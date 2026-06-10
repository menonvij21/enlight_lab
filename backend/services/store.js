/**
 * store.js
 * In-memory key-value stores for bookings and contact leads.
 *
 * Fine for demos and single-instance deployments.
 * For production / multi-instance, swap these Maps for
 * Redis (ioredis) or a database (MongoDB, PostgreSQL, etc.).
 */

// Demo call bookings
const bookingStore = new Map();

// Contact form submissions
const contactStore = new Map();

module.exports = { bookingStore, contactStore };
