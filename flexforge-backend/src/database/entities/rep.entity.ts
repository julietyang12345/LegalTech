import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('reps')
export class Rep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  skillName: string;

  @Column({ nullable: true })
  topic: string;

  @Column({ nullable: true })
  skillType: string;

  @Column({ type: 'jsonb' })
  scenario: {
    title: string;
    briefing: string;
    brief?: {
      managerName: string;
      managerRole: string;
      channel: 'slack' | 'email';
      message: string;
      deadline: string;
      deliverable: string;
    };
    template?: string;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      estimatedMinutes: number;
    }>;
    estimatedMinutes: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    skillTags: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  scenarioOptions: Array<{
    title: string;
    briefing: string;
    brief?: {
      managerName: string;
      managerRole: string;
      channel: 'slack' | 'email';
      message: string;
      deadline: string;
      deliverable: string;
    };
    template?: string;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      estimatedMinutes: number;
    }>;
    estimatedMinutes: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    skillTags: string[];
  }>;

  @Column({ type: 'text', nullable: true })
  scratchPadContent: string;

  @Column({ type: 'jsonb', default: [] })
  coachConversation: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;

  @Column({ default: 0 })
  hintsUsed: number;

  @Column({ type: 'jsonb', default: [] })
  hintsRevealed: Array<{
    taskIndex: number;
    level: number;
    hint: string;
    encouragement: string;
  }>;

  @Column({ default: false })
  completed: boolean;

  @Column({ default: 0 })
  timeSpentSeconds: number;

  @Column({ type: 'float', nullable: true })
  confidenceScore: number;

  @Column({ type: 'jsonb', nullable: true })
  feedback: {
    execution: {
      completionAnalysis: string;
      timeEfficiency: string;
      hintDependency: string;
    };
    skillEvaluation: Array<{
      dimension: string;
      score: number;
      evidence: string;
      gap: string;
    }>;
    improvementPlan: {
      immediateActions: string[];
      conceptsToStudy: string[];
      suggestedNextRep: string;
      resourceHints: string[];
      methodToImprove: Array<{ dimension: string; method: string }>;
    };
    growthSignal: {
      comparedToStart: string;
      confidenceCalibration: string;
      encouragement: string;
    };
    suggestedTopics: string[];
    exampleAnswer?: string;
    microLessons?: Array<{
      dimensionId: string;
      title: string;
      content: string;
      exercise: string;
    }>;
  };

  @Column({ type: 'jsonb', nullable: true })
  userFeedback: {
    difficulty: 'too_easy' | 'just_right' | 'too_hard';
    relevance: 'relevant' | 'not_relevant';
    note?: string;
    submittedAt: string;
  };

  @Column({ nullable: true })
  sourceSessionId: string;

  @Column({ default: 'scenario' })
  mode: 'scenario' | 'quiz';

  @Column({ type: 'jsonb', nullable: true })
  quizData: {
    questions: Array<{
      id: string;
      level: 'foundational' | 'applied';
      conceptTitle: string;
      question: string;
      caseStudy?: string;
      options: Array<{
        text: string;
        correct: boolean;
        explanation: string;
      }>;
    }>;
    answers?: Array<{
      questionId: string;
      selectedIndex: number;
      correct: boolean;
    }>;
    rawScore?: number;
    total?: number;
  };

  @Column({ nullable: true })
  sourceConcept: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
