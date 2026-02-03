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
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { communityService, Notification as ApiNotification } from '@/services/communityService';

const NAV_ITEMS = [
  { path: '/today', label: 'Today', icon: Home },
  { path: '/showcase', label: 'Showcase', icon: Trophy },
  { path: '/vault', label: 'Vault', icon: BookOpen },
  { path: '/community', label: 'Community', icon: Users },
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
    fromUserName: n.fromUser?.name || 'Someone',
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
            ? 'bg-brand-50 text-brand-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
        className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden"
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Notifications {unreadCount > 0 && `(${unreadCount})`}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={clsx(
                  'p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer',
                  !notification.isRead && 'bg-gray-100/50'
                )}
                onClick={() => onMarkRead(notification.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                    {notification.type === 'comment' && <MessageCircle className="w-4 h-4 text-gray-600" />}
                    {notification.type === 'course_request' && <Eye className="w-4 h-4 text-gray-600" />}
                    {notification.type === 'course_granted' && <Check className="w-4 h-4 text-gray-600" />}
                    {notification.type === 'mention' && <MessageCircle className="w-4 h-4 text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
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
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                        "{notification.message}"
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {getTimeAgo(notification.createdAt)}
                    </p>

                    {notification.type === 'course_request' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onGrantAccess(notification.id);
                          }}
                          className="px-3 py-1 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                        >
                          Grant Access
                        </button>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                        >
                          Ignore
                        </button>
                      </div>
                    )}
                  </div>
                  {!notification.isRead && (
                    <div className="w-2 h-2 bg-gray-800 rounded-full flex-shrink-0" />
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
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-gray-200">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <NavLink to="/today" className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-display font-bold text-xl text-gray-900">
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
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg relative"
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
              <button className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-600" />
                </div>
              </button>

              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg
                            border border-gray-200 py-2 opacity-0 invisible
                            group-hover:opacity-100 group-hover:visible transition-all">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-sm text-gray-500">{user?.email}</p>
                </div>
                <NavLink
                  to="/settings"
                  className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-50"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </NavLink>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50"
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 px-4 py-2 rounded-lg',
                isActive ? 'text-brand-600' : 'text-gray-500'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-lg',
              isActive ? 'text-brand-600' : 'text-gray-500'
            )
          }
        >
          <User className="w-5 h-5" />
          <span className="text-sm">Profile</span>
        </NavLink>
      </div>
    </nav>
  );
}

export function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      
      <main className="pb-20 md:pb-0">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
