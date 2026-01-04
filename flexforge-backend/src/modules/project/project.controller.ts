import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectController {
  constructor(private projectService: ProjectService) {}

  @Post()
  async create(@Request() req, @Body() projectData: any) {
    const project = await this.projectService.create(req.user.id, projectData);
    return { message: 'Project created successfully', project };
  }

  @Get()
  async findAll(@Request() req) {
    const projects = await this.projectService.findAll(req.user.id);
    return { projects, count: projects.length };
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const project = await this.projectService.findOne(id, req.user.id);
    return { project };
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() updates: any) {
    const project = await this.projectService.update(id, req.user.id, updates);
    return { message: 'Project updated successfully', project };
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    await this.projectService.delete(id, req.user.id);
    return { message: 'Project deleted successfully' };
  }
}
