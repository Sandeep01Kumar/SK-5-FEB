'use strict';

/**
 * HTTPS/TLS Verification Tests
 *
 * Verifies that the security-hardened Express application can be served over
 * encrypted HTTPS connections using Node.js built-in https module. The test
 * creates its own HTTPS server independently by passing the imported Express
 * app as a request handler to https.createServer() with temporary self-signed
 * TLS certificates generated via OpenSSL during setup.
 *
 * Test cases verify:
 *  1. TLS handshake completes successfully without error
 *  2. Response body is 'Hello, World!\n' — identical to HTTP (backward compat)
 *  3. HTTP 200 status code is returned over HTTPS
 *  4. Content-Type text/plain header is present over HTTPS
 *  5. Peer certificate details are accessible from the TLS connection
 *
 * Uses Node.js built-in test runner (node:test) and assert module exclusively —
 * no external test framework dependencies per Section 0.7.2.
 *
 * @see Section 0.8.1 — HTTPS (test-https.js): Verify TLS handshake, response body, cert details
 * @see Section 0.6.1 — tests/security/test-https.js: Verify TLS handshake succeeds
 * @see Section 0.8.1 test table — Purpose: Verify TLS/HTTPS functionality
 */

/* ─────────────────────────── Built-in Module Imports ──────────────────────── */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* ─────────────────────── Environment Configuration ───────────────────────── */

/*
 * Set a unique port for the auto-started server (server.js starts listening on
 * require) to prevent EADDRINUSE collisions with any service on port 3000 or
 * ports used by other test files. The test itself creates a separate HTTPS
 * server on a random OS-assigned port (0).
 * A high rate limit prevents accidental 429 responses during testing.
 */
process.env.PORT = '49879';
process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_MAX = '10000';

/* ────────────────────────── Application Import ───────────────────────────── */

/**
 * Import the Express application instance from server.js.
 * On require, server.js auto-starts a listener on the configured PORT (49879).
 * The test creates its own independent HTTPS server on a random port below.
 *
 * config/security.js is loaded transitively by server.js — it provides the
 * SSL_KEY_PATH / SSL_CERT_PATH / host / port settings that govern TLS
 * capability. This test creates its own temporary self-signed certificates
 * rather than reading from the config.
 *
 * @type {import('express').Express}
 */
const app = require('../../server');

/* ──────────────────────────── Test State ──────────────────────────────────── */

/** @type {import('https').Server|null} Test HTTPS server instance */
let httpsServer = null;

/** @type {string} Base URL for HTTPS test requests (set after server binds) */
let baseUrl = '';

/** @type {number} Assigned test HTTPS port (set after server binds) */
let testPort = 0;

/** @type {string} Path to temporary directory containing self-signed certs */
const certDir = path.join(__dirname, '.tmp-test-certs');

/** @type {string} Path to temporary TLS private key file */
const keyPath = path.join(certDir, 'test-key.pem');

/** @type {string} Path to temporary TLS certificate file */
const certPath = path.join(certDir, 'test-cert.pem');

/* ──────────────────────────── Helper Functions ────────────────────────────── */

/**
 * Generates a temporary self-signed TLS certificate and private key pair
 * using the OpenSSL CLI. Creates a 2048-bit RSA key and a self-signed
 * X.509 certificate valid for 1 day with CN=localhost.
 *
 * The certificate files are stored in a temporary directory under the test
 * folder and cleaned up by the after() hook.
 *
 * @throws {Error} If OpenSSL is not available or cert generation fails
 */
function generateSelfSignedCerts() {
  /* Create the temporary certificate directory if it does not already exist */
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  /*
   * Generate a self-signed certificate + private key in a single OpenSSL call:
   *  -x509       : produce a self-signed certificate rather than a CSR
   *  -newkey     : generate a new 2048-bit RSA key pair
   *  -keyout     : output path for the private key
   *  -out        : output path for the certificate
   *  -days 1     : certificate valid for 1 day (test use only)
   *  -nodes      : no passphrase on the private key
   *  -subj       : non-interactive subject string (CN=localhost)
   */
  execSync(
    `openssl req -x509 -newkey rsa:2048 ` +
    `-keyout "${keyPath}" ` +
    `-out "${certPath}" ` +
    `-days 1 -nodes ` +
    `-subj "/CN=localhost"`,
    { stdio: 'pipe' }
  );
}

