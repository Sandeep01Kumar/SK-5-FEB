# hao-backprop-test

A minimal Express.js HTTP server for backprop integration testing. The server exposes two plain-text endpoints on `http://127.0.0.1:3000/`.

## Endpoints

| Method | Path       | Response Body          | Content-Type | Status |
|--------|------------|------------------------|--------------|--------|
| GET    | `/`        | `Hello, universe!\n`   | text/plain   | 200    |
| GET    | `/evening` | `Good evening`         | text/plain   | 200    |

### GET /

Returns the default greeting message.

```
curl http://127.0.0.1:3000/
Hello, universe!
```

### GET /evening

Returns an evening greeting message.

```
curl http://127.0.0.1:3000/evening
Good evening
```

## Setup

Install the project dependencies:

```bash
npm install
```

## Running the Server

Start the server using npm:

```bash
npm start
```

Or run directly with Node.js:

```bash
node server.js
```

The server starts on `http://127.0.0.1:3000/` and logs a confirmation message to the console.

## Dependencies

- [Express.js](https://expressjs.com/) `^5.2.1` — HTTP web framework providing routing and request/response handling.

## License

MIT
