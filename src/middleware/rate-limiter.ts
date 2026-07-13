/**
 * Rate Limiting Middleware
 * Prevents API abuse and DDoS attacks
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

class RateLimiter {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: (req) => req.ip || 'unknown',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  middleware = () => {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.config.keyGenerator!(req);
      const now = Date.now();

      let record = this.store.get(key);

      if (!record || record.resetTime < now) {
        record = {
          count: 0,
          resetTime: now + this.config.windowMs,
        };
        this.store.set(key, record);
      }

      // Increment counter
      record.count++;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.maxRequests - record.count));
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

      // Check limit
      if (record.count > this.config.maxRequests) {
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later.',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        });
      }

      return next();
    };
  };
}

// Create rate limiters for different endpoints
export const createGeneralLimiter = () =>
  new RateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 100 });

export const createAuthLimiter = () =>
  new RateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 });

export const createAPILimiter = () =>
  new RateLimiter({ windowMs: 60 * 1000, maxRequests: 60 });

export const createStrictLimiter = () =>
  new RateLimiter({ windowMs: 60 * 1000, maxRequests: 10 });

export default RateLimiter;
