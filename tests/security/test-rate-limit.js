'use strict';

/**
 * Rate Limiting Security Verification Tests (SR-003)
 *
 * Validates that the express-rate-limit middleware correctly enforces IP-based
 * request throttling on the security-hardened Express server.  Tests use a
 * reduced RATE_LIMIT_MAX of 10 (instead of the production default of 100) to
 * enable fast test execution while verifying identical rate-limiting behaviour.
 *
 * Test matrix (ordered — cumulative request count matters):
 *   1. Requests within limit return HTTP 200
 *   2. RateLimit headers are present in responses (draft-8 standard)
 *   3. RateLimit-Remaining decrements across sequential requests
 *   4. Requests exceeding the threshold return HTTP 429 (Too Many Requests)
 *   5. Rate-limited responses include a JSON error body
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — Send 101 rapid requests and verify 429 after threshold
 * @see Section 0.6.1 — Verify rate limiting triggers 429; verify RateLimit headers
 * @see Section 0.8.1 test table — Verify rate limiting behaviour; 429 after
 *      threshold; RateLimit headers present
 *
 * @module tests/security/test-rate-limit
 */

/* ────────────── Environment Configuration (BEFORE any imports) ────────────── */

/**
 * Set RATE_LIMIT_MAX to 10 for fast testing.  The production default of 100
 * requests per 15-minute window would require 101 requests per test run which
 * is unnecessarily slow.  A limit of 10 validates the same rate-limiting logic
 * with far fewer requests.
 *
 * PORT is set to a high ephemeral port so the module-level server.listen()
 * call in server.js does not conflict with the test server or occupy port 3000.
 * HOST is locked to loopback for safety.
 */
process.env.RATE_LIMIT_MAX  = '10';
process.env.PORT            = '49877';
process.env.HOST            = '127.0.0.1';

/* ─────────────────────────── Built-in Module Imports ──────────────────────── */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('http');

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49877).
 * The test creates its own independent server on a random port below.
 *
 * @type {import('express').Express}
 */
const app = require('../../server');

/* ──────────────────────────── Test Constants ──────────────────────────────── */

/**
 * The configured rate limit maximum for this test run, mirroring the
 * RATE_LIMIT_MAX environment variable set above.  Used in assertions and
 * loop calculations to keep the test self-documenting.
 * @type {number}
 */
const TEST_RATE_LIMIT_MAX = 10;

/** Hostname for all test HTTP requests. */
const TEST_HOST = '127.0.0.1';

/** Per-request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 5000;

/* ──────────────────────────── Test State ──────────────────────────────────── */

/** @type {import('http').Server|null} Test server instance managed by hooks */
let server = null;

/** @type {number} Dynamically assigned port for the test server */
let testPort = 0;

/* ──────────────────────────── Helper Functions ────────────────────────────── */

/**
 * Makes an HTTP request to the test server and resolves with the full response
 * including status code, headers, and body.
 *
 * @param {string}  [path='/']    - URL path to request
 * @param {object}  [options]     - Additional http.request options
 * @param {string}  [options.method='GET'] - HTTP method
 * @param {object}  [options.headers={}]   - Request headers
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function makeRequest(path, options) {
  path    = path    || '/';
  options = options || {};

  return new Promise(function requestPromise(resolve, reject) {
    const reqOptions = {
      hostname: TEST_HOST,
      port:     testPort,
      path:     path,
      method:   options.method  || 'GET',
      headers:  options.headers || {}
    };

    const req = http.request(reqOptions, function onResponse(res) {
      const chunks = [];

      res.on('data', function onData(chunk) {
        chunks.push(chunk);
      });

      res.on('end', function onEnd() {
        resolve({
          statusCode: res.statusCode,
          headers:    res.headers,
          body:       Buffer.concat(chunks).toString('utf8')
        });
      });

      res.on('error', reject);
    });

    req.on('error', reject);

    /* Enforce a hard timeout to prevent tests from hanging indefinitely */
    req.setTimeout(REQUEST_TIMEOUT_MS, function onTimeout() {
      req.destroy(new Error(
        'HTTP request timed out after ' + REQUEST_TIMEOUT_MS + 'ms'
      ));
    });

    req.end();
  });
}

/**
 * Sends `count` sequential HTTP GET requests to the test server and collects
 * every response.  Requests are sent serially (not in parallel) to guarantee
 * deterministic counter incrementation in the rate-limiter memory store.
 *
 * @param {number} count       - Number of requests to send
 * @param {string} [path='/']  - URL path for each request
 * @returns {Promise<Array<{statusCode: number, headers: object, body: string}>>}
 */
async function sendRequests(count, path) {
  path = path || '/';
  const responses = [];
  for (let i = 0; i < count; i++) {
    responses.push(await makeRequest(path));
  }
  return responses;
}

/**
 * Parses the combined `RateLimit` header value per the IETF Rate Limit Fields
 * specification (draft-7 / draft-8).  The header format is a comma-separated
 * list of key=value pairs, e.g. "limit=10, remaining=9, reset=42".
 *
 * @param {string|undefined} headerValue - Raw header value
 * @returns {object} Parsed fields with numeric values where possible
 */
