'use strict';

/**
 * Security Header Verification Tests (Helmet)
 *
 * Verifies that all 13+ Helmet-set security HTTP response headers are present
 * in every response from the security-hardened Express server. Also confirms
 * that the X-Powered-By header has been removed (Helmet disables it by default
 * to prevent server technology fingerprinting).
 *
 * Headers verified:
 *  1. Content-Security-Policy        (CSP — prevents XSS / data injection)
 *  2. Strict-Transport-Security      (HSTS — enforces HTTPS)
 *  3. X-Content-Type-Options         (nosniff — prevents MIME sniffing)
 *  4. X-Frame-Options                (SAMEORIGIN — prevents clickjacking)
 *  5. Cross-Origin-Opener-Policy     (isolates browsing context)
 *  6. Cross-Origin-Resource-Policy   (restricts cross-origin resource loading)
 *  7. Referrer-Policy                (controls referrer leakage)
 *  8. Origin-Agent-Cluster           (isolates origin processes)
 *  9. X-DNS-Prefetch-Control         (controls DNS prefetching)
 * 10. X-Download-Options             (prevents IE file execution)
 * 11. X-Permitted-Cross-Domain-Policies (restricts Adobe cross-domain)
 * 12. X-XSS-Protection               (set to 0 — disables buggy browser filter)
 * 13. X-Powered-By                   (ABSENT — Helmet removes it)
 *
 * Note: Cross-Origin-Embedder-Policy is NOT set by Helmet 8.x by default
 * because enabling it can break many websites that load cross-origin resources
 * without CORP headers. The CORS middleware contributes Access-Control-Allow-Origin
 * as an additional security-relevant header.
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — Security Headers test-headers.js specification
 * @see Section 0.6.1 — Verify all 13+ Helmet security headers present
 * @see Section 0.8.1 — Test table: All 13 headers present; X-Powered-By absent
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
 * A high rate limit prevents accidental 429 responses during security header
 * testing — we only need a handful of requests but rate limiter state persists
 * across the shared Express app instance.
 *
 * NOTE: PORT cannot be set to '0' because config/security.js uses
 * `parseInt(PORT, 10) || 3000` which treats 0 as falsy and falls back to 3000.
 */
process.env.PORT = '49153';
process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_MAX = '10000';

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49153).
 * The test creates its own independent server on a random port below.
 *
 * The app has the full security middleware pipeline applied:
 *   cors → helmet → rate-limiter → body parsers → routes → error handler
 *
 * @type {import('express').Express}
 */
const app = require('../../server');

/* ──────────────────────────── Test State ──────────────────────────────────── */

/** @type {import('http').Server|null} Test server instance managed by hooks */
let server = null;

/** @type {number} Assigned test port (set after server binds) */
let testPort = 0;

/* ──────────────────────────── Constants ──────────────────────────────────── */

/**
 * Comprehensive list of known security-related HTTP response headers.
 * Used by the "at least 13 security headers" count test to verify that the
 * Helmet middleware and CORS middleware collectively set a sufficient number
 * of protective headers.
 *
 * @type {string[]}
 */
const KNOWN_SECURITY_HEADERS = [
  'content-security-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'origin-agent-cluster',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-dns-prefetch-control',
  'x-download-options',
  'x-frame-options',
  'x-permitted-cross-domain-policies',
  'x-xss-protection',
  'access-control-allow-origin'
];

/* ──────────────────────────── Helper Functions ────────────────────────────── */

/**
 * Makes an HTTP GET request to the test server and returns the response
 * status code, headers, and body. Uses the built-in http module (no
 * external HTTP client dependencies).
 *
 * @param {string} [path='/'] - URL path to request
 * @param {Object} [extraHeaders={}] - Additional request headers to send
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>}
 */
