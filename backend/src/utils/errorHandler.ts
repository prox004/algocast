import { Request, Response, NextFunction } from 'express';

export interface APIError extends Error {
  statusCode?: number;
  code?: string;
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class TwitterAPIError extends Error {
  statusCode = 503;
  code = 'TWITTER_API_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'TwitterAPIError';
  }
}

export class OpenAIError extends Error {
  statusCode = 503;
  code = 'OPENAI_API_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export class MarketGenerationError extends Error {
  statusCode = 500;
  code = 'MARKET_GENERATION_ERROR';
  
  constructor(message: string) {
    super(message);
    this.name = 'MarketGenerationError';
  }
}

export const errorHandler = (
  error: APIError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('API Error:', {
    name: error.name,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_SERVER_ERROR';

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? getPublicErrorMessage(code)
    : error.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      timestamp: new Date().toISOString()
    }
  });
};

function getPublicErrorMessage(code: string): string {
  const publicMessages: Record<string, string> = {
    'VALIDATION_ERROR': 'Invalid input data provided',
    'TWITTER_API_ERROR': 'Unable to fetch trend data at this time',
    'OPENAI_API_ERROR': 'AI service temporarily unavailable',
    'MARKET_GENERATION_ERROR': 'Unable to generate market at this time',
    'UNAUTHORIZED': 'Authentication required',
    'FORBIDDEN': 'Access denied',
    'NOT_FOUND': 'Resource not found',
    'RATE_LIMIT_EXCEEDED': 'Too many requests, please try again later'
  };

  return publicMessages[code] || 'An unexpected error occurred';
}

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString()
    }
  });
};

// Rate limiting error handler
export const rateLimitHandler = (req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      timestamp: new Date().toISOString()
    }
  });
};

// Validation helper
export const validateRequired = (fields: Record<string, any>): void => {
  const missing = Object.entries(fields)
    .filter(([key, value]) => value === undefined || value === null || value === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
};

// Type validation helper
export const validateTypes = (validations: Array<{field: string, value: any, type: string}>): void => {
  const invalid = validations.filter(v => typeof v.value !== v.type);
  
  if (invalid.length > 0) {
    const errors = invalid.map(v => `${v.field} must be ${v.type}`);
    throw new ValidationError(`Type validation failed: ${errors.join(', ')}`);
  }
};