import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

export function identifyRateLimitUser(request, _response, next) {
  request.rateLimitUserId = null;
  const [scheme, token] = String(request.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token || !process.env.JWT_ACCESS_SECRET) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (typeof payload === 'object' && payload !== null && payload.sub !== undefined) {
      request.rateLimitUserId = String(payload.sub);
    }
  } catch {
    // Invalid tokens remain subject to the client-IP limit.
  }
  return next();
}

export function createAuthenticatedRateLimiter({ windowMs = 15 * 60 * 1000, limit = 300, skip = () => false } = {}) {
  return rateLimit({
    windowMs,
    limit,
    skip: (request) => !request.rateLimitUserId || skip(request),
    keyGenerator: (request) => `user:${request.rateLimitUserId}`,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ message: 'Too many requests. Please try again later.' })
  });
}
