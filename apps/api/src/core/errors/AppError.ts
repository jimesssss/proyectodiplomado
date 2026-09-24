/**
 * Custom error classes for the ERP system
 */

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(401, 'AUTHENTICATION_ERROR', message);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(403, 'AUTHORIZATION_ERROR', message);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const message = id ? `${entity} with ID ${id} not found` : `${entity} not found`;
    super(404, 'NOT_FOUND', message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(422, 'BUSINESS_RULE_ERROR', message);
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(500, 'INTERNAL_SERVER_ERROR', message);
    Object.setPrototypeOf(this, InternalServerError.prototype);
  }
}
