'use strict';

/**
 * Backward Compatibility Verification Tests
 *
 * The most critical test file in the security test suite — verifies that the
 * core test fixture behavior is preserved after the security hardening
 * transformation from raw http.createServer() to Express 4.x with security
 * middleware pipeline.
 *
 * Asserts that GET / returns exactly the original Hello, World!\n response body
 * (14 bytes including newline), HTTP 200 status code, and text/plain Content-Type
 * header, ensuring the Blitzy back-propagation integration test pipeline that
 * consumes this project continues to function correctly.
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — test table: Verify Hello, World!\n preserved
 * @see Section 0.11.1 — Preserve test fixture functionality
 * @see Section 0.5.1 — Hello, World!\n body remains unchanged; backward compatible
 * @see Section 0.8.3 — GET / response body remains Hello, World!\n with text/plain
 */

/* ─────────────────────────── Built-in Module Imports ──────────────────────── */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

/* ─────────────────────── Environment Configuration ───────────────────────── */

/*
 * Set a unique port for the auto-started server (server.js starts listening on
 * require) to prevent EADDRINUSE collisions with any service on port 3000.
 * The test itself creates a separate server on a random OS-assigned port (0).
 * A high rate limit prevents accidental 429 responses during testing.
 */
process.env.PORT = '49876';
process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_MAX = '10000';

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49876).
 * The test creates its own independent server on a random port below.
 *
 * @type {import('express').Express}
 */
const app = require('../../server');

/* ──────────────────────────── Test State ──────────────────────────────────── */

/** @type {import('http').Server|null} Test server instance managed by hooks */
let server = null;

/** @type {string} Base URL for test requests (set after server binds) */
let baseUrl = '';

/** @type {number} Assigned test port (set after server binds) */
let testPort = 0;

/* ──────────────────────────── Helper Functions ────────────────────────────── */

/**
 * Makes an HTTP GET request to the test server using http.get().
 * Collects the full response body as a string and resolves with status code,
 * headers, and body. Rejects on network error or timeout.
 *
 * @param {string} path - URL path to request (e.g., '/')
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>}
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    const requestUrl = `${baseUrl}${path}`;
    const req = http.get(requestUrl, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    /* Enforce a 5-second timeout to prevent tests from hanging indefinitely */
    req.setTimeout(5000, () => {
      req.destroy(new Error('HTTP GET request timed out after 5000ms'));
    });
  });
}

/**
 * Makes an HTTP request to the test server using http.request() for full
 * control over method, headers, and timeout. Used for tests requiring
 * fine-grained request configuration (e.g., timing verification).
 *
 * @param {string} method - HTTP method (e.g., 'GET', 'HEAD')
 * @param {string} path   - URL path to request (e.g., '/')
 * @param {Object} [opts] - Additional options (headers, timeout)
 * @param {number} [opts.timeout=5000] - Request timeout in milliseconds
 * @param {Object} [opts.headers={}]   - Custom request headers
 * @returns {Promise<{statusCode: number, headers: Object, body: string, elapsed: number}>}
 */
function httpRequest(method, path, opts = {}) {
  const timeout = opts.timeout || 5000;
  const customHeaders = opts.headers || {};

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const requestOptions = {
      hostname: '127.0.0.1',
      port: testPort,
      path: path,
      method: method,
      headers: customHeaders
    };

    const req = http.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const elapsed = Date.now() - startTime;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          elapsed: elapsed
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    /* Enforce configurable timeout */
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`HTTP ${method} request timed out after ${timeout}ms`));
    });

    req.end();
  });
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('Backward Compatibility Tests', () => {

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
        baseUrl = `http://${addr.address}:${testPort}`;
        resolve();
      });
      server.on('error', (err) => {
        reject(new Error(`Failed to start test server: ${err.message}`));
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

  /* ──────── Test Case 1: HTTP 200 Status Code ──────── */

  it('GET / should return 200 status code', async () => {
    const response = await httpGet('/');
    assert.strictEqual(
      response.statusCode,
      200,
      `Expected HTTP 200, received HTTP ${response.statusCode}`
    );
  });

  /* ──────── Test Case 2: Exact Hello, World!\n Body ──────── */

  it('GET / should return exact Hello, World!\\n response body', async () => {
    const response = await httpGet('/');
    assert.strictEqual(
      response.body,
      'Hello, World!\n',
      `Expected exact body 'Hello, World!\\n', received '${response.body}'`
    );
  });

  /* ──────── Test Case 3: text/plain Content-Type ──────── */

  it('GET / should return text/plain Content-Type', async () => {
    const response = await httpGet('/');
    assert.ok(
      response.headers['content-type'],
      'Content-Type header must be present in response'
    );
    assert.match(
      response.headers['content-type'],
      /text\/plain/,
      `Content-Type must contain 'text/plain', received '${response.headers['content-type']}'`
    );
  });

  /* ──────── Test Case 4: Exact 14-byte Response Body ──────── */

  it('GET / response body should be exactly 14 bytes', async () => {
    const response = await httpGet('/');
    const byteLength = Buffer.byteLength(response.body, 'utf8');
    assert.strictEqual(
      byteLength,
      14,
      `Expected 14 bytes (Hello, World!\\n), received ${byteLength} bytes`
    );
  });

  /* ──────── Test Case 5: Response Time Within Bounds ──────── */

  it('GET / should respond within reasonable time', async () => {
    const maxResponseTimeMs = 5000;
    const response = await httpRequest('GET', '/', { timeout: maxResponseTimeMs });
    assert.ok(
      response.elapsed < maxResponseTimeMs,
      `Response took ${response.elapsed}ms, expected < ${maxResponseTimeMs}ms`
    );
  });

  /* ──────── Test Case 6: Server Accessibility ──────── */

  it('server should be accessible on default host and port', async () => {
    const addr = server.address();
    assert.ok(addr, 'Server address must be available after startup');
    assert.strictEqual(
      addr.address,
      '127.0.0.1',
      `Expected server bound to 127.0.0.1, bound to ${addr.address}`
    );
    assert.ok(
      typeof addr.port === 'number' && addr.port > 0,
      `Server port must be a positive number, received ${addr.port}`
    );
  });

});
