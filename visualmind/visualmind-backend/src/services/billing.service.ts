import { db } from '../db.js';
import type { UserPlan } from '../types.js';

const MVP_TRIAL_DAYS = 30;

export const getActivePlanOverride = async (userId: string): Promise<UserPlan | null> => {
  const result = await db.query<{ plan: UserPlan }>(
    `
      SELECT plan
      FROM vm_user_plan_overrides
      WHERE user_id = $1 AND expires_at > NOW()
      LIMIT 1
    `,
    [userId],
  );
  return result.rows[0]?.plan ?? null;
};

export const claimMvpProUpgrade = async (
  userId: string,
): Promise<{ plan: UserPlan; expiresAt: string; source: string }> => {
  const result = await db.query<{ plan: UserPlan; expires_at: string; source: string }>(
    `
      INSERT INTO vm_user_plan_overrides (user_id, plan, source, expires_at)
      VALUES ($1, 'pro', 'mvp-free-upgrade', NOW() + ($2::text || ' days')::interval)
      ON CONFLICT (user_id)
      DO UPDATE
      SET
        plan = 'pro',
        source = 'mvp-free-upgrade',
        expires_at = GREATEST(vm_user_plan_overrides.expires_at, NOW() + ($2::text || ' days')::interval),
        updated_at = NOW()
      RETURNING plan, source, expires_at
    `,
    [userId, MVP_TRIAL_DAYS],
  );

  return {
    plan: result.rows[0].plan,
    source: result.rows[0].source,
    expiresAt: result.rows[0].expires_at,
  };
};
