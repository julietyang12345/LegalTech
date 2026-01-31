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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock,
  X,
  Sparkles,
  Loader2,
  Lightbulb,
  Plus,
  Rocket,
  Crown,
  Target,
  Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button, Card, Input } from '@/components/common';
import { sessionService } from '@/services/sessionService';
import { authService } from '@/services/authService';

// Types
interface SkillData {
  name: string;
  status: 'complete' | 'progress' | 'locked' | 'planned';
  daysCompleted: number;
  totalDays: number;
  sessionId?: string;
  icon?: string;
}

type SkillNodeData = SkillData & { type: 'skill' };

// AI-generated types
interface AICombo {
  project: string;
  description: string;
  skills: string[];
  icon: string;
}

interface AISuggestedSkill {
  skill: string;
  unlocks: string[];
  icon: string;
}

interface PlannedSkill {
  skill: string;
  icon: string;
  addedAt: string;
}


// Custom Skill Node - floating leaf with visual states
function SkillNode({ id, data, selected, dragging }: { id: string; data: SkillNodeData; selected: boolean; dragging?: boolean }) {
  const { setNodes } = useReactFlow();
  const progressPercent = data.totalDays > 0
    ? Math.round((data.daysCompleted || 0) / data.totalDays * 100)
    : 0;

  const isPlanned = data.status === 'planned';
  const isComplete = data.status === 'complete';
  const isProgress = data.status === 'progress';

  // Build tooltip text
  const tooltipText = isProgress
    ? `${data.name} (Day ${data.daysCompleted}/${data.totalDays})`
    : isComplete
    ? `${data.name} ✓ Completed`
    : isPlanned
    ? `${data.name} (Planned)`
    : data.name;

  return (
    <motion.div
      className="flex flex-col items-center group relative select-none skill-node-wrapper"
      initial={false}
      animate={{
        scale: dragging ? 1.15 : selected ? 1.05 : 1,
        y: dragging ? -5 : 0,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Branch connector */}
      <div className="w-px h-3 pointer-events-none bg-emerald-500/40" />
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !-top-0.5 !bg-emerald-500 !pointer-events-none" />

      {/* Tooltip on hover */}
      <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 bg-gray-800/95 backdrop-blur text-white text-[10px] font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 shadow-lg">
        {tooltipText}
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-gray-800/95 rotate-45" />
      </div>

      {/* Skill box - floating leaf with visual states */}
      <motion.div
        className={clsx(
          'relative w-14 h-14 rounded-xl flex flex-col items-center justify-center cursor-pointer',
          'transition-colors duration-200',
          // Base styling - soft shadow and glow
          'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700',
          'shadow-md shadow-emerald-200/50',
          // Normal state glow
          !selected && !dragging && 'hover:shadow-lg hover:shadow-emerald-300/60',
          // Selected state - purple border with pulse
          selected && 'ring-2 ring-purple-400 shadow-lg shadow-purple-200/50 bg-gradient-to-br from-purple-50 to-purple-100',
          // Dragging state - orange glow trail effect
          dragging && 'ring-2 ring-amber-400 shadow-xl shadow-amber-300/70'
        )}
        data-skill-name={data.name}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.98 }}
      >
        {/* Selection checkbox indicator - clickable */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            setNodes(nds => nds.map(n => n.id === id ? { ...n, selected: !n.selected } : n));
          }}
          className={clsx(
            "absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center z-10 border-2 transition-all cursor-pointer",
            selected
              ? "bg-purple-500 border-purple-500 text-white hover:bg-purple-600"
              : "bg-white border-gray-300 hover:border-purple-400 hover:bg-purple-50"
          )}
          initial={false}
          animate={{ scale: selected ? 1 : 0.95 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {selected ? (
            <span className="text-[10px] font-bold">✓</span>
          ) : (
            <Plus className="w-3 h-3 text-gray-400 group-hover:text-purple-500" />
          )}
        </motion.button>


        {/* Glowing trail for dragging */}
        {dragging && (
          <motion.div
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-300/30 to-orange-300/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        {/* Icon - leaf emoji */}
        <span className="text-lg pointer-events-none select-none">🌿</span>

        {/* Name */}
        <span className={clsx(
          "text-[7px] font-medium text-center px-1 leading-tight line-clamp-2 pointer-events-none select-none max-w-full",
          selected && "text-purple-700"
        )}>
          {data.name}
        </span>

        {/* Progress indicator for in-progress skills */}
        {isProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-200/50 rounded-b-xl overflow-hidden pointer-events-none">
            <motion.div
              className="h-full bg-emerald-500"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        )}
      </motion.div>

      {/* Status label below */}
      {selected ? (
        <span className="text-[8px] text-purple-600 mt-1 font-medium pointer-events-none select-none">
          Selected
        </span>
      ) : isProgress && data.totalDays ? (
        <span className="text-[8px] text-emerald-600 mt-1 font-medium pointer-events-none select-none">
          {data.daysCompleted}/{data.totalDays}
        </span>
      ) : isComplete ? (
        <span className="text-[8px] text-emerald-600 mt-1 pointer-events-none select-none">
          ✓ Done
        </span>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bottom-0 !bg-emerald-600 !pointer-events-none" />
    </motion.div>
  );
}

// Custom Group Node - tree branch style
const nodeTypes: NodeTypes = {
  skill: SkillNode,
};

// AI Analysis action types
type AIAction = 'generate-ideas' | 'analyze-skill' | 'find-related' | 'learning-path';

// Skill Action Menu - shows on click with AI analysis options
function SkillActionMenu({
  x,
  y,
  onClose,
  onAIAction,
  onShowLimitReached,
  onToggleSelect,
  onGoToSession,
  onStartLearning,
  skillName,
  skillStatus,
  isSelected,
  isPro,
  isPremium,
  hasActiveSession,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onAIAction: (action: AIAction) => void;
  onShowLimitReached?: (nextAvailable: string) => void;
  onToggleSelect: () => void;
  onGoToSession: () => void;
  onStartLearning: () => void;
  skillName: string | null;
  skillStatus?: 'complete' | 'progress' | 'locked' | 'planned';
  isSelected: boolean;
  isPro: boolean;
  isPremium: boolean;
  hasActiveSession: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const rateLimit = canUseAIIdeas(isPro, isPremium);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleAction = (action: AIAction) => {
    if (rateLimit.allowed) {
      onAIAction(action);
    } else if (onShowLimitReached) {
      onShowLimitReached(rateLimit.nextAvailable || 'later');
    }
    onClose();
  };

  if (!skillName) {
    return null;
  }

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      className="fixed z-[100] bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[200px]"
      style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 350) }}
    >
      {/* Header with skill name and select checkbox */}
      <div className="px-4 py-2 border-b border-gray-100 mb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onToggleSelect();
            }}
            className={clsx(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-purple-500 border-purple-500 text-white"
                : "border-gray-300 hover:border-purple-400"
            )}
          >
            {isSelected && <span className="text-xs">✓</span>}
          </button>
          <span className="text-sm font-medium text-gray-800 truncate max-w-[120px]">
            {skillName}
          </span>
          {skillStatus === 'complete' && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Done</span>
          )}
          {skillStatus === 'progress' && (
            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Active</span>
          )}
        </div>
        <p className="text-[10px] text-gray-400 mt-1 ml-7">
          {isSelected ? 'Selected for combo' : 'Check to add to combo'}
        </p>
      </div>

      {/* Navigation action based on status */}
      {skillStatus === 'planned' && (
        <button
          onClick={() => {
            onStartLearning();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 text-green-700 hover:bg-green-50 transition-colors"
        >
          <Rocket className="w-4 h-4 text-green-500" />
          <span>{hasActiveSession ? 'Switch to This Skill' : 'Start Learning'}</span>
        </button>
      )}

      {(skillStatus === 'progress' || skillStatus === 'complete') && (
        <button
          onClick={() => {
            onGoToSession();
            onClose();
          }}
          className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 text-blue-700 hover:bg-blue-50 transition-colors"
        >
          <Target className="w-4 h-4 text-blue-500" />
          <span>{skillStatus === 'progress' ? 'Continue Session' : 'View Session'}</span>
        </button>
      )}

      {/* Divider */}
      <div className="my-1 border-t border-gray-100" />

      {/* AI Analysis Options - single skill actions */}
      <div className="px-4 py-1">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
          AI Analysis
        </p>
      </div>

      {/* Analyze This Skill */}
      <button
        onClick={() => handleAction('analyze-skill')}
        disabled={!rateLimit.allowed}
        className={clsx(
          "w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors",
          rateLimit.allowed
            ? "text-blue-700 hover:bg-blue-50"
            : "text-gray-400 cursor-not-allowed"
        )}
      >
        <Lightbulb className={clsx("w-4 h-4", rateLimit.allowed ? "text-blue-500" : "text-gray-300")} />
        <span>Analyze This Skill</span>
      </button>

      {/* Find Related Skills */}
      <button
        onClick={() => handleAction('find-related')}
        disabled={!rateLimit.allowed}
        className={clsx(
          "w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors",
          rateLimit.allowed
            ? "text-purple-700 hover:bg-purple-50"
            : "text-gray-400 cursor-not-allowed"
        )}
      >
        <Zap className={clsx("w-4 h-4", rateLimit.allowed ? "text-purple-500" : "text-gray-300")} />
        <span>Find Related Skills</span>
      </button>

      {/* Suggest Learning Path */}
      <button
        onClick={() => handleAction('learning-path')}
        disabled={!rateLimit.allowed}
        className={clsx(
          "w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors",
          rateLimit.allowed
            ? "text-green-700 hover:bg-green-50"
            : "text-gray-400 cursor-not-allowed"
        )}
      >
        <Rocket className={clsx("w-4 h-4", rateLimit.allowed ? "text-green-500" : "text-gray-300")} />
        <span>Suggest Learning Path</span>
      </button>

      {/* Rate limit info */}
      <div className="px-4 pt-1.5 pb-1 border-t border-gray-100 mt-1">
        <p className="text-[10px] text-gray-400">
          {isPremium ? '✨ Unlimited' : isPro ? '⭐ 1/day' : '🌱 1/week'}
        </p>
      </div>
    </motion.div>
  );
}

