# Technical Specification

# 0. Agent Action Plan

## 0.1 Executive Summary

Based on the bug description, the Blitzy platform understands that the bug is a collection of robustness deficiencies in `server.js` — a minimal Node.js HTTP server that lacks error handling, graceful shutdown support, input validation, resource cleanup, and resilient HTTP request processing. The server blindly returns `200 OK` for every inbound request regardless of HTTP method or path, provides no mechanism to catch server-level or request-level errors, and will crash ungracefully when the process receives a termination signal or encounters a port collision.

The specific error types identified are:

- **Unhandled operational error** — No `server.on('error', ...)` listener means an `EADDRINUSE` error when port 3000 is occupied causes an unhandled exception crash.
- **Absent graceful shutdown** — No `SIGTERM`/`SIGINT` handlers means the process immediately kills all active connections without draining them.
- **Missing input validation** — No route or method checks; every request (e.g., `POST /admin`, `DELETE /anything`) receives `200 OK` with `Hello, World!`.
- **No request/response error handling** — Broken pipes, malformed requests, and client-side disconnects go unhandled.
- **No resource cleanup** — Open connections are never properly drained on shutdown, risking data loss and socket leaks.

The reproduction steps are:

- Start the server: `node server.js`
- Send a request to an invalid path: `curl http://127.0.0.1:3000/nonexistent` — returns `200` instead of `404`
- Occupy port 3000 and attempt to start the server — crashes with unhandled `EADDRINUSE`
- Press `Ctrl+C` while requests are in-flight — connections are severed immediately without cleanup


## 0.2 Root Cause Identification

Based on research, the root causes are six distinct deficiencies in `server.js`, each documented below with definitive evidence from repository analysis.

**Root Cause 1 — No server-level error handler**
- Located in: `server.js`, line 12 (original) — `server.listen(port, hostname, () => { ... })`
- Triggered by: Attempting to bind port 3000 when it is already occupied. Without `server.on('error', ...)`, the `EADDRINUSE` error propagates as an uncaught exception and crashes the Node.js process.
- Evidence: The original `server.js` contains zero event listeners for the `'error'` event on the server object. Running `grep -n "on(" server.js` against the original file returned no matches.
- This conclusion is definitive because: Node.js `net.Server` emits an `'error'` event when `listen()` fails; without a listener, Node.js throws the error as an uncaught exception per its EventEmitter contract.

**Root Cause 2 — No graceful shutdown mechanism**
- Located in: `server.js` — entire file, absence of `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)`
- Triggered by: Sending `SIGTERM` (e.g., `kill <pid>`) or `SIGINT` (e.g., `Ctrl+C`) to the running process.
- Evidence: `grep -n "SIGTERM\|SIGINT\|close\|shutdown" server.js` returned zero matches against the original file.
- This conclusion is definitive because: Without signal handlers, Node.js uses the default OS behavior — immediate process termination — which severs active HTTP connections without allowing them to complete.

**Root Cause 3 — No input validation (route/method handling)**
- Located in: `server.js`, lines 6–10 (original) — the `createServer` callback
- Triggered by: Any HTTP request to any path with any method receives `200 OK` with `Hello, World!`.
- Evidence: The request handler at lines 7–9 unconditionally sets `statusCode = 200`, sets the `Content-Type` header, and calls `res.end()` without inspecting `req.url` or `req.method`.
- This conclusion is definitive because: The handler body contains no conditional logic whatsoever — it is a straight-through three-statement pipeline.

**Root Cause 4 — No request/response error handling**
- Located in: `server.js`, lines 6–10 (original) — the `createServer` callback
- Triggered by: Client-side disconnects during response, malformed request data, or broken pipe conditions.
- Evidence: No `req.on('error', ...)` or `res.on('error', ...)` listeners exist in the original file.
- This conclusion is definitive because: Node.js `IncomingMessage` and `ServerResponse` are streams that emit `'error'` events; unhandled stream errors cause the process to throw.

**Root Cause 5 — No `clientError` handler**
- Located in: `server.js` — absence of `server.on('clientError', ...)`
- Triggered by: Malformed HTTP requests (e.g., invalid headers, broken TLS handshake if upgraded).
- Evidence: The `clientError` event is not registered anywhere in the original 14-line file.
- This conclusion is definitive because: Without a `clientError` handler, the server's default behavior is to destroy the socket without sending any HTTP response, leaving the client hanging.

