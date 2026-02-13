'use strict';

/**
 * Centralized security configuration module.
 *
 * All security-sensitive values are sourced from environment variables
 * with sensible defaults, following 12-factor app methodology.
 * This module is imported by middleware/helmet.js, middleware/rateLimiter.js,
 * middleware/cors.js, and server.js.
 *
 * Environment variables:
 *   PORT              - Server listening port (default: 3000)
 *   HOST              - Server binding address (default: '127.0.0.1')
 *   SSL_KEY_PATH      - Path to TLS private key file (default: null, HTTP mode)
 *   SSL_CERT_PATH     - Path to TLS certificate file (default: null, HTTP mode)
 *   RATE_LIMIT_WINDOW - Rate limit window in minutes (default: 15)
 *   RATE_LIMIT_MAX    - Max requests per window per IP (default: 100)
 *   CORS_ORIGIN       - Allowed CORS origin(s) (default: 'http://localhost:3000')
 */

const securityConfig = {
  /** Server network settings — replaces hardcoded values from original server.js */
  server: {
    /** Listening port — env: PORT (default: 3000) */
    port: parseInt(process.env.PORT, 10) || 3000,
    /** Binding address — env: HOST (default: '127.0.0.1') */
    host: process.env.HOST || '127.0.0.1'
  },

  /** TLS/HTTPS configuration — opt-in via environment variables (SR-004) */
  tls: {
    /** Path to TLS private key file — env: SSL_KEY_PATH (default: null for HTTP mode) */
    keyPath: process.env.SSL_KEY_PATH || null,
    /** Path to TLS certificate file — env: SSL_CERT_PATH (default: null for HTTP mode) */
    certPath: process.env.SSL_CERT_PATH || null
  },

  /** Rate limiting settings — prevents DoS and brute-force attacks (SR-003) */
  rateLimit: {
    /** Window duration in milliseconds — env: RATE_LIMIT_WINDOW in minutes (default: 15 min) */
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) * 60 * 1000 || 15 * 60 * 1000,
    /** Maximum requests per window per IP — env: RATE_LIMIT_MAX (default: 100) */
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
  },

  /** CORS policy configuration — controls cross-origin access (SR-007) */
  cors: {
    /** Allowed origin(s) — env: CORS_ORIGIN (default: 'http://localhost:3000') */
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
  }
};

module.exports = securityConfig;
