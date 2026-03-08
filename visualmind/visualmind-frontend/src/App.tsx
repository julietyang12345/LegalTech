import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
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
    <div className="mindmap-node-label">{data.label}</div>
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
  dropTargetId?: string | null,
): { nodes: MindNode[]; edges: Edge[] } => {
  const nodes: MindNode[] = [];
  const edges: Edge[] = [];

  layoutVisibleTree(root, 0, expandedById, positionById, onToggle, nodes, edges, { y: 40 });
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
  const [editingSource, setEditingSource] = useState<EditingSource>(null);
  const [assetBusy, setAssetBusy] = useState<AssetMode | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [activeAssetMode, setActiveAssetMode] = useState<AssetMode>('slides');
  const [slideDeck, setSlideDeck] = useState<SlideDeck | null>(null);
  const [flashcardDeck, setFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const rawTextLength = rawText.length;
  const isOverTextLimit = rawTextLength > limits.maxTextChars;
  const remainingChars = Math.max(0, limits.maxTextChars - rawTextLength);
  const unsavedEditorText = isAddTextOpen ? rawText.trim() : '';
  const pendingSourceCount = draftSessions.length + (unsavedEditorText ? 1 : 0);

  const visibleProjects = useMemo(
    () => projects.filter((project) => !hideFailedProjects || Boolean(project.current_tree_json)),
    [projects, hideFailedProjects],
  );

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
    return createFlowGraph(tree, expandedById, nodePositions, toggleNode, dropTargetId);
  }, [tree, expandedById, nodePositions, toggleNode, dropTargetId]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodePositions({});
      setPersistedSources([]);
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
      setSelectedProjectId(preferred.id);
      setTree(normalizeTree(preferred.current_tree_json));
      setExpandedById({});
      const sources = await loadSources(preferred.id);
      const firstSource = sources[0];
      setProjectTitle(preferred.title);
      setRawText(firstSource?.content_text ?? preferred.raw_text ?? '');
      setSourceTitle(firstSource?.title ?? '');
      setIsAddTextOpen(true);
      setEditingSource(firstSource ? { scope: 'persisted', id: firstSource.id } : null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.me();
        setUserEmail(profile.user.email);
        setUserPlan(profile.user.plan ?? 'free');
        setLimits(profile.user.limits ?? defaultLimits);
        setStatus('Ready');
        await loadProjects();
      } catch {
        setStatus('Not authenticated. Please log in from your existing auth app first.');
      }
    })();
  }, []);

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
    let createdProjectId: string | null = null;
    try {
      setStatus('Creating project and generating mind map...');
      const finalTitle = projectTitle.trim() || inferTitle(sourceSessions[0] || '');
      const data = await api.createProject({
        title: finalTitle,
        rawText: sourceSessions[0] || '',
        sourceSessions: sourceSessions.slice(1),
      });
      createdProjectId = data.project.id;
      setSelectedProjectId(data.project.id);
      await loadSources(data.project.id);
      const generated = await api.generate(data.project.id);
      setTree(generated.tree);
      setExpandedById({});
      setNodePositions({});
      setDraftSessions([]);
      setRawText('');
      setSourceTitle('');
      setIsAddTextOpen(false);
      setEditingSource(null);
      setStatus(`Created "${finalTitle}" and generated map`);
      await loadProjects();
    } catch (error) {
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
      setBusy(false);
    }
  };

  const ensureAssetProject = async (): Promise<string | null> => {
    if (selectedProjectId) return selectedProjectId;
    const sourceSessions = [
      ...draftSessions.map((s) => s.contentText).filter(Boolean),
      ...(unsavedEditorText ? [unsavedEditorText] : []),
    ];
    if (sourceSessions.length === 0) {
      setStatus('Add at least one source before generating slides or flashcards.');
      return null;
    }

    const finalTitle = projectTitle.trim() || inferTitle(sourceSessions[0]);
    const data = await api.createProject({
      title: finalTitle,
      rawText: sourceSessions[0],
      sourceSessions: sourceSessions.slice(1),
    });
    setSelectedProjectId(data.project.id);
    setDraftSessions([]);
    setRawText('');
    setSourceTitle('');
    setIsAddTextOpen(false);
    setEditingSource(null);
    await loadProjects();
    return data.project.id;
  };

  const onGenerateSlides = async () => {
    setAssetBusy('slides');
    try {
      const projectId = await ensureAssetProject();
      if (!projectId) return;
      const response = await api.generateSlides(projectId, { slideCount: 6 });
      setSlideDeck(response.slides);
      setActiveAssetMode('slides');
      setStatus(`Generated ${response.slides.slides.length} AI slides`);
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Slides failed: ${message}`);
    } finally {
      setAssetBusy(null);
    }
  };

  const onGenerateFlashcards = async () => {
    setAssetBusy('flashcards');
    try {
      const projectId = await ensureAssetProject();
      if (!projectId) return;
      const response = await api.generateFlashcards(projectId, { cardCount: 10 });
      setFlashcardDeck(response.flashcards);
      setActiveAssetMode('flashcards');
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
    try {
      setStatus('Generating mind map...');
      const data = await api.generate(selectedProjectId, unsavedEditorText || undefined);
      setTree(data.tree);
      setExpandedById({});
      setNodePositions({});
      persistPositions(selectedProjectId, {});
      setStatus(`Generated version ${data.version}`);
      await loadProjects();
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Generate failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const onPrimaryMapAction = () => {
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
        await api.updateSource(selectedProjectId, editingSource.id, {
          title: sourceTitle.trim() || inferTitle(text),
          contentText: text,
        });
      } else {
        await api.addSource(selectedProjectId, {
          kind: 'text',
          title: sourceTitle.trim() || inferTitle(text),
          contentText: text,
        });
      }
      setRawText('');
      setSourceTitle('');
      setEditingSource(null);
      setIsAddTextOpen(false);
      await loadSources(selectedProjectId);
      setStatus(editingSource?.scope === 'persisted' ? 'Saved source edit' : 'Added source');
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

  const onSaveTree = async () => {
    if (!selectedProjectId || !tree) return;
    setBusy(true);
    try {
      await api.saveTree(selectedProjectId, tree);
      setStatus('Tree saved');
      await loadProjects();
    } catch (error) {
      const message = extractErrorMessage(error);
      setStatus(`Save failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const onSaveLayout = () => {
    if (!selectedProjectId) return;
    persistPositions(selectedProjectId, nodePositions);
    setStatus('Layout saved locally in this browser');
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
          {userEmail ? <span className="status-chip user">{userEmail}</span> : null}
        </div>
      </header>

      <main className="vm-grid">
        <section className="vm-pane vm-pane-left">
          <div className="card composer-card">
            <div className="composer-intro">
              <h2>Sources</h2>
              <p>
                Add content chunks, PDFs, or webpages to combine into one mind map. Plan:{' '}
                <strong>{userPlan.toUpperCase()}</strong>
              </p>
            </div>
            <div className="composer-top-fields">
              <input
                placeholder="Mind map title (optional)"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
              />
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
                {rawText.trim() ? 'Edit pasted text' : '+ Add pasted text'}
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
                Import .md
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  document.getElementById('pdf-upload-input')?.click();
                }}
                disabled={busy}
              >
                PDF Import
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const url = window.prompt('Enter webpage URL');
                  if (url) void onImportWeb(url);
                }}
                disabled={busy}
              >
                Web Import
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
                          View
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
            <div className="actions primary-actions">
              <button
                className="btn btn-primary"
                onClick={onPrimaryMapAction}
                disabled={busy || (!selectedProjectId && pendingSourceCount === 0)}
              >
                {busy ? 'Generating...' : selectedProjectId ? 'Generate Mind Map' : 'Create Mind Map'}
              </button>
            </div>
            <div className="secondary-tools">
              <span>Study tools:</span>
              <button
                className="btn btn-ghost"
                onClick={onGenerateSlides}
                disabled={busy || assetBusy !== null || (!selectedProjectId && pendingSourceCount === 0)}
              >
                {assetBusy === 'slides' ? 'Generating Slides...' : 'AI Slides'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={onGenerateFlashcards}
                disabled={busy || assetBusy !== null || (!selectedProjectId && pendingSourceCount === 0)}
              >
                {assetBusy === 'flashcards' ? 'Generating Flashcards...' : 'Flashcards'}
              </button>
            </div>
          </div>
        </section>

        <section className="vm-pane vm-pane-main">
          <div className="card map-card">
            <div className="map-header">
              <h2>Mind Map</h2>
              <div className="actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => flowInstance?.setViewport({ x: 160, y: 180, zoom: 1 }, { duration: 220 })}
                  disabled={!tree}
                >
                  Reset View
                </button>
                <button className="btn btn-ghost" onClick={onSaveLayout} disabled={!selectedProjectId || !tree}>
                  Save Layout
                </button>
                <button className="btn btn-ghost" onClick={onSaveTree} disabled={busy || !selectedProjectId || !tree}>
                  Save Tree
                </button>
                <a
                  className={`btn btn-export ${selectedProjectId ? '' : 'disabled'}`}
                  href={selectedProjectId ? api.exportMm(selectedProjectId) : '#'}
                  onClick={(e) => {
                    if (!selectedProjectId) e.preventDefault();
                  }}
                >
                  Export .mm
                </a>
              </div>
            </div>
            <p className="hint">Drag nodes freely. Click &gt; / &lt; on a node to collapse or expand that branch.</p>
            <div className="map-canvas">
              {tree ? (
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
                      setSelectedProjectId(project.id);
                      setTree(normalizeTree(project.current_tree_json));
                      setExpandedById({});
                      setProjectTitle(project.title);
                      setDraftSessions([]);
                      const sources = await loadSources(project.id);
                      const firstSource = sources[0];
                      setRawText(firstSource?.content_text ?? project.raw_text ?? '');
                      setSourceTitle(firstSource?.title ?? '');
                      setIsAddTextOpen(true);
                      setEditingSource(firstSource ? { scope: 'persisted', id: firstSource.id } : null);
                      setStatus(
                        project.current_tree_json
                          ? `Loaded "${project.title}"`
                          : `Loaded failed project "${project.title}". Click Regenerate to retry.`,
                      );
                    }}
                  >
                    <span>{project.title}</span>
                    {!project.current_tree_json ? <span style={{ marginLeft: 8, color: '#9b2c2c', fontWeight: 700 }}>Failed</span> : null}
                  </button>
                  <button
                    className="project-item-delete"
                    onClick={() =>
                      setPendingDelete({
                        projectId: project.id,
                        projectTitle: project.title,
                      })
                    }
                    disabled={deletingProjectId === project.id}
                    aria-label={`Delete ${project.title}`}
                  >
                    {deletingProjectId === project.id ? '...' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card assets-card">
            <div className="assets-header">
              <h3>AI Study Tools</h3>
              <div className="actions">
                <button
                  className={`btn ${activeAssetMode === 'slides' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveAssetMode('slides')}
                >
                  Slides
                </button>
                <button
                  className={`btn ${activeAssetMode === 'flashcards' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveAssetMode('flashcards')}
                >
                  Flashcards
                </button>
              </div>
            </div>
            {activeAssetMode === 'slides' ? (
              slideDeck ? (
                <div className="slide-preview-list">
                  <p className="asset-title">{slideDeck.title}</p>
                  {slideDeck.slides.map((slide, index) => (
                    <div className="slide-preview" key={`${slide.title}-${index}`}>
                      <div className="slide-preview-header">
                        <span className="slide-kicker">Slide {index + 1}</span>
                        <h4>{slide.title}</h4>
                        {slide.subtitle ? <p className="slide-subtitle">{slide.subtitle}</p> : null}
                      </div>
                      <div className={`slide-body layout-${slide.layout}`}>
                        {slide.bullets?.length ? (
                          <ul>
                            {slide.bullets.map((bullet, bulletIndex) => (
                              <li key={`${index}-${bulletIndex}`}>{bullet}</li>
                            ))}
                          </ul>
                        ) : null}
                        {slide.visualIdea ? (
                          <div className="slide-visual-idea">
                            <strong>Visual:</strong> {slide.visualIdea}
                          </div>
                        ) : null}
                      </div>
                      {slide.speakerNotes ? (
                        <div className="slide-notes">
                          <strong>Notes:</strong> {slide.speakerNotes}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">Generate AI Slides to create a real slide deck here.</p>
              )
            ) : flashcardDeck ? (
              <div className="asset-list">
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
              <p className="empty">Generate Flashcards to review key questions and answers.</p>
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
