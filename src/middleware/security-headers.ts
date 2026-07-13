/**
 * Security Headers Middleware
 * Implements OWASP security best practices
 */

import { Request, Response, NextFunction } from 'express';

export function securityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );

    // Permissions policy (formerly Feature-Policy)
    res.setHeader(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'ambient-light-sensor=()',
        'autoplay=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ].join(', '),
    );

    // Strict Transport Security (if HTTPS)
    if (req.protocol === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

// CORS validation middleware
export function corsValidationMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }

    return next();
  };
}

// CSRF token validation
export function csrfValidationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only validate for state-changing requests
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    const csrfToken = req.headers['x-csrf-token'] as string;
    const sessionToken = (req as any).session?.csrfToken;

    if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
      return res.status(403).json({
        success: false,
        message: 'CSRF token validation failed',
      });
    }

    return next();
  };
}

// API Key validation
export function apiKeyValidationMiddleware(apiKeys: Set<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for public endpoints
    const publicPaths = ['/health', '/api/public', '/api/auth/login'];
    if (publicPaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey || !apiKeys.has(apiKey)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or missing API key',
      });
    }

    next();
  };
}

// Request logging for security audits
export function securityAuditLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const log = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        duration,
      };

      // Log suspicious activities
      if (res.statusCode >= 400) {
        console.warn('[SECURITY]', JSON.stringify(log));
      }
    });

    return next();
  };
}
