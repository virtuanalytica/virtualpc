/**
 * Global Error Handler Middleware
 * Centralizes error handling and graceful degradation
 */

import { Express, Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true,
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Async function wrapper for error handling
export const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Global error middleware
export function errorHandlerMiddleware(app: Express) {
  // Catch 404 and forward to error handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    const err = new AppError(404, `Cannot find ${req.originalUrl} on this server!`, true);
    next(err);
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error
    logger.error(`[${err.statusCode}] ${err.message}`, {
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
      stack: err.stack,
    });

    // Send error response
    res.status(err.statusCode).json({
      success: false,
      status: err.status,
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });
}

// Validation error handler
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map((d: any) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      });
    }
    req.body = value;
    return next();
  };
}

// Retry logic helper
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
