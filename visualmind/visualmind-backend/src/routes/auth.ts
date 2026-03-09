import { Router } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { getLimitsForPlan } from '../services/plan.service.js';
import { claimMvpProUpgrade } from '../services/billing.service.js';

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

authRouter.get('/billing/upgrade-link', requireAuth, (_req, res) => {
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

authRouter.post('/billing/claim-mvp-upgrade', requireAuth, async (req, res) => {
  const upgrade = await claimMvpProUpgrade(req.user!.id);
  res.json({
    message: 'MVP upgrade applied. Pro is free for one month.',
    plan: upgrade.plan,
    source: upgrade.source,
    expiresAt: upgrade.expiresAt,
    limits: getLimitsForPlan(upgrade.plan),
  });
});
