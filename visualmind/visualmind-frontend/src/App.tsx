import { useEffect, useMemo, useState } from 'react';
import { api, getDevBearerToken, setDevBearerToken, type TreeNode, type VmProject } from './api';

const inferTitle = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Untitled Map';
  return clean.split(' ').slice(0, 8).join(' ').slice(0, 60);
};

const buildColumns = (root: TreeNode, activePath: string[]): TreeNode[][] => {
  const columns: TreeNode[][] = [[root]];
  let current: TreeNode | null = root;

  if (root.children.length > 0) {
    columns.push(root.children);
  }

  for (const selectedId of activePath) {
    if (!current) break;
    const parent: TreeNode = current;
    const next: TreeNode | null =
      parent.children.find((child: TreeNode) => child.id === selectedId) ?? null;
    if (!next) break;
    current = next;
    if (next.children.length > 0) {
      columns.push(next.children);
    }
  }

  return columns;
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [activePath, setActivePath] = useState<string[]>([]);

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const loadProjects = async () => {
    const data = await api.listProjects();
    setProjects(data.projects);
    if (!selectedProjectId && data.projects[0]) {
      setSelectedProjectId(data.projects[0].id);
      setTree(data.projects[0].current_tree_json);
      setActivePath([]);
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
    try {
      const finalTitle = title.trim() || inferTitle(rawText);
      const data = await api.createProject({ title: finalTitle, rawText: rawText.trim() });
      setSelectedProjectId(data.project.id);
      const generated = await api.generate(data.project.id, rawText.trim());
      setTree(generated.tree);
      setActivePath([]);
      setStatus(`Created "${finalTitle}" and generated map`);
      await loadProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Create failed';
      setStatus(`Create failed: ${message}`);
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
      setActivePath([]);
      setStatus(`Generated version ${data.version}`);
      await loadProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generate failed';
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
      const message = error instanceof Error ? error.message : 'Save failed';
      setStatus(`Save failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const columns = useMemo(() => {
    if (!tree) return [];
    return buildColumns(tree, activePath);
  }, [tree, activePath]);

  const handleSelectNode = (node: TreeNode, columnIndex: number) => {
    if (columnIndex === 0) return;
    const pathIndex = columnIndex - 1;
    const nextPath = activePath.slice(0, pathIndex);
    if (activePath[pathIndex] !== node.id) {
      nextPath.push(node.id);
    }
    setActivePath(nextPath);
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
            <div className="project-list">
              {projects.length === 0 ? <p>No maps yet.</p> : null}
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    setTree(project.current_tree_json);
                    setActivePath([]);
                    setRawText(project.raw_text);
                    setTitle(project.title);
                    setStatus(`Loaded "${project.title}"`);
                  }}
                >
                  <span>{project.title}</span>
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
                <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}>
                  -
                </button>
                <button className="btn btn-ghost" onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}>
                  +
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  Reset View
                </button>
                <button className="btn btn-ghost" onClick={onSaveTree} disabled={busy || !selectedProjectId || !tree}>
                  Save Layout
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
            <p className="hint">Click nodes to drill down by column. Hold and drag empty canvas area to pan.</p>
            <div
              className={`map-canvas ${isPanning ? 'is-panning' : ''}`}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('.mind-node')) return;
                setIsPanning(true);
                setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
              }}
              onMouseMove={(e) => {
                if (!isPanning) return;
                setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
              onWheel={(e) => {
                e.preventDefault();
                const direction = e.deltaY > 0 ? -0.08 : 0.08;
                setZoom((z) => Math.max(0.6, Math.min(1.8, Number((z + direction).toFixed(2)))));
              }}
            >
              <div
                className="map-scene"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {tree ? (
                  <div className="mind-columns">
                    {columns.map((column, columnIndex) => (
                      <div className="mind-column" key={`col-${columnIndex}`}>
                        {column.map((node) => {
                          const isRootColumn = columnIndex === 0;
                          const isSelected = !isRootColumn && activePath[columnIndex - 1] === node.id;
                          const hasChildren = node.children.length > 0;
                          return (
                            <button
                              key={node.id}
                              className={`mind-column-node ${isRootColumn ? 'is-root' : ''} ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => handleSelectNode(node, columnIndex)}
                            >
                              <span className="mind-column-label">{node.text}</span>
                              {hasChildren ? <span className="mind-column-arrow">{'>'}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty">Mind map appears here after you click Create Mind Map.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
