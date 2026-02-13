'use strict';

/**
 * Helmet Security Headers Middleware Configuration
 *
 * Configures and exports a pre-built helmet middleware instance that sets 13+
 * security HTTP response headers on every response. Applied as the second
 * middleware in the Express pipeline (after cors, before rate-limiter).
 *
 * Security headers set:
 *  - Content-Security-Policy (CSP) — prevents XSS and data injection attacks
 *  - Strict-Transport-Security (HSTS) — enforces HTTPS connections
 *  - X-Content-Type-Options: nosniff — prevents MIME type sniffing
 *  - X-Frame-Options: SAMEORIGIN — prevents clickjacking
 *  - Cross-Origin-Opener-Policy — isolates browsing context
 *  - Cross-Origin-Resource-Policy — restricts cross-origin resource loading
 *  - Referrer-Policy — controls referrer information leakage
 *  - X-DNS-Prefetch-Control — controls DNS prefetching
 *  - X-Download-Options — prevents IE file execution
 *  - X-Permitted-Cross-Domain-Policies — restricts Adobe cross-domain policies
 *  - Origin-Agent-Cluster — isolates origin processes
 *  - Removes X-Powered-By header to hide server technology
 *
 * @module middleware/helmet
 * @see https://helmetjs.github.io/
 */

const helmet = require('helmet');

/**
 * Helmet configuration options tailored for an API server.
 * Uses restrictive Content-Security-Policy directives appropriate for a
 * non-browser-rendered API that serves JSON/text responses.
 */
const helmetOptions = {
  /**
   * Content-Security-Policy configuration.
   * useDefaults disabled to enforce a minimal, API-appropriate policy.
   * Restricts all resource loading to same-origin only and blocks
   * object embeds and framing entirely.
   */
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    }
  },

  /**
   * Strict-Transport-Security (HSTS) configuration.
   * Instructs browsers to only access the server over HTTPS for 1 year,
   * including all subdomains, and opts into the HSTS preload list.
   */
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },

  /**
   * X-Content-Type-Options: nosniff
   * Prevents browsers from MIME-sniffing the response content type.
   */
  xContentTypeOptions: true,

  /**
   * X-Frame-Options: SAMEORIGIN
   * Prevents the page from being displayed in a frame, iframe, embed, or
   * object element on cross-origin pages — protects against clickjacking.
   */
  xFrameOptions: { action: 'sameorigin' },

  /**
   * Cross-Origin-Opener-Policy: same-origin
   * Ensures the document cannot share a browsing context group with
   * cross-origin documents, isolating the window from cross-origin popups.
   */
  crossOriginOpenerPolicy: { policy: 'same-origin' },

  /**
   * Cross-Origin-Resource-Policy: same-origin
   * Prevents other origins from loading this server's resources,
   * protecting against speculative side-channel attacks (e.g., Spectre).
   */
  crossOriginResourcePolicy: { policy: 'same-origin' },

  /**
   * Removes the X-Powered-By header from responses to prevent
   * server technology fingerprinting by attackers.
   */
  hidePoweredBy: true,

  /**
   * Referrer-Policy: strict-origin-when-cross-origin
   * Sends the full URL as referrer for same-origin requests, but only
   * the origin for cross-origin requests, and nothing for downgrades
   * (HTTPS → HTTP). Balances security with functional referrer needs.
   */
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
};

/**
 * Pre-configured helmet middleware instance.
 * Import and apply with app.use(helmetMiddleware) in the Express pipeline.
 *
 * @type {Function} Express middleware function (req, res, next) => void
 */
const helmetMiddleware = helmet(helmetOptions);

module.exports = helmetMiddleware;