/**
 * Removes the temporary certificate directory and all files within it.
 * Silently succeeds if the directory does not exist (idempotent cleanup).
 */
function cleanupCerts() {
  try {
    if (fs.existsSync(certPath)) {
      fs.unlinkSync(certPath);
    }
  } catch (_ignored) {
    /* Best-effort cleanup — ignore errors (files may already be gone) */
  }

  try {
    if (fs.existsSync(keyPath)) {
      fs.unlinkSync(keyPath);
    }
  } catch (_ignored) {
    /* Best-effort cleanup */
  }

  try {
    if (fs.existsSync(certDir)) {
      fs.rmdirSync(certDir);
    }
  } catch (_ignored) {
    /* Best-effort cleanup */
  }
}

/**
 * Makes an HTTPS GET request to the test HTTPS server with
 * rejectUnauthorized: false (required for self-signed certificates).
 * Collects the full response body as a string and resolves with status code,
 * headers, body, and the TLS socket for peer certificate inspection.
 *
 * @param {string} urlPath - URL path to request (e.g., '/')
 * @returns {Promise<{statusCode: number, headers: Object, body: string, socket: import('tls').TLSSocket}>}
 */
function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: testPort,
      path: urlPath,
      method: 'GET',
      rejectUnauthorized: false  /* Self-signed cert — skip CA verification */
    };

    const req = https.request(requestOptions, (res) => {
      /*
       * Capture the TLS socket reference immediately on response arrival,
       * before the 'end' event fires. By the time 'end' fires the socket
       * may already be detached from the response object.
       */
      const tlsSocket = res.socket;
      const isEncrypted = !!(tlsSocket && tlsSocket.encrypted);

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          encrypted: isEncrypted,
          socket: tlsSocket
        });
      });
      res.on('error', reject);
    });

    req.on('error', reject);

    /* Enforce a 5-second timeout to prevent tests from hanging indefinitely */
    req.setTimeout(5000, () => {
      req.destroy(new Error('HTTPS GET request timed out after 5000ms'));
    });

    req.end();
  });
}

/* ──────────────────────────── Test Suite ──────────────────────────────────── */

