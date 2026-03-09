import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { byUserOrIpKey, createRateLimit } from '../middleware/rate-limit.js';
import { getLimitsForPlan } from '../services/plan.service.js';
import { claimMvpProUpgrade } from '../services/billing.service.js';

export const authRouter = Router();

const authedRateLimit = createRateLimit({
  name: 'vm-auth-authed',
  windowMs: 60_000,
  max: 90,
  key: byUserOrIpKey,
});

authRouter.get('/me', requireAuth, authedRateLimit, (req, res) => {
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

authRouter.get('/billing/upgrade-link', requireAuth, authedRateLimit, (_req, res) => {
  if (!config.stripeUpgradeUrl) {
    res.status(503).json({
      message: 'Upgrade is not configured yet',
      provider: 'stripe',
    });
    return;
  }

  res.json({
    provider: 'stripe',
    url: config.stripeUpgradeUrl,
    priceUsdMonthly: config.proMonthlyPriceUsd,
    paymentReceivedUrl: `${config.frontendUrl}/?upgrade=success`,
    message: 'Click Upgrade to continue with Stripe checkout.',
  });
});

authRouter.post('/billing/claim-mvp-upgrade', requireAuth, authedRateLimit, async (req, res) => {
  const upgrade = await claimMvpProUpgrade(req.user!.id);
  res.json({
    message: 'MVP upgrade applied. Pro is free for one month.',
    plan: upgrade.plan,
    source: upgrade.source,
    expiresAt: upgrade.expiresAt,
    limits: getLimitsForPlan(upgrade.plan),
  });
});