**Root Cause 6 — No unhandled exception/rejection safety net**
- Located in: `server.js` — entire file, absence of `process.on('uncaughtException', ...)` and `process.on('unhandledRejection', ...)`
- Triggered by: Any unexpected runtime error or rejected promise anywhere in the server's execution context.
- Evidence: Zero process-level error handlers exist in the original file.
- This conclusion is definitive because: Without these safety nets, any stray exception or rejected promise causes an immediate crash with no logging or cleanup.


## 0.3 Diagnostic Execution

### 0.3.1 Code Examination Results

- **File analyzed:** `server.js` (14 lines, the sole runtime entry point)
- **Problematic code block:** Lines 6–10 (request handler) and lines 12–14 (server listen)
- **Specific failure points:**
  - Line 6: `createServer` callback lacks any error handling or input validation
  - Line 7: `res.statusCode = 200` set unconditionally for all requests
  - Line 12: `server.listen()` has no preceding `server.on('error', ...)` registration
- **Execution flow leading to bugs:**
  - Step 1: `node server.js` is executed, importing `http` and creating the server
  - Step 2: `server.listen()` binds to `127.0.0.1:3000`
  - Step 3: If port 3000 is occupied, an `EADDRINUSE` error is emitted with no handler — process crashes
  - Step 4: If binding succeeds, any incoming request (e.g., `POST /admin`) enters the handler at line 6
  - Step 5: The handler sets status 200 and responds with `Hello, World!` regardless of method or path
  - Step 6: If the process receives `SIGTERM`/`SIGINT`, it terminates immediately, severing active connections

### 0.3.2 Repository Analysis Findings

| Tool Used | Command Executed | Finding | File:Line |
|-----------|-----------------|---------|-----------|
| grep | `grep -rn "error\|catch\|try\|throw" server.js` | Zero error-handling constructs found | `server.js:*` (no matches) |
| grep | `grep -rn "SIGTERM\|SIGINT\|close\|shutdown" server.js` | Zero shutdown-related constructs found | `server.js:*` (no matches) |
| grep | `grep -rn "on(" server.js` | Zero event listeners registered | `server.js:*` (no matches) |
| grep | `grep -rn "404\|405\|method\|url\|validate" server.js` | Zero input validation logic found | `server.js:*` (no matches) |
| cat | `cat -n server.js` | Confirmed 14-line file with no conditionals in handler | `server.js:1-14` |
| node | `node -e "... s.timeout ..."` | Default server timeout is `0` (disabled) | Runtime check |
| bash | Port collision test (two servers on 3000) | `EADDRINUSE` confirmed as unhandled without `server.on('error')` | Runtime test |
| find | `find / -name ".blitzyignore"` | No ignore files found | N/A |
| npm | `npm install` | Zero external dependencies; only built-in `http` module used | `package.json` |

### 0.3.3 Web Search Findings

- **Search queries used:**
  - `"Node.js http.createServer error handling best practices"`
  - `"Node.js graceful shutdown SIGTERM SIGINT server.close"`

- **Web sources referenced:**
  - Node.js official HTTP documentation (`nodejs.org/api/http.html`)
  - DigitalOcean Node.js tutorial on error handling
  - Lagoon documentation on Node.js graceful shutdown
  - Multiple Medium/npm articles on `SIGTERM`/`SIGINT` handling patterns

- **Key findings and discoveries incorporated:**
  - The Node.js `http.Server` emits two distinct error events: `'error'` (server-level, e.g., `EADDRINUSE`) and `'clientError'` (malformed client requests). Both must be handled separately.
  - Graceful shutdown requires registering `process.on('SIGTERM')` and `process.on('SIGINT')`, calling `server.close()` to stop accepting new connections, then allowing in-flight requests to drain before calling `process.exit(0)`.
  - A forced-shutdown timeout (typically 5–10 seconds) is recommended as a safety net against connections that never close.
  - The `socket.writable` check is required before writing to a socket in the `clientError` handler to avoid writing to an already-destroyed socket.

### 0.3.4 Fix Verification Analysis

- **Steps followed to reproduce bugs:**
  - Started `server.js` and confirmed `GET /nonexistent` returns `200` (should be `404`)
  - Occupied port 3000 with a blocker server, then started `server.js` — confirmed unhandled `EADDRINUSE` crash
  - Sent `SIGTERM` to the running server — confirmed immediate termination without graceful shutdown logging

