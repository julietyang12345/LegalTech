import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('community_posts')
export class CommunityPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ default: 'project' })
  type: 'project' | 'question' | 'progress';

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  currentState: 'started' | 'in-progress' | 'paused' | 'completed';

  @Column({ type: 'text', nullable: true })
  whatDone: string;

  @Column({ type: 'text', nullable: true })
  feedbackWanted: string;

  @Column({ type: 'text', nullable: true })
  codeSnippet: string;

  // Course sharing
  @Column({ type: 'json', nullable: true })
  linkedCourse: {
    sessionId: string;
    skillName: string;
    skillLevel: string;
    durationDays: number;
    currentDay: number;
    progress: number;
  };

  @Column({ nullable: true })
  dayNumber: number;

  @Column({ nullable: true })
  stepType: string;

  @Column({ type: 'json', nullable: true })
  sharedContent: {
    question?: string;
    options?: string[];
    correctAnswer?: string;
  };

  // Question post fields
  @Column({ type: 'text', nullable: true })
  question: string;

  @Column({ type: 'text', nullable: true })
  whatTrying: string;

  @Column({ type: 'text', nullable: true })
  whatTried: string;

  @Column({ type: 'text', nullable: true })
  whereStuck: string;

  // Progress log fields
  @Column({ type: 'text', nullable: true })
  progressNote: string;

  @Column({ default: false })
  isPinned: boolean;

  @Column({ nullable: true })
  groupId: string;

  @OneToMany(() => CommunityComment, (comment) => comment.post)
  comments: CommunityComment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('community_comments')
export class CommunityComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  postId: string;

  @ManyToOne(() => CommunityPost, (post) => post.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'postId' })
  post: CommunityPost;

  @Column()
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'general' })
  commentType: 'worked-for-me' | 'clarification' | 'watch-out' | 'general';

  @Column({ default: false })
  isHelpful: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
