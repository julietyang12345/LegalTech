import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowLeft,
  Target,
  BarChart3,
} from 'lucide-react';
import { clsx } from 'clsx';
import { abilityService, type SkillProfile, type DimensionProfile, type TimelinePoint } from '@/services/abilityService';

function RadarChart({ dimensions }: { dimensions: DimensionProfile[] }) {
  const size = 240;
  const center = size / 2;
  const maxRadius = 90;
  const levels = 5;

  const angleStep = (2 * Math.PI) / dimensions.length;
  // Start from top (-PI/2)
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const radius = (value / levels) * maxRadius;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  };

  // Grid rings
  const gridRings = Array.from({ length: levels }, (_, i) => {
    const r = ((i + 1) / levels) * maxRadius;
    const points = dimensions.map((_, j) => {
      const angle = startAngle + j * angleStep;
      return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    });
    return points.join(' ');
  });

  // Data polygon
  const dataPoints = dimensions.map((d, i) => getPoint(i, d.average || 0));
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[280px] mx-auto">
      {/* Grid rings */}
      {gridRings.map((ring, i) => (
        <polygon
          key={i}
          points={ring}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {dimensions.map((_, i) => {
        const angle = startAngle + i * angleStep;
        const endX = center + maxRadius * Math.cos(angle);
        const endY = center + maxRadius * Math.sin(angle);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={endX}
            y2={endY}
            stroke="currentColor"
            className="text-border"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <motion.polygon
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        points={dataPolygon}
        className="fill-brand-500/20 stroke-brand-500"
        strokeWidth="2"
      />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          className="fill-brand-500"
        />
      ))}

      {/* Labels */}
      {dimensions.map((d, i) => {
        const angle = startAngle + i * angleStep;
        const labelRadius = maxRadius + 20;
        const x = center + labelRadius * Math.cos(angle);
        const y = center + labelRadius * Math.sin(angle);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-content-secondary text-[9px]"
          >
            {d.label.length > 14 ? d.label.slice(0, 12) + '...' : d.label}
          </text>
        );
      })}
    </svg>
  );
}

