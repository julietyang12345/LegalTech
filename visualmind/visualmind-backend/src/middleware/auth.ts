import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthUser } from '../types.js';
import { inferPlanFromRole } from '../services/plan.service.js';
import { getActivePlanOverride } from '../services/billing.service.js';

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
    const basePlan = inferPlanFromRole(payload.role);
    void (async () => {
      const overridePlan = await getActivePlanOverride(payload.sub);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        plan: overridePlan ?? basePlan,
      };
      next();
    })().catch((error) => {
      console.error('[VisualMind] auth:plan-override-check-failed', error);
      res.status(500).json({ message: 'Failed to resolve user plan' });
    });
  } catch {
    res.status(401).json({ message: 'Unauthorized: token invalid' });
  }
};
