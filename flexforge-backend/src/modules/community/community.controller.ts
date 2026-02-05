import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityService } from './community.service';
import {
  CreatePostDto,
  CreateCommentDto,
  RequestCourseAccessDto,
} from './dto/community.dto';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // Posts
  @Post('posts')
  async createPost(@Request() req, @Body() dto: CreatePostDto) {
    const post = await this.communityService.createPost(req.user.id, dto);
    return { post };
  }

  @Get('posts')
  async getPosts(@Query('groupId') groupId?: string) {
    const posts = await this.communityService.getPosts(groupId);
    return { posts };
  }

  @Get('posts/mine')
  async getMyPosts(@Request() req) {
    const posts = await this.communityService.getMyPosts(req.user.id);
    return { posts };
  }

  @Get('posts/commented')
  async getPostsICommented(@Request() req) {
    const posts = await this.communityService.getPostsICommented(req.user.id);
    return { posts };
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string) {
    const post = await this.communityService.getPostById(id);
    return { post };
  }

  @Delete('posts/:id')
  async deletePost(@Request() req, @Param('id') id: string) {
    await this.communityService.deletePost(id, req.user.id);
    return { success: true };
  }

  // Comments
  @Post('posts/:postId/comments')
  async createComment(
    @Request() req,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const comment = await this.communityService.createComment(
      req.user.id,
      postId,
      dto,
    );
    return { comment };
  }

  @Post('comments/:id/helpful')
  async markCommentHelpful(@Request() req, @Param('id') id: string) {
    const comment = await this.communityService.markCommentHelpful(id, req.user.id);
    return { comment };
  }

  // Notifications
  @Get('notifications')
  async getNotifications(@Request() req) {
    const notifications = await this.communityService.getNotifications(req.user.id);
    const unreadCount = await this.communityService.getUnreadCount(req.user.id);
    return { notifications, unreadCount };
  }

  @Post('notifications/:id/read')
  async markNotificationRead(@Request() req, @Param('id') id: string) {
    const notification = await this.communityService.markNotificationRead(
      id,
      req.user.id,
    );
    return { notification };
  }

  @Post('notifications/read-all')
  async markAllNotificationsRead(@Request() req) {
    await this.communityService.markAllNotificationsRead(req.user.id);
    return { success: true };
  }

  // Course access
  @Post('request-access')
  async requestCourseAccess(@Request() req, @Body() dto: RequestCourseAccessDto) {
    const notification = await this.communityService.requestCourseAccess(
      req.user.id,
      dto,
    );
    return { notification, success: true };
  }

  @Post('notifications/:id/grant-access')
  async grantCourseAccess(@Request() req, @Param('id') id: string) {
    await this.communityService.grantCourseAccess(id, req.user.id);
    return { success: true };
  }
}
