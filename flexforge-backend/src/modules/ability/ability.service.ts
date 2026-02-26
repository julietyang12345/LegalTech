import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillScore } from '../../database/entities/skill-score.entity';
import { getDimensions } from './dimension-registry';
import { SkillType } from '../curriculum/services/skill-detector.service';

export interface DimensionProfile {
  dimensionId: string;
  label: string;
  average: number;
  count: number;
  trend: 'improving' | 'declining' | 'stable';
  recentScores: number[];
}

export interface SkillProfile {
  skillType: SkillType;
  dimensions: DimensionProfile[];
  totalReps: number;
}

@Injectable()
export class AbilityService {
  private readonly logger = new Logger(AbilityService.name);

  constructor(
    @InjectRepository(SkillScore)
    private skillScoreRepository: Repository<SkillScore>,
  ) {}

  /**
   * Record scores from a rep completion
   */
  async recordScores(
    userId: string,
    skillType: string,
    scores: Array<{ dimensionId: string; score: number }>,
    source: 'rep' | 'lesson',
    sourceId: string,
    skillName?: string,
    phaseId?: string,
  ): Promise<void> {
    const entities = scores.map((s) =>
      this.skillScoreRepository.create({
        userId,
        skillType,
        dimensionId: s.dimensionId,
        score: s.score,
        source,
        sourceId,
        skillName,
        phaseId,
      }),
    );

    await this.skillScoreRepository.save(entities);
    this.logger.log(
      `Recorded ${entities.length} scores for user ${userId} (${skillType})`,
    );
  }

  /**
   * Get ability profile for a user — average per dimension + trend
   */
  async getProfile(
    userId: string,
    skillType?: string,
  ): Promise<SkillProfile | null> {
    const whereClause: any = { userId };
    if (skillType) whereClause.skillType = skillType;

    const scores = await this.skillScoreRepository.find({
      where: whereClause,
      order: { createdAt: 'ASC' },
    });

    if (scores.length === 0) return null;

    // Determine the skill type from scores if not provided
    const resolvedSkillType = (skillType ||
      scores[0].skillType) as SkillType;
    const dimensionDefs = getDimensions(resolvedSkillType);

    // Group by dimensionId
    const grouped = new Map<string, SkillScore[]>();
    for (const score of scores) {
      const existing = grouped.get(score.dimensionId) || [];
      existing.push(score);
      grouped.set(score.dimensionId, existing);
    }

    const dimensions: DimensionProfile[] = dimensionDefs.map((def) => {
      const dimScores = grouped.get(def.id) || [];
      const scoreValues = dimScores.map((s) => s.score);
      const average =
        scoreValues.length > 0
          ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
          : 0;

      // Calculate trend from last 5 scores
      const recent = scoreValues.slice(-5);
      let trend: 'improving' | 'declining' | 'stable' = 'stable';
      if (recent.length >= 3) {
        const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
        const secondHalf = recent.slice(Math.floor(recent.length / 2));
        const firstAvg =
          firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg =
          secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        if (secondAvg - firstAvg > 0.3) trend = 'improving';
        else if (firstAvg - secondAvg > 0.3) trend = 'declining';
      }

      return {
        dimensionId: def.id,
        label: def.label,
        average: Math.round(average * 10) / 10,
        count: scoreValues.length,
        trend,
        recentScores: recent,
      };
    });

    // Count unique sourceIds for total reps
    const uniqueSources = new Set(
      scores.filter((s) => s.source === 'rep').map((s) => s.sourceId),
    );

    return {
      skillType: resolvedSkillType,
      dimensions,
      totalReps: uniqueSources.size,
    };
  }

  /**
   * Get score timeline for one dimension (for charts)
   */
  async getTimeline(
    userId: string,
    dimensionId: string,
    limit = 20,
  ): Promise<Array<{ score: number; createdAt: Date; sourceId: string }>> {
    const scores = await this.skillScoreRepository.find({
      where: { userId, dimensionId },
      order: { createdAt: 'DESC' },
      take: limit,
      select: ['score', 'createdAt', 'sourceId'],
    });

    return scores.reverse();
  }

  /**
   * Get weakest dimensions for a user (for scenario adaptation)
   */
  async getWeakDimensions(
    userId: string,
    skillType: string,
    count = 2,
  ): Promise<Array<{ dimensionId: string; average: number }>> {
    const profile = await this.getProfile(userId, skillType);
    if (!profile) return [];

    return profile.dimensions
      .filter((d) => d.count > 0)
      .sort((a, b) => a.average - b.average)
      .slice(0, count)
      .map((d) => ({ dimensionId: d.dimensionId, average: d.average }));
  }

  /**
   * Get a summary string for prompt injection (scores + weak areas)
   */
  async getProfileSummary(
    userId: string,
    skillType: string,
  ): Promise<string | null> {
    const profile = await this.getProfile(userId, skillType);
    if (!profile || profile.totalReps === 0) return null;

    const lines = profile.dimensions
      .filter((d) => d.count > 0)
      .map((d) => {
        const strength =
          d.average >= 4
            ? 'strong'
            : d.average >= 3
              ? 'developing'
              : 'weak';
        return `- ${d.dimensionId}: avg ${d.average} (${strength})`;
      });

    return lines.join('\n');
  }
}