- **Confirmation tests used to ensure that bugs were fixed:**
  - 15 unit tests covering happy path, input validation, edge cases, and concurrent requests — all passed
  - Graceful shutdown test: sent `SIGTERM`, confirmed `"Shutting down gracefully..."` and `"Server closed."` messages, exit code 0
  - Graceful shutdown test: sent `SIGINT`, confirmed identical graceful behavior
  - EADDRINUSE test: occupied port 3000, started `server.js`, confirmed `"Server error: listen EADDRINUSE..."` logged and exit code 1

- **Boundary conditions and edge cases covered:**
  - Query strings on root path (`GET /?key=value`) — correctly returns `200`
  - Non-root paths with query strings (`GET /x?y=z`) — correctly returns `404`
  - Multiple HTTP methods (`POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`) — all return `405` on root
  - Non-GET methods on non-root paths — return `404` (path mismatch takes priority)
  - 10 concurrent requests — all handled successfully
  - Duplicate shutdown signals — guarded by `isShuttingDown` flag

- **Verification was successful. Confidence level: 95%**
  - The 5% uncertainty accounts for client-error edge cases (malformed HTTP) that are difficult to trigger programmatically in the test harness but are handled by the `clientError` listener.


## 0.4 Bug Fix Specification

### 0.4.1 The Definitive Fix

- **File to modify:** `server.js`
- **Current implementation (lines 1–14):** A 14-line server that imports `http`, creates a server with an unconditional `200 OK` handler, and listens on `127.0.0.1:3000` with no error handling, shutdown logic, or input validation.
- **Required change:** Replace the request handler with a validated routing block, add server/client error listeners, add graceful shutdown with signal handlers, and add process-level exception safety nets.
- **This fixes the root cause by:** Directly addressing each of the six deficiencies: server error handling, graceful shutdown, input validation, request/response error handling, client error handling, and unhandled exception/rejection safety.

### 0.4.2 Change Instructions

**INSERT at line 2** (after `const http = require('http');`):
```javascript
const url = require('url');
```
Adds the built-in `url` module to properly parse request URLs, separating pathname from query strings.

**INSERT at line 7** (before the `createServer` call):
```javascript
let isShuttingDown = false;
```
A guard flag to prevent duplicate shutdown handling when multiple signals arrive.

**MODIFY lines 6–10** from:
```javascript
const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello, World!\n');
});
```
to:
```javascript
const server = http.createServer((req, res) => {
  req.on('error', (err) => { /* 400 Bad Request */ });
  res.on('error', (err) => { /* log silently */ });
  const pathname = url.parse(req.url).pathname;
  if (req.method === 'GET' && pathname === '/') {
    // Original 200 OK response preserved
  } else if (pathname !== '/') {
    // 404 Not Found
  } else {
    // 405 Method Not Allowed
  }
});
```
Adds request/response error handlers, URL parsing for query-string safety, and route/method validation with appropriate HTTP status codes.

**INSERT after line 10** (after the `createServer` closing brace):
```javascript
server.on('error', (err) => { /* log and exit(1) */ });
server.on('clientError', (err, socket) => { /* 400 to socket */ });
```
Catches server-level errors (e.g., `EADDRINUSE`) and malformed client requests.

**INSERT before line 12** (before `server.listen`):
```javascript
function gracefulShutdown(signal) { /* server.close + timeout */ }
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => { /* log + shutdown */ });
process.on('unhandledRejection', (reason) => { /* log + shutdown */ });
```
Adds graceful shutdown with a 5-second forced-exit timeout, signal handlers, and process-level safety nets.

### 0.4.3 Fix Validation

- **Test command to verify fix:** `timeout 30 node server.test.js`
- **Expected output after fix:**
  - 15/15 tests pass covering all categories (basic functionality, input validation, edge cases, concurrent requests)
  - Graceful shutdown test exits with code 0 and logs shutdown messages
  - EADDRINUSE test exits with code 1 and logs server error
- **Confirmation method:**
  - HTTP requests to `GET /` return `200 OK` with `Hello, World!`
  - HTTP requests to unknown paths return `404 Not Found`
  - HTTP requests with non-GET methods on `/` return `405 Method Not Allowed`
  - `SIGTERM` and `SIGINT` trigger orderly shutdown with connection draining
  - Port collision produces a logged error and clean non-zero exit

### 0.4.4 User Interface Design

Not applicable — no Figma screens or UI components are involved in this server-side fix.


## 0.5 Scope Boundaries

### 0.5.1 Changes Required (Exhaustive List)

