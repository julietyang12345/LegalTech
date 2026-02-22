import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCompanionStore } from '@/stores/companionStore';
import {
  Search,
  BookOpen,
  CheckCircle,
} from 'lucide-react';
import { GeneratingScreen, FakePaywallModal } from '@/components/common';
import { SkillLevel } from '@/types';
import type { CreateSessionDto } from '@/types';
import api from '@/services/api';

// Map familiarity to skill level
const familiarityToSkillLevel: Record<string, SkillLevel> = {
  new: SkillLevel.BEGINNER,
  know_basics: SkillLevel.INTERMEDIATE,
  skilled: SkillLevel.ADVANCED,
};

// Map session length to hours
const sessionLengthToHours: Record<string, number> = {
  short: 0.5,
  medium: 1,
  long: 1.5,
};

export function ConfirmationPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createSession } = useSessionStore();
  const { addSystemMessage } = useCompanionStore();

  const [estimatedDays, setEstimatedDays] = useState<number>(7);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string | undefined>();
  const hasStarted = useRef(false);

  // Get preferences from user
  const prefs = user?.preferences?.learner;
  const skillName = prefs?.selectedDirection || '';
  const familiarity = prefs?.familiarity || 'new';
  const sessionLength = prefs?.sessionLength || 'medium';

  // Loading steps for curriculum generation
  const getGenerationLoadingSteps = (days: number) => [
    { icon: Search, text: 'Analyzing your skill...', duration: 5000 },
    { icon: BookOpen, text: 'Building curriculum...', duration: days > 7 ? 60000 : 40000 },
    { icon: CheckCircle, text: 'Finalizing your plan...', duration: 5000 },
  ];

  // Helper to check if error is a quota error
  const isQuotaError = (error: any): boolean => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message?.toLowerCase() || '';
    return status === 403 && (
      message.includes('quota') ||
      message.includes('exceeded') ||
      message.includes('limit') ||
      message.includes('upgrade')
    );
  };

  // Auto-start: estimate days then generate curriculum
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startGeneration = async () => {
      if (!skillName) {
        navigate('/onboarding');
        return;
      }

      try {
        // First, get estimated days + skill detection from AI
        const { data } = await api.post<{ estimatedDaysNeeded: number; skillDetection?: any }>('/curriculum/estimate-days', {
          skillName,
        });
        const days = data.estimatedDaysNeeded || 7;
        setEstimatedDays(days);

        // Then create session with AI-determined days + pre-computed skill detection
        const sessionDto: CreateSessionDto = {
          skillName,
          durationDays: days,
          hoursPerDay: sessionLengthToHours[sessionLength],
          skillLevel: familiarityToSkillLevel[familiarity],
          // Pass skill detection to avoid duplicate AI call in generateCurriculum
          skillDetection: data.skillDetection,
        };

        await createSession(sessionDto);

        addSystemMessage(
          `Your ${skillName} curriculum is ready! Here's your learning plan.`,
          'celebratory'
        );

        navigate('/plan');
      } catch (err: any) {
        console.error('Failed to generate curriculum:', err);
        if (isQuotaError(err)) {
          setQuotaErrorMessage(err.response?.data?.message);
          setShowQuotaModal(true);
        } else {
          // On error, go back to onboarding
          navigate('/onboarding');
        }
      }
    };

    startGeneration();
  }, [skillName, familiarity, sessionLength, navigate, createSession, addSystemMessage, estimatedDays]);

  return (
    <>
      <GeneratingScreen
        steps={getGenerationLoadingSteps(estimatedDays)}
        title="Creating your curriculum"
        subtitle={`Building a personalized ${skillName} learning path (~${estimatedDays} days)...`}
        timeEstimate={estimatedDays > 7 ? "This takes about 70-80 seconds" : "This takes about 50-60 seconds"}
      />

      {/* Quota Exceeded Modal - Full Feature Comparison */}
      <FakePaywallModal
        isOpen={showQuotaModal}
        onClose={() => {
          setShowQuotaModal(false);
          navigate('/onboarding');
        }}
        source="rate_limit"
        reason="curriculum_quota"
      />
    </>
  );
}
