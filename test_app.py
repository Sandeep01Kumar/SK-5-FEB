"""
Unit tests for the Flask tutorial server.

Validates that the Flask application replicates the exact behavior of the
original Node.js/Express.js server:
    - GET /         returns "Hello, World!\n" with text/plain and 200
    - GET /evening  returns "Good evening"    with text/plain and 200
    - Unmatched routes return 404
"""

import pytest

from app import app


@pytest.fixture
def client():
    """Create a Flask test client for the application.

    Configures the app in TESTING mode so that exceptions propagate
    rather than being handled by Flask's error handlers, making test
    failures easier to diagnose.
    """
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestHelloWorldEndpoint:
    """Tests for the GET / endpoint."""

    def test_get_root_returns_200(self, client):
        """GET / should return HTTP 200 status code."""
        response = client.get('/')
        assert response.status_code == 200

    def test_get_root_returns_hello_world_body(self, client):
        """GET / should return 'Hello, World!\\n' as the response body."""
        response = client.get('/')
        assert response.data == b'Hello, World!\n'

    def test_get_root_returns_plain_text(self, client):
        """GET / should set Content-Type to text/plain."""
        response = client.get('/')
        assert 'text/plain' in response.content_type

    def test_get_root_response_body_exact_match(self, client):
        """GET / response body must include the trailing newline character."""
        response = client.get('/')
        body = response.data.decode('utf-8')
        assert body == 'Hello, World!\n'
        assert body.endswith('\n')


class TestGoodEveningEndpoint:
    """Tests for the GET /evening endpoint."""

    def test_get_evening_returns_200(self, client):
        """GET /evening should return HTTP 200 status code."""
        response = client.get('/evening')
        assert response.status_code == 200

    def test_get_evening_returns_good_evening_body(self, client):
        """GET /evening should return 'Good evening' as the response body."""
        response = client.get('/evening')
        assert response.data == b'Good evening'

    def test_get_evening_returns_plain_text(self, client):
        """GET /evening should set Content-Type to text/plain."""
        response = client.get('/evening')
        assert 'text/plain' in response.content_type

    def test_get_evening_no_trailing_newline(self, client):
        """GET /evening response body must NOT have a trailing newline."""
        response = client.get('/evening')
        body = response.data.decode('utf-8')
        assert body == 'Good evening'
        assert not body.endswith('\n')


class TestUnmatchedRoutes:
    """Tests for routes that are not explicitly defined."""

    def test_unmatched_path_returns_404(self, client):
        """Requests to undefined paths should return HTTP 404."""
        response = client.get('/nonexistent')
        assert response.status_code == 404

    def test_another_unmatched_path_returns_404(self, client):
        """Another undefined path should also return HTTP 404."""
        response = client.get('/api/v1/test')
        assert response.status_code == 404


class TestMethodRestrictions:
    """Tests that endpoints only respond to GET method."""

    def test_post_to_root_returns_405(self, client):
        """POST to / should return HTTP 405 Method Not Allowed."""
        response = client.post('/')
        assert response.status_code == 405

    def test_put_to_root_returns_405(self, client):
        """PUT to / should return HTTP 405 Method Not Allowed."""
        response = client.put('/')
        assert response.status_code == 405

    def test_delete_to_root_returns_405(self, client):
        """DELETE to / should return HTTP 405 Method Not Allowed."""
        response = client.delete('/')
        assert response.status_code == 405

    def test_post_to_evening_returns_405(self, client):
        """POST to /evening should return HTTP 405 Method Not Allowed."""
        response = client.post('/evening')
        assert response.status_code == 405

    def test_put_to_evening_returns_405(self, client):
        """PUT to /evening should return HTTP 405 Method Not Allowed."""
        response = client.put('/evening')
        assert response.status_code == 405

    def test_delete_to_evening_returns_405(self, client):
        """DELETE to /evening should return HTTP 405 Method Not Allowed."""
        response = client.delete('/evening')
        assert response.status_code == 405


class TestServerConfiguration:
    """Tests for server configuration values."""

    def test_hostname_is_localhost(self):
        """Server hostname should be configured as 127.0.0.1."""
        from app import hostname
        assert hostname == '127.0.0.1'

    def test_port_is_3000(self):
        """Server port should be configured as 3000."""
        from app import port
        assert port == 3000

    def test_app_is_flask_instance(self):
        """The app object should be a Flask application instance."""
        from flask import Flask
        assert isinstance(app, Flask)
