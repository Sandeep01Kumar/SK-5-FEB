"""
Test suite for the Flask HTTP server application.

Tests both the GET / and GET /evening endpoints to verify correct response
bodies, status codes, and content types. Also tests that undefined routes
return HTTP 404.

Mirrors the test structure and coverage of the original Node.js test suite
(test/server.test.js) which contained 8 tests across 4 suites:
  - Root endpoint (GET /)        : 3 tests (status, body, content-type)
  - Evening endpoint (GET /evening): 3 tests (status, body, content-type)
  - Undefined routes (404)       : 2 tests (two different invalid paths)

:module: test.test_server
"""

import sys
import os
import pytest

# Ensure the project root is on the import path so that 'server' module
# can be imported regardless of the working directory used to invoke pytest.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from server import app


@pytest.fixture
def client():
    """
    Create a Flask test client for the application.

    Configures the app in TESTING mode, which propagates exceptions rather
    than returning generic error pages, and yields a test client instance
    that can be used to make requests without starting a real HTTP server.

    Yields:
        flask.testing.FlaskClient: A test client bound to the Flask app.
    """
    app.config['TESTING'] = True
    with app.test_client() as test_client:
        yield test_client


class TestRootEndpoint:
    """GET / - Root endpoint tests (backward compatibility with original server)."""

    def test_returns_200_status_code(self, client):
        """Should return HTTP 200 status code."""
        response = client.get('/')
        assert response.status_code == 200, \
            'Root endpoint must return status 200'

    def test_returns_exact_body_with_trailing_newline(self, client):
        """Should return the exact body "Hello, universe!\\n" with trailing newline."""
        response = client.get('/')
        body = response.data.decode('utf-8')
        assert body == 'Hello, universe!\n', \
            'Root endpoint body must match the original server response exactly'

    def test_returns_text_plain_content_type(self, client):
        """Should return Content-Type header containing text/plain."""
        response = client.get('/')
        assert response.content_type is not None, \
            'Content-Type header must be present in the response'
        assert 'text/plain' in response.content_type, \
            'Content-Type header must contain "text/plain"'


class TestEveningEndpoint:
    """GET /evening - New greeting endpoint tests."""

    def test_returns_200_status_code(self, client):
        """Should return HTTP 200 status code."""
        response = client.get('/evening')
        assert response.status_code == 200, \
            'Evening endpoint must return status 200'

    def test_returns_exact_body(self, client):
        """Should return the exact body "Good evening"."""
        response = client.get('/evening')
        body = response.data.decode('utf-8')
        assert body == 'Good evening', \
            'Evening endpoint body must match the user-specified response exactly'

    def test_returns_text_plain_content_type(self, client):
        """Should return Content-Type header containing text/plain."""
        response = client.get('/evening')
        assert response.content_type is not None, \
            'Content-Type header must be present in the response'
        assert 'text/plain' in response.content_type, \
            'Content-Type header must contain "text/plain"'


class TestUndefinedRoutes:
    """Undefined routes - 404 handling."""

    def test_returns_404_for_nonexistent_path(self, client):
        """Should return HTTP 404 for GET /nonexistent."""
        response = client.get('/nonexistent')
        assert response.status_code == 404, \
            'Requests to undefined routes must return 404'

    def test_returns_404_for_random_path(self, client):
        """Should return HTTP 404 for GET /random-path."""
        response = client.get('/random-path')
        assert response.status_code == 404, \
            'Requests to undefined routes must return 404 regardless of path'
