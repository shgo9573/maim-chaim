import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  statusCode?: number;
  keyPrefix?: string;
}

export function extractClientIp(req: Request): string {
  // Check headers commonly set by reverse proxies / CDNs (Nginx, Cloudflare, DuckDNS)
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.trim()) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const xRealIp = req.headers['x-real-ip'];
  if (typeof xRealIp === 'string' && xRealIp.trim()) {
    return xRealIp.trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * Creates an in-memory sliding-window rate limiter middleware for the entire site.
 * Strict: applies to all incoming requests without exemptions.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
  const maxRequests = options.maxRequests || 2000; // Default: 2000 requests/min
  const message = options.message || 'חריגה ממגבלת הבקשות המותרת לדקה. אנא נסה שוב מאוחר יותר.';
  const statusCode = options.statusCode || 429;
  const keyPrefix = options.keyPrefix || 'global';

  const storage = new Map<string, RateLimitRecord>();

  // Periodic cleanup of expired rate limit records (runs once every minute)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of storage.entries()) {
      if (now > record.resetTime) {
        storage.delete(key);
      }
    }
  }, 60 * 1000);
  cleanupInterval.unref?.();

  return function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
    const clientIp = extractClientIp(req);
    const key = `${keyPrefix}:${clientIp}`;
    const now = Date.now();
    let record = storage.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      storage.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    // Set standard RateLimit response headers
    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(statusCode).json({
        error: 'Too Many Requests',
        message,
        retryAfter: resetSeconds
      });
    }

    next();
  };
}
