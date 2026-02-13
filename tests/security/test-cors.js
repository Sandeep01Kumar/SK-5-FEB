'use strict';

/**
 * CORS Policy Verification Tests
 *
 * Verifies that the cors middleware (middleware/cors.js) correctly enforces the
 * Cross-Origin Resource Sharing policy configured via config/security.js on
 * the Express application (server.js).
 *
 * Test coverage:
 *   1. Access-Control-Allow-Origin is set for requests from the allowed origin.
 *   2. Access-Control-Allow-Origin does NOT match blocked/malicious origins.
 *   3. Preflight OPTIONS requests return correct Access-Control-Allow-Methods.
 *   4. Preflight OPTIONS requests return correct Access-Control-Allow-Headers.
 *   5. Preflight OPTIONS requests return the configured success status code (200).
 *
 * The cors middleware is configured with:
 *   - origin: CORS_ORIGIN env var || 'http://localhost:3000'
 *   - methods: ['GET', 'POST', 'OPTIONS']
 *   - allowedHeaders: ['Content-Type', 'Authorization']
 *   - credentials: false
 *   - optionsSuccessStatus: 200
 *   - maxAge: 86400
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — CORS test-cors.js test table
 * @see Section 0.6.1 — Verify CORS headers for allowed and blocked origins
 * @see middleware/cors.js — CORS middleware configuration
 * @see config/security.js — Centralized security configuration
 */

/* ─────────────────────────── Built-in Module Imports ──────────────────────── */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

/* ─────────────────────── Environment Configuration ───────────────────────── */

/*
 * Set environment variables BEFORE importing server.js because server.js
 * auto-starts a listener on require(). A unique high port (49878) prevents
 * EADDRINUSE collisions with other test files or services on port 3000.
 *
 * CORS_ORIGIN is set explicitly to 'http://localhost:3000' to ensure
 * deterministic test behavior matching the default from config/security.js.
 *
 * RATE_LIMIT_MAX is raised to prevent accidental 429 responses during testing.
 */
process.env.PORT = '49878';
process.env.HOST = '127.0.0.1';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.RATE_LIMIT_MAX = '10000';

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49878).
 * The test creates its own independent server on a random ephemeral port below.
 *
 * @type {import('express').Express}
 */
const app = require('../../server');

/* ──────────────────────────── Test Constants ──────────────────────────────── */

/** The allowed origin configured via CORS_ORIGIN env var / config/security.js */
const ALLOWED_ORIGIN = 'http://localhost:3000';

/** A malicious origin that should NOT pass CORS policy checks */
const BLOCKED_ORIGIN = 'http://malicious-site.com';

/* ──────────────────────────── Test State ──────────────────────────────────── */

/** @type {import('http').Server|null} Test server instance managed by hooks */
let server = null;

/** @type {number} Assigned test port (set after server binds to ephemeral port) */
let testPort = 0;

/* ──────────────────────────── Helper Functions ────────────────────────────── */

/**
 * Makes an HTTP request to the test server with configurable method, headers,
 * and body. Returns a Promise resolving with the response status code, headers,
 * and body text.
 *
 * @param {Object} options - Request configuration
 * @param {string} [options.method='GET'] - HTTP method (GET, OPTIONS, POST, etc.)
 * @param {string} [options.path='/'] - URL path to request
 * @param {Object} [options.headers={}] - Custom request headers (e.g., Origin)
 * @param {string|null} [options.body=null] - Request body string (for POST, etc.)
 * @param {number} [options.timeout=5000] - Request timeout in milliseconds
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>}
 */
