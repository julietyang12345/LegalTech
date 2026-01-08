/**
 * Documentation Sources Registry
 * Maps languages/frameworks to their official documentation sites
 */

export interface DocSource {
  id: string;
  name: string;
  domain: string;
  searchDomain: string; // For Google CSE: "site:domain.com"
  priority: number; // Higher = preferred
  contentSelector?: string; // CSS-like selector hint for extraction
}

export const DOC_SOURCES: Record<string, DocSource> = {
  // JavaScript / Web
  javascript: {
    id: 'mdn',
    name: 'MDN Web Docs',
    domain: 'developer.mozilla.org',
    searchDomain: 'site:developer.mozilla.org',
    priority: 100,
    contentSelector: 'article.main-page-content',
  },
  css: {
    id: 'mdn-css',
    name: 'MDN Web Docs',
    domain: 'developer.mozilla.org',
    searchDomain: 'site:developer.mozilla.org/en-US/docs/Web/CSS',
    priority: 100,
  },
  html: {
    id: 'mdn-html',
    name: 'MDN Web Docs',
    domain: 'developer.mozilla.org',
    searchDomain: 'site:developer.mozilla.org/en-US/docs/Web/HTML',
    priority: 100,
  },

  // React Ecosystem
  react: {
    id: 'react',
    name: 'React Documentation',
    domain: 'react.dev',
    searchDomain: 'site:react.dev',
    priority: 100,
  },
  nextjs: {
    id: 'nextjs',
    name: 'Next.js Documentation',
    domain: 'nextjs.org/docs',
    searchDomain: 'site:nextjs.org/docs',
    priority: 100,
  },

  // TypeScript
  typescript: {
    id: 'typescript',
    name: 'TypeScript Documentation',
    domain: 'typescriptlang.org',
    searchDomain: 'site:typescriptlang.org/docs',
    priority: 100,
  },

  // Node.js
  nodejs: {
    id: 'nodejs',
    name: 'Node.js Documentation',
    domain: 'nodejs.org',
    searchDomain: 'site:nodejs.org/docs',
    priority: 100,
  },
  node: {
    id: 'nodejs',
    name: 'Node.js Documentation',
    domain: 'nodejs.org',
    searchDomain: 'site:nodejs.org/docs',
    priority: 100,
  },

  // Python
  python: {
    id: 'python',
    name: 'Python Documentation',
    domain: 'docs.python.org',
    searchDomain: 'site:docs.python.org/3',
    priority: 100,
  },
  django: {
    id: 'django',
    name: 'Django Documentation',
    domain: 'docs.djangoproject.com',
    searchDomain: 'site:docs.djangoproject.com',
    priority: 90,
  },
  fastapi: {
    id: 'fastapi',
    name: 'FastAPI Documentation',
    domain: 'fastapi.tiangolo.com',
    searchDomain: 'site:fastapi.tiangolo.com',
    priority: 90,
  },

  // Go
  go: {
    id: 'go',
    name: 'Go Documentation',
    domain: 'go.dev',
    searchDomain: 'site:go.dev/doc',
    priority: 100,
  },
  golang: {
    id: 'go',
    name: 'Go Documentation',
    domain: 'go.dev',
    searchDomain: 'site:go.dev/doc',
    priority: 100,
  },

  // Rust
  rust: {
    id: 'rust',
    name: 'Rust Documentation',
    domain: 'doc.rust-lang.org',
    searchDomain: 'site:doc.rust-lang.org',
    priority: 100,
  },

  // Java
  java: {
    id: 'java',
    name: 'Java Documentation',
    domain: 'docs.oracle.com/javase',
    searchDomain: 'site:docs.oracle.com/javase',
    priority: 90,
  },

  // Vue
  vue: {
    id: 'vue',
    name: 'Vue.js Documentation',
    domain: 'vuejs.org',
    searchDomain: 'site:vuejs.org/guide',
    priority: 100,
  },

  // Angular
  angular: {
    id: 'angular',
    name: 'Angular Documentation',
    domain: 'angular.io',
    searchDomain: 'site:angular.io/docs',
    priority: 100,
  },

  // Databases
  postgresql: {
    id: 'postgresql',
    name: 'PostgreSQL Documentation',
    domain: 'postgresql.org/docs',
    searchDomain: 'site:postgresql.org/docs',
    priority: 90,
  },
  mongodb: {
    id: 'mongodb',
    name: 'MongoDB Documentation',
    domain: 'mongodb.com/docs',
    searchDomain: 'site:mongodb.com/docs',
    priority: 90,
  },

  // Cloud / DevOps
  docker: {
    id: 'docker',
    name: 'Docker Documentation',
    domain: 'docs.docker.com',
    searchDomain: 'site:docs.docker.com',
    priority: 90,
  },
  kubernetes: {
    id: 'kubernetes',
    name: 'Kubernetes Documentation',
    domain: 'kubernetes.io/docs',
    searchDomain: 'site:kubernetes.io/docs',
    priority: 90,
  },
  aws: {
    id: 'aws',
    name: 'AWS Documentation',
    domain: 'docs.aws.amazon.com',
    searchDomain: 'site:docs.aws.amazon.com',
    priority: 80,
  },

  // AI / ML
  pytorch: {
    id: 'pytorch',
    name: 'PyTorch Documentation',
    domain: 'pytorch.org/docs',
    searchDomain: 'site:pytorch.org/docs',
    priority: 90,
  },
  tensorflow: {
    id: 'tensorflow',
    name: 'TensorFlow Documentation',
    domain: 'tensorflow.org/api_docs',
    searchDomain: 'site:tensorflow.org',
    priority: 90,
  },
};

