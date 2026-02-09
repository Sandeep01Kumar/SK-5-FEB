"""
Flask HTTP server application.

Provides two plain-text endpoints:
  - GET /        -> "Hello, universe!\\n"  (backward-compatible with the original server)
  - GET /evening -> "Good evening"         (new greeting endpoint)

When executed directly (python3 server.py), the server binds to
127.0.0.1:3000 and prints a startup confirmation message to the console.

When imported as a module (e.g., by tests), only the Flask app is exposed
without auto-starting the server, allowing tests to manage the server
lifecycle explicitly and avoid port conflicts.

:module: server
"""

from flask import Flask, Response

app = Flask(__name__)

# Loopback address - keeps the server accessible only from localhost.
hostname = '127.0.0.1'

# Listening port - matches the original server configuration.
port = 3000


@app.route('/', methods=['GET'])
def root():
    """
    GET / - Returns the original greeting response, preserving backward
    compatibility with the previous implementation that served
    "Hello, universe!\\n" to every request.

    Returns:
        Response: Plain-text response with body "Hello, universe!\\n",
                  HTTP 200 status, and Content-Type text/plain.
    """
    return Response(
        'Hello, universe!\n',
        status=200,
        content_type='text/plain; charset=utf-8'
    )


@app.route('/evening', methods=['GET'])
def evening():
    """
    GET /evening - Returns the "Good evening" greeting as plain text.
    This endpoint fulfils the user's request for an additional greeting route.

    Returns:
        Response: Plain-text response with body "Good evening",
                  HTTP 200 status, and Content-Type text/plain.
    """
    return Response(
        'Good evening',
        status=200,
        content_type='text/plain; charset=utf-8'
    )


if __name__ == '__main__':
    print(f'Server running at http://{hostname}:{port}/')
    app.run(host=hostname, port=port)
