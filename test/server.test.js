/**
 * Integration tests for the Express.js server application.
 *
 * Validates both HTTP endpoints and default 404 handling:
 *   - GET /        — Verifies HTTP 200 status, "Hello, universe!\n" body, text/plain Content-Type
 *   - GET /evening — Verifies HTTP 200 status, "Good evening" body, text/plain Content-Type
 *   - Undefined    — Verifies HTTP 404 for unmatched routes (Express.js default behavior)
 *
 * Uses Node.js built-in test runner (node:test) and assertion module (node:assert)
 * to avoid adding external test framework dependencies, consistent with the
 * project's minimal dependency approach. HTTP requests are made via the built-in
 * node:http module using both http.get() and http.request() methods.
 *
 * Server lifecycle is managed explicitly: the test suite starts its own server
 * in the before() hook and closes it in the after() hook. The server.js module
 * does NOT auto-start when required, which avoids event-loop timing issues with
 * the Node.js built-in test runner (node:test) on v20.x where promises in
 * before() hooks could remain pending while the event loop resolved.
 */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

/**
 * Express application instance imported from server.js.
 * Requiring the module does NOT start listening; the test manages that.
 * @type {import('express').Application}
 */
const app = require('../server');

/**
 * HTTP server instance created and managed by the test suite.
 * Started in the before() hook, closed in the after() hook.
 * @type {import('http').Server | null}
 */
let server = null;

/**
 * Hostname and port exported by the server module, used to start
 * the test server on the same address as the production server.
 */
const hostname = app.hostname;
const port = app.port;

/**
 * Makes an HTTP GET request using the http.get() shorthand and returns a
 * promise that resolves with the response status code, headers, and body.
 *
 * This helper uses http.get() which automatically sets the method to GET
 * and calls req.end() internally, making it ideal for simple GET requests.
 *
 * @param {string} path - The URL path to request (e.g., '/' or '/evening')
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 *   Resolves with the parsed response details
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${hostname}:${port}${path}`, (res) => {
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
    }).on('error', reject);
  });
}

/**
 * Makes an HTTP request using http.request() with full control over the
 * request options (method, hostname, port, path, headers). Returns a promise
 * that resolves with the response status code, headers, and body.
 *
 * This helper uses http.request() for cases where more control over the
 * request configuration is needed (e.g., specifying custom headers or methods).
 *
 * @param {object} options - Node.js http.request() options object
 * @param {string} options.hostname - Target hostname (e.g., '127.0.0.1')
 * @param {number} options.port - Target port (e.g., 3000)
 * @param {string} options.path - URL path (e.g., '/evening')
 * @param {string} options.method - HTTP method (e.g., 'GET')
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 *   Resolves with the parsed response details
 */
function httpRequest(options) {
  return new Promise((resolve, reject) => {
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
    req.end();
  });
}

describe('Express.js Server - Endpoint Integration Tests', () => {
  // Setup: Start the Express server on 127.0.0.1:3000 and wait until it is
  // fully listening before running any test cases. The server is started here
  // (rather than auto-started in server.js on require) to give the test runner
  // full control over the lifecycle and avoid event-loop timing issues.
  before((_, done) => {
    server = app.listen(port, hostname, () => {
      done();
    });
  });

  // Teardown: Gracefully close the HTTP server to release port 3000 and allow
  // the test runner process to exit cleanly without dangling connections.
  after((_, done) => {
    if (server) {
      server.close(() => {
        done();
      });
    } else {
      done();
    }
  });

  // -----------------------------------------------------------------------
  // GET / — Root endpoint tests (backward compatibility with original server)
  // -----------------------------------------------------------------------
  describe('GET / — Root endpoint (backward compatibility)', () => {
    it('should return HTTP 200 status code', async () => {
      const res = await httpGet('/');
      assert.strictEqual(res.statusCode, 200,
        'Root endpoint must return status 200');
    });

    it('should return the exact body "Hello, universe!\\n" with trailing newline', async () => {
      const res = await httpGet('/');
      assert.strictEqual(res.body, 'Hello, universe!\n',
        'Root endpoint body must match the original server response exactly');
    });

    it('should return Content-Type header containing text/plain', async () => {
      const res = await httpGet('/');
      // Verify the Content-Type header is present
      assert.ok(res.headers['content-type'],
        'Content-Type header must be present in the response');
      // Verify it matches the text/plain pattern (may include charset suffix)
      assert.match(res.headers['content-type'], /text\/plain/,
        'Content-Type header must contain "text/plain"');
    });
  });

  // -----------------------------------------------------------------------
  // GET /evening — New greeting endpoint tests
  // -----------------------------------------------------------------------
  describe('GET /evening — New greeting endpoint', () => {
    it('should return HTTP 200 status code', async () => {
      // Use http.request() with explicit options for this test to exercise
      // both http.get() and http.request() code paths across the test suite
      const res = await httpRequest({
        hostname: hostname,
        port: port,
        path: '/evening',
        method: 'GET'
      });
      assert.strictEqual(res.statusCode, 200,
        'Evening endpoint must return status 200');
    });

    it('should return the exact body "Good evening"', async () => {
      const res = await httpGet('/evening');
      assert.strictEqual(res.body, 'Good evening',
        'Evening endpoint body must match the user-specified response exactly');
    });

    it('should return Content-Type header containing text/plain', async () => {
      const res = await httpRequest({
        hostname: hostname,
        port: port,
        path: '/evening',
        method: 'GET'
      });
      // Verify the Content-Type header is present
      assert.ok(res.headers['content-type'],
        'Content-Type header must be present in the response');
      // Verify it matches the text/plain pattern (may include charset suffix)
      assert.match(res.headers['content-type'], /text\/plain/,
        'Content-Type header must contain "text/plain"');
    });
  });

  // -----------------------------------------------------------------------
  // Undefined routes — Express.js default 404 handling
  // -----------------------------------------------------------------------
  describe('Undefined routes — 404 handling', () => {
    it('should return HTTP 404 for GET /nonexistent', async () => {
      const res = await httpGet('/nonexistent');
      assert.strictEqual(res.statusCode, 404,
        'Requests to undefined routes must return 404');
    });

    it('should return HTTP 404 for GET /random-path using http.request()', async () => {
      // Use http.request() with explicit options to verify 404 handling
      // through a different HTTP client code path
      const res = await httpRequest({
        hostname: hostname,
        port: port,
        path: '/random-path',
        method: 'GET'
      });
      assert.strictEqual(res.statusCode, 404,
        'Requests to undefined routes must return 404 regardless of path');
    });
  });
});
