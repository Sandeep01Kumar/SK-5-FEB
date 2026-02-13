#!/usr/bin/env bash
# =============================================================================
# generate-cert.sh — Self-Signed TLS Certificate Generator for Development
# =============================================================================
#
# Generates a 2048-bit RSA private key and self-signed X.509 certificate for
# local HTTPS development and testing. The generated files are placed in the
# certs/ directory at the project root, matching the default SSL_KEY_PATH and
# SSL_CERT_PATH values documented in .env.example.
#
# Usage:
#   ./scripts/generate-cert.sh
#
# After running, start the server in HTTPS mode:
#   SSL_KEY_PATH=./certs/key.pem SSL_CERT_PATH=./certs/cert.pem node server.js
#
# ⚠  WARNING: Self-signed certificates are for DEVELOPMENT ONLY.
#    Do NOT use these certificates in production environments.
#    Production deployments must use certificates issued by a trusted
#    Certificate Authority (CA).
#
# Security requirements addressed:
#   SR-004 — HTTPS Support: Provides TLS certificate provisioning for the
#            server's conditional HTTPS mode.
#
# =============================================================================

# Enable strict mode for robust error handling:
#   -e  Exit immediately if any command exits with a non-zero status
#   -u  Treat unset variables as an error
#   -o pipefail  Return the exit status of the last command in a pipeline that failed
set -euo pipefail

# ---------------------------------------------------------------------------
# Path Resolution
# ---------------------------------------------------------------------------
# Resolve the directory containing this script, then derive the project root
# (one level up from scripts/). This ensures the script works correctly
# regardless of the caller's current working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Certificate output directory and file paths — these must match the defaults
# in .env.example (SSL_KEY_PATH=./certs/key.pem, SSL_CERT_PATH=./certs/cert.pem)
# and the values read by config/security.js.
CERT_DIR="${PROJECT_ROOT}/certs"
KEY_FILE="${CERT_DIR}/key.pem"
CERT_FILE="${CERT_DIR}/cert.pem"

# Certificate parameters
KEY_BITS=2048
VALIDITY_DAYS=365
SUBJECT="/CN=localhost/O=Development/C=US"

# ---------------------------------------------------------------------------
# Preflight Checks
# ---------------------------------------------------------------------------

# Verify that OpenSSL is installed and accessible
if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: OpenSSL is not installed or not found in PATH." >&2
    echo "       Please install OpenSSL before running this script." >&2
    echo "       On Debian/Ubuntu:  sudo apt-get install -y openssl" >&2
    echo "       On macOS:          brew install openssl" >&2
    echo "       On Alpine:         apk add openssl" >&2
    exit 1
fi

# Warn if certificates already exist and prompt-free overwrite
if [ -f "${KEY_FILE}" ] && [ -f "${CERT_FILE}" ]; then
    echo "WARNING: Existing certificates detected:"
    echo "         Key:  ${KEY_FILE}"
    echo "         Cert: ${CERT_FILE}"
    echo "         Overwriting with new self-signed certificates..."
    echo ""
fi

# ---------------------------------------------------------------------------
# Certificate Generation
# ---------------------------------------------------------------------------

echo "============================================="
echo " Generating Self-Signed TLS Certificate"
echo "============================================="
echo ""

# Create the certs/ directory if it does not already exist
mkdir -p "${CERT_DIR}"

# Generate a 2048-bit RSA private key and self-signed X.509 certificate
# Flags:
#   -x509       Output a self-signed certificate instead of a CSR
#   -newkey     Generate a new private key (rsa:2048)
#   -keyout     Write the private key to KEY_FILE
#   -out        Write the certificate to CERT_FILE
#   -days       Certificate validity period (365 days for development)
#   -nodes      Do not encrypt the private key (no passphrase for dev convenience)
#   -subj       Certificate subject fields (CN=localhost for local development)
#   -sha256     Use SHA-256 digest for the certificate signature
openssl req \
    -x509 \
    -newkey "rsa:${KEY_BITS}" \
    -keyout "${KEY_FILE}" \
    -out "${CERT_FILE}" \
    -days "${VALIDITY_DAYS}" \
    -nodes \
    -subj "${SUBJECT}" \
    -sha256 \
    2>/dev/null

# ---------------------------------------------------------------------------
# File Permissions
# ---------------------------------------------------------------------------
# Restrict private key access to the file owner only (read/write).
# This follows security best practices — private keys should never be
# world-readable or group-readable.
chmod 600 "${KEY_FILE}"

# Certificate can be more permissive (it is public information)
chmod 644 "${CERT_FILE}"

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------
# Verify the generated certificate is valid and readable
if ! openssl x509 -in "${CERT_FILE}" -noout -subject >/dev/null 2>&1; then
    echo "ERROR: Certificate verification failed. The generated certificate" >&2
    echo "       may be corrupted. Please re-run this script." >&2
    exit 1
fi

# Extract certificate details for confirmation
CERT_SUBJECT="$(openssl x509 -in "${CERT_FILE}" -noout -subject 2>/dev/null)"
CERT_EXPIRY="$(openssl x509 -in "${CERT_FILE}" -noout -enddate 2>/dev/null)"

# ---------------------------------------------------------------------------
# Success Output
# ---------------------------------------------------------------------------
echo ""
echo "✅ Self-signed TLS certificate generated successfully!"
echo ""
echo "  Private Key : ${KEY_FILE}"
echo "  Certificate : ${CERT_FILE}"
echo "  Key Size    : ${KEY_BITS}-bit RSA"
echo "  Validity    : ${VALIDITY_DAYS} days"
echo "  ${CERT_SUBJECT}"
echo "  ${CERT_EXPIRY}"
echo ""
echo "---------------------------------------------"
echo " Usage"
echo "---------------------------------------------"
echo ""
echo "  Start the server in HTTPS mode:"
echo ""
echo "    SSL_KEY_PATH=./certs/key.pem SSL_CERT_PATH=./certs/cert.pem node server.js"
echo ""
echo "  Or set the variables in your .env file:"
echo ""
echo "    cp .env.example .env"
echo "    # SSL_KEY_PATH and SSL_CERT_PATH are pre-configured in .env.example"
echo "    node server.js"
echo ""
echo "  Test with curl (skip certificate verification for self-signed):"
echo ""
echo "    curl -k https://127.0.0.1:3000/"
echo ""
echo "---------------------------------------------"
echo " ⚠  WARNING: DEVELOPMENT USE ONLY"
echo "---------------------------------------------"
echo ""
echo "  These self-signed certificates are NOT suitable for production."
echo "  For production deployments, use certificates issued by a trusted"
echo "  Certificate Authority (e.g., Let's Encrypt, DigiCert, AWS ACM)."
echo ""
