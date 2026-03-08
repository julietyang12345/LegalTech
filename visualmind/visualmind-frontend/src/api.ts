export interface VmProject {
  id: string;
  title: string;
  raw_text: string;
  current_tree_json: TreeNode | null;
  created_at: string;
}

export interface TreeNode {
  id: string;
  text: string;
  children: TreeNode[];
}

const DEV_BEARER_TOKEN_KEY = 'vm_dev_bearer_token';

export const getDevBearerToken = (): string => localStorage.getItem(DEV_BEARER_TOKEN_KEY) || '';
export const setDevBearerToken = (token: string): void => {
  if (token.trim()) {
    localStorage.setItem(DEV_BEARER_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(DEV_BEARER_TOKEN_KEY);
  }
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = getDevBearerToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const resp = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<T>;
};

export const api = {
  me: () => request<{ user: { id: string; email: string } }>('/api/v1/auth/me'),
  listProjects: () => request<{ projects: VmProject[] }>('/api/v1/vm/projects'),
  createProject: (payload: { title: string; rawText: string }) =>
    request<{ project: VmProject }>('/api/v1/vm/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  generate: (projectId: string, inputText?: string) =>
    request<{ tree: TreeNode; version: number }>(`/api/v1/vm/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify(inputText ? { inputText } : {}),
    }),
  saveTree: (projectId: string, tree: TreeNode) =>
    request<{ tree: TreeNode }>(`/api/v1/vm/projects/${projectId}/tree/patch`, {
      method: 'POST',
      body: JSON.stringify({ tree }),
    }),
  exportMm: (projectId: string) => `/api/v1/vm/projects/${projectId}/export/mm`,
};
