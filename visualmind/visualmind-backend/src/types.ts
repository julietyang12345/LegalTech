export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

export interface TreeNode {
  id: string;
  text: string;
  children: TreeNode[];
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
