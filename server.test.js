/**
 * server.test.js — Comprehensive test suite for hardened server.js
 *
 * 15 unit/integration tests organized into four categories:
 *   Category 1: Basic Functionality (2 tests)
 *   Category 2: Input Validation (8 tests)
 *   Category 3: Edge Cases (4 tests)
 *   Category 4: Rapid Requests (1 test)
 *
 * Uses ONLY Node.js built-in modules (http, child_process, net).
 * Run with: timeout 30 node server.test.js
 */

const http = require('http');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const SERVER_PATH = path.join(__dirname, 'server.js');
const HOSTNAME = '127.0.0.1';
const PORT = 3000;

let passed = 0;
let failed = 0;
const results = [];

/**
 * Records a test result.
 * @param {string} testName - Descriptive name for the test case.
 * @param {boolean} pass - Whether the test passed.
 * @param {string} [detail] - Diagnostic detail on failure.
 */
function recordResult(testName, pass, detail) {
  if (pass) {
    passed++;
    results.push(`  PASS: ${testName}`);
  } else {
    failed++;
    results.push(`  FAIL: ${testName} -- ${detail || 'no detail'}`);
  }
}

/**
 * Makes an HTTP request to the server.
 * @param {string} method - HTTP method (GET, POST, etc.).
 * @param {string} urlPath - Request path (e.g., '/', '/nonexistent').
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
function makeRequest(method, urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOSTNAME,
      port: PORT,
      path: urlPath,
      method: method,
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: body });
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * Starts server.js as a child process and resolves when the
 * "Server running at" message appears on stdout.
 * @returns {Promise<{child: ChildProcess, stdout: string, stderr: string}>}
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      if (stdout.includes('Server running at')) {
        resolve({ child, stdout, stderr });
      }
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (err) => reject(err));
    setTimeout(() => reject(new Error('Server start timeout after 5s')), 5000);
  });
}

/**
 * Stops the server by sending SIGTERM and waits for exit.
 * Falls back to SIGKILL after 8 seconds.
 * @param {ChildProcess} child
 * @returns {Promise<number|null>} - exit code
 */
function stopServer(child) {
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
    child.kill('SIGTERM');
    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
      resolve(null);
    }, 8000);
  });
}

/**
 * Waits until the given port is no longer accepting connections.
 * @param {number} portNum
 * @param {number} maxWait - Max wait time in milliseconds.
 * @returns {Promise<boolean>} - true if port became free
 */
function waitForPortFree(portNum, maxWait) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const s = net.createConnection({ port: portNum, host: HOSTNAME });
      s.on('connect', () => {
        s.destroy();
        if (Date.now() - start > maxWait) {
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      });
      s.on('error', () => {
        resolve(true);
      });
    };
    check();
  });
}

/**
 * Main test runner — executes all 15 tests sequentially.
 */
