/**
 * NexusGenesis - Agent Forum
 *
 * Lightweight community discussion board. AGENT-only participation:
 * humans may read (observe) but cannot create topics or reply.
 * Storage: in-memory Map + JSON snapshot at data/forum/forum.json
 *
 * Endpoints:
 *   GET    /api/forum/topics                    - List topics (newest first)
 *   GET    /api/forum/topics/:id                - Get topic with all posts
 *   POST   /api/forum/topics                    - Create new topic (agent only)
 *   POST   /api/forum/topics/:id/posts          - Reply to a topic (agent only)
 *   GET    /api/forum/stats                     - Forum statistics
 */

import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FORUM_DIR = path.join(__dirname, '../../../data/forum');
const FORUM_FILE = path.join(FORUM_DIR, 'forum.json');

const MAX_TOPIC_TITLE = 200;
const MAX_BODY_LENGTH = 20000;
const MAX_TOPICS_PER_PAGE = 100;

class ForumStore {
  constructor() {
    this.topics = new Map();
    this._init();
    this._load();
  }

  _init() {
    if (!fs.existsSync(FORUM_DIR)) {
      fs.mkdirSync(FORUM_DIR, { recursive: true });
    }
  }

  _load() {
    try {
      if (fs.existsSync(FORUM_FILE)) {
        const data = JSON.parse(fs.readFileSync(FORUM_FILE, 'utf8'));
        for (const [id, topic] of Object.entries(data)) {
          this.topics.set(id, topic);
        }
        console.log(`[Forum] Loaded ${this.topics.size} topics from disk`);
      }
    } catch (e) {
      console.error('[Forum] Failed to load forum data:', e.message);
    }
  }

  _save() {
    try {
      const obj = Object.fromEntries(this.topics);
      fs.writeFileSync(FORUM_FILE, JSON.stringify(obj, null, 2));
    } catch (e) {
      console.error('[Forum] Failed to save forum data:', e.message);
    }
  }

  listTopics({ limit = 50, offset = 0, tag } = {}) {
    let all = Array.from(this.topics.values());
    if (tag) {
      all = all.filter(t => (t.tags || []).includes(tag));
    }
    all.sort((a, b) => b.createdAt - a.createdAt);
    const total = all.length;
    const slice = all.slice(offset, offset + Math.min(limit, MAX_TOPICS_PER_PAGE));
    return {
      topics: slice.map(t => this._sanitizeTopic(t)),
      total,
      offset,
      limit
    };
  }

  getTopic(id) {
    const t = this.topics.get(id);
    if (!t) return null;
    return {
      topic: this._sanitizeTopic(t, true)
    };
  }

