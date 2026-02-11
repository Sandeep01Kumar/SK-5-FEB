"""
Flask tutorial server with Hello World and Good Evening endpoints.

A simple Python 3 Flask application demonstrating how to build an HTTP server
with two plain-text greeting endpoints. This is a direct rewrite of the original
Node.js/Express.js tutorial server, preserving identical endpoint behavior.

Endpoints:
    GET /         -> "Hello, World!\n"  (text/plain, 200)
    GET /evening  -> "Good evening"     (text/plain, 200)

Server binds to 127.0.0.1:3000 by default.
"""

from flask import Flask, Response

# Flask application instance
app = Flask(__name__)

# Server configuration — matches the original Node.js server binding
hostname = '127.0.0.1'
port = 3000


@app.route('/', methods=['GET'])
def hello_world():
    """GET / — preserves the original 'Hello, World!' response with plain-text content type.

    Returns the same response body and content type as the original Node.js
    http.createServer handler: 'Hello, World!\\n' with Content-Type: text/plain.
    """
    return Response('Hello, World!\n', status=200, mimetype='text/plain')


@app.route('/evening', methods=['GET'])
def good_evening():
    """GET /evening — returns 'Good evening' as plain text.

    Added as part of the Express.js migration and preserved in the Flask rewrite.
    Returns 'Good evening' with Content-Type: text/plain and HTTP 200 status.
    """
    return Response('Good evening', status=200, mimetype='text/plain')


if __name__ == '__main__':
    # Print startup notification matching the original Node.js console.log output
    print(f'Server running at http://{hostname}:{port}/')
    # Start the Flask development server on the configured host and port.
    # use_reloader=False prevents the startup message from printing twice.
    app.run(host=hostname, port=port, use_reloader=False)
