import React, { useState, useEffect } from 'react';
import { 
  User, 
  Bell, 
  Shield, 
  Globe, 
  Cpu,
  Save,
  CheckCircle2,
  RefreshCw,
  Server,
  Lock,
  Sparkles,
  Zap,
  Activity,
  ArrowRight,
  ShieldAlert,
  Loader2,
  ShieldCheck,
  Radio,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Clock,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import axios from 'axios';
import { API_BASE_URL } from '../config';

type SettingsTab = 'profile' | 'notifications' | 'security' | 'ai';

const Settings = () => {
  // useApp hook
  const { user } = useApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isSaving, setIsSaving] = useState(false);

  // --- Profile States ---
  const [fullName, setFullName] = useState(() => localStorage.getItem('procureai_fullname') || 'Vivek Goud');
  const [email, setEmail] = useState(() => localStorage.getItem('procureai_email') || 'user@procureai.co');
  const [org, setOrg] = useState(() => localStorage.getItem('procureai_org') || 'ProcureAI Labs');

  // --- AI Config States ---
  const [aggressive, setAggressive] = useState(() => localStorage.getItem('procureai_aggressive') !== 'false');
  const [autoSettle, setAutoSettle] = useState(() => localStorage.getItem('procureai_autosettle') === 'true');
  const [agentTone, setAgentTone] = useState(() => localStorage.getItem('procureai_tone') || 'Competitive');
  const [agentSpeed, setAgentSpeed] = useState(() => localStorage.getItem('procureai_speed') || 'Humanized');

  // --- Notification States ---
  const [emailAlerts, setEmailAlerts] = useState(() => localStorage.getItem('procureai_emailalerts') !== 'false');
  const [pushAlerts, setPushAlerts] = useState(() => localStorage.getItem('procureai_pushalerts') !== 'false');
  const [bcAlerts, setBcAlerts] = useState(() => localStorage.getItem('procureai_bcalerts') !== 'false');

  // --- Security States ---
  const [signPref, setSignPref] = useState(() => localStorage.getItem('procureai_signpref') || 'standard');
  const [biometricAuth, setBiometricAuth] = useState(() => localStorage.getItem('procureai_bioauth') === 'true');
  const [autoLockRisk, setAutoLockRisk] = useState(() => localStorage.getItem('procureai_autolock') !== 'false');

  // --- Change Password States ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  /**
   * Restores settings state from localStorage, undoing any unsaved edits.
   */
  const handleCancel = () => {
    setFullName(localStorage.getItem('procureai_fullname') || 'Vivek Goud');
    setEmail(localStorage.getItem('procureai_email') || 'user@procureai.co');
    setOrg(localStorage.getItem('procureai_org') || 'ProcureAI Labs');
    
    setAggressive(localStorage.getItem('procureai_aggressive') !== 'false');
    setAutoSettle(localStorage.getItem('procureai_autosettle') === 'true');
    setAgentTone(localStorage.getItem('procureai_tone') || 'Competitive');
    setAgentSpeed(localStorage.getItem('procureai_speed') || 'Humanized');

    setEmailAlerts(localStorage.getItem('procureai_emailalerts') !== 'false');
    setPushAlerts(localStorage.getItem('procureai_pushalerts') !== 'false');
    setBcAlerts(localStorage.getItem('procureai_bcalerts') !== 'false');

    setSignPref(localStorage.getItem('procureai_signpref') || 'standard');
    setBiometricAuth(localStorage.getItem('procureai_bioauth') === 'true');
    setAutoLockRisk(localStorage.getItem('procureai_autolock') !== 'false');



    toast.info('Changes reverted.');
  };

  /**
   * Persists all state configurations to localStorage and issues success notification.
   */
  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      localStorage.setItem('procureai_fullname', fullName);
      localStorage.setItem('procureai_email', email);
      localStorage.setItem('procureai_org', org);
      
      localStorage.setItem('procureai_aggressive', aggressive.toString());
      localStorage.setItem('procureai_autosettle', autoSettle.toString());
      localStorage.setItem('procureai_tone', agentTone);
      localStorage.setItem('procureai_speed', agentSpeed);

      localStorage.setItem('procureai_emailalerts', emailAlerts.toString());
      localStorage.setItem('procureai_pushalerts', pushAlerts.toString());
      localStorage.setItem('procureai_bcalerts', bcAlerts.toString());

      localStorage.setItem('procureai_signpref', signPref);
      localStorage.setItem('procureai_bioauth', biometricAuth.toString());
      localStorage.setItem('procureai_autolock', autoLockRisk.toString());

      // Sync active AppContext user
      localStorage.setItem('procureai_user', JSON.stringify({ email }));

      toast.success('Procurement settings saved successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };



  /**
   * Handle password change for authenticated user.
   */
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
      const token = localStorage.getItem('procureai_token');
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
      console.error(error);
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-8 w-full pb-16 pt-4 px-2">
      {/* 🚀 SETTINGS HEADER - EXPANDED FULL WIDTH */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6 border-b border-slate-100 pb-6">
        <div className="space-y-2">
          {/* Status Indicator Chips */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-[9px] font-black uppercase tracking-wider shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Settings Console
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-[9px] font-black uppercase tracking-wider shadow-sm">
              <ShieldCheck className="w-3 h-3 text-violet-500 animate-pulse" />
              Enterprise Identity Active
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-wider shadow-sm">
              <Radio className="w-3 h-3 text-slate-500 animate-pulse" />
              Environment Synchronized
            </div>
          </div>
          <h1 className="text-4xl font-display font-medium tracking-tight text-slate-950">
            System Preferences
          </h1>
          <p className="text-slate-500 max-w-4xl font-medium text-sm leading-relaxed">
            Configure your enterprise account profile, autonomous AI agent negotiation behaviors, and settlement authorization methods.
          </p>
        </div>
      </div>

      {/* Main Grid: Navigation Sidebar & Two-Column Grid Setup */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar Tabs - Left Span */}
        <div className="xl:col-span-3 flex flex-row xl:flex-col overflow-x-auto gap-1.5 space-y-0 xl:space-y-1 bg-white p-2.5 sm:p-3 rounded-[1.5rem] border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] no-scrollbar">
          {[
            { id: 'profile', name: 'Profile', icon: User, desc: 'Enterprise Identity details' },
            { id: 'ai', name: 'AI Config', icon: Cpu, desc: 'Autonomous negotiation bots' },
            { id: 'notifications', name: 'Notifications', icon: Bell, desc: 'Sourcing email & push triggers' },
            { id: 'security', name: 'Security', icon: Shield, desc: 'Settlement authorization preferences' },
          ].map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  "w-auto xl:w-full shrink-0 flex flex-col items-start gap-1 px-4 py-2.5 sm:py-3 rounded-xl text-left transition-all relative cursor-pointer",
                  isActive 
                    ? "bg-slate-950 text-white border-l-0 xl:border-l-4 border-b-2 xl:border-b-0 border-blue-500 font-bold shadow-md" 
                    : "text-slate-500 hover:text-slate-950 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn("w-4.5 h-4.5 transition-colors", isActive ? "text-blue-400" : "text-slate-400")} />
                  <span className="text-sm font-bold">{item.name}</span>
                </div>
                <span className={cn("text-[9px] pl-7 font-semibold uppercase tracking-wider block", isActive ? "text-slate-400" : "text-slate-400/80")}>
                  {item.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content wrappers - Right Span (Wider Grid) */}
        <div className="xl:col-span-9 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              {/* DOUBLE-COLUMN GRID LAYOUT WITHIN CARDS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT GRID COLUMN: Settings Controls (Spans 7 Cols) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* PROFILE TAB PANEL */}
                  {activeTab === 'profile' && (
                    <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] rounded-[1.5rem] overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-6">
                        <CardTitle className="text-xl font-bold text-slate-950 flex items-center gap-2.5">
                          <User className="w-5 h-5 text-blue-600" /> Account Profile
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs mt-1">
                          Update your personal information and public enterprise profile.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                            <Input 
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className="bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl h-11" 
                              placeholder="e.g. Vivek Goud"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                            <Input 
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl h-11" 
                              placeholder="e.g. user@procureai.co"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Organization</label>
                          <Input 
                            value={org}
                            onChange={(e) => setOrg(e.target.value)}
                            className="bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl h-11" 
                            placeholder="e.g. ProcureAI Labs"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* AI CONFIG TAB PANEL */}
                  {activeTab === 'ai' && (
                    <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] rounded-[1.5rem] overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-6">
                        <CardTitle className="text-xl font-bold text-slate-950 flex items-center gap-2.5">
                          <Cpu className="w-5 h-5 text-blue-600" /> AI Agent Preferences
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs mt-1">
                          Control how your autonomous agents behave during supplier negotiations.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        {/* Toggle: Aggressive Negotiation */}
                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Aggressive Negotiation</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Agents will aggressively prioritize target budgets and pricing caps over expected delivery timelines.</p>
                          </div>
                          <button
                            onClick={() => setAggressive(!aggressive)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              aggressive ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                aggressive ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        {/* Toggle: Auto-Settlement */}
                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Auto-Settlement</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Automatically execute escrow funding deals that meet all criteria without physical approvals.</p>
                          </div>
                          <button
                            onClick={() => setAutoSettle(!autoSettle)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              autoSettle ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                autoSettle ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        {/* Selector: Agent Tone */}
                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Negotiation Strategy / Tone</label>
                          <div className="grid grid-cols-3 gap-3">
                            {['Collaborative', 'Diplomatic', 'Competitive'].map((tone) => (
                              <button
                                key={tone}
                                onClick={() => setAgentTone(tone)}
                                className={cn(
                                  "py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center",
                                  agentTone === tone
                                    ? "bg-slate-950 border-slate-950 text-white font-bold shadow-md"
                                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-950 hover:border-slate-300"
                                )}
                              >
                                {tone}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Selector: Agent Speed */}
                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Agent Response Speed</label>
                          <div className="grid grid-cols-3 gap-3">
                            {['Instant', 'Humanized', 'Delayed'].map((speed) => (
                              <button
                                key={speed}
                                onClick={() => setAgentSpeed(speed)}
                                className={cn(
                                  "py-3 px-4 rounded-xl border text-xs font-bold transition-all text-center",
                                  agentSpeed === speed
                                    ? "bg-slate-950 border-slate-950 text-white font-bold shadow-md"
                                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-950 hover:border-slate-300"
                                )}
                              >
                                {speed}
                              </button>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* NOTIFICATIONS TAB PANEL */}
                  {activeTab === 'notifications' && (
                    <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] rounded-[1.5rem] overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-6">
                        <CardTitle className="text-xl font-bold text-slate-950 flex items-center gap-2.5">
                          <Bell className="w-5 h-5 text-blue-600" /> Alerts & Notifications
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs mt-1">
                          Manage real-time channels for alerts, smart-contracts, and pipeline progress.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Email Sourcing Alerts</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Receive immediate summaries when negotiations concluded or actions require review.</p>
                          </div>
                          <button
                            onClick={() => setEmailAlerts(!emailAlerts)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              emailAlerts ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                emailAlerts ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Live Push Broadcasts</p>
                            <p className="text-xs text-slate-500 leading-relaxed">In-browser system notifications for instant updates during live supplier sourcing scans.</p>
                          </div>
                          <button
                            onClick={() => setPushAlerts(!pushAlerts)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              pushAlerts ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                pushAlerts ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Escrow Status Alerts</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Receive alerts when contract states change (e.g. Funding locked, Proof uploaded, Settled).</p>
                          </div>
                          <button
                            onClick={() => setBcAlerts(!bcAlerts)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              bcAlerts ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                bcAlerts ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* SECURITY TAB PANEL */}
                  {activeTab === 'security' && (
                    <Card className="bg-white border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] rounded-[1.5rem] overflow-hidden">
                      <CardHeader className="border-b border-slate-100 pb-6">
                        <CardTitle className="text-xl font-bold text-slate-950 flex items-center gap-2.5">
                          <Shield className="w-5 h-5 text-blue-600" /> Transaction Security
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-xs mt-1">
                          Configure secure signing schemes, compliance barriers, and access verification preferences.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Biometric Authorization</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Prompt for biometric confirmation when authorizing escrow settlements.</p>
                          </div>
                          <button
                            onClick={() => setBiometricAuth(!biometricAuth)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              biometricAuth ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                biometricAuth ? "translate-x-5.5" : "translate-x-0"
                              )}
                        />
                      </button>
                        </div>

                        <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-all shadow-sm">
                          <div className="space-y-1 pr-6">
                            <p className="text-sm font-semibold text-slate-900">Autonomous Dispute Guard</p>
                            <p className="text-xs text-slate-500 leading-relaxed">Instantly lock escrow assets if supplier fulfillment risk threshold exceeds 75%.</p>
                          </div>
                          <button
                            onClick={() => setAutoLockRisk(!autoLockRisk)}
                            className={cn(
                              "w-12 h-6.5 rounded-full p-1 transition-all duration-300 relative focus:outline-none flex items-center shadow-inner",
                              autoLockRisk ? "bg-slate-950 shadow-slate-950/20" : "bg-slate-200"
                            )}
                          >
                            <div
                              className={cn(
                                "w-4.5 h-4.5 bg-white rounded-full transition-all duration-300 shadow-md",
                                autoLockRisk ? "translate-x-5.5" : "translate-x-0"
                              )}
                            />
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Escrow Release Signing Protocol</label>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                              { id: 'standard', label: 'Buyer Approval', desc: 'Direct buyer release' },
                              { id: 'dual', label: 'Dual Authorization', desc: 'Buyer + Audit verification' },
                              { id: 'multisig', label: 'Three-Way Match', desc: 'Buyer + Carrier + Inspector' }
                            ].map((proto) => (
                              <button
                                key={proto.id}
                                onClick={() => setSignPref(proto.id)}
                                className={cn(
                                  "p-4 rounded-xl border text-left transition-all",
                                  signPref === proto.id
                                    ? "bg-slate-950 border-slate-950 text-white font-bold shadow-md"
                                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-950 hover:border-slate-300"
                                )}
                              >
                                <p className="text-xs font-bold uppercase tracking-wider">{proto.label}</p>
                                <p className="text-[10px] text-slate-400 mt-1 font-medium">{proto.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Change Password Section */}
                        <div className="pt-6 border-t border-slate-100">
                          <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <Lock className="w-4 h-4 text-blue-600" />
                            Change Password
                          </h3>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Current Password</label>
                              <div className="relative">
                                <Input 
                                  type={showCurrentPassword ? "text" : "password"}
                                  placeholder="Enter current password"
                                  className="h-11 bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl pr-10"
                                  value={currentPassword}
                                  onChange={(e) => setCurrentPassword(e.target.value)}
                                />
                                <button 
                                  type="button"
                                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">New Password</label>
                              <div className="relative">
                                <Input 
                                  type={showNewPassword ? "text" : "password"}
                                  placeholder="Enter new password"
                                  className="h-11 bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl pr-10"
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                />
                                <button 
                                  type="button"
                                  onClick={() => setShowNewPassword(!showNewPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Confirm New Password</label>
                              <div className="relative">
                                <Input 
                                  type={showConfirmPassword ? "text" : "password"}
                                  placeholder="Confirm new password"
                                  className="h-11 bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 rounded-xl pr-10"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                                <button 
                                  type="button"
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            <Button
                              onClick={handleChangePassword}
                              disabled={isChangingPassword}
                              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                              {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                              {isChangingPassword ? 'Changing Password...' : 'Change Password'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Action Trigger Row: Cancel / Save Changes */}
          <div className="flex justify-end gap-3.5 border-t border-slate-100 pt-6">
            <Button 
              variant="ghost" 
              onClick={handleCancel}
              className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-950 hover:bg-slate-50 border border-slate-200 rounded-xl h-12 px-6 transition-all"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={isSaving}
              className="bg-slate-950 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl h-12 px-8 shadow-xl shadow-slate-200 transition-all gap-2 hover:scale-[1.02]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-white" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

                  
