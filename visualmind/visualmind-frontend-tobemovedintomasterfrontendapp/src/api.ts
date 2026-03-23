export type NodeStatus = 'backlog' | 'active' | 'done' | 'blocked';

export type NodePriority = 'low' | 'medium' | 'high' | 'critical';

export interface TreeNodeProperties {
  status?: NodeStatus;
  priority?: NodePriority;
  owner?: string;
  source?: string;
  confidence?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface VmProject {
  id: string;
  title: string;
  primary_source_title?: string | null;
  raw_text: string;
  current_tree_json: TreeNode | null;
  created_at: string;
}

export interface TreeNode {
  id: string;
  text: string;
  summary?: string;
  properties?: TreeNodeProperties;
  children: TreeNode[];
}

export type UserPlan = 'free' | 'pro';

export interface UsageLimits {
  maxTextChars: number;
  canImportPdf: boolean;
  canImportWeb: boolean;
  maxSourceSessions: number;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    role?: string;
    plan: UserPlan;
    limits: UsageLimits;
  };
}

export interface UpgradeLinkResponse {
  provider: 'stripe';
  url: string;
  priceUsdMonthly: number;
  paymentReceivedUrl: string;
  message?: string;
}

export interface ClaimMvpUpgradeResponse {
  message: string;
  plan: UserPlan;
  source: string;
  expiresAt: string;
  limits: UsageLimits;
}

export interface ProjectSource {
  id: string;
  project_id: string;
  kind: 'text' | 'pdf' | 'url';
  title: string;
  content_text: string;
  created_at: string;
}

export interface SlideDeck {
  title: string;
  theme?: string;
  slides: Array<{
    title: string;
    subtitle?: string;
    bullets?: string[];
    speakerNotes?: string;
    layout: 'title' | 'title-bullets' | 'two-column' | 'quote' | 'timeline' | 'summary';
    visualIdea?: string;
  }>;
}

