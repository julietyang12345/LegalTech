import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  MessageCircle,
  HelpCircle,
  Folder,
  ChevronRight,
  Clock,
  Check,
  Flag,
  X,
  Send,
  Pin,
  MoreVertical,
  Trophy,
  ExternalLink,
  Github,
  Share2,
  Code,
  UserPlus,
  UserMinus,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '@/stores/authStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useCommunityShareStore } from '@/stores/communityShareStore';
import { projectService } from '@/services/projectService';
import { Button, Card, Input } from '@/components/common';
import type { Project } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

type PostType = 'project' | 'question' | 'progress';
type ViewMode = 'groups' | 'my-projects';

interface Comment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  commentType: 'worked-for-me' | 'clarification' | 'watch-out' | 'general';
  createdAt: Date;
  isHelpful?: boolean;
}

interface LinkedCourse {
  sessionId: string;
  skillName: string;
  skillLevel: string;
  durationDays: number;
  currentDay: number;
  progress: number;
}

interface Post {
  id: string;
  type: PostType;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: Date;

  // Project post fields
  title?: string;
  currentState?: 'started' | 'in-progress' | 'paused' | 'completed';
  whatDone?: string;
  feedbackWanted?: string;
  linkedProjectId?: string;
  linkedProject?: Project;
  codeSnippet?: string;

  // Course sharing
  linkedCourse?: LinkedCourse;
  dayNumber?: number;

  // Question post fields
  question?: string;
  whatTrying?: string;
  whatTried?: string;
  whereStuck?: string;

  // Progress log fields
  progressNote?: string;

  comments: Comment[];
  isPinned?: boolean;
}

interface Group {
  id: string;
  name: string;
  description: string;
  topic: string;
  memberCount: number;
  postCount: number;
  curatorId: string;
  curatorName: string;
  createdAt: Date;
  norms?: string;
}

// =============================================================================
// MOCK DATA (Replace with API calls)
// =============================================================================

const MOCK_GROUPS: Group[] = [
  {
    id: '1',
    name: 'Python Beginners',
    description: 'A supportive space for those just starting their Python journey.',
    topic: 'Python',
    memberCount: 234,
    postCount: 89,
    curatorId: 'user1',
    curatorName: 'Alex Chen',
    createdAt: new Date('2024-01-15'),
    norms: 'Be kind and patient. Everyone starts somewhere. Share your struggles openly.',
  },
  {
    id: '2',
    name: 'Web Dev Projects',
    description: 'Share your web projects, get feedback, and learn together.',
    topic: 'Web Development',
    memberCount: 456,
    postCount: 167,
    curatorId: 'user2',
    curatorName: 'Sarah Kim',
    createdAt: new Date('2024-02-20'),
    norms: 'Focus on learning, not showing off. Incomplete projects welcome!',
  },
  {
    id: '3',
    name: 'JavaScript Deep Dive',
    description: 'For those wanting to truly understand JavaScript beyond the basics.',
    topic: 'JavaScript',
    memberCount: 178,
    postCount: 45,
    curatorId: 'user3',
    curatorName: 'Mike Johnson',
    createdAt: new Date('2024-03-10'),
  },
];