// Aliases for common variations
const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  'node.js': 'nodejs',
  'react.js': 'react',
  'vue.js': 'vue',
  'next.js': 'nextjs',
  postgres: 'postgresql',
  mongo: 'mongodb',
  k8s: 'kubernetes',
};

/**
 * Get the documentation source for a given skill or language
 */
export function getDocSourceForSkill(
  skill: string,
  language?: string,
): DocSource | null {
  const normalized = skill.toLowerCase().trim();

  // Check direct match
  if (DOC_SOURCES[normalized]) {
    return DOC_SOURCES[normalized];
  }

  // Check alias
  const aliased = LANGUAGE_ALIASES[normalized];
  if (aliased && DOC_SOURCES[aliased]) {
    return DOC_SOURCES[aliased];
  }

  // Check if language is provided
  if (language) {
    const langNorm = language.toLowerCase().trim();
    if (DOC_SOURCES[langNorm]) {
      return DOC_SOURCES[langNorm];
    }
    const langAliased = LANGUAGE_ALIASES[langNorm];
    if (langAliased && DOC_SOURCES[langAliased]) {
      return DOC_SOURCES[langAliased];
    }
  }

  // Try to detect from skill name
  const skillWords = normalized.split(/[\s\-_]+/);
  for (const word of skillWords) {
    if (DOC_SOURCES[word]) {
      return DOC_SOURCES[word];
    }
    const wordAliased = LANGUAGE_ALIASES[word];
    if (wordAliased && DOC_SOURCES[wordAliased]) {
      return DOC_SOURCES[wordAliased];
    }
  }

  // Default to MDN for web-related or unknown
  return DOC_SOURCES.javascript;
}

/**
 * Get all doc domains for Google CSE multi-site search
 */
export function getAllDocDomains(): string[] {
  const domains = new Set<string>();
  for (const source of Object.values(DOC_SOURCES)) {
    domains.add(source.domain);
  }
  return Array.from(domains);
}

/**
 * Build a combined search query for multiple doc sites
 */
export function buildDocSearchQuery(concept: string, language?: string): string {
  const docSource = getDocSourceForSkill(concept, language);
  if (docSource) {
    return `${concept} ${docSource.searchDomain}`;
  }
  // Fallback: search across multiple doc sites
  return `${concept} (site:developer.mozilla.org OR site:react.dev OR site:docs.python.org)`;
}