| File | Lines (New) | Change Description |
|------|-------------|-------------------|
| `server.js` | Line 2 | INSERT `const url = require('url');` — adds URL parsing for query-string-safe pathname extraction |
| `server.js` | Lines 7–8 | INSERT `isShuttingDown` guard flag — prevents duplicate shutdown handling |
| `server.js` | Lines 11–17 | INSERT `req.on('error', ...)` handler — catches request-level errors and returns 400 |
| `server.js` | Lines 19–22 | INSERT `res.on('error', ...)` handler — catches response write failures silently |
| `server.js` | Lines 24–25 | INSERT URL pathname parsing — separates path from query string using `url.parse()` |
| `server.js` | Lines 27–42 | MODIFY request handler — adds `GET /` validation, `404` for unknown paths, `405` for wrong methods |
| `server.js` | Lines 45–49 | INSERT `server.on('error', ...)` — catches server-level errors like `EADDRINUSE` |
| `server.js` | Lines 51–57 | INSERT `server.on('clientError', ...)` — handles malformed HTTP from clients |
| `server.js` | Lines 59–74 | INSERT `gracefulShutdown()` function — stops accepting connections, drains existing ones, force-exits after 5s timeout |
| `server.js` | Lines 77–78 | INSERT `process.on('SIGTERM')` and `process.on('SIGINT')` — signal handlers for graceful shutdown |
| `server.js` | Lines 80–84 | INSERT `process.on('uncaughtException', ...)` — safety net for stray runtime errors |
| `server.js` | Lines 86–90 | INSERT `process.on('unhandledRejection', ...)` — safety net for unhandled promise rejections |
| `server.test.js` | Lines 1–140 | INSERT new file — 15 unit/integration tests covering all fix areas |

No other files require modification.

### 0.5.2 Explicitly Excluded

- **Do not modify:** `package.json` — No new dependencies were introduced; `url` and `http` are Node.js built-in modules. The `main` field pointing to `index.js` is a pre-existing discrepancy unrelated to this bug fix.
- **Do not modify:** `package-lock.json` — No dependency changes; the lock file remains valid.
- **Do not modify:** `README.md` — The documentation content is outside the scope of this server hardening fix.
- **Do not refactor:** The CommonJS `require()` pattern — the project uses CommonJS consistently, and converting to ES modules is out of scope.
- **Do not refactor:** The `url.parse()` call to `new URL()` — while `url.parse()` is legacy, `new URL()` requires a base URL and changes the API contract; this is a minimal fix, not a modernization effort.
- **Do not add:** HTTPS/TLS support, rate limiting, CORS headers, logging frameworks, or health-check endpoints — these are enhancements beyond the reported bug scope.


## 0.6 Verification Protocol

### 0.6.1 Bug Elimination Confirmation

- **Execute:** `timeout 30 node server.test.js`
- **Verify output matches:**
  - `Passed: 15 / 15` and `Failed: 0`
  - All test categories pass: Basic Functionality (2), Input Validation (8), Edge Cases (4), Rapid Requests (1)
- **Confirm error no longer appears in:**
  - Unhandled `EADDRINUSE` crash — now caught by `server.on('error')` and logged as `Server error: listen EADDRINUSE...`
  - Uncontrolled shutdown on `SIGTERM`/`SIGINT` — now handled by `gracefulShutdown()` with drain and clean exit
  - `200 OK` for invalid paths — now returns `404 Not Found`
  - `200 OK` for non-GET methods on `/` — now returns `405 Method Not Allowed`
- **Validate functionality with integration tests:**
  - Graceful shutdown test: spawn server, send `SIGTERM`, verify `"Server closed."` log and exit code 0
  - EADDRINUSE test: block port 3000, start server, verify `"Server error:"` log and exit code 1
  - SIGINT test: spawn server, send `SIGINT`, verify identical graceful behavior

### 0.6.2 Regression Check

- **Run existing test suite:** `npm test` — Note: the project's `package.json` defines `test` as `echo "Error: no test specified" && exit 1`, so no pre-existing tests exist. This is not a regression risk; the newly added `server.test.js` establishes the first test baseline.
- **Verify unchanged behavior in:**
  - `GET /` continues to return `200 OK` with body `Hello, World!\n` and header `Content-Type: text/plain` — confirmed by test suite
  - The server still binds to `127.0.0.1:3000` — hostname and port constants are unchanged
  - The console log `Server running at http://127.0.0.1:3000/` still appears on successful startup — confirmed by graceful shutdown tests
