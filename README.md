# Hello World — Flask Tutorial Server

A simple Python 3 Flask application demonstrating how to build an HTTP server with two plain-text greeting endpoints. This project is a direct rewrite of the original Node.js/Express.js tutorial server, preserving identical endpoint behavior.

> Originally created as **hao-backprop-test** — a backprop integration test fixture.

## Prerequisites

- **Python** 3.10 or higher
- **pip** (Python package manager)

## Installation

Clone the repository and install the project dependencies:

```bash
pip install -r requirements.txt
```

This installs [Flask](https://flask.palletsprojects.com/) (v3.x), the project's only runtime dependency.

## Usage

Start the server:

```bash
python app.py
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

## Running Tests

Run the test suite with pytest:

```bash
pytest test_app.py -v
```

## Project Structure

```
.
├── app.py             # Flask application with route definitions
├── test_app.py        # Unit tests for the Flask application
├── requirements.txt   # Python dependencies (Flask, pytest)
└── README.md          # Project documentation (this file)
```

## License

[MIT](https://opensource.org/licenses/MIT)
