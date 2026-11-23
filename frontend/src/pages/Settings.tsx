import React, { useState } from 'react';
import { 
  User, 
  Bell, 
  Shield, 
  Save, 
  CheckCircle2, 
  Lock, 
  Eye, 
  EyeOff,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import axios from 'axios';
import { API_BASE_URL } from '../config';

type SettingsTab = 'profile' | 'notifications' | 'security';

export default function Settings() {
  const { user } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isSaving, setIsSaving] = useState(false);

  // --- Profile States ---
  const [fullName, setFullName] = useState(() => localStorage.getItem('procureai_fullname') || user?.email?.split('@')[0] || 'User');
  const [email, setEmail] = useState(() => user?.email || localStorage.getItem('procureai_email') || 'user@example.com');
  const [org, setOrg] = useState(() => localStorage.getItem('procureai_org') || 'My Organization');

  // --- Notification States ---
  const [emailAlerts, setEmailAlerts] = useState(() => localStorage.getItem('procureai_emailalerts') !== 'false');

  // --- Change Password States ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      localStorage.setItem('procureai_fullname', fullName);
      localStorage.setItem('procureai_org', org);
      localStorage.setItem('procureai_emailalerts', emailAlerts.toString());
      toast.success('Settings saved successfully.');
    } catch (err) {
      toast.error('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('procureai_token');
      await axios.post(
        `${API_BASE_URL}/api/change-password`,
        {
          current_password: currentPassword,
          new_password: newPassword
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-8 w-full pb-16 pt-4 px-2">
      {/* 🚀 SETTINGS HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] font-semibold py-0.5 px-2.5">
              Account Management
            </Badge>
          </div>
          <h1 className="text-[clamp(1.5rem,2.5vw,2rem)] font-display font-bold tracking-tight text-slate-950">
            Settings
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Manage your profile, email preferences, and password.
          </p>
        </div>
      </div>

      {/* Main Grid: Navigation Sidebar & Content */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar Tabs */}
        <div className="xl:col-span-3 flex flex-row xl:flex-col overflow-x-auto gap-1.5 p-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
          {[
            { id: 'profile', name: 'Profile', icon: User, desc: 'Personal & company info' },
            { id: 'notifications', name: 'Notifications', icon: Bell, desc: 'Email alerts' },
            { id: 'security', name: 'Security', icon: Shield, desc: 'Password & authentication' },
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={`w-auto xl:w-full shrink-0 flex flex-col items-start gap-0.5 px-4 py-2.5 rounded-xl text-left transition-all ${
                  isActive 
                    ? "bg-slate-950 text-white font-bold shadow-sm" 
                    : "text-slate-600 hover:text-slate-950 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon className="w-4 h-4" />
                  <span className="text-xs font-bold">{item.name}</span>
                </div>
                <span className={`text-[10px] pl-6 block ${isActive ? "text-slate-300" : "text-slate-400"}`}>
                  {item.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content wrappers */}
        <div className="xl:col-span-9 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {/* PROFILE TAB */}
              {activeTab === 'profile' && (
                <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 pb-5">
                    <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-700" /> Account Profile
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-0.5">
                      Your identity and organizational details.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">Full Name</label>
                        <Input 
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="bg-white border-slate-200 rounded-xl h-10 text-xs" 
                          placeholder="Your name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-700">Email Address</label>
                        <Input 
                          value={email}
                          disabled
                          className="bg-slate-50 border-slate-200 text-slate-500 rounded-xl h-10 text-xs cursor-not-allowed" 
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Organization</label>
                      <Input 
                        value={org}
                        onChange={(e) => setOrg(e.target.value)}
                        className="bg-white border-slate-200 rounded-xl h-10 text-xs" 
                        placeholder="Company or Business name"
                      />
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-10 px-5 rounded-xl shadow-sm gap-2"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Changes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* NOTIFICATIONS TAB */}
              {activeTab === 'notifications' && (
                <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 pb-5">
                    <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-slate-700" /> Notifications
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-0.5">
                      Configure your communication alerts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-6">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">Email notifications</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Receive email alerts for escrow creation, payment receipts, and delivery verification updates.
                        </p>
                      </div>
                      <input 
                        type="checkbox"
                        checked={emailAlerts}
                        onChange={(e) => setEmailAlerts(e.target.checked)}
                        className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-10 px-5 rounded-xl shadow-sm gap-2"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save Preferences
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SECURITY TAB */}
              {activeTab === 'security' && (
                <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="border-b border-slate-100 pb-5">
                    <CardTitle className="text-base font-semibold text-slate-950 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-700" /> Security & Password
                    </CardTitle>
                    <CardDescription className="text-slate-500 text-xs mt-0.5">
                      Update your account password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-6 max-w-lg">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Current Password</label>
                      <div className="relative">
                        <Input 
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="bg-white border-slate-200 rounded-xl h-10 text-xs pr-10" 
                          placeholder="••••••••"
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">New Password</label>
                      <div className="relative">
                        <Input 
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="bg-white border-slate-200 rounded-xl h-10 text-xs pr-10" 
                          placeholder="At least 6 characters"
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Confirm New Password</label>
                      <div className="relative">
                        <Input 
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="bg-white border-slate-200 rounded-xl h-10 text-xs pr-10" 
                          placeholder="Re-enter new password"
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="pt-3">
                      <Button 
                        onClick={handleChangePassword}
                        disabled={isChangingPassword}
                        className="bg-slate-950 hover:bg-black text-white font-bold text-xs uppercase tracking-wider h-10 px-5 rounded-xl shadow-sm gap-2"
                      >
                        {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                        Update Password
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
