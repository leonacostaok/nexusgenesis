import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKETPLACE_DATA_DIR = path.join(__dirname, '../../data/marketplace');
const MAX_REVIEW_LENGTH = 5000;
const MAX_RATING = 5;
const MIN_RATING = 1;
const REVIEW_COOLDOWN_MS = 60000;
const SERVICE_LISTING_TTL = 7 * 24 * 60 * 60 * 1000;

class AgentMarketplace {
  constructor(agentManager = null, discoveryService = null) {
    this.agentManager = agentManager;
    this.discoveryService = discoveryService;
    this.eventEmitter = new EventEmitter();

    this.listings = new Map();
    this.reviews = new Map();
    this.ratings = new Map();
    this.transactions = new Map();
    this.categories = new Set();

    this._initDirectories();
    this._loadData();
  }

  _initDirectories() {
    if (!fs.existsSync(MARKETPLACE_DATA_DIR)) {
      fs.mkdirSync(MARKETPLACE_DATA_DIR, { recursive: true });
    }
  }

  _loadData() {
    try {
      const listingsFile = path.join(MARKETPLACE_DATA_DIR, 'listings.json');
      if (fs.existsSync(listingsFile)) {
        const data = JSON.parse(fs.readFileSync(listingsFile, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.listings.set(key, value);
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const reviewsFile = path.join(MARKETPLACE_DATA_DIR, 'reviews.json');
      if (fs.existsSync(reviewsFile)) {
        const data = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.reviews.set(key, value);
        }
      }
    } catch (e) { /* ignore */ }

    try {
      const ratingsFile = path.join(MARKETPLACE_DATA_DIR, 'ratings.json');
      if (fs.existsSync(ratingsFile)) {
        const data = JSON.parse(fs.readFileSync(ratingsFile, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.ratings.set(key, value);
        }
      }
    } catch (e) { /* ignore */ }
  }

  _saveData() {
    try {
      const listingsObj = Object.fromEntries(this.listings);
      fs.writeFileSync(
        path.join(MARKETPLACE_DATA_DIR, 'listings.json'),
        JSON.stringify(listingsObj, null, 2)
      );
    } catch (e) { /* ignore */ }

    try {
      const reviewsObj = Object.fromEntries(this.reviews);
      fs.writeFileSync(
        path.join(MARKETPLACE_DATA_DIR, 'reviews.json'),
        JSON.stringify(reviewsObj, null, 2)
      );
    } catch (e) { /* ignore */ }

    try {
      const ratingsObj = Object.fromEntries(this.ratings);
      fs.writeFileSync(
        path.join(MARKETPLACE_DATA_DIR, 'ratings.json'),
        JSON.stringify(ratingsObj, null, 2)
      );
    } catch (e) { /* ignore */ }
  }

  listService(agentId, serviceData) {
    if (!agentId || !serviceData.name) {
      return { success: false, reason: 'agentId and service name are required' };
    }

    if (!serviceData.capabilities || !Array.isArray(serviceData.capabilities) || serviceData.capabilities.length === 0) {
      return { success: false, reason: 'At least one capability is required' };
    }

    const listingId = crypto.randomUUID();
    const listing = {
      id: listingId,
      agentId,
      name: serviceData.name,
      description: serviceData.description || '',
      capabilities: serviceData.capabilities,
      category: serviceData.category || 'general',
      price: serviceData.price || 0,
      currency: serviceData.currency || 'NGEN',
      tags: serviceData.tags || [],
      sla: serviceData.sla || { maxResponseTime: 3600000, availability: 0.99 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + SERVICE_LISTING_TTL,
      status: 'active',
      metadata: serviceData.metadata || {}
    };

    this.listings.set(listingId, listing);
    this.categories.add(listing.category);
    this._saveData();
    this.eventEmitter.emit('serviceListed', listing);

    return { success: true, listingId, listing };
  }

  updateListing(listingId, updates) {
    const listing = this.listings.get(listingId);
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }

    const allowedFields = ['name', 'description', 'capabilities', 'category', 'price', 'currency', 'tags', 'sla', 'metadata'];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        listing[key] = value;
      }
    }
    listing.updatedAt = Date.now();
    this.categories.add(listing.category);
    this._saveData();

    return { success: true, listing };
  }

  deactivateListing(listingId) {
    const listing = this.listings.get(listingId);
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }
    listing.status = 'inactive';
    listing.updatedAt = Date.now();
    this._saveData();
    this.eventEmitter.emit('listingDeactivated', listing);
    return { success: true };
  }

