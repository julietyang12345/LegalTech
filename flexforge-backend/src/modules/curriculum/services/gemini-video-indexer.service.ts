import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import youtubeSearch from 'youtube-search-api';
import axios from 'axios';

interface VideoPlaceholder {
  searchQuery: string;
  preferredChannels: string[];
  topicFocus: string;
  idealDuration: string;
}

interface VideoSegmentResult {
  success: boolean;
  url?: string;
  startTime?: string;
  endTime?: string;
  startSeconds?: number;
  endSeconds?: number;
  watchInstructions?: string;
  keyTopics?: string[];
  verified?: boolean;
  verificationMethod?: string;
  manualReviewNeeded?: boolean;
  error?: string;
}

@Injectable()
export class GeminiVideoIndexerService {
  private readonly logger = new Logger(GeminiVideoIndexerService.name);
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('ai.gemini.apiKey');
    
    if (apiKey && apiKey !== '') {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log('✅ Gemini AI initialized');
    } else {
      this.logger.warn('⚠️ Gemini API key not configured - video indexing will be limited');
    }
  }

  /**
   * Find best video segment using Gemini 2.0 Flash (FREE)
   */
  async findBestVideoSegment(
    placeholder: VideoPlaceholder,
    allowPaidIndexing: boolean = true,
  ): Promise<VideoSegmentResult> {
    this.logger.log(
      `🎥 Searching for video: "${placeholder.searchQuery}" (paid: ${allowPaidIndexing})`,
    );

    try {
      // Step 1: Search YouTube for videos
      const videos = await this.searchYouTubeVideos(
        placeholder.searchQuery,
        placeholder.preferredChannels,
      );

      if (!videos || videos.length === 0) {
        return {
          success: false,
          error: 'No videos found',
          manualReviewNeeded: true,
        };
      }

      // Step 2: If paid indexing allowed, use Gemini to find timestamps
      if (allowPaidIndexing && this.genAI) {
        for (const video of videos.slice(0, 3)) {
          const result = await this.tryGeminiTranscript(
            video.videoId,
            video.url,
            video.title,
            placeholder.topicFocus,
            this.parseDuration(placeholder.idealDuration),
          );

          if (result.success) {
            this.logger.log(`✅ Found segment with Gemini: ${video.title}`);
            return {
              ...result,
              verificationMethod: 'gemini_2.0_flash',
            };
          }
        }
      }

      // Step 3: Fallback - return video without timestamps (FREE)
      this.logger.warn(
        `⚠️ Returning video without timestamps (manual review needed): ${videos[0].title}`,
      );

      return {
        success: true,
        url: videos[0].url,
        watchInstructions: `Watch this video to learn about: ${placeholder.topicFocus}`,
        keyTopics: ['Full video - find relevant section'],
        verified: false,
        manualReviewNeeded: true,
        verificationMethod: 'youtube_search_only',
      };
    } catch (error) {
      this.logger.error('Video indexing failed:', error.message);
      return {
        success: false,
        error: error.message,
        manualReviewNeeded: true,
      };
    }
  }

  /**
   * Search YouTube for videos
   */
  private async searchYouTubeVideos(
    query: string,
    preferredChannels: string[],
  ): Promise<Array<{ videoId: string; url: string; title: string }>> {
    try {
      const allResults = [];

      if (preferredChannels && preferredChannels.length > 0) {
        // Search each preferred channel
        for (const channel of preferredChannels) {
          const channelQuery = `${query} ${channel}`;
          const results = await youtubeSearch.GetListByKeyword(channelQuery, false, 5);

          if (results.items) {
            allResults.push(...results.items);
          }
        }
      } else {
        // Generic search
        const results = await youtubeSearch.GetListByKeyword(query, false, 10);
        if (results.items) {
          allResults.push(...results.items);
        }
      }

      // Remove duplicates and format
      const uniqueVideos = new Map();
      allResults.forEach((item) => {
        if (item.type === 'video' && item.id) {
          uniqueVideos.set(item.id, {
            videoId: item.id,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            title: item.title,
          });
        }
      });

      return Array.from(uniqueVideos.values());
    } catch (error) {
      this.logger.error('YouTube search failed:', error.message);
      return [];
    }
  }

  /**
   * Try to get video transcript and find segment using Gemini 2.0 Flash
   */
  private async tryGeminiTranscript(
    videoId: string,
    videoUrl: string,
    videoTitle: string,
    topicFocus: string,
    idealDurationMinutes: number,
  ): Promise<VideoSegmentResult> {
    try {
      if (!this.genAI) {
        return { success: false };
      }

      // Get YouTube transcript (captions)
      const transcript = await this.getYouTubeTranscript(videoId);

      if (!transcript || transcript.length === 0) {
        this.logger.warn(`No transcript available for video: ${videoId}`);
        return { success: false };
      }

      // Format transcript for Gemini
      const formattedTranscript = this.formatTranscript(transcript.slice(0, 500));

      // Use Gemini 2.0 Flash (FREE) to analyze
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `Analyze this YouTube video transcript to find the best segment for learning: "${topicFocus}"

VIDEO TITLE: ${videoTitle}

TRANSCRIPT:
${formattedTranscript}

REQUIREMENTS:
1. Find where the explanation STARTS (timestamp in seconds)
2. Find where it ENDS (timestamp in seconds)
3. Ideal duration: approximately ${idealDurationMinutes} minutes
4. Must be a complete, self-contained explanation
5. Should be pedagogically clear

Return ONLY valid JSON (no markdown, no explanations):
{
  "start_seconds": 180,
  "end_seconds": 480,
  "confidence": "high",
  "key_topics": ["Topic 1 (3:00-5:00)", "Topic 2 (5:00-8:00)"],
  "watch_instructions": "Watch 3:00-8:00. The instructor explains..."
}

If the transcript doesn't cover this topic well, return:
{
  "confidence": "low",
  "reason": "Topic not sufficiently covered"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Parse Gemini's response
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      const analysis = JSON.parse(cleanedText);

      if (analysis.confidence === 'low') {
        return { success: false };
      }

      // Format timestamps
      const startFormatted = this.secondsToTime(analysis.start_seconds);
      const endFormatted = this.secondsToTime(analysis.end_seconds);

      return {
        success: true,
        url: `${videoUrl}&t=${analysis.start_seconds}s`,
        startTime: startFormatted,
        endTime: endFormatted,
        startSeconds: analysis.start_seconds,
        endSeconds: analysis.end_seconds,
        watchInstructions: analysis.watch_instructions,
        keyTopics: analysis.key_topics,
        verified: true,
      };
    } catch (error) {
      this.logger.warn(`Gemini transcript analysis failed for ${videoId}:`, error.message);
      return { success: false };
    }
  }

  /**
   * Get YouTube transcript (captions)
   * Uses YouTube's auto-generated or manual captions
   */
  private async getYouTubeTranscript(
    videoId: string,
  ): Promise<Array<{ start: number; text: string }> | null> {
    try {
      // Fetch video page to extract caption data
      const response = await axios.get(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const html = response.data;

      // Look for caption tracks in the page
      const captionRegex = /"captionTracks":\s*(\[.*?\])/;
      const match = html.match(captionRegex);

      if (!match) {
        return null;
      }

      const captionTracks = JSON.parse(match[1]);

      // Find English captions
      const englishTrack = captionTracks.find(
        (track: any) => track.languageCode === 'en' || track.languageCode === 'en-US',
      );

      if (!englishTrack || !englishTrack.baseUrl) {
        return null;
      }

      // Fetch the caption XML
      const captionResponse = await axios.get(englishTrack.baseUrl);
      const captionXml = captionResponse.data;

      // Parse XML to extract timestamps and text
      const textRegex = /<text start="([\d.]+)" dur="[\d.]+".*?>(.*?)<\/text>/g;
      const transcript: Array<{ start: number; text: string }> = [];

      let xmlMatch;
      while ((xmlMatch = textRegex.exec(captionXml)) !== null) {
        const start = parseFloat(xmlMatch[1]);
        const text = xmlMatch[2]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]*>/g, ''); // Remove XML tags

        transcript.push({ start, text });
      }

      return transcript.length > 0 ? transcript : null;
    } catch (error) {
      this.logger.warn(`Failed to get transcript for ${videoId}:`, error.message);
      return null;
    }
  }

  /**
   * Format transcript for AI analysis
   */
  private formatTranscript(transcript: Array<{ start: number; text: string }>): string {
    return transcript
      .map((entry) => {
        const time = this.secondsToTime(entry.start);
        return `[${time}] ${entry.text}`;
      })
      .join('\n');
  }

  /**
   * Convert seconds to MM:SS format
   */
  private secondsToTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Parse duration string like "5-10 minutes" to number
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 5;
  }
}