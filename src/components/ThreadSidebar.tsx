import React, { useState, useEffect } from 'react';
import { Search, Plus, Lock, BellOff, Shield, Users, User, UserPlus, AtSign } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { Avatar } from './Avatar';
import type {
  Conversation,
  ConversationKind,
  DecryptedMessage,
  DirectoryUser,
  FocusState,
} from '../types/kestrel';

interface ThreadSidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  messagesByConversation: Record<string, DecryptedMessage[]>;
  focusState: FocusState;
  onOpenFocusSettings: () => void;
  onCreateConversation: (payload: {
    name: string;
    kind: ConversationKind;
    description: string;
    isLocked: boolean;
  }) => Promise<void>;
  childProfileActive: boolean;
  myProfile: DirectoryUser | null;
  onOpenAddContact: (prefillQuery?: string) => void;
  onOpenMyIdentity: () => void;
  brandName?: string;
  brandTagline?: string;
  planName?: string;
  onOpenPlans?: () => void;
}

export const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  messagesByConversation,
  focusState,
  onOpenFocusSettings,
  onCreateConversation,
  childProfileActive,
  myProfile,
  onOpenAddContact,
  onOpenMyIdentity,
  brandName = 'Kestrel',
  brandTagline = 'Chiat-Ratchet E2EE · Synced',
  planName = 'Kestrel Free',
  onOpenPlans,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | ConversationKind>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ConversationKind>('team');
  const [newDesc, setNewDesc] = useState('');
  const [newLocked, setNewLocked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [remainingText, setRemainingText] = useState('');

  useEffect(() => {
    if (!focusState.enabled || !focusState.endsAt) {
      setRemainingText('');
      return;
    }
    const updateTimer = () => {
      const diff = (focusState.endsAt ?? 0) - Date.now();
      if (diff <= 0) {
        setRemainingText('Expiring');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      const secs = Math.floor((diff % 60000) / 1000);
      if (hrs > 0) {
        setRemainingText(`${hrs}h ${String(remMins).padStart(2, '0')}m`);
      } else {
        setRemainingText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      }
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [focusState.enabled, focusState.endsAt]);

  const filtered = conversations
    .filter((conv) => (filterKind === 'all' ? true : conv.kind === filterKind))
    .filter((conv) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        conv.name.toLowerCase().includes(q) ||
        conv.description.toLowerCase().includes(q) ||
        conv.participants.some(
          (p) =>
            p.username?.toLowerCase().includes(q) ||
            p.phoneNumber?.toLowerCase().includes(q)
        )
      );
    })
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      await onCreateConversation({
        name: newName.trim(),
        kind: newKind,
        description: newDesc.trim() || 'End-to-end encrypted Kestrel channel',
        isLocked: newLocked,
      });
      setNewName('');
      setNewDesc('');
      setNewLocked(false);
      setShowNewModal(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create encrypted thread.');
    } finally {
      setCreating(false);
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <aside className="w-full md:w-[310px] shrink-0 bg-[#10151C] border-r border-white/[0.07] flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold tracking-tight text-slate-100 truncate">
              {brandName}
            </h1>
            <p className="text-xs text-slate-400 truncate">
              {childProfileActive ? 'Child Safe Mode · Filtered' : brandTagline}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={() => onOpenAddContact()}
              title="Add Contact by Phone Number or @Username"
              aria-label="Add Contact by Number or Username"
              className="h-9 w-9 rounded-lg bg-[#161E29] hover:bg-[#1E2837] border border-white/[0.08] text-slate-200 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <UserPlus className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or enter number / @username..."
            aria-label="Search conversations or enter phone number"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>

        {/* Segmented filter tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#090C10] rounded-lg border border-white/[0.06]">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'team', label: 'Teams' },
              { id: 'direct', label: 'Direct' },
              { id: 'family', label: 'Family' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterKind(tab.id)}
              className={`h-7 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterKind === tab.id
                  ? 'bg-[#1A222D] text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Focus Mode Active Bar */}
      {focusState.enabled && (
        <button
          type="button"
          onClick={onOpenFocusSettings}
          className="mx-3 mt-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2 text-left hover:bg-amber-500/15 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <BellOff className="w-4 h-4 text-amber-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-amber-200 truncate">
                Focus: {focusState.presetLabel}
              </p>
              <p className="text-[11px] text-amber-300/75 truncate">
                Notifications silenced
              </p>
            </div>
          </div>
          {remainingText && (
            <span className="text-xs font-mono tabular-nums text-amber-200 shrink-0">
              {remainingText}
            </span>
          )}
        </button>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {searchQuery.trim() &&
          (searchQuery.trim().startsWith('@') ||
            searchQuery.replace(/\D/g, '').length >= 6) && (
            <button
              type="button"
              onClick={() => onOpenAddContact(searchQuery.trim())}
              className="w-full px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/18 border border-emerald-500/30 flex items-center gap-3 text-left transition-colors mb-1"
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-300 truncate">
                  Message {searchQuery.trim()}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  Tap to add number or @username and chat
                </p>
              </div>
            </button>
          )}

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <p className="text-sm text-slate-400">No matching threads found.</p>
            <button
              type="button"
              onClick={() => onOpenAddContact(searchQuery.trim() || undefined)}
              className="h-8 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-300 inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Phone Number or @Username</span>
            </button>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === activeConversationId;
            const threadMessages = messagesByConversation[conv.id] || [];
            const lastMsg = threadMessages[threadMessages.length - 1];
            const showUnread =
              conv.unreadCount > 0 &&
              (!focusState.enabled || !focusState.hideUnreadBadges || conv.isVipBypass);

            const avatarSrc = conv.avatarUrl || conv.participants[0]?.avatarUrl;

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-start gap-3 text-left transition-colors border ${
                  isSelected
                    ? 'bg-[#161D27] border-emerald-500/30'
                    : 'bg-transparent border-transparent hover:bg-white/[0.035]'
                }`}
              >
                <Avatar
                  src={avatarSrc}
                  name={conv.name}
                  sizeClass="w-10 h-10"
                  fallbackIcon={
                    conv.kind === 'team' ? (
                      <Users className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <User className="w-4 h-4 text-slate-400" />
                    )
                  }
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-100 truncate flex items-center gap-1.5">
                      <span className="truncate">{conv.name}</span>
                      {conv.isLocked && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                      {conv.kind === 'family' && <Shield className="w-3 h-3 text-emerald-400 shrink-0" />}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-400 truncate">
                      {conv.isLocked
                        ? 'Locked conversation · Unlock to preview'
                        : lastMsg
                          ? `${lastMsg.senderId === 'me' ? 'You: ' : `${lastMsg.senderName.split(' ')[0]}: `}${
                              lastMsg.plaintext.text || lastMsg.plaintext.attachment?.name || 'Encrypted media'
                            }`
                          : conv.description}
                    </p>
                    {showUnread && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold font-mono tabular-nums flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* My Unique Username & Phone Identity Bar */}
      <div className="p-3 border-t border-white/[0.06] bg-[#0D1117] space-y-2">
        {onOpenPlans && (
          <button
            type="button"
            onClick={onOpenPlans}
            className="w-full px-3 py-1.5 rounded-lg bg-[#121821] hover:bg-[#171F2B] border border-white/[0.06] flex items-center justify-between gap-2 text-left transition-colors"
          >
            <span className="text-[11px] text-slate-400 truncate">
              Plan: <span className="text-slate-200 font-medium">{planName}</span>
            </span>
            <span className="text-[11px] font-medium text-emerald-400 shrink-0">
              {planName === 'Kestrel Free' ? 'Upgrade' : 'Manage'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenMyIdentity}
          className="w-full px-3 py-2 rounded-xl bg-[#121821] hover:bg-[#171F2B] border border-white/[0.08] flex items-center justify-between gap-2 text-left transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <AtSign className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-100 truncate">
                {myProfile ? `@${myProfile.username}` : 'Claim @username & number'}
              </p>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {myProfile ? myProfile.phoneNumber : 'Reserve exclusive ID'}
              </p>
            </div>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium shrink-0">
            {myProfile ? 'Edit' : 'Setup'}
          </span>
        </button>
      </div>

      {/* New Chat Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#121720] border border-white/[0.1] rounded-2xl p-6 shadow-2xl">
            <h2 className="font-display text-lg font-semibold text-slate-100 mb-1">
              Create Encrypted Thread
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Initializes a dedicated ECDH-P256 / AES-256-GCM Chiat-ratchet room key.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Channel or Contact Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Incident Response Ops"
                  className="w-full h-10 px-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Thread Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['team', 'direct', 'family'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNewKind(k)}
                      className={`h-9 rounded-lg text-xs font-medium capitalize border transition-colors ${
                        newKind === k
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#090C10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Purpose
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional channel topic"
                  className="w-full h-10 px-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newLocked}
                  onChange={(e) => setNewLocked(e.target.checked)}
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500 focus:ring-emerald-500"
                />
                <span>Require biometric / PIN unlock to view messages</span>
              </label>

              {createError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
                  <p className="text-xs text-red-300">{createError}</p>
                  {onOpenPlans && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewModal(false);
                        setCreateError('');
                        onOpenPlans();
                      }}
                      className="h-7 px-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-[11px] font-semibold shrink-0 transition-colors"
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewModal(false);
                    setCreateError('');
                  }}
                  className="h-9 px-4 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/[0.05] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold transition-colors"
                >
                  {creating ? 'Provisioning Keys...' : 'Create Thread'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
