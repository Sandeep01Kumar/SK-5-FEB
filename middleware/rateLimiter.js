'use strict';

/**
 * Rate limiting middleware module (SR-003).
 *
 * Configures express-rate-limit to enforce IP-based request throttling,
 * preventing DoS and brute-force attacks.  Defaults to 100 requests per
 * 15-minute window per IP address; both values are tuneable via the
 * RATE_LIMIT_WINDOW and RATE_LIMIT_MAX environment variables (routed
 * through config/security.js).
 *
 * Applied as global middleware — third in the Express pipeline
 * (after cors and helmet).
 *
 * @module middleware/rateLimiter
 */

const rateLimit = require('express-rate-limit');
const securityConfig = require('../config/security');

/* ---------- rate-limiter options ---------- */

const rateLimitOptions = {
  /** Duration of the rate-limit window in milliseconds. */
  windowMs: securityConfig.rateLimit.windowMs,

  /** Maximum number of requests allowed per window per IP. */
  max: securityConfig.rateLimit.max,

  /** Use the modern draft-8 RateLimit response headers. */
  standardHeaders: 'draft-8',

  /** Disable deprecated X-RateLimit-* headers. */
  legacyHeaders: false,

  /** HTTP status code returned when the limit is exceeded. */
  statusCode: 429,

  /** JSON body sent to clients that exceed the rate limit. */
  message: {
    status: 429,
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.'
  }
  /* Built-in memory store is used by default — suitable for
     single-process deployment (Section 0.11.1). */
};

/** Configured rate-limiter middleware instance. */
module.exports = rateLimit(rateLimitOptions);
