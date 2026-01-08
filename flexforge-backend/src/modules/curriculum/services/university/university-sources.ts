// ============================================
// UNIVERSITY SOURCES REGISTRY
// ============================================
//
// Non-YouTube educational resources from universities:
// - Lecture videos (hosted on university sites)
// - Lecture notes / slides (PDF, HTML)
// - Problem sets / assignments
// - Course syllabi
//
// Zero marketing, high rigor, structured curriculum
// ============================================

export type UniversityResourceType =
  | 'lecture_video'    // Full lecture recording
  | 'lecture_notes'    // PDF/HTML notes
  | 'slides'           // Presentation slides
  | 'problem_set'      // Exercises with solutions
  | 'assignment'       // Homework/project specs
  | 'syllabus'         // Course overview
  | 'reading';         // Textbook chapters, papers

export type UniversityTrust = 95 | 90 | 85;  // All high trust

export interface UniversitySource {
  name: string;
  shortName: string;                    // e.g., 'MIT', 'Stanford'
  domain: string;                       // Primary domain
  alternateDomains?: string[];          // Other valid domains
  trust: UniversityTrust;
  strengths: string[];                  // Topics this university excels at
  resourceTypes: UniversityResourceType[];
  searchPatterns: {
    lectureNotes?: string;              // e.g., "{concept} lecture notes site:ocw.mit.edu"
    problemSets?: string;
    videos?: string;
  };
  license: 'cc-by' | 'cc-by-nc-sa' | 'educational-use' | 'restricted' | 'varies';
  notes?: string;
}

// ============================================
// UNIVERSITY SOURCE DATABASE
// ============================================