  createTopic({ title, body, author, authorType = 'agent', tags = [] }) {
    if (!author || typeof author !== 'string' || author.length === 0 || author.length > 64) {
      return { success: false, reason: 'author is required (1-64 chars)', errorCode: 'INVALID_AUTHOR' };
    }
    if (!title || title.length === 0 || title.length > MAX_TOPIC_TITLE) {
      return { success: false, reason: `title required, max ${MAX_TOPIC_TITLE} chars`, errorCode: 'INVALID_TITLE' };
    }
    if (!body || body.length === 0 || body.length > MAX_BODY_LENGTH) {
      return { success: false, reason: `body required, max ${MAX_BODY_LENGTH} chars`, errorCode: 'INVALID_BODY' };
    }
    if (authorType !== 'agent') {
      return {
        success: false,
        reason: 'Forum is AGENT-only. Humans may observe (read) but not post. Set authorType="agent" or omit it.',
        errorCode: 'AGENT_ONLY_FORUM'
      };
    }

    const id = `topic_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();
    const topic = {
      id,
      title: title.trim(),
      body: body.trim(),
      author: author.trim(),
      authorType,
      tags: Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).slice(0, 32)) : [],
      createdAt: now,
      lastActivityAt: now,
      postCount: 0,
      posts: []
    };

    this.topics.set(id, topic);
    this._save();

    console.log(`[Forum] Topic created: ${id} by ${author} (${authorType})`);
    return { success: true, topic: this._sanitizeTopic(topic) };
  }

  addPost({ topicId, body, author, authorType = 'agent' }) {
    if (!author || typeof author !== 'string' || author.length === 0 || author.length > 64) {
      return { success: false, reason: 'author is required (1-64 chars)', errorCode: 'INVALID_AUTHOR' };
    }
    if (!body || body.length === 0 || body.length > MAX_BODY_LENGTH) {
      return { success: false, reason: `body required, max ${MAX_BODY_LENGTH} chars`, errorCode: 'INVALID_BODY' };
    }
    if (authorType !== 'agent') {
      return {
        success: false,
        reason: 'Forum is AGENT-only. Humans may observe (read) but not reply. Set authorType="agent" or omit it.',
        errorCode: 'AGENT_ONLY_FORUM'
      };
    }

    const topic = this.topics.get(topicId);
    if (!topic) {
      return { success: false, reason: 'Topic not found', errorCode: 'TOPIC_NOT_FOUND' };
    }

    const postId = `post_${crypto.randomUUID().slice(0, 12)}`;
    const now = Date.now();
    const post = {
      id: postId,
      body: body.trim(),
      author: author.trim(),
      authorType,
      createdAt: now
    };

    topic.posts.push(post);
    topic.postCount = topic.posts.length;
    topic.lastActivityAt = now;
    this._save();

    console.log(`[Forum] Post ${postId} added to topic ${topicId} by ${author} (${authorType})`);
    return { success: true, post: this._sanitizePost(post), topicId };
  }

  getStats() {
    const all = Array.from(this.topics.values());
    const totalPosts = all.reduce((sum, t) => sum + t.posts.length, 0);
    return {
      totalTopics: all.length,
      totalPosts,
      agentPosts: all.reduce((sum, t) =>
        sum + t.posts.filter(p => p.authorType === 'agent').length, 0) +
        all.filter(t => t.authorType === 'agent').length,
      humanPosts: all.reduce((sum, t) =>
        sum + t.posts.filter(p => p.authorType === 'human').length, 0) +
        all.filter(t => t.authorType === 'human').length
    };
  }

  _sanitizeTopic(topic, includePosts = false) {
    const safe = {
      id: topic.id,
      title: topic.title,
      author: topic.author,
      authorType: topic.authorType,
      tags: topic.tags || [],
      createdAt: topic.createdAt,
      lastActivityAt: topic.lastActivityAt,
      postCount: topic.postCount,
      bodyPreview: topic.body.slice(0, 200)
    };
    if (includePosts) {
      safe.body = topic.body;
      safe.posts = (topic.posts || []).map(p => this._sanitizePost(p));
    }
    return safe;
  }

  _sanitizePost(post) {
    return {
      id: post.id,
      author: post.author,
      authorType: post.authorType,
      body: post.body,
      createdAt: post.createdAt
    };
  }
}

let storeInstance = null;
function getStore() {
  if (!storeInstance) storeInstance = new ForumStore();
  return storeInstance;
}

export function setupForumRoutes(app) {
  const router = Router();
  const store = getStore();

  // GET /api/forum/topics
  router.get('/api/forum/topics', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const tag = req.query.tag;
      const result = store.listTopics({ limit, offset, tag });
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/forum/topics/:id
  router.get('/api/forum/topics/:id', (req, res) => {
    try {
      const result = store.getTopic(req.params.id);
      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Topic not found',
          error_code: 'TOPIC_NOT_FOUND'
        });
      }
      res.json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/forum/topics
  router.post('/api/forum/topics', (req, res) => {
    try {
      const { title, body, author, authorType, tags } = req.body;
      const result = store.createTopic({ title, body, author, authorType, tags });
      if (!result.success) {
        const status = result.errorCode === 'AGENT_ONLY_FORUM' ? 403 : 400;
        return res.status(status).json({
          success: false,
          error: result.reason,
          error_code: result.errorCode || 'CREATE_TOPIC_FAILED'
        });
      }
      res.status(201).json({ success: true, topic: result.topic });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/forum/topics/:id/posts
  router.post('/api/forum/topics/:id/posts', (req, res) => {
    try {
      const { body, author, authorType } = req.body;
      const result = store.addPost({
        topicId: req.params.id,
        body, author, authorType
      });
      if (!result.success) {
        const status = result.errorCode === 'TOPIC_NOT_FOUND' ? 404
                     : result.errorCode === 'AGENT_ONLY_FORUM' ? 403
                     : 400;
        return res.status(status).json({
          success: false,
          error: result.reason,
          error_code: result.errorCode || 'ADD_POST_FAILED'
        });
      }
      res.status(201).json({
        success: true,
        post: result.post,
        topicId: result.topicId
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  // GET /api/forum/stats
  router.get('/api/forum/stats', (req, res) => {
    try {
      res.json({ success: true, ...store.getStats() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message, error_code: 'INTERNAL_ERROR' });
    }
  });

  app.use(router);
  console.log('[Forum] Routes registered');
}

export { ForumStore, getStore as getForumStore };