function parseRateLimitHeader(headerValue) {
  const result = {};
  if (!headerValue || typeof headerValue !== 'string') {
    return result;
  }
  headerValue.split(',').forEach(function parsePart(part) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex !== -1) {
      const key      = trimmed.substring(0, eqIndex).trim();
      const rawValue = trimmed.substring(eqIndex + 1).trim();
      const numValue = Number(rawValue);
      result[key] = isNaN(numValue) ? rawValue : numValue;
    }
  });
  return result;
}

/**
 * Extracts the "remaining" request count from RateLimit response headers.
 * Supports both the draft-7/8 combined `ratelimit` header and the draft-6
 * individual `ratelimit-remaining` header for maximum compatibility.
 *
 * @param {object} headers - Response headers (keys lowercased by Node.js http)
 * @returns {number|null} The remaining request count, or null if unavailable
 */
function getRemainingFromHeaders(headers) {
  /* Draft-7 / draft-8 combined header */
  if (headers['ratelimit']) {
    const parsed = parseRateLimitHeader(headers['ratelimit']);
    if (typeof parsed.remaining === 'number') {
      return parsed.remaining;
    }
  }
  /* Draft-6 individual header fallback */
  if (headers['ratelimit-remaining'] !== undefined) {
    return parseInt(headers['ratelimit-remaining'], 10);
  }
  return null;
}

/**
 * Returns `true` when at least one recognised RateLimit-related header is
 * present in the response.  Checks for both draft-7/8 combined headers and
 * draft-6 individual headers.
 *
 * @param {object} headers - Response headers (keys lowercased by Node.js http)
 * @returns {boolean}
 */
