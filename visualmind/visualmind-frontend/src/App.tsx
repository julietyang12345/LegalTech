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
  api,
  type FlashcardDeck,
  type ProjectSource,
  type SlideDeck,
  type TreeNode,
  type UsageLimits,
  type UserPlan,
  type VmProject,
} from './api';

const HORIZONTAL_GAP = 290;
const VERTICAL_GAP = 110;

type NodePosition = { x: number; y: number };

type MindNodeData = {
  label: string;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: (nodeId: string) => void;
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
type AssetMode = 'slides' | 'flashcards';
type EditingSource =
  | { scope: 'persisted'; id: string }
  | { scope: 'draft'; id: string }
  | null;
type DraftSource = {
  id: string;
  title: string;
  contentText: string;
  kind: 'text';
};

const defaultLimits: UsageLimits = {
  maxTextChars: 5000,
  canImportPdf: true,
  canImportWeb: true,
  maxSourceSessions: 3,
};

const MindMapNode = ({ id, data }: NodeProps<MindNode>) => (
  <div className="mindmap-node">
    <Handle type="target" position={Position.Left} className="mindmap-handle" />
    {data.isEditing ? (
      <input
        className="mindmap-node-input nodrag"
        value={data.editValue}
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
        onDoubleClick={(event) => {
          event.stopPropagation();
          data.onStartEdit(id, data.label);
        }}
      >
        {data.label}
      </button>
    )}
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

const hasTree = (project: VmProject): boolean => Boolean(project.current_tree_json);

const normalizeTree = (value: unknown): TreeNode | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TreeNode;
    } catch {
      return null;
    }
  }
  return value as TreeNode;
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

const findNode = (node: TreeNode, nodeId: string): TreeNode | null => {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
};

const containsNode = (root: TreeNode, possibleDescendantId: string): boolean => {
  if (root.id === possibleDescendantId) return true;
  return root.children.some((child) => containsNode(child, possibleDescendantId));
};

