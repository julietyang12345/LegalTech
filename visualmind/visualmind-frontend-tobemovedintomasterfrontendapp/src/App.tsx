import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ApiError,
  api,
  type FlashcardDeck,
  type NodePriority,
  type NodeStatus,
  type ProjectSource,
  type SlideDeck,
  type TreeNode,
  type TreeNodeProperties,
  type UsageLimits,
  type UserPlan,
  type VmProject,
} from './api';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

const HORIZONTAL_GAP = 290;
const VERTICAL_GAP = 110;

type NodePosition = { x: number; y: number };

type MindNodeData = {
  label: string;
  summary?: string;
  heatClass?: string;
  status?: NodeStatus;
  priority?: NodePriority;
  owner: string;
  tags: string[];
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  onSelect: (nodeId: string) => void;
  onToggle: (nodeId: string) => void;
  onOpenContextMenu: (nodeId: string, label: string, canDelete: boolean, x: number, y: number) => void;
  canDelete: boolean;
  onRequestDelete: (nodeId: string, label: string) => void;
  onStartEdit: (nodeId: string, currentLabel: string) => void;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onEditCommit: (nodeId: string) => void;
  onEditCancel: () => void;
};

type MindNode = Node<MindNodeData, 'mindmap'>;
type PendingMove = {
  sourceId: string;
  sourceText: string;
  targetId: string;
  targetText: string;
};
type PendingDelete = {
  projectId: string;
  projectTitle: string;
};
type PendingNodeDelete = {
  nodeId: string;
  nodeText: string;
};
type NodeContextMenu = {
  nodeId: string;
  nodeText: string;
  canDelete: boolean;
  x: number;
  y: number;
};
type MapBuildPhase = 'idle' | 'analyzing-chunks' | 'merging-ideas' | 'building-map';
type AssetMode = 'slides' | 'flashcards';
type EditingSource =
  | { scope: 'persisted'; id: string }
  | { scope: 'draft'; id: string }
  | null;
type SourceEditorMode = 'text' | 'web';
type DraftSource = {
  id: string;
  title: string;
  contentText: string;
  kind: 'text';
};

type SortMode = 'manual' | 'alpha' | 'updated' | 'priority';

type TreeFilters = {
  query: string;
  status: 'all' | NodeStatus;
  priority: 'all' | NodePriority;
  owner: string;
  tag: string;
  colorBy: 'none' | 'priority' | 'status' | 'depth' | 'childCount';
  depth: number;
  collapseNonMatches: boolean;
  sort: SortMode;
};

const defaultLimits: UsageLimits = {
  maxTextChars: 5000,
  canImportPdf: true,
  canImportWeb: true,
  maxSourceSessions: 3,
};
const MINDMAP_CHUNK_SIZE = 3000;
const MINDMAP_CHUNK_THRESHOLD_CHARS = 9000;
const TOTAL_PROJECT_WORD_LIMIT = 20000;
const LOADER_COPY_ROTATION_MS = 1600;
const UPGRADE_PROMPT_USE_THRESHOLD = 8;
const GENERATION_USE_COUNT_KEY = 'vm_generation_use_count';
const UPGRADE_PROMPT_SHOWN_KEY = 'vm_upgrade_prompt_shown';
const DEFAULT_TREE_FILTERS: TreeFilters = {
  query: '',
  status: 'all',
  priority: 'all',
  owner: '',
  tag: '',
  colorBy: 'none',
  depth: 6,
  collapseNonMatches: true,
  sort: 'manual',
};

const HEATMAP_OPTIONS: Array<{ value: TreeFilters['colorBy']; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'depth', label: 'Depth' },
  { value: 'childCount', label: 'Child count' },
];

const MindMapNode = ({ id, data }: NodeProps<MindNode>) => (
  <div
    className={`mindmap-node ${data.heatClass ?? ''} ${data.status ? `status-${data.status}` : ''} ${data.priority ? `priority-${data.priority}` : ''} ${data.selected ? 'is-selected' : ''}`}
    onClick={() => data.onSelect(id)}
    onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      data.onOpenContextMenu(id, data.label, data.canDelete, event.clientX, event.clientY);
    }}
  >
    <Handle type="target" position={Position.Left} className="mindmap-handle" />
    {data.isEditing ? (
      <input
        className="mindmap-node-input nodrag"
        value={data.editValue}
        name={`node-label-${id}`}
        type="text"
        autoComplete="off"
        aria-label="Edit node label"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        autoFocus
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => data.onEditValueChange(event.target.value)}
        onBlur={() => data.onEditCommit(id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            data.onEditCommit(id);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            data.onEditCancel();
          }
        }}
      />
    ) : (
      <button
        className="mindmap-node-label nodrag"
        type="button"
        title={data.summary || data.label}
        onClick={(event) => {
          event.stopPropagation();
          data.onSelect(id);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          data.onStartEdit(id, data.label);
        }}
      >
        {data.label}
      </button>
    )}
    <div className="mindmap-node-meta">
      {data.status ? <span>{data.status}</span> : null}
      {data.priority ? <span>{data.priority}</span> : null}
      {data.owner ? <span>{data.owner}</span> : null}
    </div>
    {data.tags.length > 0 ? (
      <div className="mindmap-node-tags">
        {data.tags.slice(0, 3).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    ) : null}
    {data.hasChildren ? (
      <button
        className="mindmap-node-toggle nodrag"
        onClick={(event) => {
          event.stopPropagation();
          data.onToggle(id);
        }}
        type="button"
      >
        {data.expanded ? '<' : '>'}
      </button>
    ) : null}
    <Handle type="source" position={Position.Right} className="mindmap-handle" />
  </div>
);

const NODE_TYPES: NodeTypes = { mindmap: MindMapNode };

const inferTitle = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Untitled Map';
  return clean.split(' ').slice(0, 8).join(' ').slice(0, 60);
};

const countWords = (text: string): number => {
  const clean = text.trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
};

const hasTree = (project: VmProject): boolean => Boolean(project.current_tree_json);

const ensureNodeProperties = (node: TreeNode): TreeNode => {
  const now = new Date().toISOString();
  const properties: TreeNodeProperties = {
    ...(node.properties?.status ? { status: node.properties.status } : {}),
    ...(node.properties?.priority ? { priority: node.properties.priority } : {}),
    owner: node.properties?.owner?.trim() || '',
    source: node.properties?.source?.trim() || '',
    confidence:
      typeof node.properties?.confidence === 'number'
        ? Math.max(0, Math.min(100, Math.round(node.properties.confidence)))
        : 50,
    tags: Array.from(new Set((node.properties?.tags ?? []).map((tag) => tag.trim()).filter(Boolean))),
    createdAt: node.properties?.createdAt ?? now,
    updatedAt: node.properties?.updatedAt ?? now,
  };

  return {
    ...node,
    properties,
    children: node.children.map(ensureNodeProperties),
  };
};

const normalizeTree = (value: unknown): TreeNode | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return ensureNodeProperties(JSON.parse(value) as TreeNode);
    } catch {
      return null;
    }
  }
  return ensureNodeProperties(value as TreeNode);
};

const extractErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Unknown error';
  const raw = error.message?.trim();
  if (!raw) return 'Unknown error';
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed?.message) return parsed.message;
  } catch {
    // no-op
  }
  return raw;
};

const extractApiErrorMeta = (
  error: unknown,
): { code?: string; contactEmail?: string; limit?: number; usedToday?: number } | null => {
  if (error instanceof ApiError) {
    return {
      code: error.code,
      contactEmail: error.contactEmail,
      limit: error.limit,
      usedToday: error.usedToday,
    };
  }

  if (!(error instanceof Error)) return null;

  try {
    const parsed = JSON.parse(error.message) as {
      code?: string;
      contactEmail?: string;
      limit?: number;
      usedToday?: number;
    };
    return parsed;
  } catch {
    return null;
  }
};

const isProDailyLimitError = (error: unknown): boolean =>
  extractApiErrorMeta(error)?.code === 'PRO_DAILY_GENERATION_LIMIT_REACHED';

const isAuthError = (error: unknown): boolean => {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('token missing') ||
    message.includes('token invalid') ||
    message.includes('not authenticated')
  );
};

const findNode = (node: TreeNode, nodeId: string): TreeNode | null => {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
};

const updateNodeById = (node: TreeNode, targetId: string, updater: (value: TreeNode) => TreeNode): TreeNode => {
  if (node.id === targetId) {
    return updater(node);
  }
  return {
    ...node,
    children: node.children.map((child) => updateNodeById(child, targetId, updater)),
  };
};

const containsNode = (root: TreeNode, possibleDescendantId: string): boolean => {
  if (root.id === possibleDescendantId) return true;
  return root.children.some((child) => containsNode(child, possibleDescendantId));
};

const updateNodeTextById = (node: TreeNode, targetId: string, nextText: string): TreeNode => {
  if (node.id === targetId) {
    return {
      ...node,
      text: nextText,
      properties: {
        ...node.properties,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  return {
    ...node,
    children: node.children.map((child) => updateNodeTextById(child, targetId, nextText)),
  };
};

const removeNodeById = (node: TreeNode, targetId: string): { tree: TreeNode; removed: TreeNode | null } => {
  const keptChildren: TreeNode[] = [];
  let removed: TreeNode | null = null;

  for (const child of node.children) {
    if (child.id === targetId) {
      removed = child;
      continue;
    }
    const next = removeNodeById(child, targetId);
    keptChildren.push(next.tree);
    if (next.removed) {
      removed = next.removed;
    }
  }

  return { tree: { ...node, children: keptChildren }, removed };
};

const collectNodeIds = (node: TreeNode): string[] => {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...collectNodeIds(child));
  }
  return ids;
};

const insertNodeAsChild = (node: TreeNode, targetId: string, toInsert: TreeNode): TreeNode => {
  if (node.id === targetId) {
    return {
      ...node,
      properties: {
        ...node.properties,
        updatedAt: new Date().toISOString(),
      },
      children: [...node.children, ensureNodeProperties(toInsert)],
    };
  }
  return {
    ...node,
    children: node.children.map((child) => insertNodeAsChild(child, targetId, toInsert)),
  };
};

const sortChildrenForView = (children: TreeNode[], sort: SortMode): TreeNode[] => {
  const sorted = [...children];
  if (sort === 'alpha') {
    sorted.sort((a, b) => a.text.localeCompare(b.text));
  } else if (sort === 'updated') {
    sorted.sort((a, b) => {
      const left = new Date(a.properties?.updatedAt ?? 0).getTime();
      const right = new Date(b.properties?.updatedAt ?? 0).getTime();
      return right - left;
    });
  } else if (sort === 'priority') {
    const order: Record<NodePriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    sorted.sort((a, b) => (order[b.properties?.priority as NodePriority] ?? 0) - (order[a.properties?.priority as NodePriority] ?? 0));
  }
  return sorted;
};

const treeNodeMatchesFilters = (node: TreeNode, filters: TreeFilters): boolean => {
  const query = filters.query.trim().toLowerCase();
  const owner = filters.owner.trim().toLowerCase();
  const tag = filters.tag.trim().toLowerCase();
  const textMatch = !query || node.text.toLowerCase().includes(query);
  const statusMatch = filters.status === 'all' || node.properties?.status === filters.status;
  const priorityMatch = filters.priority === 'all' || node.properties?.priority === filters.priority;
  const ownerMatch = !owner || (node.properties?.owner ?? '').toLowerCase().includes(owner);
  const tagMatch = !tag || (node.properties?.tags ?? []).some((item) => item.toLowerCase().includes(tag));
  return textMatch && statusMatch && priorityMatch && ownerMatch && tagMatch;
};

const filterTreeForView = (node: TreeNode, filters: TreeFilters, depth = 0): TreeNode | null => {
  if (depth > filters.depth) return null;

  const filteredChildren = sortChildrenForView(
    node.children
      .map((child) => filterTreeForView(child, filters, depth + 1))
      .filter((child): child is TreeNode => Boolean(child)),
    filters.sort,
  );

  const selfMatches = treeNodeMatchesFilters(node, filters);
  const hasMatchingChildren = filteredChildren.length > 0;

  if (depth === 0 || selfMatches || hasMatchingChildren) {
    return {
      ...node,
      children:
        filters.collapseNonMatches && !selfMatches
          ? filteredChildren
          : filteredChildren,
    };
  }

  return null;
};

const countTreeNodes = (node: TreeNode | null): number => {
  if (!node) return 0;
  return 1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0);
};

