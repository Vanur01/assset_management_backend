/**
 * Base Application Error Class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - 400 Bad Request
 * Used for invalid input data, missing required fields, etc.
 */
export class ValidationError extends AppError {
  constructor(message) {
    super(message || 'Validation Error', 400);
  }
}

/**
 * Authentication Error - 401 Unauthorized
 * Used when user is not authenticated or credentials are invalid
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
  }
}

/**
 * Authorization Error - 403 Forbidden
 * Used when user is authenticated but doesn't have permission
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 403);
  }
}

/**
 * Forbidden Error - 403 Forbidden
 * Used for permission-related errors
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden. You do not have permission to perform this action.') {
    super(message, 403);
  }
}

/**
 * Not Found Error - 404 Not Found
 * Used when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

/**
 * Conflict Error - 409 Conflict
 * Used when there's a conflict with existing data
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/**
 * Bad Request Error - 400 Bad Request
 * Used for general bad requests
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

/**
 * Internal Server Error - 500 Internal Server Error
 * Used for unexpected server errors
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500);
  }
}

/**
 * Token Expired Error - 401 Unauthorized
 * Used when JWT token has expired
 */
export class TokenExpiredError extends AppError {
  constructor(message = 'Token has expired. Please login again.') {
    super(message, 401);
  }
}

/**
 * Invalid Token Error - 401 Unauthorized
 * Used when JWT token is invalid
 */
export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid token. Please login again.') {
    super(message, 401);
  }
}

/**
 * Database Error - 500 Internal Server Error
 * Used for database related errors
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
  }
}

/**
 * Duplicate Entry Error - 409 Conflict
 * Used for duplicate database entries
 */
export class DuplicateEntryError extends ConflictError {
  constructor(field = 'Entry') {
    super(`${field} already exists`);
    this.field = field;
  }
}

// Default export for convenience
export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  InternalServerError,
  TokenExpiredError,
  InvalidTokenError,
  DatabaseError,
  DuplicateEntryError
};