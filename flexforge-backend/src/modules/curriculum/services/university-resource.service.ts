import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import {
  UNIVERSITY_SOURCES,
  UniversityResource,
  UniversityResourceType,
  isUniversityUrl,
} from './university-sources';

// ============================================
// UNIVERSITY RESOURCE SERVICE
// ============================================
// Searches for educational resources from universities:
// - MIT OCW, Stanford, Berkeley, CMU, Harvard
// - Lecture videos, notes, problem sets
// - Zero marketing, high rigor
// ============================================

export interface UniversitySearchResult {
  success: boolean;
  resources: UniversityResource[];
  error?: string;
}

@Injectable()
export class UniversityResourceService {
  private readonly logger = new Logger(UniversityResourceService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.gemini.apiKey');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Search for university resources on a topic
   * Uses domain-filtered web search
   */
  async searchResources(
    concept: string,
    resourceType: UniversityResourceType = 'lecture_video',
    limit: number = 5,
  ): Promise<UniversitySearchResult> {
    this.logger.log(`🎓 Searching university resources for: "${concept}" (${resourceType})`);

    try {
      // Build domain filter for search
      const domains = UNIVERSITY_SOURCES
        .filter(u => u.resourceTypes.includes(resourceType))
        .map(u => `site:${u.domain}`)
        .join(' OR ');

      // Build search query based on resource type
      const typeKeyword = resourceType === 'lecture_video' ? 'lecture video'
        : resourceType === 'problem_set' ? 'problem set homework solutions'
        : resourceType === 'slides' ? 'slides pdf'
        : 'lecture notes';

      const searchQuery = `${concept} ${typeKeyword} (${domains})`;

      // Use DuckDuckGo HTML search (no API key needed)
      const resources = await this.searchDuckDuckGo(searchQuery, concept, resourceType, limit);

      if (resources.length === 0) {
        // Fallback: try with just .edu domain
        const fallbackQuery = `${concept} ${typeKeyword} site:edu`;
        const fallbackResources = await this.searchDuckDuckGo(fallbackQuery, concept, resourceType, limit);

        if (fallbackResources.length > 0) {
          return { success: true, resources: fallbackResources };
        }

        return {
          success: false,
          resources: [],
          error: 'No university resources found for this topic',
        };
      }

      this.logger.log(`✅ Found ${resources.length} university resources`);
      return { success: true, resources };

    } catch (error) {
      this.logger.error(`❌ University search failed: ${error.message}`);
      return {
        success: false,
        resources: [],
        error: error.message,
      };
    }
  }

  /**
   * Search DuckDuckGo and parse results
   * No API key needed
   */
  private async searchDuckDuckGo(
    query: string,
    concept: string,
    resourceType: UniversityResourceType,
    limit: number,
  ): Promise<UniversityResource[]> {
    try {
      // Use DuckDuckGo HTML endpoint
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FlexForge/1.0)',
        },
        timeout: 10000,
      });

      const html = response.data;
      const resources: UniversityResource[] = [];

      // Parse results using regex (simple but effective)
      const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;

      let match;
      const urls: string[] = [];
      const titles: string[] = [];
      const snippets: string[] = [];

      while ((match = resultRegex.exec(html)) !== null) {
        urls.push(match[1]);
        titles.push(match[2]);
      }

      while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1]);
      }

      // Process results
      for (let i = 0; i < Math.min(urls.length, limit); i++) {
        const url = urls[i];
        const title = titles[i] || '';
        const description = snippets[i] || '';

        // Check if from trusted university
        const { trusted, source } = isUniversityUrl(url);
        if (!trusted) continue;

        resources.push({
          type: resourceType,
          source: source?.shortName || 'University',
          title: this.cleanHtmlEntities(title),
          url,
          description: this.cleanHtmlEntities(description),
        });
      }

      return resources;

    } catch (error) {
      this.logger.warn(`DuckDuckGo search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Use Gemini to find and summarize university resources
   * More intelligent but costs tokens
   */
  async searchWithAI(
    concept: string,
    resourceType: UniversityResourceType = 'lecture_video',
  ): Promise<UniversitySearchResult> {
    if (!this.genAI) {
      return this.searchResources(concept, resourceType);
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `Find the best university educational resources for learning "${concept}".

Focus on:
- MIT OpenCourseWare (ocw.mit.edu)
- Stanford Online (online.stanford.edu, cs.stanford.edu)
- UC Berkeley (cs.berkeley.edu)
- Harvard (pll.harvard.edu, cs.harvard.edu)
- CMU (cs.cmu.edu)

Resource type: ${resourceType}

Return JSON array with up to 3 resources:
[
  {
    "title": "Resource title",
    "url": "Full URL",
    "source": "MIT" | "Stanford" | "Berkeley" | "Harvard" | "CMU",
    "description": "Brief description",
    "courseName": "Course name if applicable"
  }
]

Only include REAL resources that exist. If you're not sure, return empty array [].
Return ONLY the JSON array, no other text.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Parse JSON response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return { success: false, resources: [], error: 'No resources found' };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const resources: UniversityResource[] = parsed.map((r: any) => ({
        type: resourceType,
        source: r.source,
        title: r.title,
        url: r.url,
        description: r.description,
        courseName: r.courseName,
      }));

      return { success: true, resources };

    } catch (error) {
      this.logger.warn(`AI search failed, falling back to web search: ${error.message}`);
      return this.searchResources(concept, resourceType);
    }
  }

  /**
   * Clean HTML entities from text
   */
  private cleanHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '');
  }
}
