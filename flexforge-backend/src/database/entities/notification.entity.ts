import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  COMMENT = 'comment',
  COURSE_REQUEST = 'course_request',
  COURSE_GRANTED = 'course_granted',
  MENTION = 'mention',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Who receives the notification
  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Who triggered the notification
  @Column()
  fromUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  // Context data
  @Column({ nullable: true })
  postId: string;

  @Column({ nullable: true })
  postTitle: string;

  @Column({ nullable: true })
  courseName: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ default: false })
  isRead: boolean;

  // For course_request: track if access was granted
  @Column({ default: false })
  isActioned: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
