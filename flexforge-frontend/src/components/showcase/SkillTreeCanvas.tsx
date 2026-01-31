import { useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Node as FlowNode,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  NodeResizer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  Trash2,
  FolderPlus,
  X,
  GripVertical,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Card, Input } from '@/components/common';

// Types
interface SkillData {
  name: string;
  status: 'complete' | 'progress' | 'locked';
  daysCompleted: number;
  totalDays: number;
  sessionId?: string;
}

interface GroupData {
  label: string;
  color: string;
}

type SkillNodeData = SkillData & { type: 'skill' };
type GroupNodeData = GroupData & { type: 'group' };

// Color options for groups
const GROUP_COLORS = [
  { name: 'Blue', value: 'bg-blue-100 border-blue-300', accent: '#3b82f6' },
  { name: 'Purple', value: 'bg-purple-100 border-purple-300', accent: '#8b5cf6' },
  { name: 'Green', value: 'bg-green-100 border-green-300', accent: '#22c55e' },
  { name: 'Orange', value: 'bg-orange-100 border-orange-300', accent: '#f97316' },
  { name: 'Pink', value: 'bg-pink-100 border-pink-300', accent: '#ec4899' },
  { name: 'Cyan', value: 'bg-cyan-100 border-cyan-300', accent: '#06b6d4' },
];

