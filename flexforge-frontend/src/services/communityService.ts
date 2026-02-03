import api from './api';

export interface CommunityPost {
  id: string;
  authorId: string;
  author?: {
    id: string;
    name: string;
  };
  type: 'project' | 'question' | 'progress';
  title?: string;
  currentState?: 'started' | 'in-progress' | 'paused' | 'completed';
  whatDone?: string;
  feedbackWanted?: string;
  codeSnippet?: string;
  linkedCourse?: {
    sessionId: string;
    skillName: string;
    skillLevel: string;
    durationDays: number;
    currentDay: number;
    progress: number;
  };
  dayNumber?: number;
  stepType?: string;
  sharedContent?: {
    question?: string;
    options?: string[];
    correctAnswer?: string;
  };
  question?: string;
  whatTrying?: string;
  whatTried?: string;
  whereStuck?: string;
  progressNote?: string;
  isPinned?: boolean;
  groupId?: string;
  comments: CommunityComment[];
  createdAt: string;
  updatedAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  author?: {
    id: string;
    name: string;
  };
  content: string;
  commentType: 'worked-for-me' | 'clarification' | 'watch-out' | 'general';
  isHelpful: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  fromUserId: string;
  fromUser?: {
    id: string;
    name: string;
  };
  type: 'comment' | 'course_request' | 'course_granted' | 'mention';
  postId?: string;
  postTitle?: string;
  courseName?: string;
  sessionId?: string;
  message?: string;
  isRead: boolean;
  isActioned: boolean;
  createdAt: string;
}

export interface CreatePostDto {
  type: 'project' | 'question' | 'progress';
  title?: string;
  currentState?: 'started' | 'in-progress' | 'paused' | 'completed';
  whatDone?: string;
  feedbackWanted?: string;
  codeSnippet?: string;
  linkedCourse?: {
    sessionId: string;
    skillName: string;
    skillLevel: string;
    durationDays: number;
    currentDay: number;
    progress: number;
  };
  dayNumber?: number;
  stepType?: string;
  sharedContent?: {
    question?: string;
    options?: string[];
    correctAnswer?: string;
  };
  question?: string;
  whatTrying?: string;
  whatTried?: string;
  whereStuck?: string;
  progressNote?: string;
  groupId?: string;
}

export const communityService = {
  // Posts
  async createPost(dto: CreatePostDto): Promise<{ post: CommunityPost }> {
    const { data } = await api.post<{ post: CommunityPost }>('/community/posts', dto);
    return data;
  },

  async getPosts(groupId?: string): Promise<{ posts: CommunityPost[] }> {
    const { data } = await api.get<{ posts: CommunityPost[] }>('/community/posts', {
      params: groupId ? { groupId } : undefined,
    });
    return data;
  },

  async getPost(id: string): Promise<{ post: CommunityPost }> {
    const { data } = await api.get<{ post: CommunityPost }>(`/community/posts/${id}`);
    return data;
  },

  async deletePost(id: string): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(`/community/posts/${id}`);
    return data;
  },

  // Comments
  async createComment(
    postId: string,
    content: string,
    commentType?: 'worked-for-me' | 'clarification' | 'watch-out' | 'general',
  ): Promise<{ comment: CommunityComment }> {
    const { data } = await api.post<{ comment: CommunityComment }>(
      `/community/posts/${postId}/comments`,
      { content, commentType },
    );
    return data;
  },

  async markCommentHelpful(commentId: string): Promise<{ comment: CommunityComment }> {
    const { data } = await api.post<{ comment: CommunityComment }>(
      `/community/comments/${commentId}/helpful`,
    );
    return data;
  },

  // Notifications
  async getNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
    const { data } = await api.get<{ notifications: Notification[]; unreadCount: number }>(
      '/community/notifications',
    );
    return data;
  },

  async markNotificationRead(id: string): Promise<{ notification: Notification }> {
    const { data } = await api.post<{ notification: Notification }>(
      `/community/notifications/${id}/read`,
    );
    return data;
  },

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    const { data } = await api.post<{ success: boolean }>('/community/notifications/read-all');
    return data;
  },

  // Course access
  async requestCourseAccess(
    postId: string,
    message?: string,
  ): Promise<{ notification: Notification; success: boolean }> {
    const { data } = await api.post<{ notification: Notification; success: boolean }>(
      '/community/request-access',
      { postId, message },
    );
    return data;
  },

  async grantCourseAccess(notificationId: string): Promise<{ success: boolean }> {
    const { data } = await api.post<{ success: boolean }>(
      `/community/notifications/${notificationId}/grant-access`,
    );
    return data;
  },
};
