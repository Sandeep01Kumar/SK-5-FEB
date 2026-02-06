const express = require('express');
const app = express();

const hostname = '127.0.0.1';
const port = 3000;

// GET / - Returns the original greeting response, preserving backward compatibility
// with the previous http.createServer() implementation that served "Hello, universe!\n"
app.get('/', (req, res) => {
  res.status(200).type('text').send('Hello, universe!\n');
});

// GET /evening - Returns the "Good evening" greeting as plain text
app.get('/evening', (req, res) => {
  res.status(200).type('text').send('Good evening');
});

// Bind the Express application to the loopback address on port 3000,
// preserving the same listen configuration as the original http server.
// The server reference is captured and exported alongside the app for
// proper lifecycle management (e.g., graceful shutdown in tests).
const server = app.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

module.exports = app;
module.exports.server = server;