// Particle animation for combo generation
function ComboParticles({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            background: `hsl(${30 + Math.random() * 30}, 100%, ${60 + Math.random() * 20}%)`,
            left: '50%',
            bottom: '80px',
          }}
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0.5],
            x: (Math.random() - 0.5) * 300,
            y: -(Math.random() * 200 + 50),
            rotate: Math.random() * 360,
          }}
          transition={{
            duration: 1.5,
            delay: i * 0.05,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

// Storage key for persisting layout
const STORAGE_KEY = 'flexforge-skill-tree-layout';

// AI Ideas rate limit storage
const AI_IDEAS_USAGE_KEY = 'flexforge-ai-ideas-usage';

interface AIIdeasUsage {
  lastUsed: string; // ISO date string
  count: number;
}

function getAIIdeasUsage(): AIIdeasUsage | null {
  try {
    const stored = localStorage.getItem(AI_IDEAS_USAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function recordAIIdeasUsage(): void {
  const now = new Date().toISOString();
  localStorage.setItem(AI_IDEAS_USAGE_KEY, JSON.stringify({ lastUsed: now, count: 1 }));
}

function canUseAIIdeas(isPro: boolean, isPremium: boolean, isAdmin: boolean = false): { allowed: boolean; reason?: string; nextAvailable?: string } {
  // Admin or Premium users: unlimited
  if (isPremium || isAdmin) {
    return { allowed: true };
  }

  const usage = getAIIdeasUsage();
  if (!usage) {
    return { allowed: true };
  }

  const lastUsed = new Date(usage.lastUsed);
  const now = new Date();

  if (isPro) {
    // Pro users: 1 per day
    const hoursSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastUse >= 24) {
      return { allowed: true };
    }
    const hoursRemaining = Math.ceil(24 - hoursSinceLastUse);
    return {
      allowed: false,
      reason: 'Daily limit reached',
      nextAvailable: hoursRemaining === 1 ? 'in 1 hour' : `in ${hoursRemaining} hours`
    };
  } else {
    // Free users: 1 per week
    const daysSinceLastUse = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse >= 7) {
      return { allowed: true };
    }
    const daysRemaining = Math.ceil(7 - daysSinceLastUse);
    return {
      allowed: false,
      reason: 'Weekly limit reached',
      nextAvailable: daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`
    };
  }
}

interface SavedLayout {
  nodes: FlowNode[];
  edges: Edge[];
}

// Main Canvas Component (inner)
function SkillTreeCanvasInner({
  skills,
  onSkillClick,
  hasAccess,
  isPremium,
  isAdmin,
  plannedSkills,
  onAddPlannedSkill,
  onRemovePlannedSkill,
  onStartLearning,
}: {
  skills: SkillData[];
  onSkillClick: (sessionId: string, status?: string) => void;
  hasAccess: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  plannedSkills: PlannedSkill[];
  onAddPlannedSkill: (skill: string, icon: string) => void;
  onRemovePlannedSkill: (skill: string) => void;
  onStartLearning: (skill: string) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // AI Ideas state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<{ type: BottomAIAction; combos: AICombo[]; suggestions: AISuggestedSkill[] } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Rate limit modal state
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalNextAvailable, setLimitModalNextAvailable] = useState('');

  // Switch course confirmation modal state
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchModalSkill, setSwitchModalSkill] = useState<string>('');
  const [switchModalLoading, setSwitchModalLoading] = useState(false);

  // Combo generation animation state
  const [showParticles, setShowParticles] = useState(false);

  // Check if user has an active session
  const hasActiveSession = skills.some(s => s.status === 'progress');

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
          };
        });

        return skillNodes;
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
  const [skillMenu, setSkillMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

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
    (event: React.MouseEvent, node: FlowNode) => {
      const data = node.data as unknown as SkillNodeData;
      if (node.type === 'skill' && data.status !== 'locked') {
        // Show the skill action menu on click
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        setSkillMenu({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
          nodeId: node.id,
        });
      }
    },
    []
  );

  const handleConfirmSwitch = useCallback(async () => {
    if (!switchModalSkill) return;
    setSwitchModalLoading(true);
    try {
      onStartLearning(switchModalSkill);
    } finally {
      setSwitchModalLoading(false);
      setSwitchModalOpen(false);
      setSwitchModalSkill('');
    }
  }, [switchModalSkill, onStartLearning]);

  // Close skill menu when clicking on pane
  const onPaneClick = useCallback(() => {
    setSkillMenu(null);
  }, []);

  // Get selected skill nodes for AI generation
  const getSelectedSkillNodes = useCallback(() => {
    // Get all selected skill nodes
    const selectedNodes = nodes.filter(n => n.type === 'skill' && n.selected);
    // If none selected but skill menu was on a skill, use that one
    if (selectedNodes.length === 0 && skillMenu?.nodeId) {
      const menuNode = nodes.find(n => n.id === skillMenu.nodeId && n.type === 'skill');
      if (menuNode) return [menuNode];
    }
    return selectedNodes;
  }, [nodes, skillMenu]);

  // Get the current menu skill data
  const getMenuSkillData = useCallback((): SkillNodeData | null => {
    if (!skillMenu?.nodeId) return null;
    const node = nodes.find(n => n.id === skillMenu.nodeId);
    if (!node || node.type !== 'skill') return null;
    return node.data as unknown as SkillNodeData;
  }, [skillMenu, nodes]);

  // Check if menu skill is already selected
  const isMenuSkillSelected = useCallback((): boolean => {
    if (!skillMenu?.nodeId) return false;
    const node = nodes.find(n => n.id === skillMenu.nodeId);
    return node?.selected ?? false;
  }, [skillMenu, nodes]);

  // Handle AI action from skill menu (single skill)
  const handleMenuAIAction = useCallback(async (action: AIAction) => {
    const menuSkill = getMenuSkillData();
    if (!menuSkill) return;

    // Map menu action to bottom action type
    const bottomAction: BottomAIAction = action === 'analyze-skill' ? 'analyze' : action === 'find-related' ? 'related' : 'path';

    setAiLoading(true);
    setAiError(null);
    setAiResults(null);

    // Show particle animation
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 1500);

    // Use the specific menu skill for this action
    const selectedSkillNames = [menuSkill.name];
    console.log(`[SkillTree] Menu AI Action: ${bottomAction}, skill: ${menuSkill.name}`);

    try {
      const result = await sessionService.getSkillCombos({
        selectedSkills: selectedSkillNames,
        action: bottomAction,
      });
      setAiResults({
        type: bottomAction,
        combos: result.combos,
        suggestions: result.suggestedSkills,
      });
      recordAIIdeasUsage();
    } catch (err: any) {
      console.error('Failed to generate AI ideas:', err);
      if (err?.response?.status === 403) {
        setAiError('Daily limit reached. Upgrade to Premium for unlimited generations.');
      } else {
        setAiError('Failed to generate ideas. Please try again.');
      }
    } finally {
      setAiLoading(false);
    }
  }, [getMenuSkillData]);

  // Handle AI action from bottom panel
  const handleBottomAIAction = useCallback(async (action: BottomAIAction) => {
    const selectedNodes = getSelectedSkillNodes();
    if (selectedNodes.length === 0) return;

    setAiLoading(true);
    setAiError(null);
    setAiResults(null);

    // Show particle animation
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 1500);

    // Extract skill names from selected nodes
    const selectedSkillNames = selectedNodes.map(n => n.data.label as string);
    console.log(`[SkillTree] AI Action: ${action}, skills: [${selectedSkillNames.join(', ')}]`);

    try {
      const result = await sessionService.getSkillCombos({
        selectedSkills: selectedSkillNames,
        action: action,
      });
      setAiResults({
        type: action,
        combos: result.combos,
        suggestions: result.suggestedSkills,
      });
      recordAIIdeasUsage();
    } catch (err: any) {
      console.error('Failed to generate AI ideas:', err);
      if (err?.response?.status === 403) {
        setAiError('Daily limit reached. Upgrade to Premium for unlimited generations.');
      } else {
        setAiError('Failed to generate ideas. Please try again.');
      }
    } finally {
      setAiLoading(false);
    }
  }, [getSelectedSkillNodes]);

  // Close results
  const handleCloseResults = useCallback(() => {
    setAiResults(null);
    setAiError(null);
  }, []);

  // Add skill to combo selection (toggle selection)
  const handleAddToCombo = useCallback(() => {
    if (!skillMenu?.nodeId) return;
    setNodes(nds =>
      nds.map(n =>
        n.id === skillMenu.nodeId ? { ...n, selected: !n.selected } : n
      )
    );
  }, [skillMenu, setNodes]);

  // Navigate to session for the menu skill
  const handleGoToSession = useCallback(() => {
    const menuSkill = getMenuSkillData();
    if (menuSkill?.sessionId) {
      onSkillClick(menuSkill.sessionId, menuSkill.status);
    }
  }, [getMenuSkillData, onSkillClick]);

  // Start learning the menu skill
  const handleStartLearningMenuSkill = useCallback(() => {
    const menuSkill = getMenuSkillData();
    if (!menuSkill) return;

    if (hasActiveSession) {
      setSwitchModalSkill(menuSkill.name);
      setSwitchModalOpen(true);
    } else {
      onStartLearning(menuSkill.name);
    }
  }, [getMenuSkillData, hasActiveSession, onStartLearning]);

  // Get selected skills for combo tray
  const selectedSkillsForTray = getSelectedSkillNodes().map(n => ({
    id: n.id,
    name: (n.data as unknown as SkillNodeData).name,
  }));

  // Remove a skill from selection
  const handleRemoveFromSelection = useCallback((nodeId: string) => {
    setNodes(nds =>
      nds.map(n =>
        n.id === nodeId ? { ...n, selected: false } : n
      )
    );
  }, [setNodes]);

  // Clear all selections
  const handleClearAllSelections = useCallback(() => {
    setNodes(nds =>
      nds.map(n => ({ ...n, selected: false }))
    );
  }, [setNodes]);

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
    <div className="space-y-0">
    <div
      ref={containerRef}
      className="w-full h-[500px] rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-b from-sky-100 via-sky-50 to-green-100 relative"
    >
      {/* Tree trunk decoration */}
      <TreeTrunk />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        selectionOnDrag
        panOnDrag={[1]}
        selectNodesOnDrag
        multiSelectionKeyCode="Shift"
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
          nodeColor={() => '#22c55e'}
        />

        <Panel position="top-left" className="flex gap-2">
          <Card className="px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-gray-600 bg-white/80 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Click a skill for AI analysis • Check the ✓ to select for combos</span>
          </Card>
        </Panel>

        <Panel position="top-right">
          <Button variant="secondary" size="sm" onClick={resetLayout}>
            Reset Layout
          </Button>
        </Panel>
      </ReactFlow>

      {/* Particle animation for combo generation */}
      <ComboParticles isActive={showParticles} />

      {/* Skill Action Menu */}
      <AnimatePresence>
        {skillMenu && (
          <SkillActionMenu
            x={skillMenu.x}
            y={skillMenu.y}
            onClose={() => setSkillMenu(null)}
            onAIAction={handleMenuAIAction}
            onShowLimitReached={(nextAvailable) => {
              setLimitModalNextAvailable(nextAvailable);
              setLimitModalOpen(true);
            }}
            onToggleSelect={handleAddToCombo}
            onGoToSession={handleGoToSession}
            onStartLearning={handleStartLearningMenuSkill}
            skillName={getMenuSkillData()?.name ?? null}
            skillStatus={getMenuSkillData()?.status}
            isSelected={isMenuSkillSelected()}
            isPro={hasAccess && !isPremium}
            isPremium={isPremium}
            hasActiveSession={hasActiveSession}
          />
        )}
      </AnimatePresence>


      {/* Rate Limit Modal for AI Ideas */}
      <AnimatePresence>
        {limitModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setLimitModalOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="font-bold text-xl text-gray-900 mb-2">
                Limit Reached
              </h3>
              <p className="text-gray-600 mb-2">
                You've used your AI Ideas generation for this period.
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Available again <span className="font-medium text-gray-700">{limitModalNextAvailable}</span>
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setLimitModalOpen(false);
                    window.location.href = '/settings?tab=subscription';
                  }}
                  className="w-full"
                >
                  <Crown className="w-4 h-4 mr-2" />
                  {isPremium ? 'View Plan' : hasAccess ? 'Upgrade to Premium' : 'Upgrade to Pro'}
                </Button>
                <button
                  onClick={() => setLimitModalOpen(false)}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Got it
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                {isPremium ? 'Premium: Unlimited' : hasAccess ? 'Pro: 1/day • Premium: Unlimited' : 'Free: 1/week • Pro: 1/day'}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

    {/* Bottom Control Panel - selection + AI actions + results */}
    <BottomControlPanel
      selectedSkills={selectedSkillsForTray}
      onRemoveSkill={handleRemoveFromSelection}
      onClearAll={handleClearAllSelections}
      onAIAction={handleBottomAIAction}
      isLoading={aiLoading}
      results={aiResults}
      error={aiError}
      isPro={hasAccess && !isPremium}
      isPremium={isPremium}
      isAdmin={isAdmin}
      onStartLearning={onStartLearning}
      onCloseResults={handleCloseResults}
    />
    </div>
  );
}

// AI Action type for the bottom panel
type BottomAIAction = 'combo' | 'analyze' | 'related' | 'path';

// Bottom Control Panel - skill selection + AI actions + results
function BottomControlPanel({
  selectedSkills,
  onRemoveSkill,
  onClearAll,
  onAIAction,
  isLoading,
  results,
  error,
  isPro,
  isPremium,
  isAdmin = false,
  onStartLearning,
  onCloseResults,
}: {
  selectedSkills: { id: string; name: string }[];
  onRemoveSkill: (id: string) => void;
  onClearAll: () => void;
  onAIAction: (action: BottomAIAction) => void;
  isLoading: boolean;
  results: { type: BottomAIAction; combos: AICombo[]; suggestions: AISuggestedSkill[] } | null;
  error: string | null;
  isPro: boolean;
  isPremium: boolean;
  isAdmin?: boolean;
  onStartLearning: (skill: string) => void;
  onCloseResults: () => void;
}) {
  const rateLimit = canUseAIIdeas(isPro, isPremium, isAdmin);
  const hasSelection = selectedSkills.length > 0;

  return (
    <div className="mt-4 space-y-3">
      {/* Top row: Selected skills + AI action buttons */}
      <div className="flex gap-3">
        {/* Left: Selected skills */}
        <div className="flex-1 p-3 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500">Selected Skills</p>
            {hasSelection && (
              <button onClick={onClearAll} className="text-[10px] text-gray-400 hover:text-red-500">
                Clear
              </button>
            )}
          </div>
          <div className="min-h-[36px] flex items-center gap-1.5 flex-wrap">
            {!hasSelection ? (
              <p className="text-xs text-gray-400">Click + on skills to select</p>
            ) : (
              selectedSkills.map((skill) => (
                <motion.div
                  key={skill.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="px-2 py-1 bg-purple-50 rounded-md border border-purple-200 flex items-center gap-1.5 group"
                >
                  <span className="text-xs">🌿</span>
                  <span className="text-xs font-medium text-purple-700 max-w-[60px] truncate">
                    {skill.name}
                  </span>
                  <button
                    onClick={() => onRemoveSkill(skill.id)}
                    className="w-3.5 h-3.5 rounded-full bg-purple-100 hover:bg-red-100 flex items-center justify-center"
                  >
                    <X className="w-2 h-2 text-purple-400 group-hover:text-red-500" />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Right: AI Action buttons */}
        <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
          <p className="text-xs font-medium text-gray-500 mb-2">AI Actions</p>
          <div className="flex gap-2">
            {/* Combo - only when multiple selected */}
            <motion.button
              onClick={() => onAIAction('combo')}
              disabled={!hasSelection || isLoading || !rateLimit.allowed}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                hasSelection && rateLimit.allowed
                  ? "bg-purple-500 text-white hover:bg-purple-600 shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              whileHover={hasSelection && rateLimit.allowed ? { scale: 1.02 } : {}}
              whileTap={hasSelection && rateLimit.allowed ? { scale: 0.98 } : {}}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Combo
            </motion.button>

            <motion.button
              onClick={() => onAIAction('analyze')}
              disabled={!hasSelection || isLoading || !rateLimit.allowed}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                hasSelection && rateLimit.allowed
                  ? "bg-blue-500 text-white hover:bg-blue-600 shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              whileHover={hasSelection && rateLimit.allowed ? { scale: 1.02 } : {}}
              whileTap={hasSelection && rateLimit.allowed ? { scale: 0.98 } : {}}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Analyze
            </motion.button>

            <motion.button
              onClick={() => onAIAction('related')}
              disabled={!hasSelection || isLoading || !rateLimit.allowed}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                hasSelection && rateLimit.allowed
                  ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              whileHover={hasSelection && rateLimit.allowed ? { scale: 1.02 } : {}}
              whileTap={hasSelection && rateLimit.allowed ? { scale: 0.98 } : {}}
            >
              <Zap className="w-3.5 h-3.5" />
              Related
            </motion.button>

            <motion.button
              onClick={() => onAIAction('path')}
              disabled={!hasSelection || isLoading || !rateLimit.allowed}
              className={clsx(
                "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
                hasSelection && rateLimit.allowed
                  ? "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              whileHover={hasSelection && rateLimit.allowed ? { scale: 1.02 } : {}}
              whileTap={hasSelection && rateLimit.allowed ? { scale: 0.98 } : {}}
            >
              <Rocket className="w-3.5 h-3.5" />
              Path
            </motion.button>
          </div>
          <p className="text-[9px] text-gray-400 mt-1.5">
            {isAdmin ? '🔑 Admin' : isPremium ? '✨ Unlimited' : isPro ? '⭐ 1/day' : '🌱 1/week'}
            {!rateLimit.allowed && <span className="text-amber-500 ml-1">{rateLimit.nextAvailable}</span>}
          </p>
        </div>
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-100"
          >
            <div className="flex items-center justify-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 rounded-full border-3 border-purple-200 border-t-purple-500"
              />
              <div>
                <p className="text-sm font-medium text-purple-700">AI is thinking...</p>
                <p className="text-xs text-purple-500">Crafting personalized ideas</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {error && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 rounded-xl border border-red-100 text-sm text-red-600"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results area */}
      <AnimatePresence>
        {results && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relative"
          >
            {/* Close button */}
            <button
              onClick={onCloseResults}
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center z-10"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>

            {/* Results content based on type */}
            <div className="p-4 bg-gradient-to-br from-white to-gray-50 rounded-xl border border-gray-200 shadow-lg">
              {/* Header */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className={clsx(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  results.type === 'combo' && "bg-purple-100",
                  results.type === 'analyze' && "bg-blue-100",
                  results.type === 'related' && "bg-amber-100",
                  results.type === 'path' && "bg-green-100"
                )}>
                  {results.type === 'combo' && <Sparkles className="w-4 h-4 text-purple-600" />}
                  {results.type === 'analyze' && <Lightbulb className="w-4 h-4 text-blue-600" />}
                  {results.type === 'related' && <Zap className="w-4 h-4 text-amber-600" />}
                  {results.type === 'path' && <Rocket className="w-4 h-4 text-green-600" />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {results.type === 'combo' && 'Combo Project Ideas'}
                    {results.type === 'analyze' && 'Skill Analysis'}
                    {results.type === 'related' && 'Related Skills'}
                    {results.type === 'path' && 'Learning Path'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Based on: {selectedSkills.map(s => s.name).join(', ')}
                  </p>
                </div>
              </div>

              {/* Combo results */}
              {results.type === 'combo' && results.combos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.combos.slice(0, 6).map((combo, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-3 bg-white rounded-lg border border-gray-100 hover:border-purple-200 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-2xl">{combo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 transition-colors">
                            {combo.project}
                          </p>
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{combo.description}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-1 flex-wrap">
                        {combo.skills.map((s, j) => (
                          <span key={j} className="px-1.5 py-0.5 text-[9px] bg-gray-100 text-gray-600 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Related/Suggested skills */}
              {(results.type === 'related' || results.type === 'path') && results.suggestions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {results.suggestions.slice(0, 8).map((suggestion, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => onStartLearning(suggestion.skill)}
                      className="p-3 bg-white rounded-lg border border-gray-100 hover:border-amber-200 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">{suggestion.icon}</span>
                        <span className="text-sm font-medium text-gray-800 group-hover:text-amber-700">
                          {suggestion.skill}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Unlocks {suggestion.unlocks.length} project{suggestion.unlocks.length !== 1 ? 's' : ''}
                      </p>
                      <button className="mt-2 w-full py-1 text-[10px] font-medium text-amber-600 bg-amber-50 rounded hover:bg-amber-100 transition-colors">
                        Start Learning
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Analysis placeholder */}
              {results.type === 'analyze' && (
                <div className="space-y-3">
                  {results.combos.slice(0, 3).map((combo, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="p-3 bg-blue-50 rounded-lg border border-blue-100"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{combo.icon}</span>
                        <span className="text-sm font-medium text-blue-800">{combo.project}</span>
                      </div>
                      <p className="text-xs text-blue-600">{combo.description}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {results.combos.length === 0 && results.suggestions.length === 0 && (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">No results found</p>
                  <p className="text-xs text-gray-400">Try selecting different skills</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Wrapper with Provider
export function SkillTreeCanvas({
  skills,
  onSkillClick,
  hasAccess = false,
  isPremium = false,
  isAdmin = false,
  plannedSkills = [],
  onAddPlannedSkill,
  onRemovePlannedSkill,
  onStartLearning,
}: {
  skills: SkillData[];
  onSkillClick: (sessionId: string, status?: string) => void;
  hasAccess?: boolean;
  isPremium?: boolean;
  isAdmin?: boolean;
  plannedSkills?: PlannedSkill[];
  onAddPlannedSkill?: (skill: string, icon: string) => void;
  onRemovePlannedSkill?: (skill: string) => void;
  onStartLearning?: (skill: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <SkillTreeCanvasInner
        skills={skills}
        onSkillClick={onSkillClick}
        hasAccess={hasAccess}
        isPremium={isPremium}
        isAdmin={isAdmin}
        plannedSkills={plannedSkills}
        onAddPlannedSkill={onAddPlannedSkill || (() => {})}
        onRemovePlannedSkill={onRemovePlannedSkill || (() => {})}
        onStartLearning={onStartLearning || (() => {})}
      />
    </ReactFlowProvider>
  );
}
