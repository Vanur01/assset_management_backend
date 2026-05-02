// errors/customError.js

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
  constructor(errors) {
    super('Validation Error', 400);
    this.errors = Array.isArray(errors) ? errors : [errors];
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
 * Alias: ForbiddenError for consistency
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Not authorized', statusCode = 403) {
    super(message, statusCode);
  }
}

/**
 * Forbidden Error - 403 Forbidden
 * Alias for AuthorizationError - more semantic naming
 */
export class ForbiddenError extends AuthorizationError {
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
 * Used when there's a conflict with existing data (e.g., duplicate email)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 * Used when user exceeds rate limits
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, 429);
    this.retryAfter = retryAfter;
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
 * Service Unavailable Error - 503 Service Unavailable
 * Used when service is temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
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
 * Subscription Expired Error - 403 Forbidden
 * Used when user's subscription has expired
 */
export class SubscriptionExpiredError extends AppError {
  constructor(message = 'Subscription has expired. Please renew to continue.') {
    super(message, 403);
  }
}

/**
 * License Limit Exceeded Error - 403 Forbidden
 * Used when user exceeds their license limit
 */
export class LicenseLimitExceededError extends AppError {
  constructor(message = 'License limit exceeded. Please upgrade your plan.') {
    super(message, 403);
  }
}

/**
 * Account Inactive Error - 403 Forbidden
 * Used when user account is inactive
 */
export class AccountInactiveError extends AppError {
  constructor(message = 'Account is inactive. Please contact support.') {
    super(message, 403);
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
 * File Upload Error - 400 Bad Request
 * Used for file upload related errors
 */
export class FileUploadError extends AppError {
  constructor(message = 'File upload failed') {
    super(message, 400);
  }
}

/**
 * Database Error - 500 Internal Server Error
 * Used for database related errors
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500);
    this.originalError = originalError;
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

/**
 * Invalid Operation Error - 400 Bad Request
 * Used when an operation is invalid in the current state
 */
export class InvalidOperationError extends BadRequestError {
  constructor(message = 'Invalid operation') {
    super(message);
  }
}

/**
 * Resource Locked Error - 423 Locked
 * Used when a resource is locked and cannot be modified
 */
export class ResourceLockedError extends AppError {
  constructor(message = 'Resource is locked') {
    super(message, 423);
  }
}

/**
 * Dependency Error - 424 Failed Dependency
 * Used when a dependency fails
 */
export class DependencyError extends AppError {
  constructor(message = 'Dependency failed') {
    super(message, 424);
  }
}

/**
 * Too Many Requests Error - 429 Too Many Requests
 * Alias for RateLimitError
 */
export class TooManyRequestsError extends RateLimitError {
  constructor(message = 'Too many requests', retryAfter = 60) {
    super(message, retryAfter);
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
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  BadRequestError,
  SubscriptionExpiredError,
  LicenseLimitExceededError,
  AccountInactiveError,
  TokenExpiredError,
  InvalidTokenError,
  FileUploadError,
  DatabaseError,
  DuplicateEntryError,
  InvalidOperationError,
  ResourceLockedError,
  DependencyError,
  TooManyRequestsError
};