const MOCK_POSTS: Post[] = [
  {
    id: 'p0',
    type: 'project',
    authorId: 'user3',
    authorName: 'Mike Johnson',
    createdAt: new Date('2024-03-27'),
    title: 'Learning React Hooks',
    currentState: 'in-progress',
    whatDone: 'Finished the useState and useEffect sections. Starting to understand the mental model.',
    feedbackWanted: 'Is my useEffect cleanup function correct?',
    linkedCourse: {
      sessionId: 'session-123',
      skillName: 'React',
      skillLevel: 'beginner',
      durationDays: 14,
      currentDay: 5,
      progress: 35,
    },
    dayNumber: 5,
    codeSnippet: `useEffect(() => {
  const timer = setInterval(() => {
    setCount(c => c + 1);
  }, 1000);

  return () => clearInterval(timer);
}, []);`,
    isPinned: true,
    comments: [
      {
        id: 'c0',
        authorName: 'Sarah Kim',
        content: 'Your cleanup looks correct! The return function runs when the component unmounts or before the effect runs again.',
        commentType: 'worked-for-me',
        createdAt: new Date('2024-03-27'),
        isHelpful: true,
      },
    ],
  },
  {
    id: 'p1',
    type: 'project',
    authorId: 'user4',
    authorName: 'Jamie Lee',
    createdAt: new Date('2024-03-25'),
    title: 'Building a Todo App with Local Storage',
    currentState: 'in-progress',
    whatDone: 'Got the basic UI working and can add/delete todos. Struggling with local storage persistence.',
    feedbackWanted: 'Is my localStorage implementation correct? Data disappears on refresh sometimes.',
    isPinned: false,
    comments: [
      {
        id: 'c1',
        authorName: 'Alex Chen',
        content: "I had the same issue! Make sure you're calling JSON.stringify when saving and JSON.parse when loading. Also check if you're saving after each change, not just on page unload.",
        commentType: 'worked-for-me',
        createdAt: new Date('2024-03-25'),
        isHelpful: true,
      },
    ],
  },
  {
    id: 'p2',
    type: 'question',
    authorId: 'user5',
    authorName: 'Taylor Swift',
    createdAt: new Date('2024-03-26'),
    question: 'Why does my async function return undefined?',
    whatTrying: 'Fetching data from an API and displaying it in my React component',
    whatTried: 'Used async/await, tried .then() syntax, console.logged everything',
    whereStuck: 'The function runs but the state never updates with the data',
    comments: [
      {
        id: 'c2',
        authorName: 'Sarah Kim',
        content: "Are you sure you're awaiting the fetch call AND the .json() call? Both are async operations.",
        commentType: 'clarification',
        createdAt: new Date('2024-03-26'),
      },
    ],
  },
];

// =============================================================================
// COMPONENTS
// =============================================================================