const updateNodeTextById = (node: TreeNode, targetId: string, nextText: string): TreeNode => {
  if (node.id === targetId) {
    return { ...node, text: nextText };
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

const insertNodeAsChild = (node: TreeNode, targetId: string, toInsert: TreeNode): TreeNode => {
  if (node.id === targetId) {
    return { ...node, children: [...node.children, toInsert] };
  }
  return {
    ...node,
    children: node.children.map((child) => insertNodeAsChild(child, targetId, toInsert)),
  };
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

const layoutVisibleTree = (
  node: TreeNode,
  depth: number,
  expandedById: Record<string, boolean>,
  positionById: Record<string, NodePosition>,
  onToggle: (nodeId: string) => void,
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
        expandedById,
        positionById,
        onToggle,
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
      hasChildren: canExpand,
      expanded: isExpanded,
      onToggle,
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
  expandedById: Record<string, boolean>,
  positionById: Record<string, NodePosition>,
  onToggle: (nodeId: string) => void,
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
    expandedById,
    positionById,
    onToggle,
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
  const [rawText, setRawText] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [status, setStatus] = useState<string>('Checking auth...');
  const [busy, setBusy] = useState(false);
  const [hideFailedProjects, setHideFailedProjects] = useState(true);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [nodes, setNodes] = useState<MindNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<MindNode, Edge> | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [editingRecentMapId, setEditingRecentMapId] = useState<string | null>(null);
  const [editingRecentMapTitle, setEditingRecentMapTitle] = useState('');
  const [renamingRecentMapId, setRenamingRecentMapId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<EditingSource>(null);
  const [assetBusy, setAssetBusy] = useState<AssetMode | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [nodeEditText, setNodeEditText] = useState('');
  const [hasSourceChanges, setHasSourceChanges] = useState(false);
  const [studyToolsSpotlight, setStudyToolsSpotlight] = useState(false);
  const [activeAssetMode, setActiveAssetMode] = useState<AssetMode>('flashcards');
  const [slideDeck, setSlideDeck] = useState<SlideDeck | null>(null);
  const [flashcardDeck, setFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const studyToolsRef = useRef<HTMLDivElement | null>(null);
  const rawTextLength = rawText.length;
  const isOverTextLimit = rawTextLength > limits.maxTextChars;
  const remainingChars = Math.max(0, limits.maxTextChars - rawTextLength);
  const unsavedEditorText = isAddTextOpen ? rawText.trim() : '';
  const pendingSourceCount = draftSessions.length + (unsavedEditorText ? 1 : 0);
  const setExpandedForTree = (nextTree: TreeNode | null) => {
    setExpandedById(nextTree ? { [nextTree.id]: true } : {});
  };

  const showStudyToolsPanel = (mode: AssetMode) => {
    setActiveAssetMode(mode);
    setStudyToolsSpotlight(true);
    studyToolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => setStudyToolsSpotlight(false), 1200);
  };

  const visibleProjects = useMemo(
    () => projects.filter((project) => !hideFailedProjects || Boolean(project.current_tree_json)),
    [projects, hideFailedProjects],
  );

  const recentMapTitle = (project: VmProject): string => {
    const sourceTitle = project.primary_source_title?.trim();
    if (sourceTitle) return sourceTitle;
    return project.title;
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

      const dragWidth = dragNode.width ?? 220;
      const dragHeight = dragNode.height ?? 80;
      const dragCenterX = dragNode.position.x + dragWidth / 2;
      const dragCenterY = dragNode.position.y + dragHeight / 2;

      let best: MindNode | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        const width = candidate.width ?? 220;
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
    if (!tree) return { nodes: [], edges: [] };
    return createFlowGraph(
      tree,
      expandedById,
      nodePositions,
      toggleNode,
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
  }, [tree, expandedById, nodePositions, toggleNode, dropTargetId, editingNodeId, nodeEditText]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

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

  const loadProjects = async () => {
    const data = await api.listProjects();
    setProjects(data.projects);
    if (!selectedProjectId && data.projects[0]) {
      const preferred = data.projects.find(hasTree) ?? data.projects[0];
      const preferredTree = normalizeTree(preferred.current_tree_json);
      setSelectedProjectId(preferred.id);
      setTree(preferredTree);
      setExpandedForTree(preferredTree);
      const sources = await loadSources(preferred.id);
      const firstSource = sources[0];
      setProjectTitle(preferred.title);
      setRawText(firstSource?.content_text ?? preferred.raw_text ?? '');
      setSourceTitle(firstSource?.title ?? '');
      setIsAddTextOpen(false);
      setEditingSource(null);
      setHasSourceChanges(false);
    }
  };

  useEffect(() => {
    (async () => {
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
        setStatus('Please log in to generate mind maps.');
      }
    })();
  }, []);

  const onLogin = () => {
    const next = encodeURIComponent(window.location.href);
    window.location.href = `/login?next=${next}`;
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
    setBusy(true);
    setIsMapLoading(true);
    setTree(null);
    let createdProjectId: string | null = null;
    try {
      console.info('[VisualMind] create:start', {
        draftCount: draftSessions.length,
        hasUnsavedEditorText: Boolean(unsavedEditorText),
        sourceCount: sourceSessions.length,
      });
      setStatus('Creating project and generating mind map...');
      const finalTitle = projectTitle.trim() || inferTitle(sourceSessions[0] || '');
      const data = await api.createProject({
        title: finalTitle,
        rawText: sourceSessions[0] || '',
        sourceSessions: sourceSessions.slice(1),
      });
      createdProjectId = data.project.id;
      setSelectedProjectId(data.project.id);
      console.info('[VisualMind] create:project-created', { projectId: data.project.id });
      await loadSources(data.project.id);
      const generated = await api.generate(data.project.id);
      console.info('[VisualMind] create:generate-success', {
        projectId: data.project.id,
        version: generated.version,
        root: generated.tree?.text,
      });
      setTree(generated.tree);
      setExpandedForTree(generated.tree);
      setNodePositions({});
      setDraftSessions([]);
      setRawText('');
      setSourceTitle('');
      setIsAddTextOpen(false);
      setEditingSource(null);
      setHasSourceChanges(false);
      setStatus(`Created "${finalTitle}" and generated map`);
      await loadProjects();
    } catch (error) {
      console.error('[VisualMind] create:failed', error);
      if (createdProjectId) {
        try {
          await api.deleteProject(createdProjectId);
          if (selectedProjectId === createdProjectId) {
            setSelectedProjectId('');
            setTree(null);
          }
        } catch {
          // keep original error as primary status
        }
      }
      const message = extractErrorMessage(error);
      setStatus(`Create failed: ${message}`);
      await loadProjects();
    } finally {
      setIsMapLoading(false);
      setBusy(false);
    }
  };

  const ensureStudyToolReadyProject = (): string | null => {
    if (!isAuthenticated) {
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

  const onGenerateFlashcards = async () => {
    setAssetBusy('flashcards');
    try {
      const projectId = ensureStudyToolReadyProject();
      if (!projectId) return;
      const response = await api.generateFlashcards(projectId, { cardCount: 10 });
      setFlashcardDeck(response.flashcards);
      showStudyToolsPanel('flashcards');
      setStatus(`Generated ${response.flashcards.cards.length} flashcards`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Flashcards failed: ${message}`);
    } finally {
      setAssetBusy(null);
    }
  };

  const onGenerate = async () => {
    if (!selectedProjectId) {
      setStatus('Create a project first, then generate.');
      return;
    }
    setBusy(true);
    setIsMapLoading(true);
    setTree(null);
    try {
      console.info('[VisualMind] generate:start', {
        projectId: selectedProjectId,
        hasUnsavedEditorText: Boolean(unsavedEditorText),
        editorChars: unsavedEditorText.length,
      });
      setStatus('Generating mind map...');
      const data = await api.generate(selectedProjectId, unsavedEditorText || undefined);
      console.info('[VisualMind] generate:success', {
        projectId: selectedProjectId,
        version: data.version,
        root: data.tree?.text,
      });
      setTree(data.tree);
      setExpandedForTree(data.tree);
      setNodePositions({});
      persistPositions(selectedProjectId, {});
      setHasSourceChanges(false);
      setStatus(`Generated version ${data.version}`);
      await loadProjects();
    } catch (error) {
      console.error('[VisualMind] generate:failed', error);
      const message = extractErrorMessage(error);
      setStatus(`Generate failed: ${message}`);
    } finally {
      setIsMapLoading(false);
      setBusy(false);
    }
  };

  const onPrimaryMapAction = () => {
    console.info('[VisualMind] primary-action:clicked', {
      selectedProjectId,
      draftCount: draftSessions.length,
      hasUnsavedEditorText: Boolean(unsavedEditorText),
      busy,
      isMapLoading,
    });
    if (!isAuthenticated) {
      setStatus('Please log in to generate your mind map.');
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

  const onPdfSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const result = await api.importPdf(file);
      setRawText(result.text);
      setSourceTitle(file.name.replace(/\.pdf$/i, ''));
      setEditingSource(null);
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
      setEditingSource(null);
      setIsAddTextOpen(true);
      setStatus('Imported webpage content');
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
      setEditingSource(null);
      setIsAddTextOpen(true);
      setStatus(`Imported Markdown: ${file.name}`);
    } catch {
      setStatus('Markdown import failed');
    } finally {
      event.target.value = '';
    }
  };

  const onExportMm = async () => {
    if (!isAuthenticated) {
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
    if (!isAuthenticated) {
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
    if (!isAuthenticated) {
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
    if (!isAuthenticated) {
      setStatus('Please log in to export your mind map.');
      onLogin();
      return;
    }
    if (!nodes.length) return;

    const defaultNodeWidth = 220;
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

  const removeDraftSource = (id: string) => {
    setDraftSessions((prev) => prev.filter((source) => source.id !== id));
  };

  const deleteRecentMap = async (projectId: string, projectTitle: string) => {
    setDeletingProjectId(projectId);
    try {
      await api.deleteProject(projectId);
      if (selectedProjectId === projectId) {
        setSelectedProjectId('');
        setTree(null);
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
    setIsAddTextOpen(true);
    setEditingSource({ scope: 'persisted', id: source.id });
    setStatus(`Loaded source "${source.title}" into editor`);
  };

  const removePersistedSource = async (source: ProjectSource) => {
    if (!selectedProjectId) return;

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
      const message = extractErrorMessage(error);
      setStatus(`Remove source failed: ${message}`);
    }
  };

  return (
    <div className="vm-shell">
      <header className="vm-topbar">
        <div>
          <h1>VisualMind</h1>
          <p>Paste large text. Click once. Get a structured mind map.</p>
        </div>
        <div className="vm-topbar-right">
          <span className="status-chip">{status}</span>
          {!isAuthenticated ? (
            <button className="btn btn-ghost" type="button" onClick={onLogin}>
              Log in
            </button>
          ) : null}
          {userEmail ? <span className="status-chip user">{userEmail}</span> : null}
        </div>
      </header>

      <main className="vm-grid">
        <section className="vm-pane vm-pane-left">
          <div className="card composer-card">
            <div className="composer-intro">
              <h2>Sources</h2>
              <p>Collect the content you want Mind Map to turn into one structured map.</p>
            </div>
            <div className="composer-source-entry">
              <button
                className="source-add-btn"
                type="button"
                onClick={() => {
                  setEditingSource(null);
                  setSourceTitle('');
                  setRawText('');
                  setIsAddTextOpen(true);
                }}
              >
                Add source text
              </button>
            </div>
            <div className="actions source-tools">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  document.getElementById('md-upload-input')?.click();
                }}
                disabled={busy}
              >
                Import Markdown
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  document.getElementById('pdf-upload-input')?.click();
                }}
                disabled={busy}
              >
                Import PDF
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const url = window.prompt('Enter webpage URL');
                  if (url) void onImportWeb(url);
                }}
                disabled={busy}
              >
                Import Webpage
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
            <div className="session-list">
              {selectedProjectId ? (
                <>
                  <h4>Added Sources ({persistedSources.length})</h4>
                  {persistedSources.length === 0 ? <p className="hint">No added sources yet.</p> : null}
                  {persistedSources.map((source, index) => (
                    <div key={source.id} className="session-item">
                      <div>
                        <div className="session-item-title">{source.title || `Source ${index + 1}`}</div>
                        <div className="session-item-meta">
                          {source.kind === 'pdf' ? 'PDF' : source.kind === 'url' ? 'Web' : 'Text'} source · {source.content_text.length} chars
                        </div>
                      </div>
                      <div className="actions">
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
                  <h4>Added Sources ({draftSessions.length})</h4>
                  {draftSessions.length === 0 ? <p className="hint">Add a source to get started.</p> : null}
                  {draftSessions.map((session, index) => (
                    <div key={session.id} className="session-item">
                      <div>
                        <div className="session-item-title">{session.title || `Source ${index + 1}`}</div>
                        <div className="session-item-meta">Text source · {session.contentText.length} chars</div>
                      </div>
                      <button className="btn btn-ghost" type="button" onClick={() => removeDraftSource(session.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="primary-actions">
              <button
                className={`btn btn-map-action btn-map-primary ${busy ? 'is-generating' : ''}`}
                onClick={onPrimaryMapAction}
                disabled={busy || (isAuthenticated && !selectedProjectId && pendingSourceCount === 0)}
              >
                {!isAuthenticated
                  ? 'Log in to Create Mind Map'
                  : selectedProjectId
                    ? hasSourceChanges
                      ? 'Update your mind map'
                      : 'Generate Mind Map'
                    : 'Create Mind Map'}
              </button>
              {!isAuthenticated ? (
                <p className="auth-helper">Add your sources now, then log in to generate and save your map.</p>
              ) : null}
            </div>
            <div className="mindmao-tools">
              <div className="mindmao-tools-header">
                <div>
                  <p className="mindmao-kicker">Mind Map Outputs</p>
                  <h3>Tools from your map</h3>
                </div>
                <span className={`mindmao-badge ${tree ? 'ready' : 'locked'}`}>{tree ? 'Unlocked' : 'Locked'}</span>
              </div>
              {/* Mind Map Slides temporarily disabled */}
              <div className={`tool-card ${tree ? 'ready' : 'locked'}`}>
                <div className="tool-card-copy">
                  <div className="tool-card-title-row">
                    <h4>Mind Map Flashcards</h4>
                    <span className="tool-pill">Review</span>
                  </div>
                  <p>Convert the map into fast study prompts and answer cards based on the main branches.</p>
                  <small>
                    {tree
                      ? 'Available because this project already has a generated mind map.'
                      : 'Generate a mind map first to unlock flashcards.'}
                  </small>
                </div>
                <div
                  className={`tool-card-action ${
                    busy || assetBusy !== null || !isAuthenticated || !selectedProjectId || !tree ? 'disabled' : ''
                  }`}
                  role="button"
                  tabIndex={busy || assetBusy !== null || !isAuthenticated || !selectedProjectId || !tree ? -1 : 0}
                  onClick={() => {
                    if (busy || assetBusy !== null || !isAuthenticated || !selectedProjectId || !tree) return;
                    void onGenerateFlashcards();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (busy || assetBusy !== null || !isAuthenticated || !selectedProjectId || !tree) return;
                    void onGenerateFlashcards();
                  }}
                >
                  {assetBusy === 'flashcards' ? 'Generating...' : 'Generate Flashcards'}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="vm-pane vm-pane-main">
          <div className="card map-card">
            <div className="map-header">
              <div className="map-header-copy">
                <h2>Your Mind Map</h2>
              </div>
              <div className="actions map-export-actions">
                <button
                  type="button"
                  className={`btn btn-export ${selectedProjectId ? '' : 'disabled'}`}
                  onClick={() => void onExportMm()}
                >
                  Export .mm
                </button>
                <button
                  type="button"
                  className={`btn btn-export ${selectedProjectId ? '' : 'disabled'}`}
                  onClick={() => void onExportMarkdown()}
                >
                  Export .md
                </button>
                <button
                  type="button"
                  className={`btn btn-export ${selectedProjectId ? '' : 'disabled'}`}
                  onClick={() => void onExportNotionMarkdown()}
                >
                  Notion .md
                </button>
                <button
                  type="button"
                  className={`btn btn-export ${tree ? '' : 'disabled'}`}
                  onClick={() => onExportImage('png')}
                >
                  Export PNG
                </button>
                <button
                  type="button"
                  className={`btn btn-export ${tree ? '' : 'disabled'}`}
                  onClick={() => onExportImage('jpg')}
                >
                  Export JPG
                </button>
              </div>
            </div>
            <p className="map-interaction-hint">Drag nodes to move. Double-click node text to edit. Use &gt; / &lt; to collapse or expand branches.</p>
            <div className="map-canvas">
              {isMapLoading ? (
                <div className="map-loader">
                  <div className="map-loader-spinner" />
                  <h3>Building your mind map</h3>
                  <p>Combining sources and generating a fresh structure...</p>
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
                <p className="empty">Mind map appears here after you click Create Mind Map.</p>
              )}
            </div>
          </div>
        </section>

        <section className="vm-pane vm-pane-side">
          <div className="card history-card">
            <h3>Recent Maps</h3>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={hideFailedProjects}
                onChange={(e) => setHideFailedProjects(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              Hide failed projects
            </label>
            <div className="project-list">
              {visibleProjects.length === 0 ? <p>No maps yet.</p> : null}
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
                        setExpandedForTree(nextTree);
                        setProjectTitle(recentMapTitle(project));
                        setDraftSessions([]);
                        setHasSourceChanges(false);
                        const sources = await loadSources(project.id);
                        const firstSource = sources[0];
                        setRawText(firstSource?.content_text ?? project.raw_text ?? '');
                        setSourceTitle(firstSource?.title ?? '');
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
                    <span>{recentMapTitle(project)}</span>
                    {!project.current_tree_json ? <span style={{ marginLeft: 8, color: '#9b2c2c', fontWeight: 700 }}>Failed</span> : null}
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
                        className="project-item-edit"
                        type="button"
                        onClick={() => void saveRecentMapRename(project.id)}
                        disabled={renamingRecentMapId === project.id}
                      >
                        {renamingRecentMapId === project.id ? '...' : 'Save'}
                      </button>
                      <button
                        className="project-item-edit"
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
                    <button className="project-item-edit" type="button" onClick={() => startRecentMapRename(project)}>
                      Edit
                    </button>
                  )}
                  <button
                    className="project-item-delete"
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
              ))}
            </div>
          </div>

          <div ref={studyToolsRef} className={`card assets-card ${studyToolsSpotlight ? 'spotlight' : ''}`}>
            <div className="assets-header">
              <div className="assets-header-copy">
              <h3>Mind Map Tools</h3>
                <p>Generate slides or flashcards from your current map.</p>
              </div>
              <span className={`asset-status-badge ${tree ? 'ready' : 'locked'}`}>
                {tree ? 'Ready' : 'Locked'}
              </span>
            </div>
            <div className="asset-tabs" role="tablist" aria-label="Tools tabs">
              {/* Slides tab temporarily disabled */}
              <button
                type="button"
                role="tab"
                aria-selected={activeAssetMode === 'flashcards'}
                aria-controls="study-tab-flashcards"
                className={`asset-tab ${activeAssetMode === 'flashcards' ? 'active' : ''}`}
                onClick={() => setActiveAssetMode('flashcards')}
              >
                Flashcards
              </button>
            </div>
            {flashcardDeck ? (
              <div className="asset-list" id="study-tab-flashcards" role="tabpanel">
                <p className="asset-title">{flashcardDeck.title}</p>
                {flashcardDeck.cards.map((card, index) => (
                  <div className="flashcard" key={`${card.front}-${index}`}>
                    <div className="flashcard-front">Q{index + 1}: {card.front}</div>
                    <div className="flashcard-back">{card.back}</div>
                    {card.hint ? <p className="flashcard-hint">Hint: {card.hint}</p> : null}
                    {card.difficulty ? <p className="flashcard-meta">Difficulty: {card.difficulty}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="asset-empty-state" id="study-tab-flashcards" role="tabpanel">
                <div className="asset-empty-icon">🗂️</div>
                <h4>No flashcards generated yet</h4>
                <p>
                  {tree
                    ? 'Use Generate Flashcards from the left panel to create review cards from this mind map.'
                    : 'Create a mind map first, then generate flashcards.'}
                </p>
              </div>
            )}
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

      {isAddTextOpen ? (
        <div className="move-modal-backdrop">
          <div className="move-modal source-editor-modal">
            <h3>{editingSource ? 'Edit Source' : 'Add Text Source'}</h3>
            <div className="add-source-panel">
              <input
                placeholder="Source title (optional)"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
              <textarea
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
              {isOverTextLimit ? (
                <div className="limit-box">
                  <h4>Text too long for your plan</h4>
                  <p>
                    Your plan supports up to {limits.maxTextChars} characters per session. Upgrade for longer input, or
                    split content into sessions and combine.
                  </p>
                </div>
              ) : null}
              <div className="actions">
                <button className="btn btn-primary" onClick={onAddSession} disabled={!rawText.trim() || busy}>
                  Save your edit
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setIsAddTextOpen(false);
                    setRawText('');
                    setSourceTitle('');
                    setEditingSource(null);
                  }}
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
    </div>
  );
};
