import { Brain, HeartPulse, Moon, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import lockerRoomReflection from '../assets/stories/locker-room-reflection.png';
import nightBusReflection from '../assets/stories/night-bus-reflection.png';
import recoveryRoomReflection from '../assets/stories/recovery-room-reflection.png';
import trackStrain from '../assets/stories/track-strain.png';
import type {
  AssessmentOption,
  AthleteStory,
  ChallengeCard,
  ProviderDirectoryItem,
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
    slug: 'therapists',
    fit: "I'm struggling with my wellbeing or life outside of sport.",
    bestFor:
      'Help with anxiety, depression, trauma, stress, relationships, life transitions, and other mental health concerns that may affect your life and sport.',
    note: 'May be insurance eligible depending on provider and coverage.',
  },
  {
    title: 'Sports Psychologists',
    slug: 'sports-psychologists',
    fit: 'My sport is affecting my mental wellbeing-or my mental wellbeing is affecting my sport.',
    bestFor:
      'Sports psychologists understand the unique demands of sport and help athletes navigate performance challenges alongside mental health concerns such as anxiety, burnout, identity, and confidence.',
    note: 'Mostly Out-Of-Network.',
  },
  {
    title: 'Performance Coaches',
    slug: 'performance-coaches',
    fit: 'Mentally, I feel great but want to improve my performance.',
    bestFor:
      'Focus on goal setting, routines, visualization, self-talk, concentration, resilience, and performing consistently under pressure. They typically do not provide mental health treatment.',
    note: 'Often self-pay.',
  },
];

export const providerDirectory: ProviderDirectoryItem[] = [
  {
    name: 'Leslie H. Sherlin',
    credentials: 'PhD',
    state: 'AZ',
    telehealth: true,
    focus: 'Sports Performance, College Mental Health',
    insurance: 'Aetna, BCBS, Cigna, UnitedHealthcare',
    type: 'sports-psychologists',
  },
  {
    name: 'Natalie Horn',
    credentials: 'PhD',
    state: 'AZ',
    telehealth: true,
    focus: 'Sports Performance, Perfectionism, Eating Disorders',
    insurance: 'Aetna, BCBS, Optum, UnitedHealthcare',
    type: 'sports-psychologists',
  },
  {
    name: 'Dylan Bilyeu',
    credentials: 'LPC',
    state: 'AZ',
    telehealth: true,
    focus: 'Sports Performance, Perfectionism',
    insurance: 'Aetna, Anthem, BCBS, Cigna, UnitedHealthcare',
    type: 'therapists',
  },
  {
    name: 'Camille McCormick',
    credentials: 'LPC',
    state: 'AZ',
    telehealth: true,
    focus: 'Anxiety, Athlete-related concerns',
    insurance: 'Aetna, BCBS, Cigna, Optum, UnitedHealthcare',
    type: 'therapists',
  },
  {
    name: 'Richard Griff',
    credentials: 'Licensed Psychologist',
    state: 'FL',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, Anthem, BCBS, Cigna',
    type: 'sports-psychologists',
  },
  {
    name: 'Daniel Martinez',
    credentials: 'PsyD',
    state: 'FL',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, BCBS, Cigna, UnitedHealthcare',
    type: 'sports-psychologists',
  },
  {
    name: 'Ruhama Hazout',
    credentials: 'PsyD',
    state: 'FL',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna',
    type: 'sports-psychologists',
  },
  {
    name: 'Maude Guilmette',
    credentials: 'PhD/PsyD',
    state: 'FL',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, Cigna',
    type: 'sports-psychologists',
  },
  {
    name: 'Justin Bush',
    credentials: 'PhD',
    state: 'OR',
    telehealth: true,
    focus: 'Sports Performance, Youth Athletes',
    insurance: 'Aetna, BCBS, First Health',
    type: 'sports-psychologists',
  },
  {
    name: 'Anastasia Jones',
    credentials: 'Psychologist',
    state: 'OR',
    telehealth: true,
    focus: 'Sports Performance, OCD, Anxiety',
    insurance: 'Aetna, BCBS, Lyra, UnitedHealthcare',
    type: 'sports-psychologists',
  },
  {
    name: 'Steven Clemens',
    credentials: 'Behavioral Health Therapist',
    state: 'NC',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, BCBS, Cigna, Optum',
    type: 'therapists',
  },
  {
    name: 'George Tabb',
    credentials: 'LCSW',
    state: 'NC',
    telehealth: true,
    focus: 'Sports Injuries, Sports Performance',
    insurance: 'Aetna, BCBS, Cigna',
    type: 'therapists',
  },
  {
    name: 'John Panepinto',
    credentials: 'PsyD',
    state: 'NC',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, BCBS',
    type: 'sports-psychologists',
  },
  {
    name: 'Maria Ramundo',
    credentials: 'PsyD',
    state: 'NJ',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, BCBS, Medicare',
    type: 'sports-psychologists',
  },
  {
    name: 'Nancy Morris',
    credentials: 'LCSW',
    state: 'NJ',
    telehealth: true,
    focus: 'Sports Performance, College Mental Health',
    insurance: 'Aetna, BCBS',
    type: 'therapists',
  },
  {
    name: 'Bella Walko',
    credentials: 'LMFT',
    state: 'CA',
    telehealth: true,
    focus: 'Sports Performance, Burnout, Perfectionism',
    insurance: 'Aetna, Blue Shield, Optum',
    type: 'therapists',
  },
  {
    name: 'Elite Psychology Group',
    credentials: 'Group Practice',
    state: 'CA',
    telehealth: true,
    focus: 'Performance & Mental Health',
    insurance: 'Aetna, Anthem',
    type: 'sports-psychologists',
  },
  {
    name: 'Todd Nall',
    credentials: 'LPC-Associate',
    state: 'TX',
    telehealth: true,
    focus: 'Sports Performance',
    insurance: 'Aetna, BCBS, Cigna',
    type: 'therapists',
  },
  {
    name: 'Rachel Brackett',
    credentials: 'LPC',
    state: 'TX',
    telehealth: true,
    focus: 'Performance Anxiety',
    insurance: 'Aetna, BCBS, Cigna, Optum, UnitedHealthcare',
    type: 'therapists',
  },
  {
    name: 'Cordell Pearson',
    credentials: 'LPC',
    state: 'AZ',
    telehealth: true,
    focus: 'College Mental Health, Performance',
    insurance: 'Aetna, Optum, UnitedHealthcare',
    type: 'therapists',
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