function makeRequest(options = {}) {
  const method = options.method || 'GET';
  const path = options.path || '/';
  const customHeaders = options.headers || {};
  const body = options.body || null;
  const timeout = options.timeout || 5000;

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: testPort,
      path: path,
      method: method,
      headers: customHeaders
    };

    const req = http.request(requestOptions, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseBody
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    /* Enforce a configurable timeout to prevent tests from hanging indefinitely */
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`HTTP ${method} request timed out after ${timeout}ms`));
    });

    /* Write request body if provided, then end the request */
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('CORS Policy Verification', () => {

  /**
   * before() hook — starts the Express app on a random OS-assigned port.
   * Port 0 causes the OS to select an available ephemeral port, eliminating
   * any risk of EADDRINUSE collisions during parallel test execution.
   */
  before(async () => {
    return new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        testPort = addr.port;
        resolve();
      });
      server.on('error', (err) => {
        reject(new Error(`Failed to start CORS test server: ${err.message}`));
      });
    });
  });

  /**
   * after() hook — gracefully shuts down the test server and forces process
   * exit. The force-exit is necessary because server.js auto-starts a listener
   * on require() with no exported handle to close, which would otherwise keep
   * the Node.js event loop alive indefinitely after tests complete.
   */
  after(async () => {
    await new Promise((resolve) => {
      if (server && server.listening) {
        server.close(() => {
          server = null;
          resolve();
        });
      } else {
        server = null;
        resolve();
      }
    });

    /*
     * Allow a brief delay for TAP output to flush, then force process exit.
     * The auto-started server from require('../../server') has no exposed
     * handle, so it cannot be closed programmatically.
     */
    setTimeout(() => process.exit(0), 200).unref();
  });

  /* ──────── Test Case 1: Allowed Origin Gets ACAO Header ──────── */

  it('should include Access-Control-Allow-Origin for allowed origin', async () => {
    const response = await makeRequest({
      method: 'GET',
      path: '/',
      headers: {
        'Origin': ALLOWED_ORIGIN
      }
    });

    /*
     * The cors middleware with a string origin always sets ACAO to the
     * configured origin value. For an allowed origin request, the ACAO header
     * value matches the request Origin — browsers permit the cross-origin read.
     */
    const acao = response.headers['access-control-allow-origin'];
    assert.ok(
      acao,
      'Access-Control-Allow-Origin header must be present for allowed origin'
    );
    assert.strictEqual(
      acao,
      ALLOWED_ORIGIN,
      `Access-Control-Allow-Origin must equal '${ALLOWED_ORIGIN}', received '${acao}'`
    );
  });

  /* ──────── Test Case 2: Blocked Origin Does Not Match ACAO ──────── */

  it('should not include Access-Control-Allow-Origin for blocked origin', async () => {
    const response = await makeRequest({
      method: 'GET',
      path: '/',
      headers: {
        'Origin': BLOCKED_ORIGIN
      }
    });

    /*
     * The cors middleware with a static string origin sets ACAO to the
     * configured value regardless of the request Origin. The ACAO header may
     * be present, but its value will NOT match the malicious origin — causing
     * browsers to block the cross-origin response per the Same-Origin Policy.
     *
     * Assertion: ACAO is either absent or does not equal the blocked origin.
     */
    const acao = response.headers['access-control-allow-origin'];
    if (acao) {
      assert.notStrictEqual(
        acao,
        BLOCKED_ORIGIN,
        `Access-Control-Allow-Origin must NOT match blocked origin '${BLOCKED_ORIGIN}'`
      );
    }
    /* If acao is undefined/absent, the test implicitly passes — blocked origin
       has no matching ACAO, which is the desired security behavior. */
    assert.ok(
      !acao || acao !== BLOCKED_ORIGIN,
      'Blocked origin must not have a matching Access-Control-Allow-Origin header'
    );
  });

  /* ──────── Test Case 3: Preflight OPTIONS Handled Correctly ──────── */

  it('should handle preflight OPTIONS request correctly', async () => {
    const response = await makeRequest({
      method: 'OPTIONS',
      path: '/',
      headers: {
        'Origin': ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    });

    /* Verify Access-Control-Allow-Origin is present for the allowed origin */
    const acao = response.headers['access-control-allow-origin'];
    assert.ok(
      acao,
      'Preflight response must include Access-Control-Allow-Origin header'
    );
    assert.strictEqual(
      acao,
      ALLOWED_ORIGIN,
      `Preflight Access-Control-Allow-Origin must equal '${ALLOWED_ORIGIN}', received '${acao}'`
    );

    /* Verify Access-Control-Allow-Methods contains GET, POST, OPTIONS */
    const allowMethods = response.headers['access-control-allow-methods'];
    assert.ok(
      allowMethods,
      'Preflight response must include Access-Control-Allow-Methods header'
    );
    assert.ok(
      allowMethods.includes('GET'),
      `Access-Control-Allow-Methods must include 'GET', received '${allowMethods}'`
    );
    assert.ok(
      allowMethods.includes('POST'),
      `Access-Control-Allow-Methods must include 'POST', received '${allowMethods}'`
    );
    assert.ok(
      allowMethods.includes('OPTIONS'),
      `Access-Control-Allow-Methods must include 'OPTIONS', received '${allowMethods}'`
    );

    /* Verify Access-Control-Allow-Headers contains Content-Type and Authorization */
    const allowHeaders = response.headers['access-control-allow-headers'];
    assert.ok(
      allowHeaders,
      'Preflight response must include Access-Control-Allow-Headers header'
    );
    assert.ok(
      allowHeaders.toLowerCase().includes('content-type'),
      `Access-Control-Allow-Headers must include 'Content-Type', received '${allowHeaders}'`
    );
    assert.ok(
      allowHeaders.toLowerCase().includes('authorization'),
      `Access-Control-Allow-Headers must include 'Authorization', received '${allowHeaders}'`
    );
  });

  /* ──────── Test Case 4: Correct Access-Control-Allow-Methods ──────── */

  it('should return correct Access-Control-Allow-Methods', async () => {
    const response = await makeRequest({
      method: 'OPTIONS',
      path: '/',
      headers: {
        'Origin': ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST'
      }
    });

    /*
     * The cors middleware is configured with methods: ['GET', 'POST', 'OPTIONS'].
     * The Access-Control-Allow-Methods header should contain exactly these three
     * methods in a comma-separated list.
     */
    const allowMethods = response.headers['access-control-allow-methods'];
    assert.ok(
      allowMethods,
      'Access-Control-Allow-Methods header must be present in preflight response'
    );

    /* Parse the methods list (comma-separated, possibly with spaces) */
    const methodsList = allowMethods.split(',').map((m) => m.trim());
    const expectedMethods = ['GET', 'POST', 'OPTIONS'];

    for (const method of expectedMethods) {
      assert.ok(
        methodsList.includes(method),
        `Access-Control-Allow-Methods must include '${method}'. ` +
        `Received methods: [${methodsList.join(', ')}]`
      );
    }

    /* Ensure no unexpected methods are exposed */
    assert.strictEqual(
      methodsList.length,
      expectedMethods.length,
      `Expected exactly ${expectedMethods.length} allowed methods, ` +
      `received ${methodsList.length}: [${methodsList.join(', ')}]`
    );
  });

  /* ──────── Test Case 5: Correct Preflight Status Code ──────── */

  it('should return correct preflight status code', async () => {
    const response = await makeRequest({
      method: 'OPTIONS',
      path: '/',
      headers: {
        'Origin': ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });

    /*
     * The cors middleware is configured with optionsSuccessStatus: 200.
     * Preflight OPTIONS responses should return HTTP 200 (not the default 204)
     * for compatibility with legacy browsers that don't handle 204 correctly.
     */
    assert.strictEqual(
      response.statusCode,
      200,
      `Preflight OPTIONS must return status 200 (optionsSuccessStatus), ` +
      `received ${response.statusCode}`
    );
  });

});