async function runTests() {
  console.log('\n=== server.test.js — Test Suite for Hardened server.js ===\n');

  // Ensure port is free before starting any test
  const portFree = await waitForPortFree(PORT, 3000);
  if (!portFree) {
    console.error(`Port ${PORT} is still occupied. Cannot run tests.`);
    process.exit(1);
  }

  // =========================================================
  // CATEGORY 1: Basic Functionality (2 tests)
  // =========================================================
  console.log('Category 1: Basic Functionality');
  let server;
  try {
    server = await startServer();

    // Test 1: GET / returns 200 OK with body Hello, World!\n and Content-Type text/plain
    try {
      const res = await makeRequest('GET', '/');
      const ok = res.statusCode === 200
        && res.body === 'Hello, World!\n'
        && res.headers['content-type'] === 'text/plain';
      recordResult('Test 1: GET / returns 200 with Hello, World!', ok,
        `statusCode=${res.statusCode}, body="${res.body.trim()}", content-type="${res.headers['content-type']}"`);
    } catch (err) {
      recordResult('Test 1: GET / returns 200 with Hello, World!', false, err.message);
    }

    // Test 2: Server starts and logs startup message
    recordResult('Test 2: Server logs startup message',
      server.stdout.includes('Server running at http://127.0.0.1:3000/'),
      `stdout="${server.stdout.trim()}"`);

  } catch (err) {
    recordResult('Test 1: GET / returns 200 with Hello, World!', false, err.message);
    recordResult('Test 2: Server logs startup message', false, 'Server did not start');
  }

  // =========================================================
  // CATEGORY 2: Input Validation (8 tests)
  // =========================================================
  console.log('\nCategory 2: Input Validation');

  if (server) {
    // Test 3: GET /nonexistent returns 404 Not Found
    try {
      const res = await makeRequest('GET', '/nonexistent');
      recordResult('Test 3: GET /nonexistent returns 404',
        res.statusCode === 404 && res.body === '404 Not Found\n',
        `statusCode=${res.statusCode}, body="${res.body.trim()}"`);
    } catch (err) {
      recordResult('Test 3: GET /nonexistent returns 404', false, err.message);
    }

    // Test 4: POST / returns 405 Method Not Allowed
    try {
      const res = await makeRequest('POST', '/');
      recordResult('Test 4: POST / returns 405',
        res.statusCode === 405 && res.body === '405 Method Not Allowed\n',
        `statusCode=${res.statusCode}, body="${res.body.trim()}"`);
    } catch (err) {
      recordResult('Test 4: POST / returns 405', false, err.message);
    }

    // Test 5: PUT / returns 405 Method Not Allowed
    try {
      const res = await makeRequest('PUT', '/');
      recordResult('Test 5: PUT / returns 405',
        res.statusCode === 405,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 5: PUT / returns 405', false, err.message);
    }

    // Test 6: DELETE / returns 405 Method Not Allowed
    try {
      const res = await makeRequest('DELETE', '/');
      recordResult('Test 6: DELETE / returns 405',
        res.statusCode === 405,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 6: DELETE / returns 405', false, err.message);
    }

    // Test 7: PATCH / returns 405 Method Not Allowed
    try {
      const res = await makeRequest('PATCH', '/');
      recordResult('Test 7: PATCH / returns 405',
        res.statusCode === 405,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 7: PATCH / returns 405', false, err.message);
    }

    // Test 8: HEAD / returns 405
    try {
      const res = await makeRequest('HEAD', '/');
      recordResult('Test 8: HEAD / returns 405',
        res.statusCode === 405,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 8: HEAD / returns 405', false, err.message);
    }

    // Test 9: OPTIONS / returns 405 Method Not Allowed
    try {
      const res = await makeRequest('OPTIONS', '/');
      recordResult('Test 9: OPTIONS / returns 405',
        res.statusCode === 405,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 9: OPTIONS / returns 405', false, err.message);
    }

    // Test 10: POST /foo returns 404 (path mismatch takes priority over method)
    try {
      const res = await makeRequest('POST', '/foo');
      recordResult('Test 10: POST /foo returns 404 (path mismatch priority)',
        res.statusCode === 404,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 10: POST /foo returns 404 (path mismatch priority)', false, err.message);
    }
  }

  // =========================================================
  // CATEGORY 3: Edge Cases (4 tests)
  // =========================================================
  console.log('\nCategory 3: Edge Cases');

  if (server) {
    // Test 11: GET /?key=value returns 200 (query string on root path)
    try {
      const res = await makeRequest('GET', '/?key=value');
      recordResult('Test 11: GET /?key=value returns 200',
        res.statusCode === 200 && res.body === 'Hello, World!\n',
        `statusCode=${res.statusCode}, body="${res.body.trim()}"`);
    } catch (err) {
      recordResult('Test 11: GET /?key=value returns 200', false, err.message);
    }

    // Test 12: GET /x?y=z returns 404 (non-root with query string)
    try {
      const res = await makeRequest('GET', '/x?y=z');
      recordResult('Test 12: GET /x?y=z returns 404',
        res.statusCode === 404,
        `statusCode=${res.statusCode}`);
    } catch (err) {
      recordResult('Test 12: GET /x?y=z returns 404', false, err.message);
    }
  }

  // Stop the server before shutdown/error tests
  if (server) {
    await stopServer(server.child);
    await waitForPortFree(PORT, 5000);
  }

  // Test 13: SIGTERM triggers graceful shutdown with proper messages and exit code 0
  try {
    const s2 = await startServer();
    const exitPromise = new Promise((resolve) => {
      let stderr = '';
      let stdout = '';
      s2.child.stdout.on('data', (d) => { stdout += d.toString(); });
      s2.child.stderr.on('data', (d) => { stderr += d.toString(); });
      s2.child.on('exit', (code) => resolve({ code, stdout, stderr }));
    });
    s2.child.kill('SIGTERM');
    const result = await exitPromise;
    const hasShutdownMsg = result.stdout.includes('Shutting down gracefully... (SIGTERM)');
    const hasClosedMsg = result.stdout.includes('Server closed.');
    recordResult('Test 13: SIGTERM graceful shutdown',
      hasShutdownMsg && hasClosedMsg && result.code === 0,
      `code=${result.code}, shutdownMsg=${hasShutdownMsg}, closedMsg=${hasClosedMsg}`);
    await waitForPortFree(PORT, 5000);
  } catch (err) {
    recordResult('Test 13: SIGTERM graceful shutdown', false, err.message);
  }

  // Test 14: EADDRINUSE handled gracefully (exits 1 with error log)
  try {
    // Occupy port 3000 with a TCP blocker
    const blocker = net.createServer();
    await new Promise((resolve, reject) => {
      blocker.listen(PORT, HOSTNAME, () => resolve());
      blocker.on('error', reject);
    });

    // Attempt to start server — should fail gracefully
    const child = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    const exitCode = await new Promise((resolve) => {
      child.on('exit', (code) => resolve(code));
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
        resolve(null);
      }, 5000);
    });
    const hasErrorMsg = stderr.includes('Server error:') && stderr.includes('EADDRINUSE');
    recordResult('Test 14: EADDRINUSE handled gracefully (exits 1)',
      hasErrorMsg && exitCode === 1,
      `exitCode=${exitCode}, stderrMatch=${hasErrorMsg}`);

    // Clean up the blocker
    await new Promise((resolve) => { blocker.close(() => resolve()); });
    await waitForPortFree(PORT, 3000);
  } catch (err) {
    recordResult('Test 14: EADDRINUSE handled gracefully (exits 1)', false, err.message);
  }

  // =========================================================
  // CATEGORY 4: Rapid Requests (1 test)
  // =========================================================
  console.log('\nCategory 4: Rapid Requests');

  // Test 15: 10 concurrent GET / requests all return 200 OK
  try {
    const s3 = await startServer();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(makeRequest('GET', '/'));
    }
    const responses = await Promise.all(promises);
    const allOk = responses.every((r) => r.statusCode === 200 && r.body === 'Hello, World!\n');
    recordResult('Test 15: 10 concurrent GET / all return 200',
      allOk,
      `allOk=${allOk}, count=${responses.length}`);
    await stopServer(s3.child);
    await waitForPortFree(PORT, 5000);
  } catch (err) {
    recordResult('Test 15: 10 concurrent GET / all return 200', false, err.message);
  }

  // =========================================================
  // RESULTS SUMMARY
  // =========================================================
  console.log('\n=== Test Results ===');
  results.forEach((r) => console.log(r));
  console.log(`\nPassed: ${passed} / ${passed + failed}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
