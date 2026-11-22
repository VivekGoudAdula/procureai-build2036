import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  Settings,
  Shield,
  User as UserIcon
} from 'lucide-react';

const Topbar = () => {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 md:px-8 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all duration-300">
      {/* Left: Brand Logo */}
      <div 
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2.5 cursor-pointer group select-none shrink-0"
      >
        <img 
          src="/logo.png" 
          alt="ProcureAI Logo" 
          className="h-8 w-auto group-hover:rotate-6 transition-transform duration-300 shadow-sm rounded-lg" 
        />
        <span className="text-lg font-display font-black tracking-tight text-slate-950">ProcureAI</span>
        <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
          Enterprise
        </span>
      </div>

      {/* Right: User Menu & Working Dropdown */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2.5 p-1 sm:px-2 sm:py-1 rounded-xl hover:bg-slate-100/80 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-xl bg-slate-950 flex items-center justify-center text-white font-black text-xs shadow-sm group-hover:scale-105 transition-transform">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-bold leading-none text-slate-900 group-hover:text-primary transition-colors truncate max-w-[140px]">
              {user?.name || 'Enterprise User'}
            </p>
            <p className="text-[9px] text-slate-400 font-semibold leading-tight mt-0.5 truncate max-w-[140px]">
              {user?.email || 'user@procureai.co'}
            </p>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180 text-primary' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl shadow-slate-200/50 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-4 py-2 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-900 truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold text-emerald-600">
                <Shield className="w-2.5 h-2.5" /> Verified Organization
              </div>
            </div>

            <div className="p-1">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Account Settings</span>
              </button>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer mt-1"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topbar;
