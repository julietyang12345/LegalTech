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
    title: 'When one mistake keeps replaying',
    copy: 'A bad rep, bad game, or bad race can stick with you long after practice ends.',
  },
  {
    title: 'When tired starts feeling like burnout',
    copy: 'Training, class, travel, recovery, and pressure can make exhaustion feel permanent.',
  },
  {
    title: 'When your body is cleared, but your confidence is not',
    copy: 'You are back on paper, but trust, identity, and timing still feel different.',
  },
  {
    title: 'When sport feels like your whole identity',
    copy: 'One result can start to feel like a verdict on who you are.',
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
    title: 'Therapists / Psychologists',
    fit: "I'm struggling with my wellbeing or life outside of sport.",
    bestFor:
      'Help with anxiety, depression, trauma, stress, relationships, life transitions, and other mental health concerns that may affect your life and sport.',
    note: 'May be insurance eligible depending on provider and coverage.',
  },
  {
    title: 'Sports Psychologists',
    fit: 'My sport is affecting my mental wellbeing-or my mental wellbeing is affecting my sport.',
    bestFor:
      'Sports psychologists understand the unique demands of sport and help athletes navigate performance challenges alongside mental health concerns such as anxiety, burnout, identity, and confidence.',
    note: 'Mostly Out-Of-Network.',
  },
  {
    title: 'Performance Coaches',
    fit: 'Mentally, I feel great but want to improve my performance.',
    bestFor:
      'Focus on goal setting, routines, visualization, self-talk, concentration, resilience, and performing consistently under pressure. They typically do not provide mental health treatment.',
    note: 'Often self-pay.',
  },
];

export const socialPrompts = [
  'Private support for the pressure athletes carry',
  'I wanted support, but I did not want it getting back to my coach.',
  'One mistake keeps replaying long after practice.',
];

export const athleteStories: AthleteStory[] = [
  {
    quote: "My body was cleared, but my confidence wasn't.",
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
    quote: 'I thought I was tired. I was actually burned out.',
    context: 'Burnout',
    image: recoveryRoomReflection,
    imageAlt: 'Athlete sitting alone in a quiet recovery room after practice',
  },
];