export interface FlashcardDeck {
  title: string;
  cards: Array<{
    front: string;
    back: string;
    hint?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

export interface GenerateImmediateResponse {
  projectId: string;
  version: number;
  tree: TreeNode;
}

export interface GenerateQueuedResponse {
  projectId: string;
  jobId: string;
  status: 'queued' | 'running';
}

export interface GenerateJobResponse {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  version?: number;
  tree?: TreeNode;
  error?: string;
}

export interface ApiErrorPayload {
  message?: string;
  code?: string;
  contactEmail?: string;
  limit?: number;
  usedToday?: number;
}

export class ApiError extends Error {
  code?: string;
  contactEmail?: string;
  limit?: number;
  usedToday?: number;

  constructor(message: string, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.code = payload?.code;
    this.contactEmail = payload?.contactEmail;
    this.limit = payload?.limit;
    this.usedToday = payload?.usedToday;
  }
}

const DEV_BEARER_TOKEN_KEY = 'vm_dev_bearer_token';
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || '/api/v1';
const DEV_BEARER_ENABLED =
  import.meta.env.DEV &&
  ['1', 'true', 'yes'].includes(((import.meta.env.VITE_VM_ALLOW_DEV_BEARER as string | undefined) || '').toLowerCase());

export const getDevBearerToken = (): string => {
  if (!DEV_BEARER_ENABLED) return '';
  return localStorage.getItem(DEV_BEARER_TOKEN_KEY) || '';
};
export const setDevBearerToken = (token: string): void => {
  if (!DEV_BEARER_ENABLED) {
    localStorage.removeItem(DEV_BEARER_TOKEN_KEY);
    return;
  }
  if (token.trim()) {
    localStorage.setItem(DEV_BEARER_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(DEV_BEARER_TOKEN_KEY);
  }
};

const authHeaders = (): Headers => {
  const token = getDevBearerToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

const toApiError = async (resp: Response): Promise<ApiError> => {
  const text = await resp.text();
  if (!text.trim()) {
    return new ApiError(`Request failed (${resp.status})`);
  }

  try {
    const payload = JSON.parse(text) as ApiErrorPayload;
    return new ApiError(payload.message ?? `Request failed (${resp.status})`, payload);
  } catch {
    return new ApiError(text);
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = authHeaders();
  headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!resp.ok) {
    throw await toApiError(resp);
  }
  return resp.json() as Promise<T>;
};

const requestWithResponse = async (path: string, init?: RequestInit): Promise<Response> => {
  const headers = authHeaders();
  headers.set('Content-Type', 'application/json');
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });
};

const parseFilename = (headerValue: string | null, fallback: string): string => {
  if (!headerValue) return fallback;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const basicMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || fallback;
};

const downloadWithAuth = async (path: string, fallbackFilename: string): Promise<void> => {
  const headers = authHeaders();
  headers.set('X-Requested-With', 'XMLHttpRequest');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const blob = await response.blob();
  const filename = parseFilename(response.headers.get('content-disposition'), fallbackFilename);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export const api = {
  me: () => request<MeResponse>('/auth/me'),
  getUpgradeLink: () => request<UpgradeLinkResponse>('/auth/billing/upgrade-link'),
  claimMvpUpgrade: () => request<ClaimMvpUpgradeResponse>('/auth/billing/claim-mvp-upgrade', { method: 'POST' }),
  listProjects: () => request<{ projects: VmProject[] }>('/vm/projects'),
  createProject: (payload: { title: string; rawText: string; sourceSessions?: string[] }) =>
    request<{ project: VmProject }>('/vm/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteProject: (projectId: string) =>
    request<{ message: string }>(`/vm/projects/${projectId}`, {
      method: 'DELETE',
    }),
  updateProjectTitle: (projectId: string, title: string) =>
    request<{ project: VmProject }>(`/vm/projects/${projectId}/title`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  createFeatureRequest: (message: string) =>
    request<{ request: { id: string; created_at: string } }>('/vm/projects/feature-requests', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  listSources: (projectId: string) =>
    request<{ sources: ProjectSource[] }>(`/vm/projects/${projectId}/sources`),
  addSource: (projectId: string, payload: { kind: 'text' | 'pdf' | 'url'; title?: string; contentText: string }) =>
    request<{ source: ProjectSource }>(`/vm/projects/${projectId}/sources`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSource: (projectId: string, sourceId: string, payload: { title?: string; contentText: string }) =>
    request<{ source: ProjectSource }>(`/vm/projects/${projectId}/sources/${sourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSource: (projectId: string, sourceId: string) =>
    request<{ message: string }>(`/vm/projects/${projectId}/sources/${sourceId}/delete`, {
      method: 'POST',
    }),
  generate: async (projectId: string, inputText?: string): Promise<GenerateImmediateResponse | GenerateQueuedResponse> => {
    const resp = await requestWithResponse(`/vm/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify(inputText ? { inputText } : {}),
    });
    if (!resp.ok) {
      throw await toApiError(resp);
    }
    return resp.json() as Promise<GenerateImmediateResponse | GenerateQueuedResponse>;
  },
  getGenerateJob: (jobId: string) =>
    request<GenerateJobResponse>(`/vm/projects/generate-jobs/${jobId}`),
  generateSlides: (projectId: string, payload?: { inputText?: string; slideCount?: number }) =>
    request<{ slides: SlideDeck }>(`/vm/projects/${projectId}/generate/slides`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  generateFlashcards: (projectId: string, payload?: { inputText?: string; cardCount?: number }) =>
    request<{ flashcards: FlashcardDeck }>(`/vm/projects/${projectId}/generate/flashcards`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  saveTree: (projectId: string, tree: TreeNode) =>
    request<{ tree: TreeNode }>(`/vm/projects/${projectId}/tree/patch`, {
      method: 'POST',
      body: JSON.stringify({ tree }),
    }),
  importPdf: async (file: File): Promise<{ text: string }> => {
    const headers = authHeaders();
    headers.set('Content-Type', 'application/pdf');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const response = await fetch(`${API_BASE_URL}/imports/pdf`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: await file.arrayBuffer(),
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    return response.json() as Promise<{ text: string }>;
  },
  importWeb: (url: string) =>
    request<{ text: string }>('/imports/web', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  downloadMm: async (projectId: string) =>
    downloadWithAuth(`/vm/projects/${projectId}/export/mm`, `mindmap-${projectId}.mm`),
  downloadMarkdown: async (projectId: string) =>
    downloadWithAuth(`/vm/projects/${projectId}/export/md`, `mindmap-${projectId}.md`),
  downloadNotionMarkdown: async (projectId: string) =>
    downloadWithAuth(`/vm/projects/${projectId}/export/notion-markdown`, `mindmap-${projectId}-notion.md`),
};
