# hao-backprop-test

A minimal Python 3 Flask HTTP server for backprop integration testing. The server exposes two plain-text endpoints on `http://127.0.0.1:3000/`.

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

Install the project dependencies using pip:

```bash
pip install -r requirements.txt
```

## Running the Server

Start the server directly with Python:

```bash
python3 server.py
```

The server starts on `http://127.0.0.1:3000/` and logs a confirmation message to the console.

## Running Tests

Run the test suite using pytest:

```bash
python3 -m pytest test/test_server.py -v
```

All 8 tests validate both endpoints and 404 handling for undefined routes.

## Dependencies

- [Flask](https://flask.palletsprojects.com/) `>=3.0.0` — Lightweight WSGI web application framework providing routing and request/response handling.
- [pytest](https://docs.pytest.org/) `>=8.0.0` — Testing framework for running the test suite.

## License

MIT
