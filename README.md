# Hello World — Express.js Tutorial Server

A minimal Express.js HTTP server tutorial demonstrating route-based request handling with two endpoints. This project was migrated from a raw Node.js `http` module server to Express.js to introduce structured routing and the Express framework.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or higher
- npm v9 or higher (included with Node.js)

## Installation

Clone the repository and install the Express.js dependency:

```bash
npm install
```

## Running the Server

Start the server using either command:

```bash
npm start
```

or

```bash
node server.js
```

The server binds to `127.0.0.1` on port `3000`. Once started, you will see:

```
Server running at http://127.0.0.1:3000/
```

## Endpoints

| Route         | Method | Response Body      | Content-Type | HTTP Status |
|---------------|--------|--------------------|--------------|-------------|
| `/`           | GET    | `Hello, World!\n`  | text/plain   | 200         |
| `/evening`    | GET    | `Good evening`     | text/plain   | 200         |

Any other route returns a `404 Not Found` response (Express default behavior).

## Project Structure

```
├── server.js          # Express.js application with route handlers
├── package.json       # npm manifest with Express.js dependency
├── package-lock.json  # Dependency lock file
└── README.md          # This file
```

## License

MIT
