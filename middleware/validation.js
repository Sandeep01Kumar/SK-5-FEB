'use strict';

/**
 * Input Validation and Sanitization Middleware
 *
 * Provides reusable Express middleware functions using express-validator (v7.3.1)
 * to sanitize query parameters, validate request bodies, trim and escape string
 * inputs, and validate URL parameters. Returns structured HTTP 400 JSON responses
 * when invalid input is detected.
 *
 * Security: Addresses SR-002 — prevents XSS and injection attacks via server-side
 * input sanitization applied before route handlers in the Express middleware pipeline.
 *
 * @module middleware/validation
 */

const { query, body, param, validationResult } = require('express-validator');

/**
 * Sanitization chain for query string parameters.
 * Trims whitespace and escapes HTML entities on all top-level query values
 * to prevent reflected XSS via query string injection.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
const sanitizeQuery = [
  query('*').trim().escape()
];

/**
 * Validation and sanitization chain for request body content.
 * Trims whitespace and escapes HTML entities on all top-level body fields
 * to prevent stored XSS and injection attacks via POST/PUT/PATCH payloads.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
const validateBody = [
  body('*').trim().escape()
];

/**
 * Validation and sanitization chain for URL route parameters.
 * Trims whitespace and escapes HTML entities on all route parameter values
 * to prevent injection via URL path segments.
 *
 * @type {import('express-validator').ValidationChain[]}
 */
const validateParams = [
  param('*').trim().escape()
];

/**
 * Validation error handler middleware.
 * Inspects the request for validation errors accumulated by preceding chains.
 * If errors are found, responds with HTTP 400 and a structured JSON error body.
 * If no errors are found, passes control to the next middleware.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 * @returns {void}
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 400,
      error: 'Validation Error',
      details: errors.array()
    });
  }
  next();
}

/**
 * Composite validation middleware array.
 * Combines all sanitization/validation chains (query, body, params) with the
 * error handler into a single spreadable middleware array. Can be applied
 * globally via app.use(...validationMiddleware) or on individual routes.
 *
 * Execution order:
 *   1. sanitizeQuery  — trim/escape all query string values
 *   2. validateBody   — trim/escape all body field values
 *   3. validateParams — trim/escape all URL parameter values
 *   4. handleValidationErrors — check for errors and return 400 if any
 *
 * @type {Array<import('express-validator').ValidationChain | Function>}
 */
const validationMiddleware = [
  ...sanitizeQuery,
  ...validateBody,
  ...validateParams,
  handleValidationErrors
];

module.exports = {
  validationMiddleware,
  handleValidationErrors,
  sanitizeQuery,
  validateBody,
  validateParams
};
