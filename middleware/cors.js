'use strict';

/**
 * CORS middleware configuration module (SR-007).
 *
 * Exports a configured cors middleware instance that enforces a restrictive
 * Cross-Origin Resource Sharing policy.  Applied as the first middleware in
 * the Express pipeline (before helmet and rate-limiter) so that CORS headers
 * are present on every response — including error responses.
 *
 * Configuration is sourced from config/security.js which reads the CORS_ORIGIN
 * environment variable (default: 'http://localhost:3000').
 *
 * @module middleware/cors
 */

const cors = require('cors');
const securityConfig = require('../config/security');

/**
 * CORS options — restrictive defaults per Section 0.5.1.
 *
 * origin            – Explicit whitelist from environment configuration.
 * methods           – Only GET, POST, and OPTIONS are permitted.
 * allowedHeaders    – Only Content-Type and Authorization are accepted.
 * credentials       – Disabled by default to prevent credential leakage.
 * optionsSuccessStatus – 200 instead of 204 for legacy browser compatibility.
 * maxAge            – Preflight response cached for 24 hours (86 400 seconds).
 */
const corsOptions = {
  origin: securityConfig.cors.origin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

/* Instantiate the middleware with the restrictive options. */
const corsMiddleware = cors(corsOptions);

module.exports = corsMiddleware;
