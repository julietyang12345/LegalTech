export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  plan: UserPlan;
}

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

export interface ProjectRecord {
  id: string;
  user_id: string;
  user_email: string | null;
  title: string;
  primary_source_title?: string | null;
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
