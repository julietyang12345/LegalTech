import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { api, getDevBearerToken, setDevBearerToken, type TreeNode, type VmProject } from './api';

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
): { nodes: MindNode[]; edges: Edge[] } => {
  const nodes: MindNode[] = [];
  const edges: Edge[] = [];

  layoutVisibleTree(root, 0, expandedById, positionById, onToggle, nodes, edges, { y: 40 });

  return { nodes, edges };
};

export const App = () => {
  const [userEmail, setUserEmail] = useState<string>('');
  const [projects, setProjects] = useState<VmProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [status, setStatus] = useState<string>('Checking auth...');
  const [busy, setBusy] = useState(false);
  const [devToken, setDevToken] = useState<string>(getDevBearerToken());
  const [hideFailedProjects, setHideFailedProjects] = useState(true);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [nodes, setNodes] = useState<MindNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<MindNode, Edge> | null>(null);
  const nodeTypes = useMemo<NodeTypes>(() => ({ mindmap: MindMapNode }), []);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

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

  const graph = useMemo(() => {
    if (!tree) return { nodes: [], edges: [] };
    return createFlowGraph(tree, expandedById, nodePositions, toggleNode);
  }, [tree, expandedById, nodePositions, toggleNode]);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  useEffect(() => {
    if (!selectedProjectId) {
      setNodePositions({});
      return;
    }
    setNodePositions(loadStoredPositions(selectedProjectId));
  }, [selectedProjectId]);

  const loadProjects = async () => {
    const data = await api.listProjects();
    setProjects(data.projects);
    if (!selectedProjectId && data.projects[0]) {
      const preferred = data.projects.find(hasTree) ?? data.projects[0];
      setSelectedProjectId(preferred.id);
      setTree(normalizeTree(preferred.current_tree_json));
      setExpandedById({});
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const profile = await api.me();
        setUserEmail(profile.user.email);
        setStatus('Ready');
        await loadProjects();
      } catch {
        setStatus('Not authenticated. Please log in from your existing auth app first.');
      }
    })();
  }, []);

  const onApplyDevToken = async () => {
    setDevBearerToken(devToken);
    setStatus('Dev token applied, validating...');
    try {
      const profile = await api.me();
      setUserEmail(profile.user.email);
      setStatus('Ready');
      await loadProjects();
    } catch {
      setStatus('Token invalid or backend not reachable');
    }
  };

  const onCreateProject = async () => {
    if (!rawText.trim()) return;
    setBusy(true);
    let createdProjectId: string | null = null;
    try {
      const finalTitle = title.trim() || inferTitle(rawText);
      const data = await api.createProject({ title: finalTitle, rawText: rawText.trim() });
      createdProjectId = data.project.id;
      setSelectedProjectId(data.project.id);
      const generated = await api.generate(data.project.id, rawText.trim());
      setTree(generated.tree);
      setExpandedById({});
      setNodePositions({});
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

  const onGenerate = async () => {
    if (!selectedProjectId) return;
    setBusy(true);
    try {
      const data = await api.generate(selectedProjectId, rawText.trim() || undefined);
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
          <div className="card token-card">
            <h3>Developer Auth</h3>
            <input
              placeholder="Paste Bearer token for localhost testing"
              value={devToken}
              onChange={(e) => setDevToken(e.target.value)}
            />
            <div className="actions">
              <button className="btn btn-ghost" onClick={onApplyDevToken}>Apply Token</button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setDevToken('');
                  setDevBearerToken('');
                  setStatus('Dev token cleared');
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="card composer-card">
            <h2>Source</h2>
            <p>Drop in notes, transcript, docs, or long brainstorming text.</p>
            <input
              placeholder="Optional title (auto-generated if empty)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="Paste your long text here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={14}
            />
            <div className="actions">
              <button className="btn btn-primary" onClick={onCreateProject} disabled={busy || !rawText.trim()}>
                {busy ? 'Generating...' : 'Create Mind Map'}
              </button>
              <button className="btn btn-secondary" onClick={onGenerate} disabled={busy || !selectedProjectId}>
                Regenerate
              </button>
            </div>
          </div>

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
                <button
                  key={project.id}
                  className={`project-item ${selectedProjectId === project.id ? 'active' : ''} ${project.current_tree_json ? '' : 'is-failed'}`}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setTree(normalizeTree(project.current_tree_json));
                    setExpandedById({});
                    setRawText(project.raw_text);
                    setTitle(project.title);
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
              ))}
            </div>
          </div>
        </section>

        <section className="vm-pane vm-pane-right">
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
                  nodeTypes={nodeTypes}
                  style={{ width: '100%', height: '100%', position: 'relative', zIndex: 20 }}
                  onNodesChange={onNodesChange}
                  onInit={(instance) => {
                    setFlowInstance(instance);
                    instance.setViewport({ x: 160, y: 180, zoom: 1 });
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

                    if (!tree || !flowInstance || node.id === 'root') return;

                    const target = flowInstance
                      .getIntersectingNodes(node)
                      .find((candidate) => candidate.id !== node.id);
                    if (!target) return;

                    const sourceNode = findNode(tree, node.id);
                    const targetNode = findNode(tree, target.id);
                    if (!sourceNode || !targetNode) return;
                    if (containsNode(sourceNode, target.id)) return;

                    const removed = removeNodeById(tree, node.id);
                    if (!removed.removed) return;
                    const movedTree = insertNodeAsChild(removed.tree, target.id, removed.removed);
                    setTree(movedTree);
                    setStatus(`Moved "${sourceNode.text}" under "${targetNode.text}"`);
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
      </main>
    </div>
  );
};
