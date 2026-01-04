import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../database/entities/project.entity';

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async create(userId: string, projectData: Partial<Project>): Promise<Project> {
    const project = this.projectRepository.create({
      ...projectData,
      userId,
    });

    return this.projectRepository.save(project);
  }

  async findAll(userId: string): Promise<Project[]> {
    return this.projectRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id, userId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<Project>,
  ): Promise<Project> {
    const project = await this.findOne(id, userId);
    Object.assign(project, updates);
    return this.projectRepository.save(project);
  }

  async delete(id: string, userId: string): Promise<void> {
    const project = await this.findOne(id, userId);
    await this.projectRepository.remove(project);
  }
}
