const http = require('http');
const url = require('url');

const hostname = '127.0.0.1';
const port = 3000;

// Guard flag to prevent duplicate shutdown handling when multiple signals arrive
let isShuttingDown = false;

const server = http.createServer((req, res) => {
  // Handle request-level stream errors (e.g., malformed body, aborted request)
  req.on('error', (err) => {
    console.error('Request error:', err);
    if (!res.headersSent) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('400 Bad Request\n');
    }
  });

  // Handle response write failures (e.g., broken pipe, client disconnect)
  res.on('error', (err) => {
    console.error('Response error:', err);
  });

  // Parse URL to separate pathname from query string (e.g., /?key=value → /)
  const pathname = url.parse(req.url).pathname;

  if (req.method === 'GET' && pathname === '/') {
    // Original 200 OK response preserved exactly
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello, World!\n');
  } else if (pathname !== '/') {
    // Unknown path — return 404 Not Found
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('404 Not Found\n');
  } else {
    // Path is / but method is not GET — return 405 Method Not Allowed
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain');
    res.end('405 Method Not Allowed\n');
  }
});

// Catch server-level errors (e.g., EADDRINUSE when port is already occupied)
server.on('error', (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

// Handle malformed HTTP requests from clients (e.g., invalid headers)
server.on('clientError', (err, socket) => {
  console.error('Client error:', err);
  if (socket.writable) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
  socket.destroy();
});

// Graceful shutdown: stop accepting new connections, drain existing, force-exit after timeout
function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`Shutting down gracefully... (${signal})`);

  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  // Force shutdown after 5 seconds if connections don't drain
  const forceTimeout = setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 5000);
  forceTimeout.unref();
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process-level safety net for unexpected runtime errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

// Process-level safety net for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
