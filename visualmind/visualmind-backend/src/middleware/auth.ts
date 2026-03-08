import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthUser } from '../types.js';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const readToken = (req: Request): string | null => {
  const cookieToken = req.cookies?.[config.cookieName];
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  return null;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: 'Unauthorized: token missing' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized: token invalid' });
  }
};
