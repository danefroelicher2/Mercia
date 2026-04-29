import { Request, Response, NextFunction } from 'express';
import { verifyToken, User } from '../services/auth';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const user = verifyToken(token);
    req.user = user;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Authenticates pg_cron HTTP trigger requests via a shared secret.
 * If CRON_SECRET is not set in env, all requests are rejected.
 */
export function authenticateCronSecret(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(503).json({ error: 'Cron endpoints not configured' });
    return;
  }
  const provided = req.headers['x-cron-secret'];
  if (!provided || provided !== cronSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (error) {
      // Token invalid but continue anyway
    }
  }

  next();
}