export const UNIVERSITY_SOURCES: UniversitySource[] = [
  // ═══════════════════════════════════════════
  // TIER 1: Open CourseWare (Most Permissive)
  // ═══════════════════════════════════════════
  {
    name: 'MIT OpenCourseWare',
    shortName: 'MIT',
    domain: 'ocw.mit.edu',
    trust: 95,
    strengths: ['CS', 'AI', 'ML', 'algorithms', 'systems', 'math', 'physics', 'engineering'],
    resourceTypes: ['lecture_video', 'lecture_notes', 'slides', 'problem_set', 'assignment', 'syllabus'],
    searchPatterns: {
      lectureNotes: '{concept} lecture notes site:ocw.mit.edu',
      problemSets: '{concept} problem set site:ocw.mit.edu',
      videos: '{concept} video lecture site:ocw.mit.edu',
    },
    license: 'cc-by-nc-sa',
    notes: 'Gold standard. Full courses with all materials. Explicitly designed for reuse.',
  },
  {
    name: 'Stanford Online',
    shortName: 'Stanford',
    domain: 'online.stanford.edu',
    alternateDomains: ['cs.stanford.edu', 'web.stanford.edu'],
    trust: 95,
    strengths: ['AI', 'ML', 'NLP', 'computer vision', 'robotics', 'databases'],
    resourceTypes: ['lecture_video', 'slides', 'assignment'],
    searchPatterns: {
      lectureNotes: '{concept} lecture site:cs.stanford.edu',
      videos: '{concept} course site:online.stanford.edu',
    },
    license: 'educational-use',
    notes: 'CS231n, CS224n, CS229 are legendary. Often has Coursera mirrors.',
  },
  {
    name: 'UC Berkeley',
    shortName: 'Berkeley',
    domain: 'cs.berkeley.edu',
    alternateDomains: ['eecs.berkeley.edu', 'inst.eecs.berkeley.edu'],
    trust: 95,
    strengths: ['AI', 'RL', 'systems', 'databases', 'security', 'OS'],
    resourceTypes: ['lecture_video', 'lecture_notes', 'slides', 'problem_set'],
    searchPatterns: {
      lectureNotes: '{concept} lecture site:cs.berkeley.edu',
      problemSets: '{concept} homework site:inst.eecs.berkeley.edu',
    },
    license: 'educational-use',
    notes: 'CS188 (AI), CS285 (RL), CS161 (Security) are excellent.',
  },
  {
    name: 'Carnegie Mellon University',
    shortName: 'CMU',
    domain: 'cs.cmu.edu',
    alternateDomains: ['cmu.edu'],
    trust: 95,
    strengths: ['AI', 'ML', 'robotics', 'systems', 'PL', 'graphics'],
    resourceTypes: ['lecture_notes', 'slides', 'assignment'],
    searchPatterns: {
      lectureNotes: '{concept} course site:cs.cmu.edu',
    },
    license: 'educational-use',
    notes: 'Strong ML courses. Often publishes full course materials on professor sites.',
  },

  // ═══════════════════════════════════════════
  // TIER 2: University Course Pages
  // ═══════════════════════════════════════════
  {
    name: 'Harvard Open Learning',
    shortName: 'Harvard',
    domain: 'pll.harvard.edu',
    alternateDomains: ['cs.harvard.edu'],
    trust: 90,
    strengths: ['CS fundamentals', 'web', 'data science', 'statistics'],
    resourceTypes: ['lecture_video', 'slides', 'problem_set'],
    searchPatterns: {
      lectureNotes: '{concept} course site:harvard.edu',
    },
    license: 'educational-use',
    notes: 'CS50 is the gold standard intro course.',
  },
  {
    name: 'Princeton',
    shortName: 'Princeton',
    domain: 'cs.princeton.edu',
    trust: 90,
    strengths: ['algorithms', 'theory', 'systems'],
    resourceTypes: ['lecture_notes', 'slides', 'assignment'],
    searchPatterns: {
      lectureNotes: '{concept} site:cs.princeton.edu',
    },
    license: 'educational-use',
    notes: 'Sedgewick algorithms course materials.',
  },

  // ═══════════════════════════════════════════
  // TIER 3: GitHub Course Repos (Professor-Published)
  // ═══════════════════════════════════════════
  {
    name: 'University GitHub Courses',
    shortName: 'GitHub-Uni',
    domain: 'github.com',
    trust: 85,
    strengths: ['all CS topics', 'practical', 'code-heavy'],
    resourceTypes: ['lecture_notes', 'slides', 'problem_set', 'assignment'],
    searchPatterns: {
      lectureNotes: '{concept} course materials site:github.com university',
      problemSets: '{concept} assignments site:github.com CS',
    },
    license: 'varies',
    notes: 'Search for professor-published repos. Verify edu affiliation.',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get university sources strong in a given topic
 */
export function getUniversitySourcesForTopic(topic: string): UniversitySource[] {
  const topicLower = topic.toLowerCase();
  return UNIVERSITY_SOURCES.filter(u =>
    u.strengths.some(s => topicLower.includes(s.toLowerCase()) || s.toLowerCase().includes(topicLower))
  );
}

/**
 * Build search query for university resources
 */
export function buildUniversitySearchQuery(
  concept: string,
  resourceType: UniversityResourceType,
  source?: UniversitySource,
): string {
  if (source) {
    const patterns = source.searchPatterns;
    const pattern = resourceType === 'lecture_video' ? patterns.videos
      : resourceType === 'problem_set' ? patterns.problemSets
      : patterns.lectureNotes;

    if (pattern) {
      return pattern.replace('{concept}', concept);
    }
  }

  // Generic search across all edu domains
  const typeKeyword = resourceType === 'lecture_video' ? 'video lecture'
    : resourceType === 'problem_set' ? 'problem set homework'
    : resourceType === 'slides' ? 'slides pdf'
    : 'lecture notes';

  return `${concept} ${typeKeyword} site:edu OR site:ocw.mit.edu OR site:cs.stanford.edu`;
}

/**
 * Check if a URL is from a trusted university source
 */
export function isUniversityUrl(url: string): { trusted: boolean; source?: UniversitySource } {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    for (const source of UNIVERSITY_SOURCES) {
      if (hostname.includes(source.domain) ||
          source.alternateDomains?.some(d => hostname.includes(d))) {
        return { trusted: true, source };
      }
    }

    // Generic .edu domain
    if (hostname.endsWith('.edu')) {
      return { trusted: true };
    }

    return { trusted: false };
  } catch {
    return { trusted: false };
  }
}

// ============================================
// UNIVERSITY RESOURCE INTERFACE
// ============================================

export interface UniversityResource {
  type: UniversityResourceType;
  source: string;                       // e.g., 'MIT', 'Stanford'
  title: string;
  url: string;
  courseName?: string;                  // e.g., 'CS229: Machine Learning'
  instructor?: string;
  duration?: number;                    // For videos, in seconds
  description?: string;

  // Watch plan for videos (similar to YouTube)
  watchPlan?: {
    startSeconds: number;
    endSeconds: number;
    description: string;
    keyTopics?: string[];
  };
}

/**
 * Determine best content source for a concept
 * Returns recommendation: university, youtube, or text
 */
export function recommendContentSource(
  concept: string,
  isFoundational: boolean,
): 'university' | 'youtube' | 'text' {
  // Foundational concepts benefit from university rigor
  if (isFoundational) {
    const universityStrong = getUniversitySourcesForTopic(concept);
    if (universityStrong.length > 0) {
      return 'university';
    }
  }

  // Tool-specific content often better on YouTube
  const toolPatterns = [
    /zapier|make\.com|n8n|airtable|notion/i,
    /vercel|netlify|heroku|railway/i,
    /figma|canva|webflow/i,
    /cursor|copilot/i,
  ];

  if (toolPatterns.some(p => p.test(concept))) {
    return 'youtube';
  }

  // Default to text for simple concepts
  return 'text';
}
