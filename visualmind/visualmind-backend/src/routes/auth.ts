import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getLimitsForPlan } from '../services/plan.service.js';

export const authRouter = Router();

authRouter.get('/me', requireAuth, (req, res) => {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      limits: getLimitsForPlan(user.plan),
    },
  });
});
