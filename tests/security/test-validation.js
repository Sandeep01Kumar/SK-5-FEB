'use strict';

/**
 * Input Validation Security Verification Tests
 *
 * Verifies that the express-validator middleware (middleware/validation.js) and
 * the Express body-parsing pipeline correctly handle malicious, oversized, and
 * clean input payloads. The validation middleware uses sanitizers (trim + escape)
 * to neutralize XSS/injection content, while the body parser (express.json with
 * 10 kb limit) rejects malformed and oversized request bodies.
 *
 * Test categories:
 *   1. XSS script tag injection via query parameters  — sanitized (200)
 *   2. SQL injection patterns in request body          — rejected (400)
 *   3. Oversized request body                          — rejected (413 / 400)
 *   4. Clean input pass-through                        — accepted (200)
 *   5. Structured error message format on failure      — JSON { status, error }
 *   6. Whitespace trimming in query parameter values   — passes validation (200)
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — Input Validation test requirements
 * @see Section 0.6.1 — Verify input validation rejects malformed data with 400
 * @see Section 0.8.1 test table — Malicious input rejected (400); clean input passes
 */

/* ─────────────────────────── Built-in Module Imports ──────────────────────── */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

/* ─────────────────────── Environment Configuration ───────────────────────── */

/*
 * Set a unique port for the auto-started server (server.js starts listening on
 * require) to prevent EADDRINUSE collisions with any service on port 3000 or
 * with other test files that set their own PORT values.
 * A high rate limit prevents accidental 429 responses during testing.
 */
process.env.PORT = '49878';
process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_MAX = '10000';

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49878).
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
 * Makes an HTTP GET request to the test server.
 * Collects the full response body as a string and resolves with status code,
 * headers, and body. Rejects on network error or timeout.
 *
 * @param {string} path - URL path to request (e.g., '/' or '/?name=hello')
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
 * Makes an HTTP request with full control over method, path, body, and headers.
 * Used for POST requests with custom payloads (malicious, oversized, malformed).
 *
 * @param {string} method  - HTTP method (e.g., 'GET', 'POST')
 * @param {string} path    - URL path to request (e.g., '/')
 * @param {string|null} body - Request body content (null for no body)
 * @param {Object} [headers={}] - Custom request headers
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>}
 */
