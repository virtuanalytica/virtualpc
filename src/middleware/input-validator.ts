/**
 * Input Validation Utilities
 * Prevents injection attacks and invalid data
 */

import { Request, Response, NextFunction } from 'express';

// Sanitize string to prevent XSS
export function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

// Validate URL (prevent SSRF)
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block internal/private IPs
    const hostname = parsed.hostname;
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)) return false;
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) return false;
    return true;
  } catch {
    return false;
  }
}

// Validate UUID format
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Validate integer within range
export function isValidInteger(value: any, min?: number, max?: number): boolean {
  if (!Number.isInteger(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

// Sanitize object recursively
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  }
  return obj;
}

// Middleware to sanitize request body
export function sanitizeRequestBody() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    return next();
  };
}

// Validate request payload size
export function validatePayloadSize(maxSizeMB: number = 10) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > maxBytes) {
      return res.status(413).json({
        success: false,
        message: `Payload too large (max ${maxSizeMB}MB)`,
      });
    }
    return next();
  };
}

// Validation schema builder
export class ValidationSchema {
  private rules: Map<string, ((value: any) => boolean)[]> = new Map();

  field(name: string): ValidationSchema {
    const schema = this;
    return {
      required: () => {
        schema.addRule(name, (v) => v !== undefined && v !== null && v !== '');
        return schema as ValidationSchema;
      },
      email: () => {
        schema.addRule(name, (v) => !v || isValidEmail(v));
        return schema as ValidationSchema;
      },
      url: () => {
        schema.addRule(name, (v) => !v || isValidUrl(v));
        return schema as ValidationSchema;
      },
      uuid: () => {
        schema.addRule(name, (v) => !v || isValidUUID(v));
        return schema as ValidationSchema;
      },
      string: () => {
        schema.addRule(name, (v) => !v || typeof v === 'string');
        return schema as ValidationSchema;
      },
      number: () => {
        schema.addRule(name, (v) => !v || typeof v === 'number');
        return schema as ValidationSchema;
      },
      integer: (min?: number, max?: number) => {
        schema.addRule(name, (v) => !v || isValidInteger(v, min, max));
        return schema as ValidationSchema;
      },
      minLength: (length: number) => {
        schema.addRule(name, (v) => !v || v.length >= length);
        return schema as ValidationSchema;
      },
      maxLength: (length: number) => {
        schema.addRule(name, (v) => !v || v.length <= length);
        return schema as ValidationSchema;
      },
      custom: (fn: (v: any) => boolean) => {
        schema.addRule(name, fn);
        return schema as ValidationSchema;
      },
    } as any;
  }

  private addRule(name: string, rule: (value: any) => boolean) {
    if (!this.rules.has(name)) {
      this.rules.set(name, []);
    }
    this.rules.get(name)!.push(rule);
  }

  validate(data: any): { valid: boolean; errors: Record<string, string[]> } {
    const errors: Record<string, string[]> = {};
    for (const [field, fieldRules] of this.rules) {
      const value = data[field];
      const fieldErrors: string[] = [];
      for (const rule of fieldRules) {
        if (!rule(value)) {
          fieldErrors.push(`Validation failed for field ${field}`);
        }
      }
      if (fieldErrors.length > 0) {
        errors[field] = fieldErrors;
      }
    }
    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  }
}
