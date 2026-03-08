export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  plan: UserPlan;
}

export interface TreeNode {
  id: string;
  text: string;
  children: TreeNode[];
}

export type UserPlan = 'free' | 'pro';

export interface UsageLimits {
  maxTextChars: number;
  canImportPdf: boolean;
  canImportWeb: boolean;
  maxSourceSessions: number;
}

export interface ProjectRecord {
  id: string;
  user_id: string;
  title: string;
  raw_text: string;
  current_tree_json: TreeNode | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSourceRecord {
  id: string;
  project_id: string;
  user_id: string;
  kind: 'text' | 'pdf' | 'url';
  title: string;
  content_text: string;
  created_at: string;
}