const collectExpandedNodeIds = (node: TreeNode, acc: Record<string, boolean> = {}): Record<string, boolean> => {
  acc[node.id] = true;
  for (const child of node.children) {
    collectExpandedNodeIds(child, acc);
  }
  return acc;
};

const countExpandableNodes = (node: TreeNode | null): number => {
  if (!node) return 0;
  const self = node.children.length > 0 ? 1 : 0;
  return self + node.children.reduce((sum, child) => sum + countExpandableNodes(child), 0);
};

const countExpandedBranchNodes = (node: TreeNode | null, expandedById: Record<string, boolean>): number => {
  if (!node) return 0;
  const self = node.children.length > 0 && (expandedById[node.id] ?? false) ? 1 : 0;
  return self + node.children.reduce((sum, child) => sum + countExpandedBranchNodes(child, expandedById), 0);
};

const makeNodeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const positionsStorageKey = (projectId: string): string => `vm_positions_${projectId}`;

const loadStoredPositions = (projectId: string): Record<string, NodePosition> => {
  try {
    const raw = localStorage.getItem(positionsStorageKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, NodePosition>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
};

const persistPositions = (projectId: string, positions: Record<string, NodePosition>): void => {
  localStorage.setItem(positionsStorageKey(projectId), JSON.stringify(positions));
};

const getNodeHeatClass = (
  node: TreeNode,
  depth: number,
  colorBy: TreeFilters['colorBy'],
): string => {
  switch (colorBy) {
    case 'priority':
      return node.properties?.priority ? `heat-priority-${node.properties.priority}` : '';
    case 'status':
      return node.properties?.status ? `heat-status-${node.properties.status}` : '';
    case 'depth':
      if (depth === 0) return 'heat-depth-root';
      if (depth === 1) return 'heat-depth-top';
      if (depth === 2) return 'heat-depth-mid';
      return 'heat-depth-deep';
    case 'childCount': {
      const count = node.children.length;
      if (count >= 5) return 'heat-children-heavy';
      if (count >= 2) return 'heat-children-medium';
      return 'heat-children-light';
    }
    default:
      return '';
  }
};

const layoutVisibleTree = (
  node: TreeNode,
  depth: number,
  colorBy: TreeFilters['colorBy'],
  expandedById: Record<string, boolean>,
  positionById: Record<string, NodePosition>,
  selectedNodeId: string | null,
  onSelect: (nodeId: string) => void,
  onToggle: (nodeId: string) => void,
  onOpenContextMenu: (nodeId: string, label: string, canDelete: boolean, x: number, y: number) => void,
  onRequestDelete: (nodeId: string, label: string) => void,
  editingNodeId: string | null,
  nodeEditText: string,
  onStartEdit: (nodeId: string, currentLabel: string) => void,
  onEditValueChange: (value: string) => void,
  onEditCommit: (nodeId: string) => void,
  onEditCancel: () => void,
  nodes: MindNode[],
  edges: Edge[],
  cursor: { y: number },
): number => {
  const isExpanded = expandedById[node.id] ?? false;
  const canExpand = node.children.length > 0;

  let anchorY = cursor.y;
  if (!canExpand || !isExpanded) {
    anchorY = cursor.y;
    cursor.y += VERTICAL_GAP;
  } else {
    const childYs: number[] = [];
    for (const child of node.children) {
      const childY = layoutVisibleTree(
        child,
        depth + 1,
        colorBy,
        expandedById,
        positionById,
        selectedNodeId,
        onSelect,
        onToggle,
        onOpenContextMenu,
        onRequestDelete,
        editingNodeId,
        nodeEditText,
        onStartEdit,
        onEditValueChange,
        onEditCommit,
        onEditCancel,
        nodes,
        edges,
        cursor,
      );
      childYs.push(childY);
      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        target: child.id,
        type: 'simplebezier',
      });
    }
    if (childYs.length > 0) {
      anchorY = childYs.reduce((sum, y) => sum + y, 0) / childYs.length;
    }
  }

  const fallback = { x: depth * HORIZONTAL_GAP, y: anchorY };
  const position = positionById[node.id] ?? fallback;

  nodes.push({
    id: node.id,
    type: 'mindmap',
    position,
    data: {
      label: node.text,
      summary: node.summary,
      heatClass: getNodeHeatClass(node, depth, colorBy),
      status: node.properties?.status,
      priority: node.properties?.priority,
      owner: node.properties?.owner ?? '',
      tags: node.properties?.tags ?? [],
      hasChildren: canExpand,
      expanded: isExpanded,
      selected: selectedNodeId === node.id,
      onSelect,
      onToggle,
      onOpenContextMenu,
      canDelete: node.id !== 'root',
      onRequestDelete,
      onStartEdit,
      isEditing: editingNodeId === node.id,
      editValue: nodeEditText,
      onEditValueChange,
      onEditCommit,
      onEditCancel,
    },
    draggable: true,
  });

  return anchorY;
};

const createFlowGraph = (
  root: TreeNode,
  colorBy: TreeFilters['colorBy'],
  expandedById: Record<string, boolean>,
  positionById: Record<string, NodePosition>,
  selectedNodeId: string | null,
  onSelect: (nodeId: string) => void,
  onToggle: (nodeId: string) => void,
  onOpenContextMenu: (nodeId: string, label: string, canDelete: boolean, x: number, y: number) => void,
  onRequestDelete: (nodeId: string, label: string) => void,
  editingNodeId: string | null,
  nodeEditText: string,
  onStartEdit: (nodeId: string, currentLabel: string) => void,
  onEditValueChange: (value: string) => void,
  onEditCommit: (nodeId: string) => void,
  onEditCancel: () => void,
  dropTargetId?: string | null,
): { nodes: MindNode[]; edges: Edge[] } => {
  const nodes: MindNode[] = [];
  const edges: Edge[] = [];

  layoutVisibleTree(
    root,
    0,
    colorBy,
    expandedById,
    positionById,
    selectedNodeId,
    onSelect,
    onToggle,
    onOpenContextMenu,
    onRequestDelete,
    editingNodeId,
    nodeEditText,
    onStartEdit,
    onEditValueChange,
    onEditCommit,
    onEditCancel,
    nodes,
    edges,
    { y: 40 },
  );
  if (dropTargetId) {
    for (const node of nodes) {
      if (node.id === dropTargetId) {
        node.className = 'drop-target';
      }
    }
  }

  return { nodes, edges };
};

