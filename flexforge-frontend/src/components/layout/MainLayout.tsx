import { useState, useEffect, useCallback } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import {
  Home,
  Trophy,
  BookOpen,
  Users,
  Settings,
  User,
  LogOut,
  Bell,
  MessageCircle,
  Eye,
  Check,
  X,
  Dumbbell,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { communityService, getDisplayName, Notification as ApiNotification } from '@/services/communityService';

const NAV_ITEMS = [
  { path: '/today', label: 'Today', icon: Home },
  { path: '/showcase', label: 'Showcase', icon: Trophy },
  { path: '/vault', label: 'Vault', icon: BookOpen },
  { path: '/community', label: 'Community', icon: Users },
  { path: '/reps', label: 'Reps', icon: Dumbbell },
];

// Local notification type for display
interface DisplayNotification {
  id: string;
  type: 'comment' | 'course_request' | 'course_granted' | 'mention';
  fromUserName: string;
  postTitle?: string;
  courseName?: string;
  message?: string;
  createdAt: Date;
  isRead: boolean;
}

// Transform API notification to display format
function toDisplayNotification(n: ApiNotification): DisplayNotification {
  return {
    id: n.id,
    type: n.type,
    fromUserName: getDisplayName(n.fromUser),
    postTitle: n.postTitle,
    courseName: n.courseName,
    message: n.message,
    createdAt: new Date(n.createdAt),
    isRead: n.isRead,
  };
}

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

function NavItem({ path, label, icon: Icon }: { path: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
            : 'text-content-secondary hover:bg-surface-tertiary hover:text-content'
        )
      }
    >
      <Icon className="w-5 h-5" />
      <span className="hidden sm:inline">{label}</span>
    </NavLink>
  );
}

function NotificationPanel({
  isOpen,
  onClose,
  notifications,
  onMarkRead,
  onGrantAccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  notifications: DisplayNotification[];
  onMarkRead: (id: string) => void;
  onGrantAccess: (id: string) => void;
}) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface rounded-xl shadow-xl border border-border z-50 overflow-hidden"
      >
        <div className="p-4 border-b border-border-secondary flex items-center justify-between">
          <h3 className="font-semibold text-content">
            Notifications {unreadCount > 0 && `(${unreadCount})`}
          </h3>
          <button onClick={onClose} className="p-1 text-content-tertiary hover:text-content-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-content-tertiary">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={clsx(
                  'p-4 border-b border-border-secondary hover:bg-surface-tertiary transition-colors cursor-pointer',
                  !notification.isRead && 'bg-surface-tertiary/50'
                )}
                onClick={() => onMarkRead(notification.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-tertiary">
                    {notification.type === 'comment' && <MessageCircle className="w-4 h-4 text-content-secondary" />}
                    {notification.type === 'course_request' && <Eye className="w-4 h-4 text-content-secondary" />}
                    {notification.type === 'course_granted' && <Check className="w-4 h-4 text-content-secondary" />}
                    {notification.type === 'mention' && <MessageCircle className="w-4 h-4 text-content-secondary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-content">
                      <span className="font-medium">{notification.fromUserName}</span>
                      {notification.type === 'comment' && ' commented on '}
                      {notification.type === 'course_request' && ' requested to view your '}
                      {notification.type === 'course_granted' && ' granted access to '}
                      {notification.type === 'mention' && ' mentioned you in '}
                      <span className="font-medium">
                        {notification.postTitle || notification.courseName}
                      </span>
                    </p>
                    {notification.message && (
                      <p className="text-xs text-content-tertiary mt-1 line-clamp-1">
                        "{notification.message}"
                      </p>
                    )}
                    <p className="text-xs text-content-tertiary mt-1">
                      {getTimeAgo(notification.createdAt)}
                    </p>

                    {notification.type === 'course_request' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onGrantAccess(notification.id);
                          }}
                          className="px-3 py-1 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600"
                        >
                          Grant Access
                        </button>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1 text-xs text-content-tertiary hover:text-content-secondary"
                        >
                          Ignore
                        </button>
                      </div>
                    )}
                  </div>
                  {!notification.isRead && (
                    <div className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </>
  );
}

function TopNav() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await communityService.getNotifications();
      setNotifications(response.notifications.map(toDisplayNotification));
      setUnreadCount(response.unreadCount);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await communityService.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleGrantAccess = async (id: string) => {
    try {
      await communityService.grantCourseAccess(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to grant access:', error);
    }
  };

  // Hide on focus mode
  if (location.pathname.startsWith('/session/')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <NavLink to="/today" className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-content">
              FlexForge
            </span>
          </NavLink>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.path} {...item} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-content-tertiary hover:text-content-secondary hover:bg-surface-tertiary rounded-lg relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <NotificationPanel
                    isOpen={showNotifications}
                    onClose={() => setShowNotifications(false)}
                    notifications={notifications}
                    onMarkRead={handleMarkRead}
                    onGrantAccess={handleGrantAccess}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* User menu */}
            <div className="relative group">
              <button className="flex items-center gap-2 p-2 rounded-full hover:bg-surface-tertiary transition-colors">
                <div className="w-8 h-8 rounded-full bg-surface-tertiary flex items-center justify-center">
                  <User className="w-4 h-4 text-content-secondary" />
                </div>
              </button>

              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-surface rounded-xl shadow-lg
                            border border-border py-2 opacity-0 invisible
                            group-hover:opacity-100 group-hover:visible transition-all">
                <div className="px-4 py-2 border-b border-border-secondary">
                  <p className="font-medium text-content">{user?.name || 'User'}</p>
                  <p className="text-sm text-content-tertiary">{user?.email}</p>
                </div>
                <NavLink
                  to="/settings"
                  className="flex items-center gap-2 px-4 py-2 text-content-secondary hover:bg-surface-tertiary"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </NavLink>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-red-500 hover:bg-red-500/10"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const location = useLocation();

  // Hide on focus mode
  if (location.pathname.startsWith('/session/')) {
    return null;
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-30">
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 px-4 py-2 rounded-lg',
                isActive ? 'text-brand-600 dark:text-brand-400' : 'text-content-tertiary'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function MainLayout() {
  return (
    <div className="min-h-screen bg-surface-secondary">
      <TopNav />

      <main className="pb-20 md:pb-0">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
