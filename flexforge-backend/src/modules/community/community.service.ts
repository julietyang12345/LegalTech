import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommunityPost, CommunityComment } from '../../database/entities/community-post.entity';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { CreatePostDto, CreateCommentDto, RequestCourseAccessDto } from './dto/community.dto';

@Injectable()
export class CommunityService {
  constructor(
    @InjectRepository(CommunityPost)
    private postRepository: Repository<CommunityPost>,
    @InjectRepository(CommunityComment)
    private commentRepository: Repository<CommunityComment>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
  ) {}

  // Posts
  async createPost(userId: string, dto: CreatePostDto): Promise<CommunityPost> {
    const post = this.postRepository.create({
      authorId: userId,
      ...dto,
    });
    const savedPost = await this.postRepository.save(post);

    // Return post with author relation loaded
    return this.postRepository.findOne({
      where: { id: savedPost.id },
      relations: ['author'],
    });
  }

  async getPosts(groupId?: string): Promise<CommunityPost[]> {
    const query = this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.comments', 'comments')
      .leftJoinAndSelect('comments.author', 'commentAuthor')
      .orderBy('post.isPinned', 'DESC')
      .addOrderBy('post.createdAt', 'DESC');

    if (groupId) {
      query.where('post.groupId = :groupId', { groupId });
    }

    return query.getMany();
  }

  async getPostById(id: string): Promise<CommunityPost> {
    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['author', 'comments', 'comments.author'],
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  async deletePost(id: string, userId: string): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new Error('Not authorized to delete this post');
    }
    await this.postRepository.remove(post);
  }

  // Comments
  async createComment(userId: string, postId: string, dto: CreateCommentDto): Promise<CommunityComment> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = this.commentRepository.create({
      postId,
      authorId: userId,
      ...dto,
    });
    const savedComment = await this.commentRepository.save(comment);

    // Notify post author if commenter is different
    if (post.authorId !== userId) {
      await this.createNotification({
        userId: post.authorId,
        fromUserId: userId,
        type: NotificationType.COMMENT,
        postId,
        postTitle: post.title,
        message: dto.content.slice(0, 100),
      });
    }

    // Return comment with author relation loaded
    return this.commentRepository.findOne({
      where: { id: savedComment.id },
      relations: ['author'],
    });
  }

  async markCommentHelpful(commentId: string, userId: string): Promise<CommunityComment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
      relations: ['post'],
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    // Only post author can mark as helpful
    if (comment.post.authorId !== userId) {
      throw new Error('Only post author can mark comments as helpful');
    }
    comment.isHelpful = true;
    return this.commentRepository.save(comment);
  }

  // Notifications
  async createNotification(data: {
    userId: string;
    fromUserId: string;
    type: NotificationType;
    postId?: string;
    postTitle?: string;
    courseName?: string;
    sessionId?: string;
    message?: string;
  }): Promise<Notification> {
    const notification = this.notificationRepository.create(data);
    return this.notificationRepository.save(notification);
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: { userId },
      relations: ['fromUser'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markNotificationRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  // Course access requests
  async requestCourseAccess(
    requesterId: string,
    dto: RequestCourseAccessDto,
  ): Promise<Notification> {
    const post = await this.postRepository.findOne({ where: { id: dto.postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Create notification for course owner
    return this.createNotification({
      userId: post.authorId,
      fromUserId: requesterId,
      type: NotificationType.COURSE_REQUEST,
      postId: dto.postId,
      courseName: post.linkedCourse?.skillName,
      sessionId: post.linkedCourse?.sessionId,
      message: dto.message,
    });
  }

  async grantCourseAccess(notificationId: string, userId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, type: NotificationType.COURSE_REQUEST },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Mark as actioned
    notification.isActioned = true;
    notification.isRead = true;
    await this.notificationRepository.save(notification);

    // Notify the requester that access was granted
    const post = await this.postRepository.findOne({ where: { id: notification.postId } });
    await this.createNotification({
      userId: notification.fromUserId,
      fromUserId: userId,
      type: NotificationType.COURSE_GRANTED,
      postId: notification.postId,
      courseName: post?.linkedCourse?.skillName,
      sessionId: post?.linkedCourse?.sessionId,
    });

    // TODO: Actually grant access (store in a separate table or user preferences)
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }
}
