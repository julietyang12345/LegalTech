import type { UsageLimits, UserPlan } from '../types.js';

export const FREE_MAX_TEXT_CHARS = 5000;
export const PRO_MAX_TEXT_CHARS = 50000;

const PRO_ROLES = new Set(['pro', 'premium', 'admin', 'owner', 'unlimited']);

export const inferPlanFromRole = (role?: string): UserPlan => {
  if (!role) return 'free';
  return PRO_ROLES.has(role.toLowerCase()) ? 'pro' : 'free';
};

export const getLimitsForPlan = (plan: UserPlan): UsageLimits => {
  if (plan === 'pro') {
    return {
      maxTextChars: PRO_MAX_TEXT_CHARS,
      canImportPdf: true,
      canImportWeb: true,
      maxSourceSessions: Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    maxTextChars: FREE_MAX_TEXT_CHARS,
    canImportPdf: true,
    canImportWeb: true,
    maxSourceSessions: 3,
  };
};
