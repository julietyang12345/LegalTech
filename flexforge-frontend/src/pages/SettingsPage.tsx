import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Shield, Save, Eye, EyeOff, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/services/authService';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';

const tierColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-700',
  PRO: 'bg-brand-100 text-brand-700',
  PREMIUM: 'bg-purple-100 text-purple-700',
  UNLIMITED: 'bg-amber-100 text-amber-700',
};

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, fetchProfile, logout } = useAuthStore();

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Delete account state
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await authService.updateProfile({ name });
      await fetchProfile();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to change password';
      setPasswordError(msg);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await authService.deleteAccount();
      await logout();
      navigate('/');
      toast.success('Account deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setDeleting(false);
    }
  };

  if (!user) return null;

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      {/* Profile Section */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        </div>

        <div className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />

          <Input
            label="Email"
            value={user.email}
            disabled
            hint="Email cannot be changed"
          />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Tier:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${tierColors[user.quotaTier] || tierColors.FREE}`}>
              {user.quotaTier}
            </span>
          </div>

          <p className="text-sm text-gray-500">Member since {memberSince}</p>

          <div className="pt-2">
            <Button
              onClick={handleSaveProfile}
              isLoading={savingProfile}
              disabled={name === (user.name || '')}
              leftIcon={<Save className="w-4 h-4" />}
              size="sm"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </section>

      {/* Password Section */}
      {user.hasPassword && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Input
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <div className="relative">
              <Input
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                hint="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={passwordError}
            />

            <div className="pt-2">
              <Button
                onClick={handleChangePassword}
                isLoading={savingPassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
                size="sm"
              >
                Change Password
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Account Management - subtle, collapsed */}
      <div className="mt-10 pt-6 border-t border-gray-100">
        <button
          onClick={() => setShowDangerZone(!showDangerZone)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-500 transition-colors"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDangerZone ? 'rotate-90' : ''}`} />
          Account management
        </button>

        {showDangerZone && (
          <div className="mt-4 pl-5">
            <p className="text-sm text-gray-500 mb-3">
              Permanently delete your account and all associated data.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-sm text-gray-400 hover:text-red-500 underline underline-offset-2 transition-colors"
            >
              Delete my account
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Account</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete your account, all curricula, sessions, and progress.
              Type <span className="font-mono font-semibold text-red-600">delete</span> to confirm.
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "delete" to confirm'
            />
            <div className="flex gap-3 mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteAccount}
                isLoading={deleting}
                disabled={deleteConfirmText !== 'delete'}
                className="flex-1"
              >
                Delete Forever
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
