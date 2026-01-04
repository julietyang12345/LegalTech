import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import { FocusModeLayout } from '@/components/layout';
import { Button } from '@/components/common';

// Import step components
import { PrePromptStep } from '@/components/session/PrePromptStep';
import { VideoStep } from '@/components/session/VideoStep';
import { ActiveRecallStep } from '@/components/session/ActiveRecallStep';
import { MemoryBridgeStep } from '@/components/session/MemoryBridgeStep';
import { ConceptCheckStep } from '@/components/session/ConceptCheckStep';
import { TaskStep } from '@/components/session/TaskStep';
import { BossMilestoneStep } from '@/components/session/BossMilestoneStep';
import { ReflectionStep } from '@/components/session/ReflectionStep';

import type { SessionStep as SessionStepType } from '@/types';

const STEP_COMPONENTS: Record<SessionStepType, React.ComponentType<any>> = {
  prePrompt: PrePromptStep,
  video: VideoStep,
  activeRecall: ActiveRecallStep,
  memoryBridge: MemoryBridgeStep,
  conceptCheck: ConceptCheckStep,
  task1: TaskStep,
  bossMilestone: BossMilestoneStep,
  reflection: ReflectionStep,
};

const STEP_ORDER: SessionStepType[] = [
  'prePrompt',
  'video',
  'activeRecall',
  'memoryBridge',
  'conceptCheck',
  'task1',
  'bossMilestone',
  'reflection',
];

export function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  
  const {
    activeSession,
    currentDay,
    currentStep,
    completedSteps,
    fetchActiveSession,
    setActiveSession,
    startDay,
    setCurrentStep,
    completeStep,
  } = useSessionStore();

  const { celebrate, addSystemMessage } = useCompanionStore();

  // Load session on mount
  useEffect(() => {
    if (sessionId && !activeSession) {
      fetchActiveSession();
    }
  }, [sessionId, activeSession, fetchActiveSession]);

  // Start the day when session loads
  useEffect(() => {
    if (activeSession && !currentDay) {
      startDay(activeSession.currentDay);
    }
  }, [activeSession, currentDay, startDay]);

  // Get available steps (filter out skipped ones)
  const availableSteps = STEP_ORDER.filter(step => {
    if (step === 'memoryBridge' && currentDay?.day === 1) return false;
    if (step === 'bossMilestone' && !currentDay?.bossMilestone) return false;
    return true;
  });

  const currentStepIndex = availableSteps.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === availableSteps.length - 1;

  const handlePrevious = () => {
    if (isFirstStep) return;
    const prevStep = availableSteps[currentStepIndex - 1];
    setCurrentStep(prevStep);
  };

  const handleContinue = () => {
    if (isLastStep) {
      // Session complete!
      celebrate('dayComplete');
      addSystemMessage(
        "🎉 Incredible! You finished the whole day! Take a moment to feel proud!",
        'celebratory'
      );
      navigate('/today');
      return;
    }

    // Mark current step complete and move to next
    completeStep(currentStep);
    
    // Celebrate based on step
    if (currentStep === 'task1') {
      celebrate('taskComplete');
    }
  };

  // Loading state
  if (!activeSession || !currentDay) {
    return (
      <FocusModeLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse space-y-4 w-full max-w-lg">
            <div className="h-8 bg-gray-200 rounded w-3/4 mx-auto" />
            <div className="h-64 bg-gray-200 rounded-xl" />
            <div className="h-12 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </FocusModeLayout>
    );
  }

  const StepComponent = STEP_COMPONENTS[currentStep];

  return (
    <FocusModeLayout>
      {/* Step content with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <StepComponent
            day={currentDay}
            session={activeSession}
            onComplete={handleContinue}
          />
        </motion.div>
      </AnimatePresence>

      {/* Navigation footer - only 2 buttons! */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4">
        <div className="max-w-focus mx-auto px-4 flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={handlePrevious}
            disabled={isFirstStep}
            leftIcon={<ChevronLeft className="w-5 h-5" />}
          >
            Previous
          </Button>

          <Button
            variant={isLastStep ? 'accent' : 'primary'}
            onClick={handleContinue}
            rightIcon={<ChevronRight className="w-5 h-5" />}
          >
            {isLastStep ? 'Complete Session 🎉' : 'Continue'}
          </Button>
        </div>
      </div>

      {/* Spacer for fixed footer */}
      <div className="h-20" />
    </FocusModeLayout>
  );
}