// Project card for My Projects section
function ProjectCard({
  project,
  onShare,
}: {
  project: Project;
  onShare: (project: Project) => void;
}) {
  return (
    <Card variant="hover" className="overflow-hidden">
      {project.screenshotUrl ? (
        <img
          src={project.screenshotUrl}
          alt={project.title}
          className="w-full h-32 object-cover"
        />
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center">
          <Trophy className="w-8 h-8 text-brand-500" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900 line-clamp-1">{project.title}</h3>
          {project.isBossProject && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex-shrink-0">
              Boss
            </span>
          )}
        </div>

        {project.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{project.description}</p>
        )}

        <div className="flex flex-wrap gap-1 mb-3">
          {project.skillsTags?.slice(0, 2).map((tag, i) => (
            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {project.demoUrl && (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
              >
                <Github className="w-4 h-4" />
              </a>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => onShare(project)}>
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Current task link component
function CurrentTaskLink({
  onShare,
}: {
  onShare: () => void;
}) {
  const { activeSession, currentDay, currentStep } = useSessionStore();

  if (!activeSession || !currentDay) {
    return null;
  }

  const taskTitle = currentDay.bossMilestone?.title || currentDay.task1?.title || `Day ${currentDay.day} Task`;

  return (
    <Card className="p-4 bg-blue-50 border-blue-200">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Code className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-blue-900 mb-1">Currently Working On</h4>
          <p className="text-sm text-blue-700 mb-2">{taskTitle}</p>
          <p className="text-xs text-blue-600 mb-3">
            {activeSession.skillName} - Day {currentDay.day} ({currentStep})
          </p>
          <Button size="sm" variant="secondary" onClick={onShare}>
            <Share2 className="w-3.5 h-3.5" />
            Share to Community
          </Button>
        </div>
      </div>
    </Card>
  );
}

// Course preview card (shown in posts)
function CoursePreviewCard({
  course,
  dayNumber,
  onClick,
}: {
  course: LinkedCourse;
  dayNumber?: number;
  onClick?: () => void;
}) {
  const levelColors = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  };

  return (
    <div
      className={clsx(
        'p-4 bg-gradient-to-br from-brand-50 to-purple-50 rounded-lg border border-brand-200',
        onClick && 'cursor-pointer hover:border-brand-300 transition-colors'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-semibold text-gray-900">{course.skillName}</h4>
            <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', levelColors[course.skillLevel as keyof typeof levelColors] || levelColors.beginner)}>
              {course.skillLevel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
            <span>Day {course.currentDay} of {course.durationDays}</span>
            {dayNumber && <span className="text-brand-600">Sharing Day {dayNumber}</span>}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-purple-500 transition-all"
              style={{ width: `${course.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">{course.progress}% complete</span>
            {onClick && (
              <span className="text-xs text-brand-600 flex items-center gap-1">
                View course <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Group card for the groups list
function GroupCard({ group, onClick }: { group: Group; onClick: () => void }) {
  return (
    <Card variant="hover" className="p-4 cursor-pointer" onClick={onClick}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center flex-shrink-0">
          <Users className="w-6 h-6 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
              {group.topic}
            </span>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">{group.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{group.memberCount} members</span>
            <span>{group.postCount} posts</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>
    </Card>
  );
}

// Post type badge
function PostTypeBadge({ type }: { type: PostType }) {
  const config = {
    project: { icon: Folder, color: 'bg-blue-100 text-blue-700', label: 'Project' },
    question: { icon: HelpCircle, color: 'bg-purple-100 text-purple-700', label: 'Question' },
    progress: { icon: Clock, color: 'bg-green-100 text-green-700', label: 'Progress' },
  };

  const { icon: Icon, color, label } = config[type];

  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full', color)}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// Project state badge
function StateBadge({ state }: { state: Post['currentState'] }) {
  if (!state) return null;

  const config = {
    started: 'bg-gray-100 text-gray-600',
    'in-progress': 'bg-yellow-100 text-yellow-700',
    paused: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
  };

  return (
    <span className={clsx('px-2 py-0.5 text-xs rounded-full', config[state])}>
      {state.replace('-', ' ')}
    </span>
  );
}

// Comment type indicator
function CommentTypeLabel({ type }: { type: Comment['commentType'] }) {
  const labels = {
    'worked-for-me': "Here's what worked for me...",
    'clarification': 'A question to clarify...',
    'watch-out': 'One thing to watch out for...',
    'general': '',
  };

  if (type === 'general') return null;

  return (
    <span className="text-xs text-gray-500 italic mb-1 block">{labels[type]}</span>
  );
}

// Single comment
function CommentItem({ comment, canMarkHelpful, onMarkHelpful }: {
  comment: Comment;
  canMarkHelpful?: boolean;
  onMarkHelpful?: () => void;
}) {
  const timeAgo = getTimeAgo(comment.createdAt);

  return (
    <div className={clsx(
      'p-3 rounded-lg',
      comment.isHelpful ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
    )}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-gray-600">
            {comment.authorName.charAt(0)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">{comment.authorName}</span>
            <span className="text-xs text-gray-500">{timeAgo}</span>
            {comment.isHelpful && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                <Check className="w-3 h-3" />
                Helpful
              </span>
            )}
          </div>
          <CommentTypeLabel type={comment.commentType} />
          <p className="text-sm text-gray-700">{comment.content}</p>
          {canMarkHelpful && !comment.isHelpful && (
            <button
              onClick={onMarkHelpful}
              className="mt-2 text-xs text-gray-500 hover:text-green-600 flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              Mark as helpful
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Post card
function PostCard({
  post,
  isExpanded,
  onToggle,
  currentUserId,
  onViewCourse,
}: {
  post: Post;
  isExpanded: boolean;
  onToggle: () => void;
  currentUserId?: string;
  onViewCourse?: (post: Post) => void;
}) {
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentType, setCommentType] = useState<Comment['commentType']>('general');
  const [commentText, setCommentText] = useState('');
  const timeAgo = getTimeAgo(post.createdAt);
  const isAuthor = currentUserId === post.authorId;

  const handleSubmitComment = () => {
    console.log('Submit comment:', { type: commentType, text: commentText });
    setCommentText('');
    setShowCommentForm(false);
  };

  return (
    <Card className={clsx('overflow-hidden', post.isPinned && 'border-brand-300')}>
      {post.isPinned && (
        <div className="px-4 py-1.5 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5 text-xs text-brand-700">
          <Pin className="w-3 h-3" />
          Pinned by curator
        </div>
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-gray-600">
              {post.authorName.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{post.authorName}</span>
              <PostTypeBadge type={post.type} />
              {post.currentState && <StateBadge state={post.currentState} />}
            </div>
            <span className="text-xs text-gray-500">{timeAgo}</span>
          </div>
          <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Content based on post type */}
        {post.type === 'project' && (
          <div className="space-y-3">
            {post.title && (
              <h3 className="font-semibold text-gray-900">{post.title}</h3>
            )}

            {/* Linked course preview */}
            {post.linkedCourse && (
              <CoursePreviewCard
                course={post.linkedCourse}
                dayNumber={post.dayNumber}
                onClick={() => onViewCourse?.(post)}
              />
            )}

            {/* Linked project preview */}
            {post.linkedProject && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-900">Linked Project</span>
                  {post.linkedProject.isBossProject && (
                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Boss</span>
                  )}
                </div>
                <p className="text-sm text-gray-700">{post.linkedProject.title}</p>
                {post.linkedProject.demoUrl && (
                  <a
                    href={post.linkedProject.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View Demo
                  </a>
                )}
              </div>
            )}

            {/* Code snippet */}
            {post.codeSnippet && (
              <div className="p-3 bg-gray-900 rounded-lg overflow-x-auto">
                <pre className="text-sm text-gray-100 font-mono">{post.codeSnippet}</pre>
              </div>
            )}

            {post.whatDone && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">What I've done</span>
                <p className="text-sm text-gray-700 mt-1">{post.whatDone}</p>
              </div>
            )}
            {post.feedbackWanted && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">Feedback wanted</span>
                <p className="text-sm text-purple-900 mt-1">{post.feedbackWanted}</p>
              </div>
            )}
          </div>
        )}

        {post.type === 'question' && (
          <div className="space-y-3">
            {post.question && (
              <h3 className="font-semibold text-gray-900">{post.question}</h3>
            )}
            <div className="space-y-2 text-sm">
              {post.whatTrying && (
                <div>
                  <span className="font-medium text-gray-700">What I'm trying to do: </span>
                  <span className="text-gray-600">{post.whatTrying}</span>
                </div>
              )}
              {post.whatTried && (
                <div>
                  <span className="font-medium text-gray-700">What I've tried: </span>
                  <span className="text-gray-600">{post.whatTried}</span>
                </div>
              )}
              {post.whereStuck && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <span className="font-medium text-orange-700">Where I'm stuck: </span>
                  <span className="text-orange-900">{post.whereStuck}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {post.type === 'progress' && (
          <p className="text-gray-700">{post.progressNote}</p>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-600"
          >
            <MessageCircle className="w-4 h-4" />
            {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
          </button>

          {post.type !== 'progress' && (
            <button
              onClick={() => setShowCommentForm(!showCommentForm)}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Reply
            </button>
          )}
        </div>

        {/* Expanded comments */}
        <AnimatePresence>
          {isExpanded && post.comments.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 space-y-3 overflow-hidden"
            >
              {post.comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  canMarkHelpful={isAuthor}
                  onMarkHelpful={() => console.log('Mark helpful:', comment.id)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Comment form */}
        <AnimatePresence>
          {showCommentForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 pt-4 border-t border-gray-100 overflow-hidden"
            >
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {(['worked-for-me', 'clarification', 'watch-out', 'general'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setCommentType(type)}
                      className={clsx(
                        'px-3 py-1.5 text-xs rounded-full transition-colors',
                        commentType === type
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {type === 'worked-for-me' && "What worked for me"}
                      {type === 'clarification' && "Question to clarify"}
                      {type === 'watch-out' && "Watch out for"}
                      {type === 'general' && "General comment"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Share your thoughts..."
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleSubmitComment}
                    disabled={!commentText.trim()}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

// Create post modal
function CreatePostModal({
  isOpen,
  onClose,
  groupName,
  projects,
  preselectedProject,
  initialShareData,
}: {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  projects: Project[];
  preselectedProject?: Project;
  initialShareData?: {
    scope: 'course' | 'task';
    sessionId: string;
    skillName: string;
    skillLevel: string;
    durationDays: number;
    currentDay: number;
    progress: number;
    dayNumber: number;
    taskTitle: string;
    taskDescription?: string;
    code?: string;
    notes?: string;
    currentState: 'started' | 'in-progress' | 'paused' | 'completed';
  } | null;
}) {
  const [postType, setPostType] = useState<PostType>('project');
  const [shareScope, setShareScope] = useState<'course' | 'task'>(initialShareData?.scope || 'course');
  const [selectedProject, setSelectedProject] = useState<Project | null>(preselectedProject || null);
  const [showCodeEditor, setShowCodeEditor] = useState(!!initialShareData?.code);
  const [codeSnippet, setCodeSnippet] = useState(initialShareData?.code || '');
  const [formData, setFormData] = useState({
    title: initialShareData?.taskTitle || preselectedProject?.title || '',
    currentState: (initialShareData?.currentState || 'in-progress') as Post['currentState'],
    whatDone: initialShareData?.notes || '',
    feedbackWanted: '',
    question: '',
    whatTrying: '',
    whatTried: '',
    whereStuck: '',
    progressNote: '',
  });

  // Course data for preview
  const courseData: LinkedCourse | null = initialShareData ? {
    sessionId: initialShareData.sessionId,
    skillName: initialShareData.skillName,
    skillLevel: initialShareData.skillLevel,
    durationDays: initialShareData.durationDays,
    currentDay: initialShareData.currentDay,
    progress: initialShareData.progress,
  } : null;

  const handleSubmit = () => {
    console.log('Create post:', {
      type: postType,
      linkedProject: selectedProject,
      shareScope,
      linkedCourse: courseData,
      codeSnippet,
      ...formData,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">New Post in {groupName}</h2>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Post type selector */}
          <div className="flex gap-2 mb-6">
            {(['project', 'question', 'progress'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setPostType(type)}
                className={clsx(
                  'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors',
                  postType === type
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {type === 'project' && 'Project'}
                {type === 'question' && 'Question'}
                {type === 'progress' && 'Progress Log'}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            {postType === 'project' && (
              <>
                {/* Link existing project */}
                {projects.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Link a project (optional)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {projects.slice(0, 5).map((project) => (
                        <button
                          key={project.id}
                          onClick={() => {
                            setSelectedProject(selectedProject?.id === project.id ? null : project);
                            if (project.title && !formData.title) {
                              setFormData({ ...formData, title: project.title });
                            }
                          }}
                          className={clsx(
                            'px-3 py-1.5 text-xs rounded-lg border transition-colors flex items-center gap-1',
                            selectedProject?.id === project.id
                              ? 'border-brand-500 bg-brand-50 text-brand-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          )}
                        >
                          {project.isBossProject && <Trophy className="w-3 h-3 text-purple-600" />}
                          {project.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Course/Task sharing from session */}
                {initialShareData && courseData && (
                  <div className="space-y-3">
                    {/* Scope selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        What do you want to share?
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShareScope('course')}
                          className={clsx(
                            'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border',
                            shareScope === 'course'
                              ? 'bg-brand-50 border-brand-300 text-brand-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          )}
                        >
                          <Trophy className="w-4 h-4 inline mr-1.5" />
                          Whole Course
                        </button>
                        <button
                          onClick={() => setShareScope('task')}
                          className={clsx(
                            'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors border',
                            shareScope === 'task'
                              ? 'bg-brand-50 border-brand-300 text-brand-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          )}
                        >
                          <Code className="w-4 h-4 inline mr-1.5" />
                          Just This Task
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1.5">
                        {shareScope === 'course'
                          ? 'Others can view your course progress and curriculum'
                          : 'Only share this specific task and your notes'}
                      </p>
                    </div>

                    {/* Course preview */}
                    <CoursePreviewCard
                      course={courseData}
                      dayNumber={shareScope === 'task' ? initialShareData.dayNumber : undefined}
                    />
                  </div>
                )}

                {/* Code snippet */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Code snippet (optional)
                    </label>
                    {!showCodeEditor && (
                      <button
                        onClick={() => setShowCodeEditor(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <Code className="w-3.5 h-3.5 text-gray-500" />
                        Add Code
                      </button>
                    )}
                  </div>
                  {showCodeEditor && (
                    <div className="relative">
                      <textarea
                        value={codeSnippet}
                        onChange={(e) => setCodeSnippet(e.target.value)}
                        placeholder="Paste your code here..."
                        className="w-full px-3 py-2 bg-gray-900 text-gray-100 font-mono text-sm border border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y min-h-[120px]"
                        rows={6}
                      />
                      <button
                        onClick={() => {
                          setCodeSnippet('');
                          setShowCodeEditor(false);
                        }}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What are you building/working on? *
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Todo app with React"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current state *</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['started', 'in-progress', 'paused', 'completed'] as const).map((state) => (
                      <button
                        key={state}
                        onClick={() => setFormData({ ...formData, currentState: state })}
                        className={clsx(
                          'px-3 py-1.5 text-sm rounded-lg transition-colors',
                          formData.currentState === state
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {state.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What have you done so far? *
                  </label>
                  <textarea
                    value={formData.whatDone}
                    onChange={(e) => setFormData({ ...formData, whatDone: e.target.value })}
                    placeholder="Describe your progress..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What feedback do you want? (optional)
                  </label>
                  <textarea
                    value={formData.feedbackWanted}
                    onChange={(e) => setFormData({ ...formData, feedbackWanted: e.target.value })}
                    placeholder="Be specific about what you'd like help with..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    rows={2}
                  />
                </div>
              </>
            )}

            {postType === 'question' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What are you trying to do? *
                  </label>
                  <textarea
                    value={formData.whatTrying}
                    onChange={(e) => setFormData({ ...formData, whatTrying: e.target.value })}
                    placeholder="Describe your goal..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    What have you already tried? *
                  </label>
                  <textarea
                    value={formData.whatTried}
                    onChange={(e) => setFormData({ ...formData, whatTried: e.target.value })}
                    placeholder="List what you've attempted..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Where are you stuck? *
                  </label>
                  <textarea
                    value={formData.whereStuck}
                    onChange={(e) => setFormData({ ...formData, whereStuck: e.target.value })}
                    placeholder="Be specific about the blocker..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    rows={2}
                  />
                </div>

                {/* Code snippet for questions */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Share code? (optional)
                    </label>
                    {!showCodeEditor && (
                      <button
                        onClick={() => setShowCodeEditor(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <Code className="w-3.5 h-3.5 text-gray-500" />
                        Add Code
                      </button>
                    )}
                  </div>
                  {showCodeEditor && (
                    <div className="relative">
                      <textarea
                        value={codeSnippet}
                        onChange={(e) => setCodeSnippet(e.target.value)}
                        placeholder="Paste your code here..."
                        className="w-full px-3 py-2 bg-gray-900 text-gray-100 font-mono text-sm border border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y min-h-[120px]"
                        rows={6}
                      />
                      <button
                        onClick={() => {
                          setCodeSnippet('');
                          setShowCodeEditor(false);
                        }}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {postType === 'progress' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What did you work on today?
                </label>
                <textarea
                  value={formData.progressNote}
                  onChange={(e) => setFormData({ ...formData, progressNote: e.target.value })}
                  placeholder="Today I..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Progress logs have reactions only (no comments by default)
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="flex-1">
              Post
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Helper function
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Shared content viewer modal - shows course/task to other users
function SharedContentViewer({
  isOpen,
  onClose,
  course,
  post,
}: {
  isOpen: boolean;
  onClose: () => void;
  course: LinkedCourse;
  post: Post;
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(post.dayNumber || null);

  if (!isOpen) return null;

  const levelColors = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  };

  // Generate mock curriculum days for display
  const curriculumDays = Array.from({ length: course.durationDays }, (_, i) => ({
    day: i + 1,
    isCompleted: i + 1 < course.currentDay,
    isCurrent: i + 1 === course.currentDay,
    isLocked: i + 1 > course.currentDay,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{course.skillName}</h2>
              <div className="flex items-center gap-2">
                <span className={clsx('px-2 py-0.5 text-xs font-medium rounded-full', levelColors[course.skillLevel as keyof typeof levelColors] || levelColors.beginner)}>
                  {course.skillLevel}
                </span>
                <span className="text-xs text-gray-500">by {post.authorName}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Progress overview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Course Progress</span>
              <span className="text-sm text-brand-600">{course.progress}% complete</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-purple-500"
                style={{ width: `${course.progress}%` }}
              />
            </div>
          </div>

          {/* Curriculum days */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Curriculum ({course.durationDays} days)</h3>
            <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
              {curriculumDays.map(({ day, isCompleted, isCurrent, isLocked }) => (
                <button
                  key={day}
                  onClick={() => !isLocked && setSelectedDay(day === selectedDay ? null : day)}
                  disabled={isLocked}
                  className={clsx(
                    'aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition-all',
                    isCompleted && 'bg-green-100 text-green-700',
                    isCurrent && 'bg-brand-100 text-brand-700 ring-2 ring-brand-500',
                    isLocked && 'bg-gray-100 text-gray-400 cursor-not-allowed',
                    !isCompleted && !isCurrent && !isLocked && 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    selectedDay === day && 'ring-2 ring-brand-500'
                  )}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : day}
                </button>
              ))}
            </div>
          </div>

          {/* Selected day or shared task content */}
          {(selectedDay || post.dayNumber) && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Day {selectedDay || post.dayNumber} - {post.title}
              </h3>

              {/* Task card - similar to session view */}
              <Card className="border-2 border-purple-200">
                <div className="p-4 space-y-4">
                  {/* Task title */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{post.title}</h4>
                      {post.currentState && (
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded-full',
                          post.currentState === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        )}>
                          {post.currentState}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* What they did */}
                  {post.whatDone && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Progress Notes</span>
                      <p className="text-sm text-gray-700 mt-1">{post.whatDone}</p>
                    </div>
                  )}

                  {/* Code snippet */}
                  {post.codeSnippet && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Code</span>
                      <pre className="mt-1 p-3 bg-gray-900 text-gray-100 text-sm rounded-lg overflow-x-auto font-mono">
                        {post.codeSnippet}
                      </pre>
                    </div>
                  )}

                  {/* Feedback wanted */}
                  {post.feedbackWanted && (
                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                      <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">Feedback Wanted</span>
                      <p className="text-sm text-purple-900 mt-1">{post.feedbackWanted}</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* View instructions */}
          <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-100">
            <p>This is a shared view of {post.authorName}'s learning journey.</p>
            <p className="mt-1">Want to learn {course.skillName}? Start your own course!</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export function CommunityPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { activeSession, currentDay } = useSessionStore();
  const { shareData, clearShareData } = useCommunityShareStore();
  const [viewMode, setViewMode] = useState<ViewMode>('groups');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [shareProject, setShareProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  const [joinedGroups, setJoinedGroups] = useState<Set<string>>(new Set());

  // Handle share from session (via URL param)
  useEffect(() => {
    if (searchParams.get('share') === 'true' && shareData) {
      // Auto-select first group and open create post modal
      setSelectedGroup(MOCK_GROUPS[0]);
      setShowCreatePost(true);
      // Clear the URL param
      setSearchParams({});
    }
  }, [searchParams, shareData, setSearchParams]);

  // Load user's projects
  useEffect(() => {
    if (viewMode === 'my-projects') {
      loadProjects();
    }
  }, [viewMode]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const response = await projectService.getAll();
      setProjects(response.projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const filteredGroups = MOCK_GROUPS.filter(group =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const bossProjects = projects.filter(p => p.isBossProject);
  const otherProjects = projects.filter(p => !p.isBossProject);

  const handleShareProject = (project: Project) => {
    setShareProject(project);
    // Show group selection or go to a default group
    if (selectedGroup) {
      setShowCreatePost(true);
    } else {
      // Default to first group for now
      setSelectedGroup(MOCK_GROUPS[0]);
      setShowCreatePost(true);
    }
  };

  const handleToggleJoinGroup = (groupId: string) => {
    setJoinedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const isGroupJoined = (groupId: string) => joinedGroups.has(groupId);

  // Group detail view
  if (selectedGroup && !showCreatePost) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => setSelectedGroup(null)}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Groups
        </button>

        {/* Group header */}
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-8 h-8 text-brand-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900">{selectedGroup.name}</h1>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-sm rounded-full">
                  {selectedGroup.topic}
                </span>
              </div>
              <p className="text-gray-600 mb-3">{selectedGroup.description}</p>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{selectedGroup.memberCount} members</span>
                <span>Curated by {selectedGroup.curatorName}</span>
              </div>
            </div>
          </div>

          {selectedGroup.norms && (
            <div className="mt-4 p-3 bg-brand-50 rounded-lg border border-brand-100">
              <span className="text-xs font-medium text-brand-700 uppercase tracking-wide">Group norms</span>
              <p className="text-sm text-brand-900 mt-1">{selectedGroup.norms}</p>
            </div>
          )}
        </Card>

        {/* Current task link */}
        {activeSession && currentDay && (
          <div className="mb-6">
            <CurrentTaskLink onShare={() => setShowCreatePost(true)} />
          </div>
        )}

        {/* Create post button */}
        <div className="mb-6">
          <Button onClick={() => setShowCreatePost(true)} className="w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Share your work or question
          </Button>
        </div>

        {/* Posts */}
        <div className="space-y-4">
          {MOCK_POSTS.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isExpanded={expandedPostId === post.id}
              onToggle={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
              currentUserId={user?.id}
              onViewCourse={setViewingPost}
            />
          ))}
        </div>

        {/* Create post modal */}
        {showCreatePost && (
          <CreatePostModal
            key={`${shareProject?.id || 'no-project'}-${shareData?.sessionId || 'no-share'}`}
            isOpen={showCreatePost}
            onClose={() => {
              setShowCreatePost(false);
              setShareProject(null);
              clearShareData();
            }}
            groupName={selectedGroup.name}
            projects={projects}
            preselectedProject={shareProject || undefined}
            initialShareData={shareData}
          />
        )}

        {/* Shared content viewer modal */}
        {viewingPost?.linkedCourse && (
          <SharedContentViewer
            isOpen={!!viewingPost}
            onClose={() => setViewingPost(null)}
            course={viewingPost.linkedCourse}
            post={viewingPost}
          />
        )}
      </div>
    );
  }

  // Main view with tabs
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Community</h1>
        <p className="text-gray-600">
          Join topic-based groups, share your projects, and learn together.
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('groups')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'groups'
              ? 'bg-brand-100 text-brand-700'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Browse Groups
        </button>
        <button
          onClick={() => setViewMode('my-projects')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            viewMode === 'my-projects'
              ? 'bg-brand-100 text-brand-700'
              : 'text-gray-600 hover:bg-gray-100'
          )}
        >
          <Trophy className="w-4 h-4 inline mr-1.5" />
          My Projects
        </button>
      </div>

      {/* Groups view */}
      {viewMode === 'groups' && (
        <>
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search groups by name or topic..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Early access notice */}
          <Card className="p-4 mb-6 bg-yellow-50 border-yellow-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <Flag className="w-4 h-4 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-medium text-yellow-900">Community is in early access</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  We're building a supportive learning space. Groups below are examples of what's coming.
                </p>
              </div>
            </div>
          </Card>

          {/* Groups list */}
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Browse Groups</h2>
            {filteredGroups.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No groups found</h3>
                <p className="text-gray-600">Try a different search term.</p>
              </Card>
            ) : (
              filteredGroups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onClick={() => setSelectedGroup(group)}
                />
              ))
            )}
          </div>

          {/* Create group CTA */}
          <Card className="mt-8 p-6 text-center bg-gradient-to-br from-gray-50 to-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">Want to start a group?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Be a curator for a topic you're passionate about.
            </p>
            <Button variant="secondary">Request to create a group</Button>
          </Card>
        </>
      )}

      {/* My Projects view */}
      {viewMode === 'my-projects' && (
        <>
          {isLoadingProjects ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-32 bg-gray-200 rounded-t-xl" />
                  <div className="p-4 bg-white rounded-b-xl shadow-sm">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No projects yet</h3>
              <p className="text-gray-600 mb-4">
                Complete boss projects in your learning sessions to build your portfolio!
              </p>
              <Button onClick={() => navigate('/today')}>Start Learning</Button>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Boss Projects */}
              {bossProjects.length > 0 && (
                <div>
                  <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-purple-600" />
                    Boss Projects ({bossProjects.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bossProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onShare={handleShareProject}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Projects */}
              {otherProjects.length > 0 && (
                <div>
                  <h2 className="font-semibold text-gray-900 mb-4">
                    Other Projects ({otherProjects.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onShare={handleShareProject}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current task card */}
          {activeSession && currentDay && (
            <div className="mt-8">
              <h2 className="font-semibold text-gray-900 mb-4">Currently Working On</h2>
              <CurrentTaskLink
                onShare={() => {
                  setSelectedGroup(MOCK_GROUPS[0]);
                  setShowCreatePost(true);
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Create post modal (when sharing from My Projects) */}
      {showCreatePost && selectedGroup && (
        <CreatePostModal
          key={`main-${shareProject?.id || 'no-project'}-${shareData?.sessionId || 'no-share'}`}
          isOpen={showCreatePost}
          onClose={() => {
            setShowCreatePost(false);
            setShareProject(null);
            setSelectedGroup(null);
            clearShareData();
          }}
          groupName={selectedGroup.name}
          projects={projects}
          preselectedProject={shareProject || undefined}
          initialShareData={shareData}
        />
      )}
    </div>
  );
}
