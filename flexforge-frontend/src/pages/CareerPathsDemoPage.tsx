import { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Briefcase, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/common';
import { ROLE_SIMULATIONS, ROLE_SIMULATIONS_MAP } from '@/data/careerPathsRoles';
import type { RoleId } from '@/data/careerPathsRoles';
import { RoleCard } from '@/components/careerDemo/RoleCard';
import { CompanyBrief } from '@/components/careerDemo/CompanyBrief';
import { DeliverableTask } from '@/components/careerDemo/DeliverableTask';
import { SimulationDebrief } from '@/components/careerDemo/SimulationDebrief';

const STEP_LABELS = ['Brief', 'Task', 'Debrief'];

// ---------------------------------------------------------------------------
// Hub — role selection grid (no ?role= param)
// ---------------------------------------------------------------------------

function Hub({
  completedRoles,
  onStartRole,
}: {
  completedRoles: Set<RoleId>;
  onStartRole: (id: RoleId) => void;
}) {
  const navigate = useNavigate();
  const completedCount = completedRoles.size;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
          className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center shadow-lg shadow-brand-500/20"
        >
          <Briefcase className="w-8 h-8 text-white" />
        </motion.div>
        <h1 className="text-3xl font-bold text-content mb-3">
          Do the job before you get the job
        </h1>
        <p className="text-content-secondary max-w-lg mx-auto">
          Try a real task from each role. 5 minutes. No signup. Walk away with a
          deliverable you'd actually create on the job.
        </p>
      </div>

      {/* Completed banner */}
      {completedCount > 0 && completedCount < ROLE_SIMULATIONS.length && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 text-center"
        >
          <p className="text-sm text-brand-700 dark:text-brand-300">
            You've explored <span className="font-semibold">{completedCount}</span> role
            {completedCount > 1 ? 's' : ''}. Get a personalized curriculum for any of them.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:text-brand-700"
          >
            Sign up free
          </button>
        </motion.div>
      )}

      {completedCount >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-center"
        >
          <p className="text-sm text-purple-700 dark:text-purple-300">
            You're seriously exploring career options. Let us build a plan that maps YOUR background to YOUR target role.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => navigate('/register')}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Get Your Personalized Plan
          </Button>
        </motion.div>
      )}

      {/* Role grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ROLE_SIMULATIONS.map((role, i) => (
          <RoleCard
            key={role.id}
            role={role}
            isCompleted={completedRoles.has(role.id)}
            onStart={() => onStartRole(role.id)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulation — 3-step flow (Brief → Task → Debrief)
// ---------------------------------------------------------------------------

function Simulation({
  roleId,
  onComplete,
  onBack,
}: {
  roleId: RoleId;
  onComplete: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const role = ROLE_SIMULATIONS_MAP[roleId];
  const [step, setStep] = useState(0); // 0=Brief, 1=Task, 2=Debrief

  const handleTaskComplete = useCallback(() => {
    setStep(2);
    onComplete();
  }, [onComplete]);

  const handleTryAnother = useCallback(() => {
    onBack();
  }, [onBack]);

  return (
    <>
      {/* Progress bar for simulation steps */}
      <div className="max-w-2xl mx-auto px-4 pb-4">
        <div className="flex items-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={clsx(
                  'w-full h-1.5 rounded-full transition-colors',
                  i < step
                    ? 'bg-green-500'
                    : i === step
                      ? 'bg-brand-500'
                      : 'bg-surface-tertiary',
                )}
              />
              <span
                className={clsx(
                  'text-xs hidden sm:block',
                  i <= step ? 'text-content-secondary font-medium' : 'text-content-tertiary',
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <CompanyBrief
            key="brief"
            role={role}
            onStartTask={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <DeliverableTask
            key="task"
            role={role}
            onComplete={handleTaskComplete}
          />
        )}
        {step === 2 && (
          <SimulationDebrief
            key="debrief"
            role={role}
            onTryAnother={handleTryAnother}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page — orchestrator
// ---------------------------------------------------------------------------

export function CareerPathsDemoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [completedRoles, setCompletedRoles] = useState<Set<RoleId>>(new Set());

  const roleParam = searchParams.get('role') as RoleId | null;
  const activeRole = roleParam && ROLE_SIMULATIONS_MAP[roleParam] ? roleParam : null;

  const handleStartRole = useCallback(
    (id: RoleId) => {
      setSearchParams({ role: id });
    },
    [setSearchParams],
  );

  const handleCompleteRole = useCallback(() => {
    if (activeRole) {
      setCompletedRoles((prev) => new Set(prev).add(activeRole));
    }
  }, [activeRole]);

  const handleBackToHub = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-secondary to-surface flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => (activeRole ? handleBackToHub() : navigate('/'))}
            className="flex items-center gap-2 text-content-secondary hover:text-content transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-lg text-content">FlexForge</span>
          </button>

          <div className="flex items-center gap-2 text-sm text-content-tertiary">
            {activeRole ? (
              <>
                <Sparkles className="w-4 h-4 text-brand-500" />
                <span className="hidden sm:inline">
                  {ROLE_SIMULATIONS_MAP[activeRole].role} Simulation
                </span>
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4 text-brand-500" />
                <span className="hidden sm:inline">Career Role Simulations</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-8">
        <AnimatePresence mode="wait">
          {activeRole ? (
            <Simulation
              key={activeRole}
              roleId={activeRole}
              onComplete={handleCompleteRole}
              onBack={handleBackToHub}
            />
          ) : (
            <Hub
              key="hub"
              completedRoles={completedRoles}
              onStartRole={handleStartRole}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
