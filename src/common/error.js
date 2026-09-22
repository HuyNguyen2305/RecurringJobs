export class CustomError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends CustomError {
  constructor(message = 'Resource not found', details) {
    super(message, 404, details);
  }
}

export class ValidationError extends CustomError {
  constructor(message = 'Validation failed', details) {
    super(message, 400, details);
  }
}
