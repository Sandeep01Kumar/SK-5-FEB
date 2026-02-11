# Hello World — Express.js Tutorial Server

A simple Node.js tutorial project demonstrating how to build an HTTP server with [Express.js](https://expressjs.com/). The server exposes two endpoints that return plain-text greetings.

> Originally created as **hao-backprop-test** — a backprop integration test fixture.

## Prerequisites

- **Node.js** v20 or higher
- **npm** v9 or higher

## Installation

Clone the repository and install the project dependencies:

```bash
npm install
```

This installs [Express.js](https://www.npmjs.com/package/express) (v5.x), the project's only runtime dependency.

## Usage

Start the server with either of the following commands:

```bash
npm start
```

or

```bash
node server.js
```

The server binds to `127.0.0.1` on port `3000`. Once running, you will see:

```
Server running at http://127.0.0.1:3000/
```

## Endpoints

| Method | Path       | Response Body      | Content-Type | Status |
|--------|------------|--------------------|--------------|--------|
| GET    | `/`        | `Hello, World!\n`  | text/plain   | 200    |
| GET    | `/evening` | `Good evening`     | text/plain   | 200    |

### Examples

Retrieve the Hello World greeting:

```bash
curl http://127.0.0.1:3000/
```

```
Hello, World!
```

Retrieve the Good Evening greeting:

```bash
curl http://127.0.0.1:3000/evening
```

```
Good evening
```

## Project Structure

```
.
├── server.js          # Express.js application with route definitions
├── package.json       # npm manifest with Express.js dependency
├── package-lock.json  # Dependency lock file (auto-generated)
└── README.md          # Project documentation (this file)
```

## License

[MIT](https://opensource.org/licenses/MIT)
