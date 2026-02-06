/**
 * Express.js HTTP server application.
 *
 * Provides two plain-text endpoints:
 *   - GET /        → "Hello, universe!\n"  (backward-compatible with the original http server)
 *   - GET /evening → "Good evening"        (new greeting endpoint)
 *
 * When executed directly (node server.js / npm start), the server binds to
 * 127.0.0.1:3000 and prints a startup confirmation message to the console.
 *
 * When required as a module (e.g., by tests), only the Express app is exported
 * without auto-starting the server, allowing tests to manage the server
 * lifecycle explicitly and avoid port conflicts or event-loop timing issues
 * with the Node.js built-in test runner.
 *
 * @module server
 */

'use strict';

const express = require('express');

const app = express();

/** Loopback address — keeps the server accessible only from localhost. */
const hostname = '127.0.0.1';

/** Listening port — matches the original http server configuration. */
const port = 3000;

// ---------------------------------------------------------------------------
// Route Definitions
// ---------------------------------------------------------------------------

/**
 * GET / — Returns the original greeting response, preserving backward
 * compatibility with the previous http.createServer() implementation that
 * served "Hello, universe!\n" to every request.
 */
app.get('/', (req, res) => {
  res.status(200).type('text').send('Hello, universe!\n');
});

/**
 * GET /evening — Returns the "Good evening" greeting as plain text.
 * This endpoint fulfils the user's request for an additional greeting route.
 */
app.get('/evening', (req, res) => {
  res.status(200).type('text').send('Good evening');
});

// ---------------------------------------------------------------------------
// Server Startup (only when executed directly, not when required by tests)
// ---------------------------------------------------------------------------

if (require.main === module) {
  // Start listening when the file is run directly (node server.js / npm start).
  app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

// Export the Express app, hostname, and port so that tests (and any other
// consumers) can create and manage their own server instances.
module.exports = app;
module.exports.hostname = hostname;
module.exports.port = port;