// Custom Skill Node - smaller, hanging from branch
function SkillNode({ data, selected }: { data: SkillNodeData; selected: boolean }) {
  const statusStyles = {
    complete: 'bg-gradient-to-br from-green-400 to-emerald-500 text-white border-green-400',
    progress: 'bg-gradient-to-br from-brand-400 to-purple-500 text-white border-brand-400',
    locked: 'bg-gray-100 text-gray-400 border-gray-300',
  };

  const progressPercent = data.totalDays > 0
    ? Math.round((data.daysCompleted || 0) / data.totalDays * 100)
    : 0;

  return (
    <div className="flex flex-col items-center">
      {/* Branch connector - the "string" hanging from branch */}
      <div className="w-0.5 h-4 bg-amber-700/60" />
      <Handle type="target" position={Position.Top} className="!bg-amber-700 !w-1.5 !h-1.5 !-top-1" />

      <div
        className={clsx(
          'w-14 h-14 rounded-lg flex flex-col items-center justify-center relative overflow-hidden',
          'border transition-all duration-200',
          statusStyles[data.status],
          selected && 'ring-2 ring-brand-500 ring-offset-1',
          data.status !== 'locked' && 'shadow-md hover:shadow-lg hover:scale-105 cursor-pointer',
          data.status === 'locked' && 'cursor-not-allowed opacity-70'
        )}
      >
        {/* Progress bar for in-progress skills */}
        {data.status === 'progress' && (
          <div
            className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        )}

        {data.status === 'locked' ? (
          <Lock className="w-3 h-3" />
        ) : data.status === 'complete' ? (
          <span className="text-xs">✓</span>
        ) : null}
        <span className="text-[7px] font-medium text-center px-0.5 leading-tight line-clamp-2">
          {data.name}
        </span>
      </div>

      {/* Day progress shown below the box */}
      {data.status === 'progress' && data.totalDays ? (
        <span className="text-[8px] text-gray-500 mt-0.5">
          {data.daysCompleted}/{data.totalDays}d
        </span>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="!bg-amber-700 !w-1.5 !h-1.5 !bottom-0" />
    </div>
  );
}

// Custom Group Node - resizable
function GroupNode({ data, selected }: { data: GroupNodeData; selected: boolean }) {
  return (
    <>
      <NodeResizer
        minWidth={120}
        minHeight={80}
        isVisible={selected}
        lineClassName="!border-brand-400"
        handleClassName="!w-2 !h-2 !bg-brand-500 !border-brand-600"
      />
      <div
        className={clsx(
          'w-full h-full rounded-xl border-2 border-dashed p-3',
          data.color,
          selected && 'ring-2 ring-brand-500 ring-offset-1',
          'cursor-grab active:cursor-grabbing'
        )}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <GripVertical className="w-3 h-3 text-gray-400" />
          <span className="text-sm font-semibold text-gray-700">{data.label}</span>
        </div>
        <p className="text-[10px] text-gray-500">Drag skills here</p>
      </div>
    </>
  );
}

const nodeTypes: NodeTypes = {
  skill: SkillNode,
  group: GroupNode,
};

// Context Menu
function ContextMenu({
  x,
  y,
  onClose,
  onAddGroup,
  onDelete,
  showDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onAddGroup: () => void;
  onDelete?: () => void;
  showDelete: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={() => {
          onAddGroup();
          onClose();
        }}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
      >
        <FolderPlus className="w-4 h-4" />
        Add Group Here
      </button>
      {showDelete && onDelete && (
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete Selected
        </button>
      )}
    </motion.div>
  );
}

// Add Group Modal
function AddGroupModal({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (label: string, color: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0]);

  const handleSubmit = () => {
    if (label.trim()) {
      onAdd(label.trim(), selectedColor.value);
      setLabel('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Create Group</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group Name
            </label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Coding, Design, Data Science"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {GROUP_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setSelectedColor(color)}
                  className={clsx(
                    'w-8 h-8 rounded-lg border-2 transition-all',
                    color.value,
                    selectedColor.name === color.name
                      ? 'ring-2 ring-brand-500 ring-offset-2'
                      : 'hover:scale-110'
                  )}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!label.trim()} className="flex-1">
              Create
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Storage key for persisting layout
const STORAGE_KEY = 'flexforge-skill-tree-layout';

interface SavedLayout {
  nodes: FlowNode[];
  edges: Edge[];
}

// Main Canvas Component (inner)
function SkillTreeCanvasInner({
  skills,
  onSkillClick,
}: {
  skills: SkillData[];
  onSkillClick: (sessionId: string) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();

  // Initialize nodes from skills or saved layout
  const getInitialNodes = useCallback((): FlowNode[] => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const layout: SavedLayout = JSON.parse(saved);
        // Merge saved positions with current skills
        const savedNodeMap = new Map(layout.nodes.map(n => [n.id, n]));

        const skillNodes: FlowNode[] = skills.map((skill, index) => {
          const savedNode = savedNodeMap.get(`skill-${skill.sessionId || index}`);
          return {
            id: `skill-${skill.sessionId || index}`,
            type: 'skill',
            position: savedNode?.position || { x: (index % 4) * 140 + 50, y: Math.floor(index / 4) * 140 + 50 },
            data: { ...skill, type: 'skill' as const },
            parentId: savedNode?.parentId,
            extent: savedNode?.parentId ? 'parent' as const : undefined,
          };
        });

        // Add saved group nodes
        const groupNodes = layout.nodes
          .filter(n => n.type === 'group')
          .map(n => ({
            ...n,
            data: { ...n.data, type: 'group' as const },
          }));

        return [...groupNodes, ...skillNodes];
      } catch {
        // Fall through to default
      }
    }

    // Default tree-like layout - skills arranged in tiers
    return skills.map((skill, index) => {
      // Arrange in a tree pattern: row 0 has 1, row 1 has 2, row 2 has 3, etc.
      const cols = 5; // Max items per row
      const row = Math.floor(index / cols);
      const col = index % cols;
      const rowOffset = (cols - Math.min(skills.length - row * cols, cols)) * 45; // Center each row

      return {
        id: `skill-${skill.sessionId || index}`,
        type: 'skill',
        position: { x: col * 90 + 80 + rowOffset, y: row * 100 + 40 },
        data: { ...skill, type: 'skill' as const },
      };
    });
  }, [skills]);

  const getInitialEdges = useCallback((): Edge[] => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const layout: SavedLayout = JSON.parse(saved);
        return layout.edges;
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(getInitialEdges());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const [addGroupModal, setAddGroupModal] = useState<{ x: number; y: number } | null>(null);

  // Update nodes when skills change
  useEffect(() => {
    setNodes(getInitialNodes());
  }, [skills, getInitialNodes, setNodes]);

  // Save layout on changes
  useEffect(() => {
    const layout: SavedLayout = { nodes, edges };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      const data = node.data as unknown as SkillNodeData;
      if (node.type === 'skill' && data.sessionId && data.status !== 'locked') {
        onSkillClick(data.sessionId);
      }
    },
    [onSkillClick]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY });
      setAddGroupModal(null);
    },
    []
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowNode) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    []
  );

  const handleAddGroup = useCallback(() => {
    if (contextMenu) {
      const position = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
      setAddGroupModal({ x: position.x, y: position.y });
    }
  }, [contextMenu, screenToFlowPosition]);

  const createGroup = useCallback(
    (label: string, color: string) => {
      if (!addGroupModal) return;

      const newNode: FlowNode = {
        id: `group-${Date.now()}`,
        type: 'group',
        position: addGroupModal,
        data: { label, color, type: 'group' },
        style: { width: 150, height: 100 },
      };

      setNodes((nds) => [newNode, ...nds]);
    },
    [addGroupModal, setNodes]
  );

  const handleDelete = useCallback(() => {
    if (contextMenu?.nodeId) {
      const nodeToDelete = nodes.find(n => n.id === contextMenu.nodeId);
      if (nodeToDelete?.type === 'group') {
        // Unparent any child nodes
        setNodes((nds) =>
          nds
            .filter((n) => n.id !== contextMenu.nodeId)
            .map((n) =>
              n.parentId === contextMenu.nodeId
                ? { ...n, parentId: undefined, extent: undefined }
                : n
            )
        );
        setEdges((eds) =>
          eds.filter((e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId)
        );
      }
    }
  }, [contextMenu, nodes, setNodes, setEdges]);

  const resetLayout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const cols = 5;
    setNodes(
      skills.map((skill, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const rowOffset = (cols - Math.min(skills.length - row * cols, cols)) * 45;

        return {
          id: `skill-${skill.sessionId || index}`,
          type: 'skill',
          position: { x: col * 90 + 80 + rowOffset, y: row * 100 + 40 },
          data: { ...skill, type: 'skill' as const },
        };
      })
    );
    setEdges([]);
  }, [skills, setNodes, setEdges]);

  // Tree trunk SVG component
  const TreeTrunk = () => (
    <svg
      className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none z-0"
      width="120"
      height="180"
      viewBox="0 0 120 180"
    >
      {/* Main trunk */}
      <path
        d="M60 180 L60 60 Q60 40 50 30 M60 60 Q60 40 70 30"
        fill="none"
        stroke="#92400e"
        strokeWidth="12"
        strokeLinecap="round"
      />
      {/* Trunk texture */}
      <path
        d="M55 180 L55 80 M65 180 L65 80"
        fill="none"
        stroke="#78350f"
        strokeWidth="2"
        opacity="0.3"
      />
      {/* Left branch */}
      <path
        d="M60 100 Q40 90 20 70"
        fill="none"
        stroke="#92400e"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Right branch */}
      <path
        d="M60 100 Q80 90 100 70"
        fill="none"
        stroke="#92400e"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Upper left branch */}
      <path
        d="M60 70 Q35 60 15 50"
        fill="none"
        stroke="#92400e"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Upper right branch */}
      <path
        d="M60 70 Q85 60 105 50"
        fill="none"
        stroke="#92400e"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-b from-sky-100 via-sky-50 to-green-100 relative">
      {/* Tree trunk decoration */}
      <TreeTrunk />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectNodesOnDrag={false}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        }}
      >
        <Background gap={20} size={1} color="#bae6fd" className="opacity-30" />
        <Controls className="!bg-white !border-gray-200 !rounded-lg !shadow-sm" />
        <MiniMap
          className="!bg-white !border-gray-200 !rounded-lg"
          nodeColor={(node) => {
            if (node.type === 'group') return '#e0e7ff';
            if (node.data?.status === 'complete') return '#22c55e';
            if (node.data?.status === 'progress') return '#8b5cf6';
            return '#d1d5db';
          }}
        />

        <Panel position="top-left" className="flex gap-2">
          <Card className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-gray-600 bg-white/80 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span>Click skill to open • Right-click to add groups</span>
          </Card>
        </Panel>

        <Panel position="top-right">
          <Button variant="secondary" size="sm" onClick={resetLayout}>
            Reset Layout
          </Button>
        </Panel>
      </ReactFlow>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onAddGroup={handleAddGroup}
            onDelete={contextMenu.nodeId ? handleDelete : undefined}
            showDelete={!!contextMenu.nodeId && nodes.find(n => n.id === contextMenu.nodeId)?.type === 'group'}
          />
        )}
      </AnimatePresence>

      <AddGroupModal
        isOpen={!!addGroupModal}
        onClose={() => setAddGroupModal(null)}
        onAdd={createGroup}
      />
    </div>
  );
}

// Wrapper with Provider
export function SkillTreeCanvas({
  skills,
  onSkillClick,
}: {
  skills: SkillData[];
  onSkillClick: (sessionId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <SkillTreeCanvasInner skills={skills} onSkillClick={onSkillClick} />
    </ReactFlowProvider>
  );
}