describe('HTTPS/TLS Tests', () => {

  /**
   * before() hook — generates temporary self-signed TLS certificates using
   * OpenSSL, reads them from disk, creates an HTTPS server with the Express
   * app as the request handler, and starts it listening on a random
   * OS-assigned port (port 0) to eliminate EADDRINUSE collisions.
   */
  before(async () => {
    /* Step 1: Generate temporary self-signed certificates */
    generateSelfSignedCerts();

    /* Step 2: Read certificate and private key from disk */
    const key = fs.readFileSync(keyPath);
    const cert = fs.readFileSync(certPath);

    /* Step 3: Create HTTPS server with Express app and TLS credentials */
    httpsServer = https.createServer({ key, cert }, app);

    /* Step 4: Start listening on a random available port */
    return new Promise((resolve, reject) => {
      httpsServer.listen(0, '127.0.0.1', () => {
        const addr = httpsServer.address();
        testPort = addr.port;
        baseUrl = `https://${addr.address}:${testPort}`;
        resolve();
      });
      httpsServer.on('error', (err) => {
        reject(new Error(`Failed to start HTTPS test server: ${err.message}`));
      });
    });
  });

  /**
   * after() hook — gracefully shuts down the HTTPS test server, cleans up
   * temporary certificate files, and forces process exit. The force-exit is
   * necessary because server.js auto-starts a listener on require() with no
   * exported handle to close, which would otherwise keep the Node.js event
   * loop alive indefinitely after tests complete.
   */
  after(async () => {
    /* Close the HTTPS test server if it is still listening */
    await new Promise((resolve) => {
      if (httpsServer && httpsServer.listening) {
        httpsServer.close(() => {
          httpsServer = null;
          resolve();
        });
      } else {
        httpsServer = null;
        resolve();
      }
    });

    /* Remove temporary certificate files */
    cleanupCerts();

    /*
     * Allow a brief delay for TAP output to flush, then force process exit.
     * The auto-started server from require('../../server') has no exposed
     * handle, so it cannot be closed programmatically.
     */
    setTimeout(() => process.exit(0), 200).unref();
  });

  /* ──────── Test Case 1: TLS Handshake Success ──────── */

  it('should complete TLS handshake successfully', async () => {
    /*
     * If the HTTPS request completes without throwing, the TLS handshake
     * succeeded. Any TLS negotiation failure would surface as an ECONNREFUSED,
     * ERR_TLS_CERT_ALTNAME_INVALID, or similar socket-level error that would
     * cause the promise to reject.
     */
    const response = await httpsGet('/');
    assert.ok(
      response.statusCode,
      'TLS handshake must succeed — a valid HTTP status code indicates the ' +
      'encrypted connection was established and a response was received'
    );
    assert.ok(
      response.encrypted,
      'Socket must be encrypted (TLS) — the connection should be a TLS socket'
    );
  });

  /* ──────── Test Case 2: Hello, World!\n Body Over HTTPS ──────── */

  it('should respond with Hello, World!\\n over HTTPS', async () => {
    const response = await httpsGet('/');
    assert.strictEqual(
      response.body,
      'Hello, World!\n',
      `Expected exact body 'Hello, World!\\n' over HTTPS, received '${response.body}'`
    );
  });

  /* ──────── Test Case 3: HTTP 200 Status Code Over HTTPS ──────── */

  it('should return 200 status code over HTTPS', async () => {
    const response = await httpsGet('/');
    assert.strictEqual(
      response.statusCode,
      200,
      `Expected HTTP 200 over HTTPS, received HTTP ${response.statusCode}`
    );
  });

  /* ──────── Test Case 4: text/plain Content-Type Over HTTPS ──────── */

  it('should return text/plain content type over HTTPS', async () => {
    const response = await httpsGet('/');
    assert.ok(
      response.headers['content-type'],
      'Content-Type header must be present in HTTPS response'
    );
    assert.ok(
      response.headers['content-type'].includes('text/plain'),
      `Content-Type must contain 'text/plain' over HTTPS, received '${response.headers['content-type']}'`
    );
  });

  /* ──────── Test Case 5: Accessible Certificate Details ──────── */

  it('should have accessible certificate details', async () => {
    /*
     * Use a raw https.request() so that we can inspect the TLS socket's
     * peer certificate before the response body is fully consumed. The
     * getPeerCertificate() method returns an object with subject, issuer,
     * valid_from, valid_to, fingerprint, and other fields.
     */
    const certDetails = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path: '/',
          method: 'GET',
          rejectUnauthorized: false
        },
        (res) => {
          /* Retrieve peer certificate from the TLS socket */
          const peerCert = res.socket.getPeerCertificate();
          /* Consume response body to prevent memory leaks */
          res.on('data', () => {});
          res.on('end', () => {
            resolve(peerCert);
          });
          res.on('error', reject);
        }
      );

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy(new Error('HTTPS cert inspection request timed out after 5000ms'));
      });
      req.end();
    });

    /* Assert that the peer certificate object is not empty */
    assert.ok(
      certDetails && typeof certDetails === 'object',
      'Peer certificate must be an accessible object'
    );

    /* Assert the certificate subject contains the CN we set during generation */
    assert.ok(
      certDetails.subject,
      'Peer certificate must have a subject field'
    );
    assert.strictEqual(
      certDetails.subject.CN,
      'localhost',
      `Certificate CN must be 'localhost', received '${certDetails.subject ? certDetails.subject.CN : 'undefined'}'`
    );

    /* Assert validity date fields are present and non-empty */
    assert.ok(
      certDetails.valid_from,
      'Peer certificate must have a valid_from date'
    );
    assert.ok(
      certDetails.valid_to,
      'Peer certificate must have a valid_to date'
    );

    /* Assert a fingerprint is present (confirms certificate data is accessible) */
    assert.ok(
      certDetails.fingerprint,
      'Peer certificate must have a fingerprint'
    );
  });

});
