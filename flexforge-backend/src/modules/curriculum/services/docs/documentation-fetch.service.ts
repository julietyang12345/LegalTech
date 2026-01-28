/**
 * Documentation Fetch Service
 * Fetches and extracts content from official documentation sites
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  DocSource,
  getDocSourceForSkill,
  buildDocSearchQuery,
} from './doc-sources';

// ============================================
// TYPES
// ============================================

export interface DocFetchResult {
  success: boolean;
  docs: ExtractedDoc[];
  source: string;
  searchQuery?: string;
  error?: string;
}

export interface ExtractedDoc {
  title: string;
  url: string;
  source: string;
  description?: string;
  sections: DocSection[];
}

export interface DocSection {
  heading: string;
  content: string;
  codeExamples: CodeExample[];
  apiSignatures?: string[];
}

export interface CodeExample {
  language: string;
  code: string;
  description?: string;
}

interface CachedDoc {
  result: DocFetchResult;
  cachedAt: number;
  failed?: boolean;
}

interface GoogleCSEResponse {
  items?: Array<{
    title: string;
    link: string;
    snippet: string;
  }>;
}

// ============================================
// CONSTANTS
// ============================================

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cache settings
const DOC_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const NEGATIVE_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const DOC_CACHE_MAX = 1000;
const DOC_CACHE_TARGET = 900;

// Request settings
const REQUEST_TIMEOUT = 8000; // 8 seconds
const MAX_CONTENT_LENGTH = 500000; // 500KB max per page

// ============================================
// SERVICE
// ============================================

@Injectable()
export class DocumentationFetchService {
  private readonly logger = new Logger(DocumentationFetchService.name);
  private docCache = new Map<string, CachedDoc>();
  private readonly apiKey: string;
  private readonly engineId: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_CSE_API_KEY') || '';
    this.engineId =
      this.configService.get<string>('GOOGLE_CSE_ENGINE_ID') || '';
  }

  // ============================================
  // MAIN ENTRY POINT
  // ============================================

  /**
   * Fetch documentation for a concept
   * @param concept - The topic to search for (e.g., "useState hook", "async await")
   * @param language - Optional language/framework hint (e.g., "react", "python")
   * @param limit - Max number of doc pages to fetch (default: 3)
   */
  async fetchDocumentation(
    concept: string,
    language?: string,
    limit = 3,
  ): Promise<DocFetchResult> {
    const cacheKey = this.buildCacheKey(concept, language);

    // Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.logger.debug(`📚 Cache hit for docs: "${concept}"`);
      return cached;
    }

    const docSource = getDocSourceForSkill(concept, language);
    if (!docSource) {
      return {
        success: false,
        docs: [],
        source: 'unknown',
        error: 'No documentation source found for this topic',
      };
    }

    this.logger.log(
      `📚 Fetching documentation for "${concept}" from ${docSource.name}`,
    );

    try {
      // Step 1: Search for relevant doc pages
      const searchResults = await this.searchDocs(concept, docSource, limit);

      if (searchResults.length === 0) {
        const failResult: DocFetchResult = {
          success: false,
          docs: [],
          source: docSource.name,
          error: 'No documentation pages found',
        };
        this.setCache(cacheKey, failResult, true);
        return failResult;
      }

      // Step 2: Fetch and extract content from each page (parallel)
      const extractPromises = searchResults.slice(0, limit).map((result) =>
        this.extractDocContent(result.url, result.title, docSource).catch(
          (err) => {
            this.logger.warn(`Failed to extract ${result.url}: ${err.message}`);
            return null;
          },
        ),
      );

      const extractedDocs = (await Promise.all(extractPromises)).filter(
        (doc): doc is ExtractedDoc => doc !== null,
      );

      const result: DocFetchResult = {
        success: extractedDocs.length > 0,
        docs: extractedDocs,
        source: docSource.name,
        searchQuery: `${concept} ${docSource.searchDomain}`,
      };

      this.setCache(cacheKey, result, extractedDocs.length === 0);
      return result;
    } catch (error) {
      this.logger.error(`Documentation fetch failed: ${error.message}`);
      const failResult: DocFetchResult = {
        success: false,
        docs: [],
        source: docSource.name,
        error: error.message,
      };
      this.setCache(cacheKey, failResult, true);
      return failResult;
    }
  }

  // ============================================
  // SEARCH (Google CSE)
  // ============================================

  private async searchDocs(
    concept: string,
    docSource: DocSource,
    limit: number,
  ): Promise<Array<{ title: string; url: string; snippet: string }>> {
    // If Google CSE not configured, try direct URL construction
    if (!this.apiKey || !this.engineId) {
      this.logger.warn('Google CSE not configured, using direct URL fallback');
      return this.buildDirectUrls(concept, docSource, limit);
    }

    try {
      const query = buildDocSearchQuery(concept, docSource.id);
      const response = await axios.get<GoogleCSEResponse>(
        'https://www.googleapis.com/customsearch/v1',
        {
          params: {
            key: this.apiKey,
            cx: this.engineId,
            q: query,
            num: Math.min(limit, 10),
          },
          timeout: REQUEST_TIMEOUT,
        },
      );

      const items = response.data.items || [];
      return items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      }));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        this.logger.warn(
          'Google CSE rate limit reached, using direct URL fallback',
        );
      } else {
        this.logger.warn(`Google CSE search failed: ${error.message}`);
      }
      return this.buildDirectUrls(concept, docSource, limit);
    }
  }

  /**
   * Fallback: Build direct URLs for known doc sites
   */
  private buildDirectUrls(
    concept: string,
    docSource: DocSource,
    limit: number,
  ): Array<{ title: string; url: string; snippet: string }> {
    const slug = concept
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const urls: Array<{ title: string; url: string; snippet: string }> = [];

    switch (docSource.id) {
      case 'mdn':
        urls.push({
          title: `${concept} - MDN`,
          url: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/${this.toPascalCase(concept)}`,
          snippet: '',
        });
        urls.push({
          title: `${concept} Guide - MDN`,
          url: `https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/${slug}`,
          snippet: '',
        });
        break;

      case 'react':
        urls.push({
          title: `${concept} - React`,
          url: `https://react.dev/reference/react/${slug}`,
          snippet: '',
        });
        urls.push({
          title: `${concept} Guide - React`,
          url: `https://react.dev/learn/${slug}`,
          snippet: '',
        });
        break;

      case 'python':
        urls.push({
          title: `${concept} - Python`,
          url: `https://docs.python.org/3/library/${slug}.html`,
          snippet: '',
        });
        break;

      case 'typescript':
        urls.push({
          title: `${concept} - TypeScript`,
          url: `https://www.typescriptlang.org/docs/handbook/${slug}.html`,
          snippet: '',
        });
        break;

      case 'nodejs':
        urls.push({
          title: `${concept} - Node.js`,
          url: `https://nodejs.org/docs/latest/api/${slug}.html`,
          snippet: '',
        });
        break;

      default:
        // Generic fallback
        urls.push({
          title: `${concept} - ${docSource.name}`,
          url: `https://${docSource.domain}/${slug}`,
          snippet: '',
        });
    }

    return urls.slice(0, limit);
  }

  // ============================================
  // CONTENT EXTRACTION
  // ============================================

  private async extractDocContent(
    url: string,
    title: string,
    docSource: DocSource,
  ): Promise<ExtractedDoc | null> {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: REQUEST_TIMEOUT,
        maxContentLength: MAX_CONTENT_LENGTH,
      });

      const html = response.data;

      // Route to specific extractor based on doc source
      let sections: DocSection[];
      switch (docSource.id) {
        case 'mdn':
        case 'mdn-css':
        case 'mdn-html':
          sections = this.extractMDNContent(html);
          break;
        case 'react':
          sections = this.extractReactContent(html);
          break;
        case 'python':
          sections = this.extractPythonContent(html);
          break;
        default:
          sections = this.extractGenericContent(html);
      }

      // Extract page title from HTML if not provided
      const extractedTitle = this.extractTitle(html) || title;

      return {
        title: extractedTitle,
        url,
        source: docSource.name,
        sections,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch ${url}: ${error.message}`);
      return null;
    }
  }

  // ============================================
  // SITE-SPECIFIC EXTRACTORS
  // ============================================

  /**
   * Extract content from MDN Web Docs
   */
  private extractMDNContent(html: string): DocSection[] {
    const sections: DocSection[] = [];

    // Extract main article content
    const articleMatch = html.match(
      /<article[^>]*class="[^"]*main-page-content[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
    );
    const content = articleMatch ? articleMatch[1] : html;

    // Extract sections by h2/h3 headings
    const sectionMatches = content.matchAll(
      /<h([23])[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[23]|$)/gi,
    );

    for (const match of sectionMatches) {
      const heading = this.stripHtml(match[3]);
      const sectionContent = match[4];

      // Extract code blocks
      const codeExamples = this.extractCodeBlocks(sectionContent, 'js');

      // Extract text content
      const textContent = this.extractTextContent(sectionContent);

      if (heading && (textContent || codeExamples.length > 0)) {
        sections.push({
          heading,
          content: textContent.slice(0, 2000), // Cap content length
          codeExamples: codeExamples.slice(0, 5), // Max 5 examples per section
        });
      }
    }

    // If no sections found, extract as single section
    if (sections.length === 0) {
      const codeExamples = this.extractCodeBlocks(content, 'js');
      const textContent = this.extractTextContent(content);

      if (textContent || codeExamples.length > 0) {
        sections.push({
          heading: 'Overview',
          content: textContent.slice(0, 3000),
          codeExamples: codeExamples.slice(0, 10),
        });
      }
    }

    return sections;
  }

  /**
   * Extract content from React.dev
   */
  private extractReactContent(html: string): DocSection[] {
    const sections: DocSection[] = [];

    // React.dev uses <article> with MDX content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const content = articleMatch ? articleMatch[1] : html;

    // Extract sections by headings
    const sectionMatches = content.matchAll(
      /<h([23])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[23]|$)/gi,
    );

    for (const match of sectionMatches) {
      const heading = this.stripHtml(match[2]);
      const sectionContent = match[3];

      const codeExamples = this.extractCodeBlocks(sectionContent, 'jsx');
      const textContent = this.extractTextContent(sectionContent);

      if (heading && (textContent || codeExamples.length > 0)) {
        sections.push({
          heading,
          content: textContent.slice(0, 2000),
          codeExamples: codeExamples.slice(0, 5),
        });
      }
    }

    // Fallback to generic extraction
    if (sections.length === 0) {
      return this.extractGenericContent(html);
    }

    return sections;
  }

  /**
   * Extract content from Python docs
   */
  private extractPythonContent(html: string): DocSection[] {
    const sections: DocSection[] = [];

    // Python docs use <div class="body">
    const bodyMatch = html.match(
      /<div[^>]*class="[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    const content = bodyMatch ? bodyMatch[1] : html;

    // Extract sections
    const sectionMatches = content.matchAll(
      /<h([123])[^>]*>([\s\S]*?)<\/h\1>([\s\S]*?)(?=<h[123]|$)/gi,
    );

    for (const match of sectionMatches) {
      const heading = this.stripHtml(match[2]);
      const sectionContent = match[3];

      const codeExamples = this.extractCodeBlocks(sectionContent, 'python');
      const textContent = this.extractTextContent(sectionContent);

      // Extract function signatures
      const signatures = this.extractPythonSignatures(sectionContent);

      if (heading && (textContent || codeExamples.length > 0)) {
        sections.push({
          heading,
          content: textContent.slice(0, 2000),
          codeExamples: codeExamples.slice(0, 5),
          apiSignatures: signatures,
        });
      }
    }

    if (sections.length === 0) {
      return this.extractGenericContent(html);
    }

    return sections;
  }

  /**
   * Generic content extraction fallback
   */
  private extractGenericContent(html: string): DocSection[] {
    // Try to find main content area
    const mainMatch =
      html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const content = mainMatch ? mainMatch[1] : html;

    const codeExamples = this.extractCodeBlocks(content, 'javascript');
    const textContent = this.extractTextContent(content);

    if (!textContent && codeExamples.length === 0) {
      return [];
    }

    return [
      {
        heading: 'Documentation',
        content: textContent.slice(0, 4000),
        codeExamples: codeExamples.slice(0, 10),
      },
    ];
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private extractCodeBlocks(html: string, defaultLang: string): CodeExample[] {
    const examples: CodeExample[] = [];

    // Pattern 1: <pre><code class="language-xxx">
    const preCodeMatches = html.matchAll(
      /<pre[^>]*>[\s\S]*?<code[^>]*(?:class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/gi,
    );
    for (const match of preCodeMatches) {
      const lang = match[1] || defaultLang;
      const code = this.decodeHtmlEntities(match[2]).trim();
      if (code.length > 10 && code.length < 5000) {
        examples.push({ language: lang, code });
      }
    }

    // Pattern 2: <pre class="brush: xxx">
    const brushMatches = html.matchAll(
      /<pre[^>]*class="[^"]*brush:\s*(\w+)[^"]*"[^>]*>([\s\S]*?)<\/pre>/gi,
    );
    for (const match of brushMatches) {
      const code = this.decodeHtmlEntities(match[2]).trim();
      if (code.length > 10 && code.length < 5000) {
        examples.push({ language: match[1], code });
      }
    }

    // Pattern 3: Simple <pre> blocks
    if (examples.length === 0) {
      const simplePreMatches = html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
      for (const match of simplePreMatches) {
        const code = this.stripHtml(match[1]).trim();
        if (code.length > 20 && code.length < 5000) {
          examples.push({ language: defaultLang, code });
        }
      }
    }

    return examples;
  }

  private extractTextContent(html: string): string {
    // Remove code blocks first
    let text = html.replace(/<pre[\s\S]*?<\/pre>/gi, '');
    text = text.replace(/<code[\s\S]*?<\/code>/gi, '');

    // Extract paragraphs
    const paragraphs: string[] = [];
    const pMatches = text.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const match of pMatches) {
      const p = this.stripHtml(match[1]).trim();
      if (p.length > 20) {
        paragraphs.push(p);
      }
    }

    // Also extract list items
    const liMatches = text.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    for (const match of liMatches) {
      const li = this.stripHtml(match[1]).trim();
      if (li.length > 10) {
        paragraphs.push('• ' + li);
      }
    }

    return paragraphs.join('\n\n');
  }

  private extractPythonSignatures(html: string): string[] {
    const signatures: string[] = [];

    // Look for dl.py.function or similar
    const sigMatches = html.matchAll(
      /<dt[^>]*class="[^"]*sig[^"]*"[^>]*>([\s\S]*?)<\/dt>/gi,
    );
    for (const match of sigMatches) {
      const sig = this.stripHtml(match[1]).trim();
      if (sig.length > 5 && sig.length < 200) {
        signatures.push(sig);
      }
    }

    return signatures;
  }

  private extractTitle(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      return this.stripHtml(titleMatch[1]).split('|')[0].split('-')[0].trim();
    }
    return null;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
      .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[\s\-_]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  // ============================================
  // CACHING
  // ============================================

  private buildCacheKey(concept: string, language?: string): string {
    const normalized = concept.toLowerCase().trim();
    const lang = language?.toLowerCase().trim() || '';
    return `${normalized}:${lang}`;
  }

  private getFromCache(key: string): DocFetchResult | null {
    const cached = this.docCache.get(key);
    if (!cached) return null;

    const ttl = cached.failed ? NEGATIVE_CACHE_TTL : DOC_CACHE_TTL;
    if (Date.now() - cached.cachedAt > ttl) {
      this.docCache.delete(key);
      return null;
    }

    return cached.result;
  }

  private setCache(key: string, result: DocFetchResult, failed = false): void {
    // LRU eviction
    if (this.docCache.has(key)) {
      this.docCache.delete(key);
    }

    this.docCache.set(key, {
      result,
      cachedAt: Date.now(),
      failed,
    });

    // Evict old entries if over limit
    if (this.docCache.size > DOC_CACHE_MAX) {
      const keysToDelete: string[] = [];
      let count = 0;
      for (const k of this.docCache.keys()) {
        if (count++ < this.docCache.size - DOC_CACHE_TARGET) {
          keysToDelete.push(k);
        } else {
          break;
        }
      }
      for (const k of keysToDelete) {
        this.docCache.delete(k);
      }
    }
  }
}
