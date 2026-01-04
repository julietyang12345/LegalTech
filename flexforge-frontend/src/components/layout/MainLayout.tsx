import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Home,
  CalendarDays,
  Trophy,
  BookOpen,
  Settings,
  User,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CompanionChat, CompanionBubble } from '@/components/companion';
import { StreakBadge } from '@/components/common';

const NAV_ITEMS = [
  { path: '/today', label: 'Today', icon: Home },
  { path: '/plan', label: 'Plan', icon: CalendarDays },
  { path: '/showcase', label: 'Showcase', icon: Trophy },
  { path: '/vault', label: 'Vault', icon: BookOpen },
];

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

function TopNav() {
  const { user, logout } = useAuthStore();
  const location = useLocation();

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
          <div className="flex items-center gap-4">
            {user && <StreakBadge count={user.currentStreak} />}

            {/* User menu */}
            <div className="relative group">
              <button className="flex items-center gap-2 p-2 rounded-full hover:bg-gray-100 transition-colors">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-brand-600" />
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
            <span className="text-xs">{item.label}</span>
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
          <span className="text-xs">Profile</span>
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

      {/* Companion */}
      <CompanionBubble />
      <CompanionChat />
    </div>
  );
}
