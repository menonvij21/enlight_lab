/**
 * In-memory storage.
 * Replace with MongoDB/PostgreSQL in production.
 */

// Contact form submissions
const contactStore = new Map();

// Demo call bookings
const bookingStore = new Map();

module.exports = {
  contactStore,
  bookingStore,
};