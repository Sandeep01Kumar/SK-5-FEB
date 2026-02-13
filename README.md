# hello_world

A security-hardened Node.js HTTP server built on Express 4.x. Originally a minimal "Hello, World!" test fixture for backprop integration, this application has been transformed into a security-aware server demonstrating industry-standard protective middleware including security headers, CORS policy enforcement, rate limiting, input validation, and conditional HTTPS/TLS support.

The server preserves backward compatibility — `GET /` returns `Hello, World!\n` with `Content-Type: text/plain` and HTTP 200, ensuring integration test pipelines continue to function.

## Security Features

| Feature | Package | Description |
| --- | --- | --- |
| **Security Headers** | [helmet](https://www.npmjs.com/package/helmet) v8.1.0 | Sets 13+ HTTP response headers including Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy, and Referrer-Policy. Removes the `X-Powered-By` header by default. |
| **CORS Policy** | [cors](https://www.npmjs.com/package/cors) v2.8.6 | Enforces a restrictive Cross-Origin Resource Sharing policy with an explicit origin whitelist, limited HTTP methods (`GET`, `POST`, `OPTIONS`), and controlled header access. |
| **Rate Limiting** | [express-rate-limit](https://www.npmjs.com/package/express-rate-limit) v8.2.1 | IP-based request throttling: 100 requests per 15-minute window per IP address by default. Returns HTTP 429 (Too Many Requests) with `RateLimit` headers when exceeded. Uses draft-8 standard headers. |
| **Input Validation** | [express-validator](https://www.npmjs.com/package/express-validator) v7.3.1 | Server-side validation and sanitization of query parameters, request bodies, and URL parameters. Rejects malicious payloads (XSS, injection) with HTTP 400 and structured JSON error responses. |
| **HTTPS/TLS Support** | Node.js built-in `https` | Conditional HTTPS server creation when TLS certificates are provided via environment variables. Encrypts all traffic in transit. Falls back to HTTP when certificates are not configured. |

## Prerequisites

- **Node.js** v20.x or higher (tested with v20.20.0)
- **npm** v9+ (ships with Node.js 20.x)
- **OpenSSL** (optional, required only for generating self-signed TLS certificates for development)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd hello_world

# Install dependencies
npm install
```

This installs all five production dependencies: `express`, `helmet`, `cors`, `express-rate-limit`, and `express-validator`.

## Configuration

All security-sensitive settings are configured via environment variables following the [12-factor app](https://12factor.net/config) methodology. Copy the provided template and adjust values for your environment:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port number the server listens on. |
| `HOST` | `127.0.0.1` | Host address the server binds to. Use `0.0.0.0` to accept connections on all interfaces. |
| `SSL_KEY_PATH` | *(unset)* | Path to TLS private key file (PEM format). Setting both `SSL_KEY_PATH` and `SSL_CERT_PATH` enables HTTPS mode. |
| `SSL_CERT_PATH` | *(unset)* | Path to TLS certificate file (PEM format). Setting both `SSL_KEY_PATH` and `SSL_CERT_PATH` enables HTTPS mode. |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin. Requests from other origins are rejected. |
| `RATE_LIMIT_WINDOW` | `15` | Rate limit window duration in minutes. |
| `RATE_LIMIT_MAX` | `100` | Maximum number of requests allowed per IP address within the rate limit window. |

See [`.env.example`](.env.example) for a fully commented template with all available settings.

## Usage

### HTTP Mode (default)

Start the server with default settings (HTTP on `127.0.0.1:3000`):

```bash
npm start
```

Or run directly:

```bash
node server.js
```

### HTTPS Mode

To enable HTTPS, provide paths to a TLS private key and certificate:

```bash
SSL_KEY_PATH=./certs/key.pem SSL_CERT_PATH=./certs/cert.pem npm start
```

The server creates an HTTPS listener when both `SSL_KEY_PATH` and `SSL_CERT_PATH` are set and the referenced files exist. If either is missing, the server falls back to HTTP automatically.

### Custom Configuration

Override any default via environment variables:

```bash
PORT=8080 HOST=0.0.0.0 CORS_ORIGIN=https://myapp.example.com RATE_LIMIT_MAX=200 npm start
```

## Development

### Generating Self-Signed TLS Certificates

For local HTTPS development, use the included certificate generation script:

```bash
# Make the script executable (first time only)
chmod +x scripts/generate-cert.sh

# Generate self-signed certificates in certs/
./scripts/generate-cert.sh
```

This creates `certs/key.pem` and `certs/cert.pem` using OpenSSL with a 2048-bit RSA key, valid for 365 days. These certificates are for **development only** — use certificates from a trusted Certificate Authority in production.

Start the server with the generated certificates:

```bash
SSL_KEY_PATH=./certs/key.pem SSL_CERT_PATH=./certs/cert.pem node server.js
```

> **Note:** The `certs/` directory should be added to `.gitignore` and must never be committed to version control.

## Testing

The test suite uses the Node.js built-in test runner (`node:test`) and assertion module (`node:assert`) with zero external test framework dependencies.

### Run All Security Tests

```bash
npm test
```

This executes `node --test tests/security/` which runs all test files in the security test directory:

| Test File | Purpose |
| --- | --- |
| `test-headers.js` | Verifies all 13+ Helmet security headers are present; confirms `X-Powered-By` is absent |
| `test-rate-limit.js` | Verifies HTTP 429 after exceeding 100-request threshold; checks `RateLimit` headers |
| `test-cors.js` | Verifies CORS headers for allowed origins; confirms blocked origins are rejected |
| `test-https.js` | Verifies TLS handshake succeeds; confirms response body unchanged over HTTPS |
| `test-validation.js` | Verifies malicious input rejected with HTTP 400; confirms clean input passes |
| `test-backward-compat.js` | Verifies `GET /` returns exact `Hello, World!\n` response (critical for backprop integration) |

## Security Verification

Run these commands to verify the security posture of the running server:

### Dependency Vulnerability Scan

```bash
npm audit
```

Expected result: `found 0 vulnerabilities`.

### Security Header Inspection

```bash
# Start the server in the background
node server.js &

# Inspect security response headers
curl -sI http://127.0.0.1:3000/ | grep -iE "content-security-policy|strict-transport|x-content-type|x-frame|cross-origin|x-powered-by"
```

Verify `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options` are present, and `X-Powered-By` is absent.

### Rate Limit Verification

```bash
# Send 105 rapid requests and check the last 5 status codes
for i in $(seq 1 105); do
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
done | tail -5
```

Requests exceeding the configured limit (default: 100 per 15 minutes) return HTTP `429`.

### CORS Header Verification

```bash
# Check CORS headers for the allowed origin
curl -sI -H "Origin: http://localhost:3000" http://127.0.0.1:3000/ | grep -i "access-control"
```

The `Access-Control-Allow-Origin` header should be present for allowed origins.

## Project Structure

```
hello_world/
├── server.js                          # Express application entry point with security middleware pipeline
├── package.json                       # npm manifest with security dependencies
├── package-lock.json                  # Dependency lock file for reproducible installs
├── .env.example                       # Environment variable template (safe defaults)
├── README.md                          # This file
├── config/
│   └── security.js                    # Centralized security configuration (env-driven)
├── middleware/
│   ├── helmet.js                      # Helmet security headers configuration
│   ├── cors.js                        # CORS policy enforcement middleware
│   ├── rateLimiter.js                 # IP-based rate limiting middleware
│   └── validation.js                  # Input validation and sanitization middleware
├── scripts/
│   └── generate-cert.sh               # Self-signed TLS certificate generator (development)
└── tests/
    └── security/
        ├── test-headers.js            # Security header verification tests
        ├── test-rate-limit.js         # Rate limiting verification tests
        ├── test-cors.js               # CORS policy verification tests
        ├── test-https.js              # HTTPS/TLS verification tests
        ├── test-validation.js         # Input validation verification tests
        └── test-backward-compat.js    # Backward compatibility verification tests
```

### Middleware Pipeline Order

Incoming requests pass through the security middleware in this order:

1. **CORS** (`middleware/cors.js`) — Cross-origin request filtering
2. **Helmet** (`middleware/helmet.js`) — Security response headers
3. **Rate Limiter** (`middleware/rateLimiter.js`) — IP-based request throttling
4. **Body Parser** (`express.json()`, `express.urlencoded()`) — Request body parsing
5. **Route Handlers** — Application logic (`GET /` → `Hello, World!\n`)
6. **Error Handler** — Centralized error handling (suppresses stack traces)

## License

[MIT](https://opensource.org/licenses/MIT) — see `package.json` for details.