  activateListing(listingId) {
    const listing = this.listings.get(listingId);
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }
    listing.status = 'active';
    listing.expiresAt = Date.now() + SERVICE_LISTING_TTL;
    listing.updatedAt = Date.now();
    this._saveData();
    this.eventEmitter.emit('listingActivated', listing);
    return { success: true };
  }

  getListing(listingId) {
    return this.listings.get(listingId) || null;
  }

  searchListings(filters = {}) {
    let results = [];

    for (const listing of this.listings.values()) {
      if (listing.status !== 'active') continue;
      if (listing.expiresAt < Date.now()) continue;

      if (filters.category && listing.category !== filters.category) continue;

      if (filters.capabilities && filters.capabilities.length > 0) {
        const listingCaps = new Set(listing.capabilities.map(c => c.toLowerCase().trim()));
        const match = filters.capabilities.some(c => listingCaps.has(c.toLowerCase().trim()));
        if (!match) continue;
      }

      if (filters.maxPrice !== undefined && listing.price > filters.maxPrice) continue;
      if (filters.minPrice !== undefined && listing.price < filters.minPrice) continue;

      if (filters.currency && listing.currency !== filters.currency) continue;

      if (filters.tags && filters.tags.length > 0) {
        const listingTags = new Set(listing.tags.map(t => t.toLowerCase().trim()));
        const match = filters.tags.some(t => listingTags.has(t.toLowerCase().trim()));
        if (!match) continue;
      }

      if (filters.textQuery) {
        const query = filters.textQuery.toLowerCase();
        const searchText = `${listing.name} ${listing.description} ${listing.tags.join(' ')}`.toLowerCase();
        if (!searchText.includes(query)) continue;
      }

      const agentRating = this.getAgentRatingSummary(listing.agentId);
      results.push({
        ...listing,
        agentRating: agentRating.averageRating,
        agentReviewCount: agentRating.totalReviews,
        agentReputation: agentRating.reputation
      });
    }

    if (filters.sortBy === 'price_asc') {
      results.sort((a, b) => a.price - b.price);
    } else if (filters.sortBy === 'price_desc') {
      results.sort((a, b) => b.price - a.price);
    } else if (filters.sortBy === 'rating') {
      results.sort((a, b) => b.agentRating - a.agentRating);
    } else if (filters.sortBy === 'newest') {
      results.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      results.sort((a, b) => {
        const scoreA = a.agentRating * 20 + (a.agentReputation || 0);
        const scoreB = b.agentRating * 20 + (b.agentReputation || 0);
        return scoreB - scoreA;
      });
    }

    return results.slice(0, filters.limit || 100);
  }

  addReview(listingId, reviewerId, reviewData) {
    if (!listingId || !reviewerId) {
      return { success: false, reason: 'listingId and reviewerId are required' };
    }

    const listing = this.listings.get(listingId);
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }

    if (reviewerId === listing.agentId) {
      return { success: false, reason: 'Cannot review your own listing' };
    }

    if (reviewData.rating < MIN_RATING || reviewData.rating > MAX_RATING) {
      return { success: false, reason: `Rating must be between ${MIN_RATING} and ${MAX_RATING}` };
    }

    if (reviewData.content && reviewData.content.length > MAX_REVIEW_LENGTH) {
      return { success: false, reason: `Review content must be under ${MAX_REVIEW_LENGTH} characters` };
    }

    const existingReviews = this.reviews.get(listingId) || [];
    const recentReview = existingReviews.find(r =>
      r.reviewerId === reviewerId && (Date.now() - r.createdAt) < REVIEW_COOLDOWN_MS
    );
    if (recentReview) {
      return { success: false, reason: 'Please wait before submitting another review' };
    }

    const reviewId = crypto.randomUUID();
    const review = {
      id: reviewId,
      listingId,
      agentId: listing.agentId,
      reviewerId,
      rating: reviewData.rating,
      title: reviewData.title || '',
      content: reviewData.content || '',
      createdAt: Date.now(),
      helpfulCount: 0,
      flags: []
    };

    if (!this.reviews.has(listingId)) {
      this.reviews.set(listingId, []);
    }
    this.reviews.get(listingId).push(review);

    this._updateAgentRating(listing.agentId);
    this._saveData();
    this.eventEmitter.emit('reviewAdded', review);

    return { success: true, reviewId, review };
  }

  markReviewHelpful(listingId, reviewId) {
    const reviews = this.reviews.get(listingId);
    if (!reviews) return { success: false, reason: 'Listing not found' };

    const review = reviews.find(r => r.id === reviewId);
    if (!review) return { success: false, reason: 'Review not found' };

    review.helpfulCount++;
    this._saveData();
    return { success: true, helpfulCount: review.helpfulCount };
  }

  flagReview(listingId, reviewId, reason) {
    const reviews = this.reviews.get(listingId);
    if (!reviews) return { success: false, reason: 'Listing not found' };

    const review = reviews.find(r => r.id === reviewId);
    if (!review) return { success: false, reason: 'Review not found' };

    review.flags.push({ reason, timestamp: Date.now() });
    this._saveData();
    return { success: true };
  }

  getReviews(listingId, options = {}) {
    const reviews = this.reviews.get(listingId) || [];
    let result = [...reviews];

    if (options.sortBy === 'newest') {
      result.sort((a, b) => b.createdAt - a.createdAt);
    } else if (options.sortBy === 'helpful') {
      result.sort((a, b) => b.helpfulCount - a.helpfulCount);
    } else if (options.sortBy === 'rating_high') {
      result.sort((a, b) => b.rating - a.rating);
    } else if (options.sortBy === 'rating_low') {
      result.sort((a, b) => a.rating - b.rating);
    }

    return result.slice(0, options.limit || 50);
  }

  getAgentReviews(agentId, options = {}) {
    const result = [];
    for (const [listingId, reviews] of this.reviews) {
      for (const review of reviews) {
        if (review.agentId === agentId) {
          result.push({ listingId, ...review });
        }
      }
    }

    if (options.sortBy === 'newest') {
      result.sort((a, b) => b.createdAt - a.createdAt);
    }

    return result.slice(0, options.limit || 50);
  }

  _updateAgentRating(agentId) {
    const allRatings = [];
    for (const [, reviews] of this.reviews) {
      for (const review of reviews) {
        if (review.agentId === agentId) {
          allRatings.push(review.rating);
        }
      }
    }

    if (allRatings.length === 0) return;

    const average = allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length;
    const distribution = {};
    for (let i = MIN_RATING; i <= MAX_RATING; i++) {
      distribution[i] = allRatings.filter(r => r === i).length;
    }

    const recentRatings = allRatings.slice(-10);
    const recentAverage = recentRatings.reduce((sum, r) => sum + r, 0) / recentRatings.length;

    this.ratings.set(agentId, {
      averageRating: Math.round(average * 100) / 100,
      recentAverage: Math.round(recentAverage * 100) / 100,
      totalReviews: allRatings.length,
      distribution,
      updatedAt: Date.now()
    });
  }

  getAgentRatingSummary(agentId) {
    const rating = this.ratings.get(agentId);
    const agent = this.agentManager?.getAllAgents?.()
      ?.find(a => a.id === agentId);

    return {
      agentId,
      averageRating: rating?.averageRating || 0,
      recentAverage: rating?.recentAverage || 0,
      totalReviews: rating?.totalReviews || 0,
      distribution: rating?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      reputation: agent?.reputation || 0
    };
  }

  recordTransaction(listingId, consumerId, transactionData) {
    const listing = this.listings.get(listingId);
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }

    const transactionId = crypto.randomUUID();
    const transaction = {
      id: transactionId,
      listingId,
      agentId: listing.agentId,
      consumerId,
      amount: transactionData.amount || listing.price,
      currency: listing.currency,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      metadata: transactionData.metadata || {}
    };

    this.transactions.set(transactionId, transaction);
    this.eventEmitter.emit('transactionCreated', transaction);

    return { success: true, transactionId, transaction };
  }

  completeTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return { success: false, reason: 'Transaction not found' };
    }

    transaction.status = 'completed';
    transaction.completedAt = Date.now();
    this.eventEmitter.emit('transactionCompleted', transaction);

    return { success: true, transaction };
  }

  getAgentListings(agentId) {
    const result = [];
    for (const listing of this.listings.values()) {
      if (listing.agentId === agentId) {
        result.push(listing);
      }
    }
    return result;
  }

  getCategories() {
    return Array.from(this.categories).sort();
  }

  getMarketplaceStats() {
    const activeListings = Array.from(this.listings.values()).filter(
      l => l.status === 'active' && l.expiresAt > Date.now()
    );

    const totalReviews = Array.from(this.reviews.values()).reduce((sum, r) => sum + r.length, 0);
    const totalTransactions = this.transactions.size;
    const completedTransactions = Array.from(this.transactions.values()).filter(t => t.status === 'completed').length;

    let totalVolume = 0;
    for (const tx of this.transactions.values()) {
      if (tx.status === 'completed') totalVolume += tx.amount;
    }

    let averageRating = 0;
    const allRatings = Array.from(this.ratings.values());
    if (allRatings.length > 0) {
      averageRating = allRatings.reduce((sum, r) => sum + r.averageRating, 0) / allRatings.length;
    }

    const categoryStats = {};
    for (const listing of this.listings.values()) {
      if (listing.status !== 'active') continue;
      if (!categoryStats[listing.category]) {
        categoryStats[listing.category] = { count: 0, totalVolume: 0 };
      }
      categoryStats[listing.category].count++;
    }

    const topRatedAgents = Array.from(this.ratings.entries())
      .sort((a, b) => b[1].averageRating - a[1].averageRating)
      .slice(0, 10)
      .map(([agentId, rating]) => ({ agentId, ...rating }));

    return {
      totalListings: this.listings.size,
      activeListings: activeListings.length,
      categories: this.categories.size,
      totalReviews,
      totalTransactions,
      completedTransactions,
      totalVolume,
      averageRating: Math.round(averageRating * 100) / 100,
      categoryStats,
      topRatedAgents
    };
  }

  cleanupExpiredListings() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, listing] of this.listings) {
      if (listing.expiresAt < now && listing.status === 'active') {
        listing.status = 'expired';
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this._saveData();
    }
    return cleaned;
  }
}

const agentMarketplace = new AgentMarketplace();
export { AgentMarketplace };
export default agentMarketplace;
