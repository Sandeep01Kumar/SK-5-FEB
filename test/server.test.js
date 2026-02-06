/**
 * Integration tests for the Express.js server application.
 *
 * Tests both HTTP endpoints:
 *   - GET /        — Verifies HTTP 200 status, "Hello, universe!\n" body, text/plain Content-Type
 *   - GET /evening — Verifies HTTP 200 status, "Good evening" body, text/plain Content-Type
 *
 * Also tests that requests to undefined routes return HTTP 404 responses
 * (Express.js default behavior for unmatched routes).
 *
 * Uses Node.js built-in test runner (node:test) and assertion module (node:assert)
 * to avoid adding external test framework dependencies, consistent with the
 * project's minimal dependency approach.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

/** @type {import('express').Application} */
let app;

/** @type {import('http').Server} */
let server;

/**
 * Makes an HTTP GET request to the test server and returns a promise
 * resolving with the response status code, headers, and body.
 *
 * @param {string} path - The URL path to request (e.g., '/' or '/evening')
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3000${path}`, (res) => {
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

describe('Express.js Server - Endpoint Integration Tests', () => {
  before(() => {
    // Import the server module which starts listening on 127.0.0.1:3000
    app = require('../server');
    server = app.server;

    // Wait for the server to be fully ready before running tests
    return new Promise((resolve) => {
      if (server.listening) {
        resolve();
      } else {
        server.on('listening', resolve);
      }
    });
  });

  after(() => {
    // Gracefully close the server to release the port and allow the
    // test runner process to exit cleanly
    return new Promise((resolve) => {
      if (server) {
        server.close(resolve);
      } else {
        resolve();
      }
    });
  });

  describe('GET / — Root endpoint (backward compatibility)', () => {
    it('should return HTTP 200 status code', async () => {
      const res = await httpGet('/');
      assert.strictEqual(res.statusCode, 200);
    });

    it('should return the exact body "Hello, universe!\\n" with trailing newline', async () => {
      const res = await httpGet('/');
      assert.strictEqual(res.body, 'Hello, universe!\n');
    });

    it('should return Content-Type header containing text/plain', async () => {
      const res = await httpGet('/');
      assert.ok(
        res.headers['content-type'].includes('text/plain'),
        `Expected Content-Type to include "text/plain", got "${res.headers['content-type']}"`
      );
    });
  });

  describe('GET /evening — New greeting endpoint', () => {
    it('should return HTTP 200 status code', async () => {
      const res = await httpGet('/evening');
      assert.strictEqual(res.statusCode, 200);
    });

    it('should return the exact body "Good evening"', async () => {
      const res = await httpGet('/evening');
      assert.strictEqual(res.body, 'Good evening');
    });

    it('should return Content-Type header containing text/plain', async () => {
      const res = await httpGet('/evening');
      assert.ok(
        res.headers['content-type'].includes('text/plain'),
        `Expected Content-Type to include "text/plain", got "${res.headers['content-type']}"`
      );
    });
  });

  describe('Undefined routes — 404 handling', () => {
    it('should return HTTP 404 for GET /nonexistent', async () => {
      const res = await httpGet('/nonexistent');
      assert.strictEqual(res.statusCode, 404);
    });

    it('should return HTTP 404 for GET /random-path', async () => {
      const res = await httpGet('/random-path');
      assert.strictEqual(res.statusCode, 404);
    });
  });
});
