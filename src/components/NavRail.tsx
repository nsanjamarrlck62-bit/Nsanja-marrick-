import React from 'react';
import {
  MessageSquare,
  Phone,
  Calendar,
  HardDrive,
  Box,
  ShieldCheck,
  Lock,
  BellOff,
  Bell,
  CreditCard,
} from 'lucide-react';
import type { FocusState } from '../types/kestrel';
import { PWAInstallButton } from './PWAInstallButton';

export type WorkspaceTab =
  | 'chats'
  | 'calls'
  | 'calendar'
  | 'vault'
  | 'spatial'
  | 'guardian'
  | 'security'
  | 'monetization';

interface NavRailProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  focusState: FocusState;
  onToggleFocus: () => void;
  onLockApp: () => void;
  totalUnread: number;
  childModeActive: boolean;
}

export const NavRail: React.FC<NavRailProps> = ({
  activeTab,
  onSelectTab,
  focusState,
  onToggleFocus,
  onLockApp,
  totalUnread,
  childModeActive,
}) => {
  const navItems: {
    id: WorkspaceTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: 'chats',
      label: 'Chats',
      icon: MessageSquare,
      badge: focusState.enabled && focusState.hideUnreadBadges ? 0 : totalUnread,
    },
    { id: 'calls', label: 'Calls', icon: Phone },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'vault', label: 'Sync & Vault', icon: HardDrive },
    { id: 'spatial', label: '3D Vault Mesh', icon: Box },
    { id: 'guardian', label: 'Child Guard', icon: ShieldCheck },
    { id: 'security', label: 'Lock & Focus', icon: Lock },
    { id: 'monetization', label: 'Plans, Handles & Licensing', icon: CreditCard },
  ];

  return (
    <aside
      aria-label="Workspace navigation"
      className="w-[68px] shrink-0 bg-[#0D1117] border-r border-white/[0.07] flex flex-col items-center py-4 justify-between select-none overflow-y-auto"
    >
      <div className="flex flex-col items-center gap-5 w-full">
        {/* Brand emblem */}
        <button
          type="button"
          onClick={() => onSelectTab('chats')}
          title="Kestrel Encrypted Workspace"
          className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2L4 6v6c0 5.5 3.4 9.7 8 11 4.6-1.3 8-5.5 8-11V6l-8-4z" />
            <path d="M9.5 12.5L11.5 14.5L15.5 9.5" />
          </svg>
        </button>

        <nav className="flex flex-col items-center gap-1.5 w-full px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-md bg-emerald-500 text-[#06100B] text-[11px] font-semibold flex items-center justify-center tabular-nums">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
                {item.id === 'guardian' && childModeActive ? (
                  <span
                    className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-amber-400"
                    title="Child Safe Profile Active"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-2 px-2 w-full">
        <PWAInstallButton compact />

        <button
          type="button"
          onClick={onToggleFocus}
          title={focusState.enabled ? `Focus Mode Active (${focusState.presetLabel})` : 'Enable Focus Mode'}
          aria-label="Toggle Focus Mode"
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            focusState.enabled
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border-transparent'
          }`}
        >
          {focusState.enabled ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={onLockApp}
          title="Lock Workspace Now"
          aria-label="Lock Workspace Now"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Lock className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
