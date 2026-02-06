# hao-backprop-test

Test project for backprop integration — an Express.js HTTP server serving greeting endpoints.

## Overview

A minimal Node.js HTTP server built with [Express.js](https://expressjs.com/) that serves plain-text greeting responses. Originally implemented with the native `http` module, the server has been migrated to Express.js to support route-based request handling.

## Endpoints

| Method | Path       | Response Body          | Content-Type | Status |
|--------|------------|------------------------|--------------|--------|
| GET    | `/`        | `Hello, universe!\n`   | text/plain   | 200    |
| GET    | `/evening` | `Good evening`         | text/plain   | 200    |

Any request to an undefined route returns an HTTP 404 response (Express.js default behavior).

## Setup

```bash
# Install dependencies
npm install

# Start the server
npm start
# or
node server.js
```

The server runs at `http://127.0.0.1:3000/`.

## Running Tests

```bash
npm test
```

Tests use the Node.js built-in test runner (`node:test`) and verify both endpoint responses and 404 handling.