export const App = () => {
  const appIsAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const { mode, setMode } = useThemeStore();
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlan>('free');
  const [limits, setLimits] = useState<UsageLimits>(defaultLimits);
  const [projects, setProjects] = useState<VmProject[]>([]);
  const [persistedSources, setPersistedSources] = useState<ProjectSource[]>([]);
  const [draftSessions, setDraftSessions] = useState<DraftSource[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectTitle, setProjectTitle] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [isAddTextOpen, setIsAddTextOpen] = useState(false);
  const [sourceEditorMode, setSourceEditorMode] = useState<SourceEditorMode>('text');
  const [webUrl, setWebUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [treeFilters, setTreeFilters] = useState<TreeFilters>(DEFAULT_TREE_FILTERS);
  const [isMapFiltersOpen, setIsMapFiltersOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [status, setStatus] = useState<string>('Checking auth...');
  const [generationLimitMeta, setGenerationLimitMeta] = useState<{
    contactEmail: string;
    limit?: number;
    usedToday?: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [nodes, setNodes] = useState<MindNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<MindNode, Edge> | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingNodeDelete, setPendingNodeDelete] = useState<PendingNodeDelete | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenu | null>(null);
  const [isFeatureRequestOpen, setIsFeatureRequestOpen] = useState(false);
  const [featureRequestMessage, setFeatureRequestMessage] = useState('');
  const [sendingFeatureRequest, setSendingFeatureRequest] = useState(false);
  const [featureRequestFeedback, setFeatureRequestFeedback] = useState<{
    tone: 'error' | 'success';
    message: string;
  } | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [isUpgradeOfferOpen, setIsUpgradeOfferOpen] = useState(false);
  const [isMvpUpgradeOpen, setIsMvpUpgradeOpen] = useState(false);
  const [editingRecentMapId, setEditingRecentMapId] = useState<string | null>(null);
  const [editingRecentMapTitle, setEditingRecentMapTitle] = useState('');
  const [renamingRecentMapId, setRenamingRecentMapId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<EditingSource>(null);
  const [assetBusy, setAssetBusy] = useState<AssetMode | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapBuildPhase, setMapBuildPhase] = useState<MapBuildPhase>('idle');
  const [mapBuildProgress, setMapBuildProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [loaderTick, setLoaderTick] = useState(0);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditText, setNodeEditText] = useState('');
  const [hasSourceChanges, setHasSourceChanges] = useState(false);
  const [studyToolsSpotlight, setStudyToolsSpotlight] = useState(false);
  const selectedProjectIdRef = useRef('');
  const [activeAssetMode, setActiveAssetMode] = useState<AssetMode>('flashcards');
  const [slideDeck, setSlideDeck] = useState<SlideDeck | null>(null);
  const [flashcardDeck, setFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const studyToolsRef = useRef<HTMLDivElement | null>(null);
  const buildProgressTimerRef = useRef<number | null>(null);
  const authRefreshInFlightRef = useRef(false);

  const trackGenerationUsage = useCallback(() => {
    if (userPlan !== 'free') return;

    const rawCount = window.localStorage.getItem(GENERATION_USE_COUNT_KEY);
    const nextCount = Number.parseInt(rawCount ?? '0', 10) + 1;
    window.localStorage.setItem(GENERATION_USE_COUNT_KEY, String(nextCount));

    const promptShown = window.localStorage.getItem(UPGRADE_PROMPT_SHOWN_KEY) === 'true';
    if (!promptShown && nextCount >= UPGRADE_PROMPT_USE_THRESHOLD) {
      window.localStorage.setItem(UPGRADE_PROMPT_SHOWN_KEY, 'true');
      setIsUpgradeOfferOpen(true);
    }
  }, [userPlan]);
  const rawTextLength = rawText.length;
  const isLoggedIn = isAuthenticated || appIsAuthenticated || Boolean(userEmail);
  const isOverTextLimit = rawTextLength > limits.maxTextChars;
  const remainingChars = Math.max(0, limits.maxTextChars - rawTextLength);
  const unsavedEditorText = isAddTextOpen && sourceEditorMode === 'text' ? rawText.trim() : '';
  const pendingSourceCount = draftSessions.length + (unsavedEditorText ? 1 : 0);
  const persistedSourceWords = persistedSources.reduce((sum, source) => sum + countWords(source.content_text), 0);
  const draftSourceWords = draftSessions.reduce((sum, source) => sum + countWords(source.contentText), 0);
  const activeSourceWords = selectedProjectId ? persistedSourceWords : draftSourceWords;
  const editingSourceOriginalWords =
    editingSource?.scope === 'persisted'
      ? countWords(persistedSources.find((source) => source.id === editingSource.id)?.content_text ?? '')
      : editingSource?.scope === 'draft'
        ? countWords(draftSessions.find((source) => source.id === editingSource.id)?.contentText ?? '')
        : 0;
  const projectedCombinedWords = isAddTextOpen
    ? activeSourceWords - editingSourceOriginalWords + countWords(unsavedEditorText)
    : activeSourceWords;
  const isOverCombinedLimit = projectedCombinedWords > TOTAL_PROJECT_WORD_LIMIT;
  const remainingCombinedWords = Math.max(0, TOTAL_PROJECT_WORD_LIMIT - projectedCombinedWords);
  const isWebUrlValid = /^https?:\/\/\S+/i.test(webUrl.trim());
  const setExpandedForTree = (nextTree: TreeNode | null) => {
    setExpandedById(nextTree ? { [nextTree.id]: true } : {});
  };
  const visibleTree = useMemo(() => {
    if (!tree) return null;
    return filterTreeForView(tree, treeFilters);
  }, [tree, treeFilters]);
  const selectedNode = useMemo(
    () => (tree && selectedNodeId ? findNode(tree, selectedNodeId) : null),
    [tree, selectedNodeId],
  );
  const visibleNodeCount = useMemo(() => countTreeNodes(visibleTree), [visibleTree]);
  const totalNodeCount = useMemo(() => countTreeNodes(tree), [tree]);
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (treeFilters.status !== 'all') {
      chips.push({
        key: 'status',
        label: `Status: ${treeFilters.status}`,
        onRemove: () => setTreeFilters((prev) => ({ ...prev, status: 'all' })),
      });
    }
    if (treeFilters.priority !== 'all') {
      chips.push({
        key: 'priority',
        label: `Priority: ${treeFilters.priority}`,
        onRemove: () => setTreeFilters((prev) => ({ ...prev, priority: 'all' })),
      });
    }
    if (treeFilters.owner.trim()) {
      chips.push({
        key: 'owner',
        label: `Owner: ${treeFilters.owner.trim()}`,
        onRemove: () => setTreeFilters((prev) => ({ ...prev, owner: '' })),
      });
    }
    if (treeFilters.tag.trim()) {
      chips.push({
        key: 'tag',
        label: `Tag: ${treeFilters.tag.trim()}`,
        onRemove: () => setTreeFilters((prev) => ({ ...prev, tag: '' })),
      });
    }
    return chips;
  }, [treeFilters]);
  const unlockMoreHref = useMemo(() => {
    if (!generationLimitMeta?.contactEmail || !userEmail) return null;
    const subject = encodeURIComponent('VisualMind unlock request');
    const body = encodeURIComponent(
      `Please unlock more VisualMind generations for today.\n\nUser email: ${userEmail}\nPlan: ${userPlan}\nUsed today: ${generationLimitMeta.usedToday ?? 'unknown'} / ${generationLimitMeta.limit ?? 'unknown'}`,
    );
    return `mailto:${generationLimitMeta.contactEmail}?subject=${subject}&body=${body}`;
  }, [generationLimitMeta, userEmail, userPlan]);

  const showStudyToolsPanel = (mode: AssetMode) => {
    setActiveAssetMode(mode);
    setStudyToolsSpotlight(true);
    studyToolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => setStudyToolsSpotlight(false), 1200);
  };

  const allNodesExpanded = useMemo(
    () => {
      const totalExpandable = countExpandableNodes(tree);
      if (totalExpandable === 0) return false;
      return countExpandedBranchNodes(tree, expandedById) >= totalExpandable;
    },
    [tree, expandedById],
  );

  const toggleAllNodes = useCallback(() => {
    if (!tree) return;
    setExpandedById(allNodesExpanded ? { [tree.id]: true } : collectExpandedNodeIds(tree));
    window.requestAnimationFrame(() => {
      flowInstance?.fitView({ padding: 0.14, duration: 260 });
    });
  }, [allNodesExpanded, tree, flowInstance]);

  const stopBuildProgress = useCallback(() => {
    if (buildProgressTimerRef.current !== null) {
      window.clearInterval(buildProgressTimerRef.current);
      buildProgressTimerRef.current = null;
    }
    setMapBuildPhase('idle');
    setMapBuildProgress({ current: 0, total: 0 });
  }, []);

  const startBuildProgress = useCallback(
    (estimatedChars: number) => {
      stopBuildProgress();
      const isLongText = estimatedChars > MINDMAP_CHUNK_THRESHOLD_CHARS;
      const totalChunks = Math.max(1, Math.ceil(estimatedChars / MINDMAP_CHUNK_SIZE));

      if (!isLongText) {
        setMapBuildPhase('building-map');
        setStatus('Building final mind map...');
        return;
      }

      setMapBuildPhase('analyzing-chunks');
      setMapBuildProgress({ current: 1, total: totalChunks });
      setStatus(`Analyzing part 1 of ${totalChunks}...`);

      buildProgressTimerRef.current = window.setInterval(() => {
        setMapBuildProgress((prev) => {
          if (prev.current < prev.total) {
            const nextCurrent = prev.current + 1;
            setStatus(`Analyzing part ${nextCurrent} of ${prev.total}...`);
            return { ...prev, current: nextCurrent };
          }

          setMapBuildPhase((phase) => {
            if (phase === 'analyzing-chunks') {
              setStatus('Merging ideas...');
              return 'merging-ideas';
            }
            if (phase === 'merging-ideas') {
              setStatus('Building final mind map...');
              return 'building-map';
            }
            return phase;
          });
          return prev;
        });
      }, 1400);
    },
    [stopBuildProgress],
  );

  const visibleProjects = useMemo(() => projects, [projects]);

  const loaderDisplay = useMemo(() => {
    if (mapBuildPhase === 'analyzing-chunks') {
      return {
        title: `Analyzing part ${mapBuildProgress.current} of ${mapBuildProgress.total}`,
        body: 'Extracting key points from each section...',
      };
    }

    if (mapBuildPhase === 'merging-ideas') {
      return {
        title: 'Merging ideas',
        body: 'Combining and deduplicating ideas...',
      };
    }

    const buildingMessages = [
      'Turning your source into a connected map...',
      'Organizing branches and preserving structure...',
      'Finalizing nodes for the canvas...',
    ];

    return {
      title: 'Building final mind map',
      body: status || buildingMessages[loaderTick % buildingMessages.length],
    };
  }, [loaderTick, mapBuildPhase, mapBuildProgress.current, mapBuildProgress.total, status]);

const recentMapTitle = (project: VmProject): string => {
  const sourceTitle = project.primary_source_title?.trim();
  if (sourceTitle) return sourceTitle;
  return project.title;
};

const sortProjectsNewestFirst = (items: VmProject[]): VmProject[] =>
  [...items].sort((left, right) => {
    const leftTime = new Date(left.created_at).getTime();
    const rightTime = new Date(right.created_at).getTime();
    return rightTime - leftTime;
  });

const mergeProjectsById = (existing: VmProject[], incoming: VmProject[]): VmProject[] => {
  const merged = new Map<string, VmProject>();
  for (const project of existing) {
    merged.set(project.id, project);
  }
  for (const project of incoming) {
    merged.set(project.id, project);
  }
  return sortProjectsNewestFirst(Array.from(merged.values()));
};

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedById((prev) => ({
      ...prev,
      [nodeId]: !(prev[nodeId] ?? false),
    }));
  }, []);

  const pickNearestValidTarget = useCallback(
    (dragNode: MindNode): MindNode | null => {
      if (!tree || !flowInstance) return null;

      const sourceNode = findNode(tree, dragNode.id);
      if (!sourceNode) return null;

      const intersections = flowInstance
        .getIntersectingNodes(dragNode)
        .filter((candidate) => candidate.id !== dragNode.id) as MindNode[];

      const candidates = intersections.filter((candidate) => {
        if (!candidate.data?.hasChildren && candidate.id !== 'root') return false;
        if (containsNode(sourceNode, candidate.id)) return false;
        return true;
      });

      if (candidates.length === 0) return null;

      const dragWidth = dragNode.width ?? 260;
      const dragHeight = dragNode.height ?? 80;
      const dragCenterX = dragNode.position.x + dragWidth / 2;
      const dragCenterY = dragNode.position.y + dragHeight / 2;

      let best: MindNode | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        const width = candidate.width ?? 260;
        const height = candidate.height ?? 80;
        const centerX = candidate.position.x + width / 2;
        const centerY = candidate.position.y + height / 2;
        const distance = Math.hypot(centerX - dragCenterX, centerY - dragCenterY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }

      return best;
    },
    [tree, flowInstance],
  );

  const graph = useMemo(() => {
    if (!visibleTree) return { nodes: [], edges: [] };
    return createFlowGraph(
      visibleTree,
      treeFilters.colorBy,
      expandedById,
      nodePositions,
      selectedNodeId,
      setSelectedNodeId,
      toggleNode,
      (nodeId, label, canDelete, x, y) => {
        setNodeContextMenu({ nodeId, nodeText: label, canDelete, x, y });
      },
      (nodeId, label) => {
        setPendingNodeDelete({ nodeId, nodeText: label });
      },
      editingNodeId,
      nodeEditText,
      (nodeId, currentLabel) => {
        setEditingNodeId(nodeId);
        setNodeEditText(currentLabel);
      },
      setNodeEditText,
      (nodeId) => {
        const nextText = nodeEditText.trim();
        if (!tree || !nextText) {
          setEditingNodeId(null);
          setNodeEditText('');
          return;
        }
        const updatedTree = updateNodeTextById(tree, nodeId, nextText);
        setTree(updatedTree);
        setEditingNodeId(null);
        setNodeEditText('');
      },
      () => {
        setEditingNodeId(null);
        setNodeEditText('');
      },
      dropTargetId,
    );
  }, [visibleTree, treeFilters.colorBy, expandedById, nodePositions, selectedNodeId, toggleNode, dropTargetId, editingNodeId, nodeEditText]);

  const heatmapLegend = useMemo(() => {
    switch (treeFilters.colorBy) {
      case 'priority':
        return [
          { label: 'Critical', className: 'heat-priority-critical' },
          { label: 'High', className: 'heat-priority-high' },
          { label: 'Medium / Low', className: 'heat-priority-low' },
        ];
      case 'status':
        return [
          { label: 'Blocked', className: 'heat-status-blocked' },
          { label: 'Active', className: 'heat-status-active' },
          { label: 'Done', className: 'heat-status-done' },
          { label: 'Backlog', className: 'heat-status-backlog' },
        ];
      case 'depth':
        return [
          { label: 'Root', className: 'heat-depth-root' },
          { label: 'Level 1', className: 'heat-depth-top' },
          { label: 'Level 2', className: 'heat-depth-mid' },
          { label: 'Level 3+', className: 'heat-depth-deep' },
        ];
      case 'childCount':
        return [
          { label: 'Many children', className: 'heat-children-heavy' },
          { label: 'Some children', className: 'heat-children-medium' },
          { label: 'Few / none', className: 'heat-children-light' },
        ];
      default:
        return [];
    }
  }, [treeFilters.colorBy]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    const closeMenu = () => setNodeContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);

  useEffect(() => () => stopBuildProgress(), [stopBuildProgress]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodePositions({});
      setPersistedSources([]);
      setHasSourceChanges(false);
      return;
    }
    setNodePositions(loadStoredPositions(selectedProjectId));
  }, [selectedProjectId]);

  const loadSources = async (projectId: string) => {
    const data = await api.listSources(projectId);
    setPersistedSources(data.sources);
    return data.sources;
  };

  const loadProjects = async (options?: { preferredProjectId?: string | null }) => {
    const data = await api.listProjects();
    setProjects((prev) => mergeProjectsById(prev, data.projects));

    const preferredProjectId = options?.preferredProjectId ?? selectedProjectIdRef.current;
    const activeProject = preferredProjectId
      ? data.projects.find((project) => project.id === preferredProjectId)
      : null;

    if (activeProject) {
      return;
    }

    if (data.projects[0]) {
      const fallbackProject = data.projects.find(hasTree) ?? data.projects[0];
      const fallbackTree = normalizeTree(fallbackProject.current_tree_json);
      setSelectedProjectId(fallbackProject.id);
      setTree(fallbackTree);
      setSelectedNodeId(fallbackTree?.id ?? null);
      setExpandedForTree(fallbackTree);
      await loadSources(fallbackProject.id);
      setProjectTitle(fallbackProject.title);
      setRawText('');
      setSourceTitle('');
      setIsAddTextOpen(false);
      setEditingSource(null);
      setHasSourceChanges(false);
      return;
    }

    setSelectedProjectId('');
    setTree(null);
    setSelectedNodeId(null);
    setExpandedForTree(null);
    setPersistedSources([]);
  };

  const refreshAuthState = useCallback(
    async (options?: { silent?: boolean }) => {
      if (authRefreshInFlightRef.current) return;
      authRefreshInFlightRef.current = true;
      try {
        const profile = await api.me();
        setIsAuthenticated(true);
        setUserEmail(profile.user.email);
        setUserPlan(profile.user.plan ?? 'free');
        setLimits(profile.user.limits ?? defaultLimits);
        setStatus('Ready');
        await loadProjects();
      } catch {
        setIsAuthenticated(false);
        setUserEmail('');
        setProjects([]);
        setPersistedSources([]);
        setSelectedProjectId('');
        setTree(null);
        setSelectedNodeId(null);
        setExpandedForTree(null);
        if (!options?.silent) {
          setStatus('Ready');
        }
      } finally {
        authRefreshInFlightRef.current = false;
      }
    },
    [selectedProjectId],
  );

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  useEffect(() => {
    const onFocus = () => {
      void refreshAuthState({ silent: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshAuthState({ silent: true });
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshAuthState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      setStatus('Payment received. Your account will be upgraded shortly.');
      params.delete('upgrade');
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, []);

  useEffect(() => {
    if (!isOverCombinedLimit || userPlan !== 'free' || isUpgradeOfferOpen) return;
    setIsUpgradeOfferOpen(true);
  }, [isOverCombinedLimit, isUpgradeOfferOpen, userPlan]);

  useEffect(() => {
    if (!isMapLoading) {
      setLoaderTick(0);
      return;
    }
    const timer = window.setInterval(() => {
      setLoaderTick((value) => value + 1);
    }, LOADER_COPY_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [isMapLoading]);

  const onLogin = () => {
    const next = encodeURIComponent(window.location.href);
    window.location.href = `/login?next=${next}`;
  };

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      setIsAuthenticated(false);
      setUserEmail('');
      setProjects([]);
      setPersistedSources([]);
      setDraftSessions([]);
      setSelectedProjectId('');
      setProjectTitle('');
      setSourceTitle('');
      setRawText('');
      setTree(null);
      setSelectedNodeId(null);
      setExpandedForTree(null);
      setHasSourceChanges(false);
      setStatus('Logged out');
    }
  };

  const onToggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const continueUpgradeFlow = async () => {
    setUpgradeBusy(true);
    try {
      const upgrade = await api.getUpgradeLink();
      setIsUpgradeOfferOpen(false);
      window.open(upgrade.url, '_blank', 'noopener,noreferrer');
      setStatus(`Opening Stripe checkout ($${upgrade.priceUsdMonthly}/month).`);
    } catch (error) {
      const message = extractErrorMessage(error);
      if (message.toLowerCase().includes('not configured')) {
        setIsUpgradeOfferOpen(false);
        setIsMvpUpgradeOpen(true);
        return;
      }
      setStatus(`Upgrade unavailable: ${message}`);
    } finally {
      setUpgradeBusy(false);
    }
  };

  const claimMvpUpgrade = async () => {
    setUpgradeBusy(true);
    try {
      const claim = await api.claimMvpUpgrade();
      setUserPlan(claim.plan ?? 'pro');
      setLimits(claim.limits ?? defaultLimits);
      setStatus(claim.message || 'Upgrade applied.');
      setIsMvpUpgradeOpen(false);
    } catch (claimError) {
      const claimMessage = extractErrorMessage(claimError);
      setStatus(`Upgrade unavailable: ${claimMessage}`);
    } finally {
      setUpgradeBusy(false);
    }
  };

  const onCreateProject = async () => {
    const sourceSessions = [
      ...draftSessions.map((s) => s.contentText).filter(Boolean),
      ...(unsavedEditorText ? [unsavedEditorText] : []),
    ];
    if (sourceSessions.length === 0) {
      setStatus('Add at least one source before generating a mind map.');
      return;
    }
    const combinedWords = sourceSessions.reduce((sum, session) => sum + countWords(session), 0);
    if (combinedWords > TOTAL_PROJECT_WORD_LIMIT) {
      setStatus(`Combined source text exceeds ${TOTAL_PROJECT_WORD_LIMIT} words. Remove text and try again.`);
      return;
    }
    setBusy(true);
    setIsMapLoading(true);
    setTree(null);
    const estimatedChars = sourceSessions.join('\n\n').length;
    startBuildProgress(estimatedChars);
    try {
      setGenerationLimitMeta(null);
      setStatus('Creating project and generating mind map...');
      const finalTitle = projectTitle.trim() || inferTitle(sourceSessions[0] || '');
      const data = await api.createProject({
        title: finalTitle,
        rawText: sourceSessions[0] || '',
        sourceSessions: sourceSessions.slice(1),
      });
      setProjects((prev) => mergeProjectsById(prev, [data.project]));
      setSelectedProjectId(data.project.id);
      await loadSources(data.project.id);
      const generated = await api.generate(data.project.id);
      if ('jobId' in generated) {
        await waitForGeneratedTree(data.project.id, generated.jobId);
      } else {
        setTree(generated.tree);
        setSelectedNodeId(generated.tree.id);
        setExpandedForTree(generated.tree);
        setNodePositions({});
        trackGenerationUsage();
      }
      setDraftSessions([]);
      setRawText('');
      setSourceTitle('');
      setIsAddTextOpen(false);
      setEditingSource(null);
      setHasSourceChanges(false);
      setStatus(`Created "${finalTitle}" and generated map`);
      await loadProjects({ preferredProjectId: data.project.id });
    } catch (error) {
      const message = extractErrorMessage(error);
      const meta = extractApiErrorMeta(error);
      if (meta?.code === 'PRO_DAILY_GENERATION_LIMIT_REACHED' && meta.contactEmail) {
        setGenerationLimitMeta({
          contactEmail: meta.contactEmail,
          limit: meta.limit,
          usedToday: meta.usedToday,
        });
      } else {
        setGenerationLimitMeta(null);
      }
      setStatus(`Create failed: ${message}`);
      await loadProjects();
    } finally {
      stopBuildProgress();
      setIsMapLoading(false);
      setBusy(false);
    }
  };

  const ensureStudyToolReadyProject = (): string | null => {
    if (!isLoggedIn) {
      setStatus('Please log in to use study tools.');
      onLogin();
      return null;
    }
    if (!selectedProjectId || !tree) {
      setStatus('Create or generate a mind map first, then use AI Slides or Flashcards.');
      return null;
    }
    return selectedProjectId;
  };

  // Slides are temporarily disabled.
  // const onGenerateSlides = async () => {
  //   setAssetBusy('slides');
  //   try {
  //     const projectId = ensureStudyToolReadyProject();
  //     if (!projectId) return;
  //     const response = await api.generateSlides(projectId, { slideCount: 6 });
  //     setSlideDeck(response.slides);
  //     showStudyToolsPanel('slides');
  //     setStatus(`Generated ${response.slides.slides.length} AI slides`);
  //   } catch (error) {
  //     const message = extractErrorMessage(error);
  //     setStatus(`Slides failed: ${message}`);
  //   } finally {
  //     setAssetBusy(null);
  //   }
  // };

  // Flashcards are temporarily disabled.
  // const onGenerateFlashcards = async () => {
  //   setAssetBusy('flashcards');
  //   try {
  //     const projectId = ensureStudyToolReadyProject();
  //     if (!projectId) return;
  //     const response = await api.generateFlashcards(projectId, { cardCount: 10 });
  //     setFlashcardDeck(response.flashcards);
  //     showStudyToolsPanel('flashcards');
  //     setStatus(`Generated ${response.flashcards.cards.length} flashcards`);
  //   } catch (error) {
  //     const message = extractErrorMessage(error);
  //     setStatus(`Flashcards failed: ${message}`);
  //   } finally {
  //     setAssetBusy(null);
  //   }
  // };

  const waitForGeneratedTree = async (projectId: string, jobId: string) => {
    setStatus('Generation queued. Building your mind map...');
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const job = await api.getGenerateJob(jobId);
      if (job.status === 'queued') {
        setStatus('Generation queued. Starting soon...');
        continue;
      }
      if (job.status === 'running') {
        setStatus('Generating mind map...');
        continue;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || 'Mind map generation failed');
      }
      if (job.status === 'done' && job.tree && typeof job.version === 'number') {
        setTree(job.tree);
        setSelectedNodeId(job.tree.id);
        setExpandedForTree(job.tree);
        setNodePositions({});
        persistPositions(projectId, {});
        setHasSourceChanges(false);
        trackGenerationUsage();
        setStatus(`Generated version ${job.version}`);
        await loadProjects();
        return;
      }
    }
  };

  const onGenerate = async () => {
    if (!selectedProjectId) {
      setStatus('Create a project first, then generate.');
      return;
    }
    if (unsavedEditorText) {
      setStatus('Save your text into Added Sources before generating.');
      return;
    }
    if (persistedSources.length === 0) {
      setStatus('Add at least one source in Added Sources before generating.');
      return;
    }
    setBusy(true);
    setIsMapLoading(true);
    setTree(null);
    const estimatedChars = persistedSources.map((source) => source.content_text).join('\n\n').length;
    startBuildProgress(estimatedChars);
    try {
      setGenerationLimitMeta(null);
      setStatus('Generating mind map...');
      const data = await api.generate(selectedProjectId);
      if ('jobId' in data) {
        await waitForGeneratedTree(selectedProjectId, data.jobId);
        return;
      }
      const immediate = data;
      setTree(immediate.tree);
      setSelectedNodeId(immediate.tree.id);
      setExpandedForTree(immediate.tree);
      setNodePositions({});
      persistPositions(selectedProjectId, {});
      setHasSourceChanges(false);
      trackGenerationUsage();
      setStatus(`Generated version ${immediate.version}`);
      await loadProjects();
    } catch (error) {
      const message = extractErrorMessage(error);
      const meta = extractApiErrorMeta(error);
      if (meta?.code === 'PRO_DAILY_GENERATION_LIMIT_REACHED' && meta.contactEmail) {
        setGenerationLimitMeta({
          contactEmail: meta.contactEmail,
          limit: meta.limit,
          usedToday: meta.usedToday,
        });
      } else {
        setGenerationLimitMeta(null);
      }
      setStatus(`Generate failed: ${message}`);
    } finally {
      stopBuildProgress();
      setIsMapLoading(false);
      setBusy(false);
    }
  };

  const onPrimaryMapAction = async () => {
    if (!isLoggedIn) {
      onLogin();
      return;
    }

    if (selectedProjectId) {
      void onGenerate();
      return;
    }
    void onCreateProject();
  };

  const onAddSession = async () => {
    const text = rawText.trim();
    if (!text) return;
    if (isOverTextLimit) {
      setStatus(`Text is over your ${limits.maxTextChars}-character plan limit.`);
      return;
    }
    if (isOverCombinedLimit) {
      setStatus(`Combined source text exceeds ${TOTAL_PROJECT_WORD_LIMIT} words.`);
      return;
    }

    if (!selectedProjectId) {
      if (editingSource?.scope === 'draft') {
        setDraftSessions((prev) =>
          prev.map((source) =>
            source.id === editingSource.id
              ? { ...source, title: sourceTitle.trim() || inferTitle(text), contentText: text }
              : source,
          ),
        );
        setRawText('');
        setSourceTitle('');
        setWebUrl('');
        setSourceEditorMode('text');
        setEditingSource(null);
        setIsAddTextOpen(false);
        setStatus('Saved source edit');
        return;
      }

      if (draftSessions.length >= limits.maxSourceSessions) {
        setStatus(`Your plan supports up to ${limits.maxSourceSessions} source sessions per project.`);
        return;
      }
      const nextDraft: DraftSource = {
        id: `draft-${Date.now()}`,
        title: sourceTitle.trim() || inferTitle(text),
        contentText: text,
        kind: 'text',
      };
      setDraftSessions((prev) => [...prev, nextDraft]);
      setRawText('');
      setSourceTitle('');
      setWebUrl('');
      setSourceEditorMode('text');
      setIsAddTextOpen(false);
      setStatus('Added source');
      return;
    }

    setBusy(true);
    try {
      if (editingSource?.scope === 'persisted') {
        const existingSource = persistedSources.find((source) => source.id === editingSource.id);
        const nextTitle = sourceTitle.trim() || inferTitle(text);
        const nextContent = text;
        const titleChanged = (existingSource?.title ?? '').trim() !== nextTitle;
        const contentChanged = (existingSource?.content_text ?? '').trim() !== nextContent;
        if (!titleChanged && !contentChanged) {
          setStatus('No changes to save');
          setWebUrl('');
          setSourceEditorMode('text');
          setIsAddTextOpen(false);
          setEditingSource(null);
          return;
        }
        await api.updateSource(selectedProjectId, editingSource.id, {
          title: nextTitle,
          contentText: nextContent,
        });
        setHasSourceChanges(true);
      } else {
        await api.addSource(selectedProjectId, {
          kind: 'text',
          title: sourceTitle.trim() || inferTitle(text),
          contentText: text,
        });
        setHasSourceChanges(true);
      }
      setRawText('');
      setSourceTitle('');
      setWebUrl('');
      setSourceEditorMode('text');
      setEditingSource(null);
      setIsAddTextOpen(false);
      await loadSources(selectedProjectId);
      setStatus(
        editingSource?.scope === 'persisted'
          ? 'Saved source edit. Click Update your mind map to apply changes.'
          : 'Added source. Click Update your mind map to apply changes.',
      );
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Add session failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const resetSourceEditor = () => {
    setIsAddTextOpen(false);
    setSourceEditorMode('text');
    setWebUrl('');
    setRawText('');
    setSourceTitle('');
    setEditingSource(null);
  };

  const onPdfSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const result = await api.importPdf(file);
      setRawText(result.text);
      setSourceTitle(file.name.replace(/\.pdf$/i, ''));
      setWebUrl('');
      setEditingSource(null);
      setSourceEditorMode('text');
      setIsAddTextOpen(true);
      setStatus(`Imported PDF: ${file.name}`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`PDF import failed: ${message}`);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const onImportWeb = async (url: string) => {
    setBusy(true);
    try {
      const result = await api.importWeb(url);
      setRawText(result.text);
      setSourceTitle(inferTitle(url));
      setWebUrl(url.trim());
      setEditingSource(null);
      setSourceEditorMode('text');
      setIsAddTextOpen(true);
      setStatus('Imported webpage or Notion content');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Web import failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const onMdSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setRawText(text);
      setSourceTitle(file.name.replace(/\.md$/i, ''));
      setWebUrl('');
      setEditingSource(null);
      setSourceEditorMode('text');
      setIsAddTextOpen(true);
      setStatus(`Imported Markdown: ${file.name}`);
    } catch {
      setStatus('Markdown import failed');
    } finally {
      event.target.value = '';
    }
  };

  const onExportMm = async () => {
    if (!isLoggedIn) {
      setStatus('Please log in to export your mind map.');
      onLogin();
      return;
    }
    if (!selectedProjectId) return;
    try {
      await api.downloadMm(selectedProjectId);
      setStatus('Exported .mm file');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Export .mm failed: ${message}`);
    }
  };

  const onExportMarkdown = async () => {
    if (!isLoggedIn) {
      setStatus('Please log in to export your mind map.');
      onLogin();
      return;
    }
    if (!selectedProjectId) return;
    try {
      await api.downloadMarkdown(selectedProjectId);
      setStatus('Exported .md file');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Export .md failed: ${message}`);
    }
  };

  const onExportNotionMarkdown = async () => {
    if (!isLoggedIn) {
      setStatus('Please log in to export your mind map.');
      onLogin();
      return;
    }
    if (!selectedProjectId) return;
    try {
      await api.downloadNotionMarkdown(selectedProjectId);
      setStatus('Exported Notion .md file');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Export Notion .md failed: ${message}`);
    }
  };

  const onExportImage = (format: 'png' | 'jpg') => {
    if (!isLoggedIn) {
      setStatus('Please log in to export your mind map.');
      onLogin();
      return;
    }
    if (!nodes.length) return;

    const defaultNodeWidth = 260;
    const defaultNodeHeight = 80;
    const padding = 48;

    const bounds = nodes.reduce(
      (acc, node) => {
        const width = node.width ?? defaultNodeWidth;
        const height = node.height ?? defaultNodeHeight;
        return {
          minX: Math.min(acc.minX, node.position.x),
          minY: Math.min(acc.minY, node.position.y),
          maxX: Math.max(acc.maxX, node.position.x + width),
          maxY: Math.max(acc.maxY, node.position.y + height),
        };
      },
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const canvasWidth = Math.ceil(contentWidth + padding * 2);
    const canvasHeight = Math.ceil(contentHeight + padding * 2);
    const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(canvasWidth * scale);
    canvas.height = Math.ceil(canvasHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setStatus('Export image failed: canvas not supported');
      return;
    }

    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const offsetX = padding - bounds.minX;
    const offsetY = padding - bounds.minY;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    ctx.strokeStyle = '#7fa8df';
    ctx.lineWidth = 2;
    for (const edge of edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const sourceWidth = source.width ?? defaultNodeWidth;
      const sourceHeight = source.height ?? defaultNodeHeight;
      const targetHeight = target.height ?? defaultNodeHeight;
      const sx = source.position.x + sourceWidth + offsetX;
      const sy = source.position.y + sourceHeight / 2 + offsetY;
      const tx = target.position.x + offsetX;
      const ty = target.position.y + targetHeight / 2 + offsetY;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    for (const node of nodes) {
      const width = node.width ?? defaultNodeWidth;
      const height = node.height ?? defaultNodeHeight;
      const x = node.position.x + offsetX;
      const y = node.position.y + offsetY;
      const radius = 14;

      ctx.fillStyle = '#d8edf9';
      ctx.strokeStyle = '#86aee3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const label = node.data?.label ?? '';
      const words = label.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > 26 && current) {
          lines.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) lines.push(current);

      const maxLines = 3;
      const finalLines = lines.slice(0, maxLines);
      if (lines.length > maxLines) {
        finalLines[maxLines - 1] = `${finalLines[maxLines - 1]}...`;
      }

      ctx.fillStyle = '#1a2535';
      ctx.font = '700 14px Manrope, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const lineHeight = 18;
      const startY = y + height / 2 - ((finalLines.length - 1) * lineHeight) / 2;
      for (const [lineIndex, line] of finalLines.entries()) {
        ctx.fillText(line, x + 14, startY + lineIndex * lineHeight, width - 28);
      }
    }

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const dataUrl = canvas.toDataURL(mimeType, format === 'jpg' ? 0.92 : undefined);
    const link = document.createElement('a');
    const baseName = (projectTitle.trim() || 'mindmap').replace(/[^a-zA-Z0-9-_]+/g, '_');
    link.href = dataUrl;
    link.download = `${baseName}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setStatus(`Exported ${format.toUpperCase()} image`);
  };

  const onNodesChange = useCallback((changes: NodeChange<MindNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const applyTreeMove = (sourceId: string, targetId: string) => {
    if (!tree) return;
    const sourceNode = findNode(tree, sourceId);
    const targetNode = findNode(tree, targetId);
    if (!sourceNode || !targetNode) return;
    if (containsNode(sourceNode, targetId)) return;

    const removed = removeNodeById(tree, sourceId);
    if (!removed.removed) return;
    const movedTree = insertNodeAsChild(removed.tree, targetId, removed.removed);
    setTree(movedTree);
    setStatus(`Moved "${sourceNode.text}" under "${targetNode.text}"`);
  };

  const applyNodeAdd = async (parentId: string, parentText: string) => {
    if (!tree) return;

    const parent = findNode(tree, parentId);
    if (!parent) {
      setStatus('Parent node not found.');
      return;
    }

    const newNode: TreeNode = {
      id: makeNodeId(),
      text: 'New node',
      children: [],
    };

    const nextTree = insertNodeAsChild(tree, parentId, newNode);
    setNodeContextMenu(null);
    setTree(nextTree);
    setExpandedById((prev) => ({ ...prev, [parentId]: true }));
    setEditingNodeId(newNode.id);
    setNodeEditText(newNode.text);

    if (!selectedProjectId) {
      setStatus(`Added child node under "${parentText}"`);
      return;
    }

    try {
      await api.saveTree(selectedProjectId, nextTree);
      await loadProjects();
      setStatus(`Added child node under "${parentText}"`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Add node failed: ${message}`);
    }
  };

  const applyNodeTags = async (nodeId: string, nodeText: string) => {
    if (!tree) return;

    const node = findNode(tree, nodeId);
    if (!node) {
      setStatus('Node not found.');
      return;
    }

    const currentTags = (node.properties?.tags ?? []).join(', ');
    const nextValue = window.prompt(`Add tags for "${nodeText}"`, currentTags);
    if (nextValue === null) {
      setNodeContextMenu(null);
      return;
    }

    const tags = Array.from(new Set(nextValue.split(',').map((tag) => tag.trim()).filter(Boolean)));
    await applyNodeProperties(nodeId, nodeText, { tags });
    setStatus(tags.length > 0 ? `Updated tags for "${nodeText}"` : `Cleared tags for "${nodeText}"`);
  };

  const applyNodeDelete = async (nodeId: string, nodeText: string) => {
    if (!tree) return;
    if (nodeId === 'root') {
      setStatus('Root node cannot be deleted.');
      return;
    }

    const removed = removeNodeById(tree, nodeId);
    if (!removed.removed) {
      setStatus('Node not found.');
      return;
    }

    const removedIds = new Set(collectNodeIds(removed.removed));
    const nextPositions = Object.fromEntries(
      Object.entries(nodePositions).filter(([id]) => !removedIds.has(id)),
    );

    setTree(removed.tree);
    setNodePositions(nextPositions);
    if (selectedProjectId) {
      persistPositions(selectedProjectId, nextPositions);
    }
    if (editingNodeId && removedIds.has(editingNodeId)) {
      setEditingNodeId(null);
      setNodeEditText('');
    }
    setPendingNodeDelete(null);
    setNodeContextMenu(null);

    if (!selectedProjectId) {
      setStatus(`Deleted node "${nodeText}"`);
      return;
    }

    try {
      await api.saveTree(selectedProjectId, removed.tree);
      await loadProjects();
      setStatus(`Deleted node "${nodeText}"`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Delete node failed: ${message}`);
    }
  };

  const removeDraftSource = (id: string) => {
    setDraftSessions((prev) => prev.filter((source) => source.id !== id));
  };

  const deleteRecentMap = async (projectId: string, projectTitle: string) => {
    setDeletingProjectId(projectId);
    try {
      await api.deleteProject(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
      if (selectedProjectId === projectId) {
        setSelectedProjectId('');
        setTree(null);
        setSelectedNodeId(null);
        setPersistedSources([]);
        setNodePositions({});
        setHasSourceChanges(false);
      }
      setStatus(`Deleted "${projectTitle}"`);
      await loadProjects();
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Delete failed: ${message}`);
    } finally {
      setDeletingProjectId(null);
      setPendingDelete(null);
    }
  };

  const openFeatureRequestModal = () => {
    if (!isLoggedIn) {
      setStatus('Please log in to send a feature request.');
      onLogin();
      return;
    }
    setFeatureRequestFeedback(null);
    setIsFeatureRequestOpen(true);
  };

  const submitFeatureRequest = async () => {
    const message = featureRequestMessage.trim();
    if (message.length < 10) {
      setFeatureRequestFeedback({
        tone: 'error',
        message: 'Please enter at least 10 characters before sending.',
      });
      setStatus('Please enter at least 10 characters.');
      return;
    }

    setSendingFeatureRequest(true);
    setFeatureRequestFeedback(null);
    try {
      const response = await api.createFeatureRequest(message);
      const backendMessage = response.request?.id
        ? 'Feature request sent. Thank you.'
        : 'Request submitted.';
      setFeatureRequestFeedback({
        tone: 'success',
        message: backendMessage,
      });
      setStatus(backendMessage);
      setFeatureRequestMessage('');
    } catch (error) {
      const requestMessage = extractErrorMessage(error);
      setFeatureRequestFeedback({
        tone: 'error',
        message: requestMessage,
      });
      setStatus(`Feature request failed: ${requestMessage}`);
    } finally {
      setSendingFeatureRequest(false);
    }
  };

  const startRecentMapRename = (project: VmProject) => {
    setEditingRecentMapId(project.id);
    setEditingRecentMapTitle(recentMapTitle(project));
  };

  const saveRecentMapRename = async (projectId: string) => {
    const nextTitle = editingRecentMapTitle.trim();
    if (!nextTitle) {
      setStatus('Title cannot be empty');
      return;
    }

    setRenamingRecentMapId(projectId);
    try {
      await api.updateProjectTitle(projectId, nextTitle);
      if (selectedProjectId === projectId) {
        setProjectTitle(nextTitle);
      }
      setStatus(`Updated map title to "${nextTitle}"`);
      setEditingRecentMapId(null);
      setEditingRecentMapTitle('');
      await loadProjects();
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Rename failed: ${message}`);
    } finally {
      setRenamingRecentMapId(null);
    }
  };

  const openPersistedSource = (source: ProjectSource) => {
    setSourceTitle(source.title);
    setRawText(source.content_text);
    setWebUrl('');
    setSourceEditorMode('text');
    setIsAddTextOpen(true);
    setEditingSource({ scope: 'persisted', id: source.id });
    setStatus(`Loaded source "${source.title}" into editor`);
  };

  const removePersistedSource = async (source: ProjectSource) => {
    if (!selectedProjectId) return;
    if (!isLoggedIn) {
      setStatus('Please log in to remove sources.');
      onLogin();
      return;
    }

    try {
      await api.deleteSource(selectedProjectId, source.id);
      await loadSources(selectedProjectId);
      setHasSourceChanges(true);

      if (editingSource?.scope === 'persisted' && editingSource.id === source.id) {
        setEditingSource(null);
        setSourceTitle('');
        setRawText('');
        setIsAddTextOpen(false);
      }

      setStatus(`Removed source "${source.title}"`);
    } catch (error) {
      if (isAuthError(error)) {
        setIsAuthenticated(false);
        setUserEmail('');
        setStatus('Session expired. Please log in again to remove sources.');
        onLogin();
        return;
      }
      const message = extractErrorMessage(error);
      setStatus(`Remove source failed: ${message}`);
    }
  };

  const applySelectedNodeProperties = async (patch: Partial<TreeNodeProperties>) => {
    if (!tree || !selectedNodeId) return;
    const nextTree = updateNodeById(tree, selectedNodeId, (node) =>
      ensureNodeProperties({
        ...node,
        properties: {
          ...node.properties,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    setTree(nextTree);

    if (!selectedProjectId) {
      setStatus('Updated node properties');
      return;
    }

    try {
      await api.saveTree(selectedProjectId, nextTree);
      await loadProjects();
      setStatus('Updated node properties');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Save node properties failed: ${message}`);
    }
  };

  const applyNodeProperties = async (
    nodeId: string,
    nodeText: string,
    patch: Partial<TreeNodeProperties>,
    options?: { colorBy?: TreeFilters['colorBy'] },
  ) => {
    if (!tree) return;

    const nextTree = updateNodeById(tree, nodeId, (node) =>
      ensureNodeProperties({
        ...node,
        properties: {
          ...node.properties,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    setNodeContextMenu(null);
    setTree(nextTree);

    if (options?.colorBy) {
      setTreeFilters((prev) => ({ ...prev, colorBy: options.colorBy as TreeFilters['colorBy'] }));
    }

    if (!selectedProjectId) {
      setStatus(`Updated "${nodeText}"`);
      return;
    }

    try {
      await api.saveTree(selectedProjectId, nextTree);
      await loadProjects();
      setStatus(`Updated "${nodeText}"`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Save node update failed: ${message}`);
    }
  };

  const applySelectedNodeSummary = async (summary: string) => {
    if (!tree || !selectedNodeId) return;
    const nextTree = updateNodeById(tree, selectedNodeId, (node) =>
      ensureNodeProperties({
        ...node,
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(summary.trim() ? {} : { summary: undefined }),
        properties: {
          ...node.properties,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    setTree(nextTree);

    if (!selectedProjectId) {
      setStatus('Updated node summary');
      return;
    }

    try {
      await api.saveTree(selectedProjectId, nextTree);
      await loadProjects();
      setStatus('Updated node summary');
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Save node summary failed: ${message}`);
    }
  };

  const createRelatedNode = async (mode: 'child' | 'sibling') => {
    if (!tree || !selectedNodeId) return;

    const newNode = ensureNodeProperties({
      id: makeNodeId(),
      text: mode === 'child' ? 'New child' : 'New sibling',
      properties: {},
      children: [],
    });

    let nextTree = tree;
    if (mode === 'child') {
      nextTree = insertNodeAsChild(tree, selectedNodeId, newNode);
      setExpandedById((prev) => ({ ...prev, [selectedNodeId]: true }));
    } else if (selectedNodeId !== 'root') {
      const attachSibling = (node: TreeNode): TreeNode => {
        const index = node.children.findIndex((child) => child.id === selectedNodeId);
        if (index >= 0) {
          const nextChildren = [...node.children];
          nextChildren.splice(index + 1, 0, newNode);
          return {
            ...node,
            properties: {
              ...node.properties,
              updatedAt: new Date().toISOString(),
            },
            children: nextChildren,
          };
        }
        return {
          ...node,
          children: node.children.map(attachSibling),
        };
      };
      nextTree = attachSibling(tree);
    }

    setTree(nextTree);
    setSelectedNodeId(newNode.id);
    setEditingNodeId(newNode.id);
    setNodeEditText(newNode.text);

    if (!selectedProjectId) {
      setStatus(`Added ${mode} node`);
      return;
    }

    try {
      await api.saveTree(selectedProjectId, nextTree);
      await loadProjects();
      setStatus(`Added ${mode} node`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Add ${mode} node failed: ${message}`);
    }
  };

  return (
    <div className="vm-shell">
      <header className="vm-topbar">
        <div>
          <h1>VisualMind</h1>
          <p>Turn large text into a structured mind map with live filters, sorting, and node properties.</p>
        </div>
        <div className="vm-topbar-right">
          <button className="theme-toggle" type="button" onClick={onToggleTheme}>
            <span className="theme-toggle-icon" aria-hidden="true">{mode === 'dark' ? 'D' : 'L'}</span>
            <span>{mode === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          {status !== 'Ready' ? <span className="status-chip">{status}</span> : null}
          {unlockMoreHref ? (
            <a className="btn btn-ghost status-action" href={unlockMoreHref}>
              Email us to unlock more
            </a>
          ) : null}
          {!isLoggedIn ? (
            <button className="btn btn-ghost" type="button" onClick={onLogin}>
              Log in
            </button>
          ) : null}
          {isLoggedIn ? <span className="status-chip user">{userEmail || 'Signed in'}</span> : null}
          {isLoggedIn ? (
            <button className="btn btn-ghost" type="button" onClick={() => void onLogout()}>
              Logout
            </button>
          ) : null}
        </div>
      </header>

      <main className="vm-grid">
        <section className="vm-pane vm-pane-left">
          <div className="card composer-card">
            <div className="composer-intro">
              <h2 className="panel-title">Sources</h2>
              <p className="panel-subtitle">Build the map from notes, docs, PDFs, and saved research.</p>
            </div>
            <div className="workspace-divider" />
            <div className="composer-source-entry">
              <button
                className="source-add-btn"
                type="button"
                onClick={() => {
                  resetSourceEditor();
                  setIsAddTextOpen(true);
                  setSourceEditorMode('text');
                }}
              >
                <span className="source-add-title">+ Add Source</span>
                <span className="source-add-subtext">Paste text, notes, or research</span>
              </button>
            </div>
            <div className="source-tools source-tools-stack">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  document.getElementById('md-upload-input')?.click();
                }}
                disabled={busy}
              >
                Markdown
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  document.getElementById('pdf-upload-input')?.click();
                }}
                disabled={busy}
              >
                PDF
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  resetSourceEditor();
                  setIsAddTextOpen(true);
                  setSourceEditorMode('web');
                }}
                disabled={busy}
              >
                Web
              </button>
            </div>
            <input
              id="md-upload-input"
              type="file"
              accept=".md,text/markdown,text/plain"
              style={{ display: 'none' }}
              onChange={onMdSelected}
            />
            <input
              id="pdf-upload-input"
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={onPdfSelected}
            />
            <div className="sources-list-header">
              <h4>Added Sources</h4>
              <span className="sources-list-state">
                {selectedProjectId
                  ? persistedSources.length === 0
                    ? '(empty)'
                    : `(${persistedSources.length})`
                  : draftSessions.length === 0
                    ? '(empty)'
                    : `(${draftSessions.length})`}
              </span>
            </div>
            <div className="session-list">
              {selectedProjectId ? (
                <>
                  {persistedSources.length === 0 ? <p className="hint sources-empty">(empty)</p> : null}
                  {persistedSources.map((source, index) => (
                    <div key={source.id} className="session-item">
                      <div className="session-item-main">
                        <div className="session-item-title">{source.title || `Source ${index + 1}`}</div>
                        <div className="session-item-meta">
                          {source.kind === 'pdf' ? 'PDF' : source.kind === 'url' ? 'Web' : 'Text'} source · {source.content_text.length} chars
                        </div>
                      </div>
                      <div className="session-item-actions">
                        <button className="btn btn-ghost" type="button" onClick={() => openPersistedSource(source)}>
                          Edit
                        </button>
                        <button className="btn btn-ghost" type="button" onClick={() => void removePersistedSource(source)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {draftSessions.length === 0 ? <p className="hint sources-empty">(empty)</p> : null}
                  {draftSessions.map((session, index) => (
                    <div key={session.id} className="session-item">
                      <div className="session-item-main">
                        <div className="session-item-title">{session.title || `Source ${index + 1}`}</div>
                        <div className="session-item-meta">Text source · {session.contentText.length} chars</div>
                      </div>
                      <div className="session-item-actions">
                        <button className="btn btn-ghost" type="button" onClick={() => removeDraftSource(session.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            {(selectedProjectId ? persistedSources.length : draftSessions.length) > 1 ? (
              <div className="source-warning-card">
                <div className="source-warning-copy">
                  <strong>All added sources are included</strong>
                  <span>
                    Remove any unused source before generating so the map reflects only what you want included.
                  </span>
                </div>
              </div>
            ) : null}
            <div className="primary-actions">
              <button
                className={`btn btn-map-action btn-map-primary btn-map-fab ${busy ? 'is-generating' : ''}`}
                onClick={() => void onPrimaryMapAction()}
                disabled={busy || (isLoggedIn && !selectedProjectId && pendingSourceCount === 0)}
              >
                <span className="btn-map-plus">+</span>
                {!isLoggedIn
                  ? 'Create Mind Map'
                  : selectedProjectId
                    ? hasSourceChanges
                      ? 'Update your mind map'
                      : 'Generate Mind Map'
                    : 'Create Mind Map'}
              </button>
            </div>
            {/* Mind Map Outputs section temporarily disabled */}
          </div>
        </section>

        <section className="vm-pane vm-pane-main">
          <div className="card map-card">
            <div className="map-header">
              <h2 className="panel-title panel-title-small">Your Mind Map</h2>
            </div>
            <div className="map-canvas">
              <div className="map-canvas-overlay">
                <div className="map-command-bar">
                  <div className="map-command-bar-main">
                    <div className="map-search-shell">
                      <input
                        className="map-toolbar-search"
                        type="search"
                        name="node-search"
                        autoComplete="off"
                        aria-label="Search nodes"
                        inputMode="search"
                        enterKeyHint="search"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        placeholder="Search nodes"
                        value={treeFilters.query}
                        onChange={(event) => setTreeFilters((prev) => ({ ...prev, query: event.target.value }))}
                      />
                    </div>
                    <div className="map-toolbar-group">
                      <div className="map-toolbar-menu map-toolbar-menu-filter">
                        <button
                          type="button"
                          className={`map-toolbar-button ${isMapFiltersOpen ? 'is-active' : ''}`}
                          onClick={() => setIsMapFiltersOpen((prev) => !prev)}
                        >
                          <span className="map-button-icon" aria-hidden="true">+</span>
                          <span>Filter</span>
                        </button>
                        {isMapFiltersOpen ? (
                          <div className="map-toolbar-popover map-filter-panel">
                            <div className="map-filter-grid">
                              <select
                                name="filter-status"
                                aria-label="Filter by status"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                value={treeFilters.status}
                                onChange={(event) => setTreeFilters((prev) => ({ ...prev, status: event.target.value as TreeFilters['status'] }))}
                              >
                                <option value="all">All status</option>
                                <option value="backlog">Backlog</option>
                                <option value="active">Active</option>
                                <option value="done">Done</option>
                                <option value="blocked">Blocked</option>
                              </select>
                              <select
                                name="filter-priority"
                                aria-label="Filter by priority"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                value={treeFilters.priority}
                                onChange={(event) => setTreeFilters((prev) => ({ ...prev, priority: event.target.value as TreeFilters['priority'] }))}
                              >
                                <option value="all">All priority</option>
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="critical">Critical</option>
                              </select>
                              <input
                                className="map-filter-input"
                                type="text"
                                name="filter-owner"
                                autoComplete="off"
                                aria-label="Filter by owner"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                placeholder="Owner"
                                value={treeFilters.owner}
                                onChange={(event) => setTreeFilters((prev) => ({ ...prev, owner: event.target.value }))}
                              />
                              <input
                                className="map-filter-input"
                                type="text"
                                name="filter-tag"
                                autoComplete="off"
                                aria-label="Filter by tag"
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-bwignore="true"
                                placeholder="Tag"
                                value={treeFilters.tag}
                                onChange={(event) => setTreeFilters((prev) => ({ ...prev, tag: event.target.value }))}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <label className="map-toolbar-depth">
                        <span className="map-toolbar-label">Depth</span>
                        <span className="map-toolbar-value">{treeFilters.depth}</span>
                        <input
                          type="range"
                          name="filter-depth"
                          aria-label="Visible depth"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          min={1}
                          max={8}
                          value={treeFilters.depth}
                          onChange={(event) => setTreeFilters((prev) => ({ ...prev, depth: Number(event.target.value) }))}
                        />
                      </label>
                      <label className="map-toolbar-select-shell">
                        <span className="map-toolbar-label">Color by</span>
                        <select
                          className="map-toolbar-select"
                          name="color-by"
                          aria-label="Color nodes by"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          value={treeFilters.colorBy}
                          onChange={(event) =>
                            setTreeFilters((prev) => ({ ...prev, colorBy: event.target.value as TreeFilters['colorBy'] }))
                          }
                        >
                          {HEATMAP_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="map-toolbar-button"
                        onClick={toggleAllNodes}
                        disabled={!tree}
                      >
                        <span>{allNodesExpanded ? 'Collapse' : 'Expand'}</span>
                      </button>
                      <div className="map-toolbar-menu">
                        <button
                          type="button"
                          className="map-toolbar-button"
                          onClick={() => setIsExportMenuOpen((prev) => !prev)}
                        >
                          <span>Export</span>
                          <span className="map-button-caret" aria-hidden="true">v</span>
                        </button>
                        {isExportMenuOpen ? (
                          <div className="map-toolbar-popover map-export-menu">
                            <button
                              type="button"
                              className="map-menu-item"
                              disabled={!selectedProjectId}
                              onClick={() => {
                                setIsExportMenuOpen(false);
                                void onExportMm();
                              }}
                            >
                              FreeMind .mm
                            </button>
                            <button
                              type="button"
                              className="map-menu-item"
                              disabled={!selectedProjectId}
                              onClick={() => {
                                setIsExportMenuOpen(false);
                                void onExportMarkdown();
                              }}
                            >
                              Markdown .md
                            </button>
                            <button
                              type="button"
                              className="map-menu-item"
                              disabled={!selectedProjectId}
                              onClick={() => {
                                setIsExportMenuOpen(false);
                                void onExportNotionMarkdown();
                              }}
                            >
                              Notion .md
                            </button>
                            <button
                              type="button"
                              className="map-menu-item"
                              disabled={!tree}
                              onClick={() => {
                                setIsExportMenuOpen(false);
                                onExportImage('png');
                              }}
                            >
                              PNG
                            </button>
                            <button
                              type="button"
                              className="map-menu-item"
                              disabled={!tree}
                              onClick={() => {
                                setIsExportMenuOpen(false);
                                onExportImage('jpg');
                              }}
                            >
                              JPG
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {activeFilterChips.length > 0 ? (
                    <div className="map-filter-chips">
                      {activeFilterChips.map((chip) => (
                        <button key={chip.key} type="button" className="map-filter-chip" onClick={chip.onRemove}>
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {heatmapLegend.length > 0 ? (
                <div className="heatmap-legend">
                  {heatmapLegend.map((entry) => (
                    <div key={entry.label} className="heatmap-legend-item">
                      <span className={`heatmap-legend-swatch ${entry.className}`} />
                      <span>{entry.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="map-canvas-hint">
                Drag nodes to move • Double-click to rename • Right-click for actions
              </div>
              {isMapLoading ? (
                <div className="map-loader">
                  <div className="map-loader-spinner" />
                  <h3>{loaderDisplay.title}</h3>
                  <p>{loaderDisplay.body}</p>
                </div>
              ) : tree ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  style={{ width: '100%', height: '100%', position: 'relative', zIndex: 20 }}
                  onNodesChange={onNodesChange}
                  onInit={(instance) => {
                    setFlowInstance(instance);
                    instance.setViewport({ x: 160, y: 180, zoom: 1 });
                  }}
                  onNodeDrag={(_event, node) => {
                    const target = pickNearestValidTarget(node as MindNode);
                    setDropTargetId(target?.id ?? null);
                  }}
                  onNodeDragStop={(_event, node) => {
                    const next = {
                      ...nodePositions,
                      [node.id]: { x: node.position.x, y: node.position.y },
                    };
                    setNodePositions(next);
                    if (selectedProjectId) {
                      persistPositions(selectedProjectId, next);
                    }

                    if (!tree || !flowInstance || node.id === 'root') {
                      setDropTargetId(null);
                      return;
                    }
                    const target = pickNearestValidTarget(node as MindNode);
                    setDropTargetId(null);
                    if (!target) return;

                    const sourceNode = findNode(tree, node.id);
                    const targetNode = findNode(tree, target.id);
                    if (!sourceNode || !targetNode) return;
                    if (containsNode(sourceNode, target.id)) return;
                    setPendingMove({
                      sourceId: sourceNode.id,
                      sourceText: sourceNode.text,
                      targetId: targetNode.id,
                      targetText: targetNode.text,
                    });
                  }}
                  defaultViewport={{ x: 160, y: 180, zoom: 1 }}
                  minZoom={0.1}
                  maxZoom={2.2}
                  defaultEdgeOptions={{ type: 'simplebezier' }}
                >
                  <Background color="#dce8f8" gap={24} />
                  <MiniMap pannable zoomable />
                  <Controls showInteractive={false} />
                </ReactFlow>
              ) : (
                <div className="map-empty-state">
                  <div className="map-empty-illustration" aria-hidden="true">
                    <div className="map-empty-center">Mind Map</div>
                    <div className="map-empty-branch map-empty-branch-left">Sources</div>
                    <div className="map-empty-branch map-empty-branch-right">Themes</div>
                    <div className="map-empty-branch map-empty-branch-bottom">Insights</div>
                  </div>
                  <h3>Create your first mind map</h3>
                  <p>Add sources on the left, then create a mind map to explore your ideas visually.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="vm-pane vm-pane-side">
          <div className="card history-card">
            <h3 className="panel-title panel-title-small">Recent Maps</h3>
            <p className="panel-subtitle">Your latest saved maps.</p>
            <div className="project-list">
              {visibleProjects.length === 0 ? <p className="hint">No maps yet.</p> : null}
              {visibleProjects.map((project) => (
                <div
                  key={project.id}
                  className={`project-item ${selectedProjectId === project.id ? 'active' : ''} ${project.current_tree_json ? '' : 'is-failed'}`}
                >
                  <button
                    className="project-item-main"
                    onClick={async () => {
                      setIsMapLoading(true);
                      try {
                        const nextTree = normalizeTree(project.current_tree_json);
                        setSelectedProjectId(project.id);
                        setTree(nextTree);
                        setSelectedNodeId(nextTree?.id ?? null);
                        setExpandedForTree(nextTree);
                        setProjectTitle(recentMapTitle(project));
                        setDraftSessions([]);
                        setHasSourceChanges(false);
                        await loadSources(project.id);
                        setRawText('');
                        setSourceTitle('');
                        setIsAddTextOpen(false);
                        setEditingSource(null);
                        setStatus(
                          project.current_tree_json
                            ? `Loaded "${recentMapTitle(project)}"`
                            : `Loaded failed project "${recentMapTitle(project)}". Click Generate Mind Map to retry.`,
                        );
                      } catch (error) {
                        const message = extractErrorMessage(error);
                        setStatus(`Load project failed: ${message}`);
                      } finally {
                        setIsMapLoading(false);
                      }
                    }}
                  >
                    <div className="project-item-copy">
                      <div className="project-item-title-row">
                        <span className="project-title">{recentMapTitle(project)}</span>
                        {!project.current_tree_json ? <span className="project-flag-failed">Failed</span> : null}
                      </div>
                      <div className="project-preview">
                        {(project.raw_text || 'No source preview').replace(/\s+/g, ' ').trim().slice(0, 84)}
                        {(project.raw_text || '').length > 84 ? '...' : ''}
                      </div>
                    </div>
                  </button>
                  {editingRecentMapId === project.id ? (
                    <div className="project-item-rename">
                      <input
                        value={editingRecentMapTitle}
                        onChange={(event) => setEditingRecentMapTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveRecentMapRename(project.id);
                          }
                          if (event.key === 'Escape') {
                            setEditingRecentMapId(null);
                            setEditingRecentMapTitle('');
                          }
                        }}
                      />
                      <button
                        className="btn-ghost"
                        type="button"
                        onClick={() => void saveRecentMapRename(project.id)}
                        disabled={renamingRecentMapId === project.id}
                      >
                        {renamingRecentMapId === project.id ? '...' : 'Save'}
                      </button>
                      <button
                        className="btn-ghost"
                        type="button"
                        onClick={() => {
                          setEditingRecentMapId(null);
                          setEditingRecentMapTitle('');
                        }}
                        disabled={renamingRecentMapId === project.id}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="project-actions">
                      <button className="btn-ghost" type="button" onClick={() => startRecentMapRename(project)}>
                        Edit
                      </button>
                      <button
                        className="btn-ghost danger"
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            projectId: project.id,
                            projectTitle: recentMapTitle(project),
                          })
                        }
                        disabled={deletingProjectId === project.id}
                        aria-label={`Delete ${recentMapTitle(project)}`}
                      >
                        {deletingProjectId === project.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div ref={studyToolsRef} className={`card assets-card ${studyToolsSpotlight ? 'spotlight' : ''}`}>
            <div className="assets-header">
              <div className="assets-header-copy">
                <h3 className="panel-title panel-title-small">Feature Requests</h3>
                <p className="panel-subtitle">Tell us what you want next.</p>
              </div>
            </div>
            <div className="feature-request-card">
              <button className="feature-btn" type="button" onClick={openFeatureRequestModal}>
                Request a Feature
              </button>
            </div>
          </div>
        </section>
      </main>

      {pendingMove ? (
        <div className="move-modal-backdrop">
          <div className="move-modal">
            <h3>Confirm Move</h3>
            <p>
              Move <strong>{pendingMove.sourceText}</strong> under{' '}
              <strong>{pendingMove.targetText}</strong>?
            </p>
            <div className="actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setPendingMove(null);
                  setStatus('Move cancelled');
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  applyTreeMove(pendingMove.sourceId, pendingMove.targetId);
                  setPendingMove(null);
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUpgradeOfferOpen ? (
        <div className="move-modal-backdrop">
          <div className="move-modal upgrade-modal">
            <div className="upgrade-hero">
              <p className="upgrade-kicker">VisualMind Pro</p>
              <h3>Upgrade to VisualMind Pro</h3>
              <p>
                Remove free-plan limits and unlock a more flexible workflow for larger projects.
              </p>
            </div>
            <div className="upgrade-benefits">
              <div className="upgrade-benefit">
                <strong>More generation capacity</strong>
                <span>Handle larger projects with expanded access and fewer limits.</span>
              </div>
              <div className="upgrade-benefit">
                <strong>Unlimited sources</strong>
                <span>Add as many source sessions as you need for one map.</span>
              </div>
              <div className="upgrade-benefit">
                <strong>Bigger input limits</strong>
                <span>Longer source text support per session.</span>
              </div>
            </div>
            <div className="upgrade-checkout-row">
              <div>
                <p className="upgrade-price">$8/month</p>
                <p className="upgrade-price-sub">Cancel anytime</p>
              </div>
              <button
                className="btn btn-primary upgrade-continue-btn"
                type="button"
                onClick={() => void continueUpgradeFlow()}
                disabled={upgradeBusy}
              >
                {upgradeBusy ? 'Checking...' : 'Continue'}
              </button>
            </div>
            <div className="actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setIsUpgradeOfferOpen(false)}
                disabled={upgradeBusy}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isMvpUpgradeOpen ? (
        <div className="move-modal-backdrop">
          <div className="move-modal upgrade-modal mvp-upgrade-modal">
            <div className="upgrade-hero">
              <p className="upgrade-kicker">Early User Offer</p>
              <h3>We are in MVP: Enjoy 1 Month Free Pro</h3>
              <p>
                For now, early users get full Pro access free for one month while we finish billing rollout.
              </p>
            </div>
            <div className="upgrade-benefits">
              <div className="upgrade-benefit">
                <strong>Full Pro access now</strong>
                <span>Expanded limits unlock immediately.</span>
              </div>
            </div>
            <div className="actions">
              <button
                className="btn btn-primary upgrade-continue-btn"
                type="button"
                onClick={() => void claimMvpUpgrade()}
                disabled={upgradeBusy}
              >
                {upgradeBusy ? 'Upgrading...' : 'Activate Free Month'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setIsMvpUpgradeOpen(false)}
                disabled={upgradeBusy}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFeatureRequestOpen ? (
        <div className="move-modal-backdrop">
          <div className="move-modal source-editor-modal">
            <h3>Email Feature Request</h3>
            <div className="add-source-panel">
              <p className="hint">Describe the feature you want in this section.</p>
              <textarea
                name="feature-request-message"
                autoComplete="off"
                aria-label="Feature request message"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                placeholder="Type your feature request here..."
                value={featureRequestMessage}
                onChange={(event) => {
                  setFeatureRequestMessage(event.target.value);
                  if (featureRequestFeedback?.tone === 'error') {
                    setFeatureRequestFeedback(null);
                  }
                }}
                rows={8}
              />
              <p className="hint">{featureRequestMessage.trim().length}/2000 characters</p>
              {featureRequestFeedback ? (
                <p className={`hint ${featureRequestFeedback.tone}`}>
                  {featureRequestFeedback.message}
                </p>
              ) : null}
              <div className="actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={submitFeatureRequest}
                  disabled={sendingFeatureRequest}
                >
                  {sendingFeatureRequest ? 'Sending...' : 'Send Request'}
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setIsFeatureRequestOpen(false);
                    setFeatureRequestMessage('');
                    setFeatureRequestFeedback(null);
                  }}
                  disabled={sendingFeatureRequest}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAddTextOpen ? (
        <div className="move-modal-backdrop">
          <div className="move-modal source-editor-modal">
            <h3>
              {editingSource
                ? 'Edit Source'
                : sourceEditorMode === 'web'
                  ? 'Add Web Source'
                  : 'Add Text Source'}
            </h3>
            <div className="add-source-panel">
              {sourceEditorMode === 'web' ? (
                <>
                  <input
                    name="source-title"
                    autoComplete="off"
                    aria-label="Source title"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Source title (optional)"
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                  />
                  <input
                    name="source-web-url"
                    autoComplete="url"
                    type="url"
                    aria-label="Source webpage URL"
                    inputMode="url"
                    enterKeyHint="go"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Paste a public webpage URL"
                    value={webUrl}
                    onChange={(e) => setWebUrl(e.target.value)}
                  />
                  <p className="hint">Notion content needs to be pasted directly.</p>
                </>
              ) : (
                <>
                  <input
                    name="source-title"
                    autoComplete="off"
                    aria-label="Source title"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Source title (optional)"
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                  />
                  <textarea
                    name="source-raw-text"
                    autoComplete="off"
                    aria-label="Source text"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    placeholder="Paste one article, transcript section, notes chunk, or brainstorm here..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    rows={10}
                  />
                  <p className={`hint ${isOverTextLimit ? 'error' : ''}`}>
                    {rawTextLength}/{limits.maxTextChars} characters
                    {isOverTextLimit
                      ? ' · Over your plan limit. Upgrade or split into sessions.'
                      : ` · ${remainingChars} left`}
                  </p>
                  <p className={`hint warning ${isOverCombinedLimit ? 'error' : ''}`}>
                    Combined sources: {projectedCombinedWords}/{TOTAL_PROJECT_WORD_LIMIT} words
                    {isOverCombinedLimit ? ' · Over project limit.' : ` · ${remainingCombinedWords} left`}
                  </p>
                  {isOverTextLimit ? (
                    <div className="limit-box">
                      <h4>Text too long for your plan</h4>
                      <p>
                        Your plan supports up to {limits.maxTextChars} characters per session. Upgrade for longer input, or
                        split content into sessions and combine.
                      </p>
                    </div>
                  ) : null}
                  {isOverCombinedLimit ? (
                    <div className="limit-box">
                      <h4>Project total limit reached</h4>
                      <p>
                        A project supports up to {TOTAL_PROJECT_WORD_LIMIT} combined words across all added sources.
                      </p>
                      {userPlan === 'free' ? (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => setIsUpgradeOfferOpen(true)}
                        >
                          Upgrade to continue
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              <div className="actions">
                {sourceEditorMode === 'web' ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => void onImportWeb(webUrl.trim())}
                    disabled={!isWebUrlValid || busy}
                  >
                    Fetch page
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={onAddSession}
                    disabled={!rawText.trim() || busy || isOverCombinedLimit}
                  >
                    Save your edit
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={resetSourceEditor}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="move-modal-backdrop">
          <div className="move-modal">
            <h3>Delete Map</h3>
            <p>
              Delete <strong>{pendingDelete.projectTitle}</strong>? This cannot be undone.
            </p>
            <div className="actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setPendingDelete(null);
                }}
                disabled={deletingProjectId === pendingDelete.projectId}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void deleteRecentMap(pendingDelete.projectId, pendingDelete.projectTitle)}
                disabled={deletingProjectId === pendingDelete.projectId}
              >
                {deletingProjectId === pendingDelete.projectId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {nodeContextMenu ? (
        <div
          className="node-context-menu"
          style={{ top: nodeContextMenu.y, left: nodeContextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="node-context-menu-item"
            onClick={() => {
              void applyNodeAdd(nodeContextMenu.nodeId, nodeContextMenu.nodeText);
            }}
          >
            Add child node
          </button>
          <button
            type="button"
            className="node-context-menu-item"
            onClick={() => {
              void applyNodeTags(nodeContextMenu.nodeId, nodeContextMenu.nodeText);
            }}
          >
            Add tags
          </button>
          <div className="node-context-menu-group">
            <span className="node-context-menu-label">Priority</span>
            <div className="node-context-menu-pills">
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { priority: 'high' }, { colorBy: 'priority' });
                }}
              >
                High
              </button>
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { priority: 'critical' }, { colorBy: 'priority' });
                }}
              >
                Critical
              </button>
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { priority: undefined }, { colorBy: 'priority' });
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="node-context-menu-group">
            <span className="node-context-menu-label">Status</span>
            <div className="node-context-menu-pills">
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { status: 'active' }, { colorBy: 'status' });
                }}
              >
                Active
              </button>
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { status: 'done' }, { colorBy: 'status' });
                }}
              >
                Done
              </button>
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { status: 'blocked' }, { colorBy: 'status' });
                }}
              >
                Blocked
              </button>
              <button
                type="button"
                className="node-context-menu-pill"
                onClick={() => {
                  void applyNodeProperties(nodeContextMenu.nodeId, nodeContextMenu.nodeText, { status: undefined }, { colorBy: 'status' });
                }}
              >
                Clear
              </button>
            </div>
          </div>
          {nodeContextMenu.canDelete ? (
            <button
              type="button"
              className="node-context-menu-item danger"
              onClick={() => {
                setPendingNodeDelete({
                  nodeId: nodeContextMenu.nodeId,
                  nodeText: nodeContextMenu.nodeText,
                });
                setNodeContextMenu(null);
              }}
            >
              Delete node
            </button>
          ) : null}
        </div>
      ) : null}

      {pendingNodeDelete ? (
        <div className="move-modal-backdrop">
          <div className="move-modal">
            <h3>Delete Node</h3>
            <p>
              Delete <strong>{pendingNodeDelete.nodeText}</strong> and its child nodes? This cannot be undone.
            </p>
            <div className="actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setPendingNodeDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void applyNodeDelete(pendingNodeDelete.nodeId, pendingNodeDelete.nodeText);
                }}
              >
                Delete Node
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