function hasRateLimitHeaders(headers) {
  return (
    headers['ratelimit-policy']    !== undefined ||
    headers['ratelimit']           !== undefined ||
    headers['ratelimit-limit']     !== undefined ||
    headers['ratelimit-remaining'] !== undefined ||
    headers['ratelimit-reset']     !== undefined
  );
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('Rate Limiting Security Tests', function rateLimitSuite() {

  /**
   * before() hook — starts the Express app on a random OS-assigned port.
   * Port 0 causes the OS to select an available ephemeral port, eliminating
   * any risk of EADDRINUSE collisions during parallel test execution.
   */
  before(async function startTestServer() {
    return new Promise(function listenPromise(resolve, reject) {
      server = app.listen(0, TEST_HOST, function onListening() {
        const addr = server.address();
        testPort   = addr.port;
        resolve();
      });
      server.on('error', function onError(err) {
        reject(new Error('Failed to start test server: ' + err.message));
      });
    });
  });

  /**
   * after() hook — gracefully shuts down the test server and forces process
   * exit.  The force-exit is necessary because server.js auto-starts a listener
   * on require() with no exported handle to close, which would otherwise keep
   * the Node.js event loop alive indefinitely after tests complete.
   */
  after(async function stopTestServer() {
    await new Promise(function closePromise(resolve) {
      if (server && server.listening) {
        server.close(function onClose() {
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
    setTimeout(function forceExit() { process.exit(0); }, 200).unref();
  });

  /*
   * ────────── Test Ordering Note ──────────
   *
   * The rate limiter uses an in-memory store that accumulates request counts
   * across all requests to the Express application.  Tests within this describe
   * block share this counter and MUST run in declaration order (guaranteed by
   * node:test for it() blocks inside a describe).
   *
   * Cumulative request tracker:
   *
   *   Test 1 — 1 request   → cumulative:  1 / 10
   *   Test 2 — 1 request   → cumulative:  2 / 10
   *   Test 3 — 2 requests  → cumulative:  4 / 10
   *   Test 4 — 7 requests  → cumulative: 11 / 10  (exceeds limit at #11)
   *   Test 5 — 1 request   → cumulative: 12 / 10  (already rate-limited)
   */

  /* ──────── Test 1: Requests within limit return 200 ──────── */

  it('should return 200 for requests within rate limit', async function () {
    /* Cumulative requests after this test: 1 / TEST_RATE_LIMIT_MAX */
    const response = await makeRequest('/');

    assert.strictEqual(
      response.statusCode,
      200,
      'A single request well within the rate limit should return HTTP 200'
    );

    assert.ok(
      response.body.includes('Hello, World!'),
      'Response body should contain the expected Hello, World! message'
    );
  });

  /* ──────── Test 2: RateLimit headers present ──────── */

  it('should include RateLimit headers in responses', async function () {
    /* Cumulative requests after this test: 2 / TEST_RATE_LIMIT_MAX */
    const response = await makeRequest('/');

    assert.strictEqual(response.statusCode, 200,
      'Request within limit should return HTTP 200');

    /*
     * Verify draft-8 standard RateLimit headers are present.
     * express-rate-limit with standardHeaders: 'draft-8' should set:
     *   - ratelimit-policy  (describes the rate limit, e.g. "10;w=900")
     *   - ratelimit         (current state, e.g. "limit=10, remaining=8, reset=42")
     *
     * Fallback to draft-6 individual headers if combined headers are absent.
     */
    const rateLimitHeaderNames = Object.keys(response.headers)
      .filter(function (h) { return h.startsWith('ratelimit'); });

    assert.ok(
      hasRateLimitHeaders(response.headers),
      'Response should include at least one RateLimit header (draft-8 or draft-6). ' +
      'Found rate-limit related headers: [' + rateLimitHeaderNames.join(', ') + ']'
    );
  });

  /* ──────── Test 3: RateLimit-Remaining decrements ──────── */

  it('should show RateLimit-Remaining decremented', async function () {
    /* Cumulative requests after this test: 4 / TEST_RATE_LIMIT_MAX */
    const first  = await makeRequest('/');
    const second = await makeRequest('/');

    assert.strictEqual(first.statusCode, 200,
      'First request should return HTTP 200');
    assert.strictEqual(second.statusCode, 200,
      'Second request should return HTTP 200');

    const firstRemaining  = getRemainingFromHeaders(first.headers);
    const secondRemaining = getRemainingFromHeaders(second.headers);

    if (firstRemaining !== null && secondRemaining !== null) {
      assert.ok(
        secondRemaining < firstRemaining,
        'RateLimit-Remaining should decrease between sequential requests: ' +
        firstRemaining + ' → ' + secondRemaining
      );
      assert.strictEqual(
        secondRemaining,
        firstRemaining - 1,
        'RateLimit-Remaining should decrement by exactly 1 per request'
      );
    } else {
      /*
       * If the remaining count is not parseable from headers (unlikely with
       * express-rate-limit), verify at minimum that rate limit headers exist.
       */
      assert.ok(
        hasRateLimitHeaders(first.headers),
        'At least one RateLimit header should be present even when remaining ' +
        'could not be parsed'
      );
    }
  });

  /* ──────── Test 4: 429 after exceeding threshold ──────── */

  it('should return 429 after exceeding rate limit threshold', async function () {
    /*
     * We have sent 4 requests so far (tests 1-3).  The rate limit is 10.
     * Send 7 more requests to bring the cumulative total to 11 — exceeding
     * the limit at request #11 which should receive HTTP 429.
     *
     * Requests 5-10 (within limit) should return 200.
     * Request 11 (exceeds limit) should return 429.
     */
    const requestsAlreadySent = 4;
    const remainingToExceed   = TEST_RATE_LIMIT_MAX - requestsAlreadySent + 1; /* 7 */
    const responses           = await sendRequests(remainingToExceed, '/');

    /* The first (remainingToExceed - 1) requests should succeed with 200 */
    for (let i = 0; i < remainingToExceed - 1; i++) {
      assert.strictEqual(
        responses[i].statusCode,
        200,
        'Request #' + (requestsAlreadySent + 1 + i) + ' of ' +
        TEST_RATE_LIMIT_MAX + ' should return HTTP 200'
      );
    }

    /* The final request (request #11, exceeding limit of 10) should be 429 */
    const lastResponse = responses[responses.length - 1];
    assert.strictEqual(
      lastResponse.statusCode,
      429,
      'Request exceeding the rate limit (request #' +
      (requestsAlreadySent + remainingToExceed) + ' with max ' +
      TEST_RATE_LIMIT_MAX + ') should return HTTP 429 Too Many Requests'
    );

    /* Verify the 429 response still includes RateLimit headers */
    assert.ok(
      hasRateLimitHeaders(lastResponse.headers),
      'Rate-limited 429 response should still include RateLimit headers'
    );

    /* Verify remaining is 0 on the rate-limited response */
    const remaining = getRemainingFromHeaders(lastResponse.headers);
    if (remaining !== null) {
      assert.strictEqual(
        remaining,
        0,
        'RateLimit-Remaining should be 0 when rate limit is exceeded'
      );
    }
  });

  /* ──────── Test 5: JSON error body on 429 ──────── */

  it('should return JSON error body on rate limit exceeded', async function () {
    /*
     * Cumulative: already over the limit (12 / 10).
     * This request is guaranteed to receive 429.
     */
    const response = await makeRequest('/');

    assert.strictEqual(
      response.statusCode,
      429,
      'Subsequent request after rate limit exceeded should return HTTP 429'
    );

    /* Parse the JSON error body */
    let body;
    try {
      body = JSON.parse(response.body);
    } catch (parseError) {
      assert.fail(
        '429 response body should be valid JSON but failed to parse: ' +
        parseError.message + '. Raw body (first 200 chars): ' +
        response.body.substring(0, 200)
      );
    }

    /*
     * Verify the error body structure matches the message configured in
     * middleware/rateLimiter.js:
     *
     *   message: {
     *     status:  429,
     *     error:   'Too Many Requests',
     *     message: 'Rate limit exceeded. Please try again later.'
     *   }
     */
    assert.strictEqual(
      body.status,
      429,
      'Error body "status" field should be 429'
    );
    assert.strictEqual(
      body.error,
      'Too Many Requests',
      'Error body "error" field should be "Too Many Requests"'
    );
    assert.ok(
      body.message && typeof body.message === 'string',
      'Error body should include a descriptive "message" string, got: ' +
      JSON.stringify(body.message)
    );
  });
});
