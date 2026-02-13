'use strict';

/**
 * Security-Hardened Express Server
 *
 * Replaces the original raw http.createServer() implementation with an Express 4.x
 * application featuring a full security middleware pipeline addressing six security
 * domains: security headers (SR-001), input validation (SR-002), rate limiting
 * (SR-003), HTTPS support (SR-004), dependency introduction (SR-005), and CORS
 * policy (SR-007).
 *
 * Middleware execution order:
 *   1. cors          — Cross-Origin Resource Sharing policy (SR-007)
 *   2. helmet        — 13+ security HTTP response headers (SR-001)
 *   3. rate-limiter  — IP-based request throttling (SR-003)
 *   4. express.json  — JSON body parsing with size limit
 *   5. express.urlencoded — URL-encoded body parsing
 *   6. route handlers — application routes
 *   7. error handler — centralized error response (suppresses stack traces)
 *
 * Backward compatibility: GET / returns 'Hello, World!\n' (text/plain, HTTP 200)
 * to preserve backprop integration test fixture behavior.
 *
 * @module server
 */

/* ──────────────────────────── External Dependencies ──────────────────────── */

const express = require('express');
const https = require('https');
const fs = require('fs');

/* ──────────────────────────── Internal Middleware ─────────────────────────── */

const helmetMiddleware = require('./middleware/helmet');
const rateLimiter = require('./middleware/rateLimiter');
const corsMiddleware = require('./middleware/cors');
const { validationMiddleware } = require('./middleware/validation');
const securityConfig = require('./config/security');

/* ──────────────────────────── Application Setup ──────────────────────────── */

/**
 * Express application instance.
 * Configured with a security middleware pipeline and exported for testing.
 *
 * @type {import('express').Express}
 */
const app = express();

/* ─────────────────── Security Middleware Pipeline (ordered) ───────────────── */

/*
 * 1. CORS middleware — must be first so that CORS headers appear on every
 *    response, including error responses from downstream middleware.
 */
app.use(corsMiddleware);

/*
 * 2. Helmet middleware — sets 13+ security HTTP response headers including
 *    Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
 *    X-Frame-Options, Cross-Origin-Opener-Policy, and removes X-Powered-By.
 */
app.use(helmetMiddleware);

/*
 * 3. Rate limiter — enforces IP-based request throttling (default: 100 requests
 *    per 15-minute window). Returns HTTP 429 with RateLimit headers when exceeded.
 */
app.use(rateLimiter);

/*
 * 4. JSON body parser — parses application/json request bodies.
 *    Limit set to 10kb to prevent oversized payload attacks.
 */
app.use(express.json({ limit: '10kb' }));

/*
 * 5. URL-encoded body parser — parses application/x-www-form-urlencoded bodies.
 *    Extended mode disabled to use querystring library (simpler, safer parsing).
 *    Limit set to 10kb to prevent oversized payload attacks.
 */
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

/* ──────────────────────────── Route Definitions ──────────────────────────── */

/**
 * GET / — Primary route (backward compatible).
 *
 * Preserves the original Hello, World!\n response from the raw http server
 * to maintain backprop integration test fixture compatibility.
 * Input validation middleware is applied to sanitize any query parameters.
 *
 * @route GET /
 * @returns {string} 'Hello, World!\n' with Content-Type: text/plain and HTTP 200
 */
app.get('/', validationMiddleware, function handleRoot(req, res) {
  res.status(200).type('text/plain').send('Hello, World!\n');
});

/* ─────────────────── Centralized Error Handling Middleware ────────────────── */

/**
 * Global error handler — catches all unhandled errors in the middleware pipeline.
 *
 * In production (NODE_ENV === 'production'), stack traces are suppressed to prevent
 * information leakage per Helmet best practices. In development, stack traces are
 * included to aid debugging.
 *
 * @param {Error} err - The error object thrown or passed via next(err)
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} _next - Express next function (required by Express error handler signature)
 */
app.use(function errorHandler(err, req, res, _next) { // eslint-disable-line no-unused-vars
  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  /* Log the full error server-side regardless of environment */
  console.error(`[ERROR] ${req.method} ${req.originalUrl} — ${err.message}`);
  if (!isProduction) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    status: statusCode,
    error: isProduction ? 'Internal Server Error' : err.message,
    /* Stack trace only included in non-production environments */
    ...(isProduction ? {} : { stack: err.stack })
  });
});

/* ──────────────────────────── Server Initialization ──────────────────────── */

const host = securityConfig.server.host;
const port = securityConfig.server.port;
const keyPath = securityConfig.tls.keyPath;
const certPath = securityConfig.tls.certPath;

/**
 * Conditionally creates an HTTPS or HTTP server based on TLS certificate
 * availability. HTTPS mode is opt-in — enabled only when both SSL_KEY_PATH
 * and SSL_CERT_PATH environment variables point to valid files.
 */
if (keyPath && certPath) {
  /* HTTPS mode — TLS certificates configured via environment variables */
  const tlsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  const server = https.createServer(tlsOptions, app);

  server.listen(port, host, function onHttpsListening() {
    console.log(
      `Security-hardened server running at https://${host}:${port}/ (TLS enabled)`
    );
  });
} else {
  /* HTTP mode — no TLS certificates provided; fall back to plain HTTP */
  app.listen(port, host, function onHttpListening() {
    console.log(
      `Security-hardened server running at http://${host}:${port}/ (TLS not configured)`
    );
  });
}

/* ──────────────────────────── Module Export ───────────────────────────────── */

/**
 * Export the Express app instance for testing and programmatic use.
 * Allows test files to create supertest instances or import the app directly
 * without starting the server.
 *
 * @type {import('express').Express}
 */
module.exports = app;