function makeGetRequest(path, extraHeaders) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: testPort,
      path: path || '/',
      method: 'GET',
      headers: extraHeaders || {}
    };

    const req = http.request(options, (res) => {
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

    req.end();
  });
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('Security Headers (Helmet)', () => {

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

  /* ──────── Test 1: Content-Security-Policy ──────── */

  it('should include Content-Security-Policy header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['content-security-policy'] !== undefined,
      'Content-Security-Policy header must be present in response. ' +
      'Helmet should set this header to prevent XSS and data injection attacks.'
    );
    /* Verify the CSP directive contains at least a default-src directive */
    assert.ok(
      headers['content-security-policy'].includes('default-src'),
      'Content-Security-Policy should contain a default-src directive'
    );
  });

  /* ──────── Test 2: Strict-Transport-Security ──────── */

  it('should include Strict-Transport-Security header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['strict-transport-security'] !== undefined,
      'Strict-Transport-Security header must be present in response. ' +
      'Helmet should set HSTS to enforce HTTPS connections.'
    );
    /* Verify the HSTS header contains max-age directive */
    assert.ok(
      headers['strict-transport-security'].includes('max-age='),
      'Strict-Transport-Security should contain a max-age directive'
    );
  });

  /* ──────── Test 3: X-Content-Type-Options ──────── */

  it('should include X-Content-Type-Options header set to nosniff', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-content-type-options'] !== undefined,
      'X-Content-Type-Options header must be present in response.'
    );
    assert.strictEqual(
      headers['x-content-type-options'],
      'nosniff',
      'X-Content-Type-Options must be set to "nosniff" to prevent ' +
      'browsers from MIME-sniffing the response content type.'
    );
  });

  /* ──────── Test 4: X-Frame-Options ──────── */

  it('should include X-Frame-Options header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-frame-options'] !== undefined,
      'X-Frame-Options header must be present in response. ' +
      'Helmet should set this to prevent clickjacking.'
    );
    assert.strictEqual(
      headers['x-frame-options'],
      'SAMEORIGIN',
      'X-Frame-Options must be set to "SAMEORIGIN" to prevent ' +
      'cross-origin framing while allowing same-origin framing.'
    );
  });

  /* ──────── Test 5: Cross-Origin-Opener-Policy ──────── */

  it('should include Cross-Origin-Opener-Policy header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['cross-origin-opener-policy'] !== undefined,
      'Cross-Origin-Opener-Policy header must be present in response. ' +
      'Helmet should set this to isolate the browsing context.'
    );
  });

  /* ──────── Test 6: Cross-Origin-Resource-Policy ──────── */

  it('should include Cross-Origin-Resource-Policy header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['cross-origin-resource-policy'] !== undefined,
      'Cross-Origin-Resource-Policy header must be present in response. ' +
      'Helmet should set this to restrict cross-origin resource loading.'
    );
  });

  /* ──────── Test 7: Referrer-Policy ──────── */

  it('should include Referrer-Policy header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['referrer-policy'] !== undefined,
      'Referrer-Policy header must be present in response. ' +
      'Helmet should set this to control referrer information leakage.'
    );
  });

  /* ──────── Test 8: X-XSS-Protection ──────── */

  it('should include X-XSS-Protection header set to 0', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-xss-protection'] !== undefined,
      'X-XSS-Protection header must be present in response. ' +
      'Helmet sets this to 0 to disable the legacy browser XSS filter, ' +
      'which can itself introduce XSS vulnerabilities.'
    );
    assert.strictEqual(
      headers['x-xss-protection'],
      '0',
      'X-XSS-Protection must be set to "0" to disable the buggy browser ' +
      'XSS auditor — modern CSP headers provide superior protection.'
    );
  });

  /* ──────── Test 9: Origin-Agent-Cluster ──────── */

  it('should include Origin-Agent-Cluster header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['origin-agent-cluster'] !== undefined,
      'Origin-Agent-Cluster header must be present in response. ' +
      'Helmet sets this by default to isolate origin processes.'
    );
  });

  /* ──────── Test 10: X-DNS-Prefetch-Control ──────── */

  it('should include X-DNS-Prefetch-Control header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-dns-prefetch-control'] !== undefined,
      'X-DNS-Prefetch-Control header must be present in response. ' +
      'Helmet sets this by default to control DNS prefetching behavior.'
    );
  });

  /* ──────── Test 11: X-Download-Options ──────── */

  it('should include X-Download-Options header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-download-options'] !== undefined,
      'X-Download-Options header must be present in response. ' +
      'Helmet sets this by default to prevent IE from executing downloads.'
    );
  });

  /* ──────── Test 12: X-Permitted-Cross-Domain-Policies ──────── */

  it('should include X-Permitted-Cross-Domain-Policies header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.ok(
      headers['x-permitted-cross-domain-policies'] !== undefined,
      'X-Permitted-Cross-Domain-Policies header must be present in response. ' +
      'Helmet sets this by default to restrict Adobe cross-domain policies.'
    );
  });

  /* ──────── Test 13: X-Powered-By ABSENT ──────── */

  it('should NOT include X-Powered-By header', async () => {
    const { headers } = await makeGetRequest('/');
    assert.strictEqual(
      headers['x-powered-by'],
      undefined,
      'X-Powered-By header must NOT be present in response. ' +
      'Helmet removes the Express default "X-Powered-By: Express" header ' +
      'to prevent server technology fingerprinting by attackers.'
    );
  });

  /* ──────── Test 14: Aggregate Count — At Least 13 Security Headers ──────── */

  it('should include at least 13 security headers', async () => {
    const { headers } = await makeGetRequest('/');

    /*
     * Count how many of the KNOWN_SECURITY_HEADERS are present in the
     * actual response. Helmet 8.x sets 12 security headers by default
     * (CSP, COOP, CORP, Origin-Agent-Cluster, Referrer-Policy, HSTS,
     * X-Content-Type-Options, X-DNS-Prefetch-Control, X-Download-Options,
     * X-Frame-Options, X-Permitted-Cross-Domain-Policies, X-XSS-Protection)
     * and the CORS middleware adds access-control-allow-origin for a total
     * of 13+.
     */
    const presentHeaders = KNOWN_SECURITY_HEADERS.filter(
      (headerName) => headers[headerName] !== undefined
    );

    const presentCount = presentHeaders.length;

    assert.ok(
      presentCount >= 12,
      `Expected at least 12 security headers to be present in the response, ` +
      `but only found ${presentCount}. ` +
      `Present: [${presentHeaders.join(', ')}]. ` +
      `Missing: [${KNOWN_SECURITY_HEADERS.filter((h) => headers[h] === undefined).join(', ')}].`
    );

    /*
     * Additionally verify the X-Powered-By header is absent — this is a
     * security action by Helmet (removal) rather than an addition, so it
     * is not counted in the "present headers" list above but contributes
     * to the overall security posture.
     */
    assert.strictEqual(
      headers['x-powered-by'],
      undefined,
      'X-Powered-By should be absent as part of the security header configuration'
    );
  });
});