function TrendIcon({ trend }: { trend: DimensionProfile['trend'] }) {
  if (trend === 'improving')
    return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (trend === 'declining')
    return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-content-tertiary" />;
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const h = 20;
  const w = 60;
  const max = 5;
  const step = w / (scores.length - 1);
  const points = scores
    .map((s, i) => `${i * step},${h - (s / max) * h}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[60px] h-[20px]">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        className="text-brand-500"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DimensionCard({
  dimension,
  onSelect,
}: {
  dimension: DimensionProfile;
  onSelect: (id: string) => void;
}) {
  const getColor = () => {
    if (dimension.average >= 4) return 'text-green-600';
    if (dimension.average >= 3) return 'text-amber-600';
    if (dimension.average > 0) return 'text-red-600';
    return 'text-content-tertiary';
  };

  return (
    <button
      onClick={() => onSelect(dimension.dimensionId)}
      className="p-3 rounded-lg border border-border bg-surface hover:bg-surface-tertiary/30 transition-colors text-left w-full"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-content">{dimension.label}</span>
        <div className="flex items-center gap-1.5">
          <TrendIcon trend={dimension.trend} />
          <span className={clsx('text-sm font-semibold', getColor())}>
            {dimension.count > 0 ? dimension.average.toFixed(1) : '--'}
          </span>
        </div>
      </div>

      {/* Sparkline of recent scores */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-content-tertiary">{dimension.count} scores</span>
        <Sparkline scores={dimension.recentScores} />
      </div>
    </button>
  );
}

function TimelineChart({ points }: { points: TimelinePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="text-sm text-content-tertiary text-center py-8">
        No scores yet for this dimension.
      </div>
    );
  }

  const h = 120;
  const w = 300;
  const padding = 20;
  const maxScore = 5;

  const step = points.length > 1 ? (w - padding * 2) / (points.length - 1) : 0;
  const linePoints = points
    .map(
      (p, i) =>
        `${padding + i * step},${h - padding - ((p.score / maxScore) * (h - padding * 2))}`,
    )
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Y-axis grid lines */}
      {[1, 2, 3, 4, 5].map((v) => {
        const y = h - padding - ((v / maxScore) * (h - padding * 2));
        return (
          <g key={v}>
            <line
              x1={padding}
              y1={y}
              x2={w - padding}
              y2={y}
              stroke="currentColor"
              className="text-border"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
            <text
              x={padding - 5}
              y={y}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-content-tertiary text-[8px]"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Line */}
      <polyline
        points={linePoints}
        fill="none"
        stroke="currentColor"
        className="text-brand-500"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Dots */}
      {points.map((p, i) => {
        const x = padding + i * step;
        const y = h - padding - ((p.score / maxScore) * (h - padding * 2));
        return <circle key={i} cx={x} cy={y} r="3" className="fill-brand-500" />;
      })}
    </svg>
  );
}

export function AbilityDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SkillProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    abilityService
      .getProfile()
      .then(({ profile: p }) => setProfile(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDimension) return;
    setTimelineLoading(true);
    abilityService
      .getTimeline(selectedDimension)
      .then(({ timeline: t }) => setTimeline(t))
      .catch(() => {})
      .finally(() => setTimelineLoading(false));
  }, [selectedDimension]);

  const weakDimensions = useMemo(() => {
    if (!profile) return [];
    return profile.dimensions
      .filter((d) => d.count > 0 && d.average < 3)
      .sort((a, b) => a.average - b.average);
  }, [profile]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <div className="animate-pulse text-content-tertiary">Loading ability profile...</div>
      </div>
    );
  }

  if (!profile || profile.totalReps === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-tertiary rounded-full mb-4">
            <BarChart3 className="w-8 h-8 text-content-tertiary" />
          </div>
          <h1 className="text-xl font-bold text-content mb-2">No ability data yet</h1>
          <p className="text-content-tertiary mb-6">
            Complete some practice reps to start building your ability profile.
          </p>
          <button
            onClick={() => navigate('/reps')}
            className="px-4 py-2 text-sm font-medium bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            Start a rep
          </button>
        </div>
      </div>
    );
  }

  const selectedDef = selectedDimension
    ? profile.dimensions.find((d) => d.dimensionId === selectedDimension)
    : null;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-content-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-content">Ability Profile</h1>
          <p className="text-sm text-content-tertiary">
            {profile.totalReps} reps completed
          </p>
        </div>
      </div>

      {/* Radar chart */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border border-border bg-surface p-6 mb-6"
      >
        <RadarChart dimensions={profile.dimensions} />
      </motion.div>

      {/* Dimension cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {profile.dimensions.map((d) => (
          <DimensionCard
            key={d.dimensionId}
            dimension={d}
            onSelect={setSelectedDimension}
          />
        ))}
      </div>

      {/* Timeline (when dimension selected) */}
      {selectedDef && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-surface p-4 mb-6"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-content">
              {selectedDef.label} — Timeline
            </h3>
            <button
              onClick={() => setSelectedDimension(null)}
              className="text-xs text-content-tertiary hover:text-content-secondary"
            >
              Close
            </button>
          </div>
          {timelineLoading ? (
            <div className="text-sm text-content-tertiary text-center py-8">Loading...</div>
          ) : (
            <TimelineChart points={timeline} />
          )}
        </motion.div>
      )}

      {/* Weakness log */}
      {weakDimensions.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-medium text-content">Focus Areas</h3>
          </div>
          <div className="space-y-2">
            {weakDimensions.map((d) => (
              <div
                key={d.dimensionId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-content-secondary">{d.label}</span>
                <span className="text-red-600 font-medium">{d.average.toFixed(1)}/5</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