- **Confirm performance metrics:**
  - 10 concurrent `GET /` requests all return `200 OK` within the test timeout — confirmed
  - Server startup time remains negligible (sub-second for a zero-dependency Node.js server)
  - No new external dependencies introduced — zero impact on `npm install` time or bundle size


## 0.7 Execution Requirements

### 0.7.1 Research Completeness Checklist

- ✓ Repository structure fully mapped — 4 files at root: `server.js`, `package.json`, `package-lock.json`, `README.md`
- ✓ All related files examined with retrieval tools — every file read in full, no subdirectories exist
- ✓ Bash analysis completed for patterns/dependencies — `grep`, `find`, `cat -n`, runtime Node.js checks all executed
- ✓ Root cause definitively identified with evidence — six distinct deficiencies documented with line-level precision
- ✓ Single solution determined and validated — all fixes applied to `server.js`, 15 tests pass, graceful shutdown and error handling confirmed
- ✓ Web search completed — Node.js official documentation, DigitalOcean, Lagoon, npm, and community sources consulted
- ✓ No `.blitzyignore` files found — no files excluded from analysis
- ✓ No Figma attachments provided — UI design analysis not applicable

### 0.7.2 Fix Implementation Rules

- **Make the exact specified change only** — all modifications are confined to `server.js` (hardening the existing server) and the new `server.test.js` (verification). No other files touched.
- **Zero modifications outside the bug fix** — `package.json`, `package-lock.json`, and `README.md` remain untouched. The `main: "index.js"` discrepancy in `package.json` is a pre-existing issue and is explicitly excluded.
- **No interpretation or improvement of working code** — the `hostname`, `port`, console log format, and response body `Hello, World!\n` are preserved exactly as-is.
- **Preserve all whitespace and formatting except where changed** — the original two-space indentation style, `const` declarations, arrow functions, and CommonJS `require()` pattern are all maintained in the new code.
- **Only built-in Node.js modules used** — `http` (existing) and `url` (added) are both part of the Node.js standard library, requiring zero changes to `package.json` or `package-lock.json`.


## 0.8 References

### 0.8.1 Repository Files and Folders Searched

| File/Folder | Purpose | Key Finding |
|-------------|---------|-------------|
| `server.js` | Primary runtime entry point — the HTTP server | All six root causes identified here: no error handling, no shutdown, no validation, no cleanup |
| `package.json` | NPM manifest defining project metadata and scripts | Zero external dependencies; `test` script is a stub; `main` points to `index.js` (not `server.js`) |
| `package-lock.json` | NPM lockfile for deterministic installs | Confirms lockfileVersion 3, single root package, MIT license |
| `README.md` | Project documentation | Identifies the repo as `hao-backprop-test` for backprop integration testing |
| `/` (root) | Repository root folder | Confirmed only 4 files exist; no subdirectories, no additional source files |

### 0.8.2 External Sources Referenced

| Source | URL | Relevance |
|--------|-----|-----------|
| Node.js Official HTTP Documentation | `https://nodejs.org/api/http.html` | Authoritative reference for `server.on('error')`, `server.on('clientError')`, `server.close()`, and server timeout defaults |
| DigitalOcean — How To Create a Web Server in Node.js | `https://www.digitalocean.com/community/tutorials/how-to-create-a-web-server-in-node-js-with-the-http-module` | Best practices for error handling in HTTP servers, status code patterns |
| Lagoon Documentation — Node.js Graceful Shutdown | `https://docs.lagoon.sh/using-lagoon-advanced/nodejs/` | Pattern for `server.close()` with `SIGTERM`/`SIGINT` signal handlers |
| Honeybadger — Comprehensive Guide to Error Handling in Node.js | `https://www.honeybadger.io/blog/errors-nodejs/` | Operational vs. programmer error distinction, error delivery methods |
| Medium (Juliano Firme) — Graceful Shutdown in Node.js | `https://medium.com/@julianofirme23/graceful-shutdown-in-node-js-78ed2e0d107f` | `server.close()` callback pattern with `process.exit(0)` |
| Bits and Pieces — Add Graceful Shutdown to Node.js Applications | `https://blog.bitsrc.io/proper-way-to-add-graceful-shutdown-nodejs-6c7b35c047aa` | SIGINT/SIGTERM signal semantics and microservice shutdown best practices |

### 0.8.3 Attachments

No attachments were provided for this project. No Figma screens or external design files are referenced.