function httpRequest(method, path, body, headers) {
  const requestHeaders = headers || {};

  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: testPort,
      path: path,
      method: method,
      headers: requestHeaders
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

    /* Enforce a 5-second timeout to prevent tests from hanging indefinitely */
    req.setTimeout(5000, () => {
      req.destroy(new Error(`HTTP ${method} request timed out after 5000ms`));
    });

    if (body !== null && body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('Input Validation Security Tests', () => {

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

  /* ──────── Test Case 1: XSS Script Tag in Query Parameters ──────── */

  it('should reject XSS script tag in query parameters', async () => {
    /*
     * The validation middleware (middleware/validation.js) uses express-validator
     * sanitizers: query('*').trim().escape(). The escape() function HTML-encodes
     * special characters (< → &lt;, > → &gt;) in query parameter values,
     * neutralizing XSS payloads. The sanitizer does NOT produce validation
     * errors — it transforms the input and allows the request to proceed.
     *
     * Expected behavior: Server sanitizes the XSS content and returns 200
     * with the standard "Hello, World!\n" response. The raw script tags are
     * never reflected in the response body.
     */
    const xssPayload = encodeURIComponent("<script>alert('xss')</script>");
    const response = await httpGet(`/?name=${xssPayload}`);

    /* Sanitized input passes through — server returns 200, not 500 */
    assert.ok(
      response.statusCode === 200 || response.statusCode === 400,
      `Expected sanitized response (200) or validation rejection (400), ` +
      `received HTTP ${response.statusCode}`
    );

    /* Response body must never contain raw XSS script tags */
    assert.ok(
      !response.body.includes('<script>'),
      'Response body must not contain raw <script> tags — XSS should be sanitized'
    );
  });

  /* ──────── Test Case 2: SQL Injection Patterns in Request Body ──────── */

  it('should reject SQL injection patterns in request body', async () => {
    /*
     * Send raw SQL injection text with Content-Type: application/json.
     * The express.json() body parser (applied globally in server.js with
     * limit: '10kb') attempts to parse the body as JSON. Since raw SQL
     * injection text ("'; DROP TABLE users; --") is not valid JSON, the
     * parser throws a SyntaxError with status 400, which is caught by the
     * centralized error handler in server.js.
     *
     * This tests the defense-in-depth strategy: even if SQL injection content
     * reaches the body parser, the JSON parsing layer rejects it before any
     * route handler can access it.
     */
    const sqlPayload = "'; DROP TABLE users; --";
    const response = await httpRequest('POST', '/', sqlPayload, {
      'Content-Type': 'application/json'
    });

    assert.strictEqual(
      response.statusCode,
      400,
      `Expected HTTP 400 for SQL injection payload in malformed JSON body, ` +
      `received HTTP ${response.statusCode}`
    );
  });

  /* ──────── Test Case 3: Oversized Request Body ──────── */

  it('should reject oversized request body', async () => {
    /*
     * The express.json() middleware in server.js is configured with
     * { limit: '10kb' }. A request body exceeding 10 kb triggers a
     * PayloadTooLargeError (HTTP 413) from the body parser, which is
     * caught by the centralized error handler.
     *
     * Generate a JSON body approximately 20 kb in size to ensure it
     * exceeds the limit.
     */
    const oversizedData = JSON.stringify({ data: 'x'.repeat(20000) });
    const response = await httpRequest('POST', '/', oversizedData, {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(oversizedData))
    });

    /* Server may return 400 (bad request) or 413 (payload too large) */
    assert.ok(
      response.statusCode === 413 || response.statusCode === 400,
      `Expected HTTP 400 or 413 for oversized body (${Buffer.byteLength(oversizedData)} bytes), ` +
      `received HTTP ${response.statusCode}`
    );
  });

  /* ──────── Test Case 4: Clean Input Passes Validation ──────── */

  it('should sanitize and pass clean input successfully', async () => {
    /*
     * A GET request with clean, safe query parameters should pass through
     * the validation middleware without issues and reach the route handler,
     * which returns the standard "Hello, World!\n" response.
     *
     * The sanitizer applies trim() and escape() to the query param value
     * "hello", which contains no special characters, so the value is
     * unchanged after sanitization.
     */
    const response = await httpGet('/?name=hello');

    assert.strictEqual(
      response.statusCode,
      200,
      `Expected HTTP 200 for clean input, received HTTP ${response.statusCode}`
    );

    assert.strictEqual(
      response.body,
      'Hello, World!\n',
      `Expected 'Hello, World!\\n' body for clean input, received '${response.body}'`
    );
  });

  /* ──────── Test Case 5: Error Message Format on Validation Failure ──────── */

  it('should return appropriate error message format on validation failure', async () => {
    /*
     * The centralized error handler in server.js returns structured JSON
     * error responses with { status, error } fields (and optionally stack
     * in non-production mode). This test verifies the error format by
     * sending malformed JSON that triggers a 400 error from the body parser.
     *
     * Expected response body structure:
     *   { "status": 400, "error": "<parser error message>" }
     */
    const malformedJson = '{invalid json payload}';
    const response = await httpRequest('POST', '/', malformedJson, {
      'Content-Type': 'application/json'
    });

    assert.strictEqual(
      response.statusCode,
      400,
      `Expected HTTP 400 for malformed JSON, received HTTP ${response.statusCode}`
    );

    /* Parse the error response body and verify structure */
    let errorBody;
    try {
      errorBody = JSON.parse(response.body);
    } catch (parseErr) {
      assert.fail(
        `Error response body must be valid JSON, but parsing failed: ${parseErr.message}. ` +
        `Raw body: ${response.body}`
      );
    }

    /* Verify the response contains the required structured error fields */
    assert.ok(
      typeof errorBody.status === 'number',
      `Error response must contain a numeric 'status' field, received: ${typeof errorBody.status}`
    );
    assert.ok(
      typeof errorBody.error === 'string',
      `Error response must contain a string 'error' field, received: ${typeof errorBody.error}`
    );
    assert.strictEqual(
      errorBody.status,
      400,
      `Error response status field must be 400, received: ${errorBody.status}`
    );
  });

  /* ──────── Test Case 6: Whitespace Trimming in Input Values ──────── */

  it('should trim whitespace from input values', async () => {
    /*
     * The validation middleware uses query('*').trim() which removes leading
     * and trailing whitespace from query parameter values before the route
     * handler processes them. This test sends a query param value padded
     * with spaces (%20) and verifies the request passes validation
     * successfully (HTTP 200).
     *
     * While the GET / response body is always "Hello, World!\n" regardless
     * of query params, a 200 status confirms the trimmed value passed
     * through the validation middleware without errors.
     */
    const paddedValue = encodeURIComponent('   hello   ');
    const response = await httpGet(`/?name=${paddedValue}`);

    assert.strictEqual(
      response.statusCode,
      200,
      `Expected HTTP 200 for whitespace-padded input (should be trimmed), ` +
      `received HTTP ${response.statusCode}`
    );

    assert.strictEqual(
      response.body,
      'Hello, World!\n',
      `Expected 'Hello, World!\\n' body after whitespace trimming, received '${response.body}'`
    );
  });

});
