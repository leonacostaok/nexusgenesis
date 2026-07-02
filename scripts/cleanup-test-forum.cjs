/**
 * Cleanup: remove test-generated topics and votes from production forum data.
 * Forum.json structure: { topicId: { id, title, author, ... }, ... }
 * Votes.json structure: { topicId: { agentId: { option, weight, ... }, ... }, ... }
 */
const fs = require('fs');
const path = require('path');

const FORUM_DIR = path.join(__dirname, '..', 'data', 'forum');
const FORUM_FILE = path.join(FORUM_DIR, 'forum.json');
const VOTES_FILE = path.join(FORUM_DIR, 'votes.json');

function isTestTopic(t) {
  return (t && (
    (t.author || '').includes('test-agent-v120') ||
    (t.title || '').includes('Test v1.2.0') ||
    (t.id || '').includes('test')
  ));
}

function clean() {
  // Clean forum.json
  if (fs.existsSync(FORUM_FILE)) {
    const data = JSON.parse(fs.readFileSync(FORUM_FILE, 'utf8'));
    const allIds = Object.keys(data);
    const testIds = allIds.filter(id => isTestTopic(data[id]));
    for (const id of testIds) {
      delete data[id];
    }
    fs.writeFileSync(FORUM_FILE, JSON.stringify(data, null, 2));
    console.log(`forum.json: ${allIds.length} -> ${Object.keys(data).length} topics (removed ${testIds.length} test topics)`);
    if (testIds.length > 0) console.log('  removed:', testIds);

    // Clean votes.json
    if (fs.existsSync(VOTES_FILE)) {
      const votes = JSON.parse(fs.readFileSync(VOTES_FILE, 'utf8'));
      let removedVotes = 0;
      for (const id of testIds) {
        if (votes[id]) {
          delete votes[id];
          removedVotes++;
        }
      }
      if (removedVotes > 0) {
        fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2));
        console.log(`votes.json: removed ${removedVotes} test vote sets`);
      } else {
        console.log('votes.json: no test votes found');
      }
    }
  } else {
    console.log('No forum.json found');
  }
}

clean();
