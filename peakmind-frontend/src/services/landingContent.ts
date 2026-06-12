import { Brain, HeartPulse, Moon, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import lockerRoomReflection from '../assets/stories/locker-room-reflection.png';
import nightBusReflection from '../assets/stories/night-bus-reflection.png';
import recoveryRoomReflection from '../assets/stories/recovery-room-reflection.png';
import trackStrain from '../assets/stories/track-strain.png';
import type {
  AssessmentOption,
  AthleteStory,
  ChallengeCard,
  ProviderOption,
  ResourceCard,
} from '../types/landing';

export const challengeCards: ChallengeCard[] = [
  {
    title: 'When one mistake follows you home',
    copy: 'You replay the moment long after practice ends, even when everyone else has moved on.',
  },
  {
    title: 'When tired starts feeling like numb',
    copy: 'Training, class, travel, and expectations pile up until you stop feeling like yourself.',
  },
  {
    title: 'When your body is cleared but your mind is not',
    copy: 'You are back on paper, but trust, confidence, role, or identity still feels different.',
  },
  {
    title: 'When sport feels like your whole identity',
    copy: 'A bad day does not just feel like a bad day. It starts feeling like a verdict on you.',
  },
  {
    title: 'When you need help outside the team system',
    copy: 'You want support, but not through your coach, roster, school, or athletic department.',
  },
  {
    title: 'When confidence disappears quietly',
    copy: 'You still care. You still work. But competing freely starts to feel far away.',
  },
];

export const assessmentOptions: AssessmentOption[] = [
  {
    title: 'Pressure to perform',
    detail: 'Expectations, fear of losing your spot, or feeling like one bad day changes everything.',
  },
  {
    title: 'Feeling burned out',
    detail: 'Tired, detached, irritable, or overloaded by training, school, travel, and pressure.',
  },
  {
    title: 'Coming back from injury',
    detail: 'Physically cleared, but confidence, trust, role, or identity still feels different.',
  },
  {
    title: 'Confidence loss',
    detail: 'You know what you can do, but your mind is not letting you compete freely.',
  },
  {
    title: 'Coach/team pressure',
    detail: 'You want support that does not run through your coach, team, school, or department.',
  },
  {
    title: "I don't know yet",
    detail: 'You just know something feels heavy, and you want help naming it.',
  },
];

export const resources: ResourceCard[] = [
  {
    icon: Volume2,
    title: '1-3 minute mindset shifts',
    copy: 'Short audio resets for before practice, after a mistake, on the bus, or when your mind will not slow down.',
  },
  {
    icon: RotateCcw,
    title: 'Post-mistake reset',
    copy: 'Tools for stopping the spiral after one play, one race, one routine, or one bad performance.',
  },
  {
    icon: Sparkles,
    title: 'Confidence rebuilding',
    copy: 'Self-talk and reflection prompts for athletes who feel like their edge has disappeared.',
  },
  {
    icon: Moon,
    title: 'Sleep recovery audio',
    copy: 'Calming support for the nights when pressure follows you into bed.',
  },
  {
    icon: HeartPulse,
    title: 'Injury comeback support',
    copy: 'Guidance for the emotional side of returning when your body, role, or trust feels different.',
  },
  {
    icon: Brain,
    title: 'Self-talk training',
    copy: 'Practice reframing the inner voice that gets loud under pressure.',
  },
];

export const providerTypes: ProviderOption[] = [
  {
    title: 'Therapists / psychologists',
    bestFor:
      'Anxiety, depression, trauma, stress, emotional wellbeing, and clinical support.',
    note: 'May be insurance eligible.',
  },
  {
    title: 'Sports psychologists',
    bestFor:
      'Athlete-specific mental skills, performance pressure, confidence, recovery, and identity challenges.',
    note: 'Often focused on the overlap between wellbeing and performance.',
  },
  {
    title: 'Performance coaches',
    bestFor:
      'Mental skills, routines, self-talk, focus, confidence, and game-day mindset.',
    note: 'Often self-pay.',
  },
];

export const socialPrompts = [
  'Signs your sport has become your entire identity.',
  'Need support, but do not want it getting back to your coach?',
  'When one mistake makes you question your whole worth.',
];

export const athleteStories: AthleteStory[] = [
  {
    quote: "I wasn't injured anymore, but I still didn't feel like myself.",
    context: 'Returning from injury',
    image: lockerRoomReflection,
    imageAlt: 'Male boxer sitting in a training gym after a round',
  },
  {
    quote: 'One bad game made me question if I belonged.',
    context: 'Confidence and pressure',
    image: nightBusReflection,
    imageAlt: 'Athlete sitting on a locker room bench after practice',
  },
  {
    quote: "I wanted support, but I didn't want it getting back to my coach.",
    context: 'Private support',
    image: trackStrain,
    imageAlt: 'Track athlete sitting on the ground with her head resting on her arms',
  },
  {
    quote: 'I thought being tired was part of the sport until I stopped feeling like me.',
    context: 'Burnout',
    image: recoveryRoomReflection,
    imageAlt: 'Athlete sitting alone in a quiet recovery room after practice',
  },
];
