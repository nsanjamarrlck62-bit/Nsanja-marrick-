import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NavRail, type WorkspaceTab } from './components/NavRail';
import { ThreadSidebar } from './components/ThreadSidebar';
import { ChatViewport, type RightDrawerTab } from './components/ChatViewport';
import { RightDrawer } from './components/RightDrawer';
import { VoiceCallOverlay } from './components/VoiceCallOverlay';
import { CallsView } from './components/CallsView';
import { CalendarProductivityView } from './components/CalendarProductivityView';
import { DevicesVaultView, type VaultBlobRecord } from './components/DevicesVaultView';
import { GuardianSafetyView } from './components/GuardianSafetyView';
import { LockSettingsView } from './components/LockSettingsView';
import { AppLockScreen } from './components/AppLockScreen';
import { OfflineIndicator } from './components/PWAInstallButton';
import { AddContactModal, MyIdentityModal } from './components/IdentityModals';
import { MonetizationView } from './components/MonetizationView';
import { SpatialVaultScene } from './components/three/SpatialVaultScene';
import type {
  BiometricLockConfig,
  CalendarEventItem,
  CallLogEntry,
  Conversation,
  ConversationKind,
  DecentralizedAttachment,
  DecryptedMessage,
  DeviceSession,
  DirectoryUser,
  EncryptedMessageEnvelope,
  FocusState,
  GuardianPolicy,
  MonetizationState,
  Participant,
  ProductivityDispatch,
} from './types/kestrel';
import {
  decryptMessagePayload,
  encryptMessagePayload,
  getOrCreateDeviceIdentity,
} from './utils/crypto';

const DEFAULT_LOCK_CONFIG: BiometricLockConfig = {
  enabled: false,
  biometricEnrolled: false,
  credentialId: null,
  credentialLabel: null,
  pinHash: null,
  autoLockMinutes: 15,
  requireForSettings: false,
  requireForGuardian: false,
};

function loadSavedLockConfig(): BiometricLockConfig {
  try {
    const raw = localStorage.getItem('kestrel_lock_config');
    if (raw) return { ...DEFAULT_LOCK_CONFIG, ...(JSON.parse(raw) as Partial<BiometricLockConfig>) };
  } catch {
    // fallback
  }
  return DEFAULT_LOCK_CONFIG;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState('');
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chats');
  const [rightDrawerTab, setRightDrawerTab] = useState<RightDrawerTab>(null);

  const [deviceId, setDeviceId] = useState('dev_local');
  const [deviceFingerprint, setDeviceFingerprint] = useState('48291 09412 77310 55192');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [envelopes, setEnvelopes] = useState<EncryptedMessageEnvelope[]>([]);
  const [decryptedByConv, setDecryptedByConv] = useState<Record<string, DecryptedMessage[]>>({});
  const [inspectedMessage, setInspectedMessage] = useState<DecryptedMessage | null>(null);

  const [vaultBlobs, setVaultBlobs] = useState<VaultBlobRecord[]>([]);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [dispatches, setDispatches] = useState<ProductivityDispatch[]>([]);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [myProfile, setMyProfile] = useState<DirectoryUser | null>(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [prefilledContactQuery, setPrefilledContactQuery] = useState('');
  const [showMyIdentityModal, setShowMyIdentityModal] = useState(false);
  const [typingByConv, setTypingByConv] = useState<Record<string, string | null>>({});
  const [mobileShowChat, setMobileShowChat] = useState(true);
  const [monetization, setMonetization] = useState<MonetizationState>({
    planId: 'free',
    billingCycle: 'monthly',
    seats: 3,
    limits: {
      aiSummariesMonthly: 5,
      maxDevices: 3,
      maxConversations: 8,
      dispatchesMonthly: 5,
      vaultQuotaBytes: 2 * 1024 * 1024 * 1024,
      whiteLabelIncluded: false,
    },
    usage: {
      aiSummariesUsed: 0,
      dispatchesUsed: 0,
      cycleResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    storageTier: 'free_2gb',
    storageQuotaBytes: 2 * 1024 * 1024 * 1024,
    reservedHandles: [],
    whiteLabel: {
      active: false,
      tier: 'None',
      brandName: 'Kestrel',
      brandTagline: 'Chiat-Ratchet E2EE · Synced',
      accentColor: 'emerald',
      customDomain: '',
      bundleId: 'app.kestrel.secure',
      licenseKey: null,
      seatsIncluded: 25,
      updatedAt: 0,
    },
    invoices: [],
  });

  const [focusState, setFocusState] = useState<FocusState>({
    enabled: false,
    presetLabel: 'Off',
    endsAt: null,
    silenceSounds: true,
    hideUnreadBadges: true,
    allowVipBypass: true,
    autoReplyText: '',
  });

  const [guardianPolicy, setGuardianPolicy] = useState<GuardianPolicy>({
    childProfileActive: false,
    safeMessageFiltering: true,
    blockPiiSharing: true,
    blockUnsafeLinks: true,
    blurUnapprovedMedia: true,
    allowlistOnly: true,
    approvedContactIds: [],
    quietHoursEnabled: true,
    quietStartHour: 21,
    quietEndHour: 7,
    auditLog: [],
  });

  const [lockConfig, setLockConfig] = useState<BiometricLockConfig>(loadSavedLockConfig);
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => {
    const cfg = loadSavedLockConfig();
    return Boolean(cfg.enabled && (cfg.biometricEnrolled || cfg.pinHash));
  });
  const [pendingAuthTarget, setPendingAuthTarget] = useState<
    | { type: 'app' }
    | { type: 'settings' }
    | { type: 'guardian' }
    | { type: 'thread'; conversationId: string }
    | null
  >(null);
  const [settingsUnlocked, setSettingsUnlocked] = useState(false);
  const [guardianUnlocked, setGuardianUnlocked] = useState(false);
  const [unlockedThreadIds, setUnlockedThreadIds] = useState<string[]>([]);

  // Voice call state
  const [activeCallConv, setActiveCallConv] = useState<Conversation | null>(null);
  const [incomingCallSignal, setIncomingCallSignal] = useState<Record<string, unknown> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  const decryptAllMessages = useCallback(
    async (convList: Conversation[], envList: EncryptedMessageEnvelope[]) => {
      const convMap = new Map(convList.map((c) => [c.id, c]));
      const grouped: Record<string, DecryptedMessage[]> = {};
      for (const c of convList) grouped[c.id] = [];

      await Promise.all(
        envList.map(async (env) => {
          const conv = convMap.get(env.conversationId);
          if (!conv) return;
          const res = await decryptMessagePayload(
            conv.id,
            conv.roomSalt,
            env.keyEpoch,
            env.ciphertext,
            env.iv
          );
          if (!grouped[conv.id]) grouped[conv.id] = [];
          grouped[conv.id].push({
            ...env,
            plaintext: res.payload,
            decryptionVerified: res.verified,
          });
        })
      );

      for (const cid of Object.keys(grouped)) {
        grouped[cid].sort((a, b) => a.createdAt - b.createdAt);
      }
      setDecryptedByConv(grouped);
    },
    []
  );

  // Re-decrypt whenever conversations or envelopes change
  useEffect(() => {
    if (conversations.length > 0) {
      decryptAllMessages(conversations, envelopes);
    }
  }, [conversations, envelopes, decryptAllMessages]);

  // Initial bootstrap & device identity
  useEffect(() => {
    let mounted = true;
    let reconnectTimer: number | null = null;

    const init = async () => {
      try {
        const identity = await getOrCreateDeviceIdentity();
        if (!mounted) return;
        setDeviceId(identity.deviceId);
        setDeviceFingerprint(identity.fingerprint);

        const res = await fetch('/api/bootstrap');
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!mounted) return;

        setConversations(data.conversations || []);
        setActiveConversationId((prev) => prev || data.conversations?.[0]?.id || '');
        setEnvelopes(data.messages || []);
        setVaultBlobs(data.vaultBlobs || []);
        setDevices(data.devices || []);
        setCalendarEvents(data.calendarEvents || []);
        setDispatches(data.dispatches || []);
        setCallLogs(data.callLogs || []);
        setDirectoryUsers(data.directoryUsers || []);
        setMyProfile(data.myProfile || null);
        if (data.monetization) setMonetization(data.monetization);
        if (data.focusState) setFocusState(data.focusState);
        if (data.guardianPolicy) setGuardianPolicy(data.guardianPolicy);
        setBootstrapError('');
        setLoading(false);

        // Connect WebSocket for real-time cross-platform sync
        const connectWs = () => {
          if (!mounted) return;
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
          wsRef.current = ws;

          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                event: 'device:hello',
                payload: {
                  id: identity.deviceId,
                  name: `${navigator.platform || 'Web'} Browser Session`,
                  platform: 'Web',
                  fingerprint: identity.fingerprint,
                },
              })
            );
          };

          ws.onerror = () => {
            // Suppress noisy console error; onclose will schedule clean reconnect
          };

        ws.onmessage = (ev) => {
          try {
            const frame = JSON.parse(ev.data) as { event: string; payload: unknown };
            if (frame.event === 'message:created') {
              const incoming = frame.payload as EncryptedMessageEnvelope;
              setEnvelopes((prev) =>
                prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
              );
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === incoming.conversationId
                    ? { ...c, lastMessageAt: incoming.createdAt }
                    : c
                )
              );
            } else if (frame.event === 'message:updated') {
              const updated = frame.payload as EncryptedMessageEnvelope;
              setEnvelopes((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            } else if (frame.event === 'conversation:created') {
              const created = frame.payload as Conversation;
              setConversations((prev) =>
                prev.some((c) => c.id === created.id) ? prev : [created, ...prev]
              );
            } else if (frame.event === 'conversation:updated') {
              const updated = frame.payload as Conversation;
              setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            } else if (frame.event === 'devices:updated') {
              setDevices(frame.payload as DeviceSession[]);
            } else if (frame.event === 'focus:updated') {
              setFocusState(frame.payload as FocusState);
            } else if (frame.event === 'calendar:updated') {
              setCalendarEvents(frame.payload as CalendarEventItem[]);
            } else if (frame.event === 'dispatches:updated') {
              setDispatches(frame.payload as ProductivityDispatch[]);
            } else if (frame.event === 'guardian:updated') {
              setGuardianPolicy(frame.payload as GuardianPolicy);
            } else if (frame.event === 'calls:updated') {
              setCallLogs(frame.payload as CallLogEntry[]);
            } else if (frame.event === 'vault:updated') {
              setVaultBlobs(frame.payload as VaultBlobRecord[]);
            } else if (frame.event === 'directory:updated') {
              const dir = frame.payload as {
                directoryUsers: DirectoryUser[];
                myProfile: DirectoryUser | null;
              };
              if (dir.directoryUsers) setDirectoryUsers(dir.directoryUsers);
              if (typeof dir.myProfile !== 'undefined') setMyProfile(dir.myProfile);
            } else if (frame.event === 'monetization:updated') {
              setMonetization(frame.payload as MonetizationState);
            } else if (frame.event === 'typing:update') {
              const sig = frame.payload as {
                conversationId?: string;
                senderName?: string;
                isTyping?: boolean;
                fromDevice?: string;
              };
              if (sig.conversationId && sig.fromDevice !== identity.deviceId) {
                setTypingByConv((prev) => ({
                  ...prev,
                  [sig.conversationId!]: sig.isTyping ? sig.senderName || 'Someone' : null,
                }));
              }
            } else if (frame.event === 'call:signal') {
              const sig = frame.payload as Record<string, unknown>;
              setIncomingCallSignal(sig);
              // Automatically open call view if receiving an incoming offer from another device
              if (sig.type === 'offer' && sig.fromDevice !== identity.deviceId) {
                const targetConv = conversationsRef.current.find(
                  (c) => c.id === sig.conversationId
                );
                if (targetConv) {
                  setActiveCallConv((cur) => cur || targetConv);
                }
              }
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

          ws.onclose = () => {
            if (mounted) {
              reconnectTimer = window.setTimeout(connectWs, 2500);
            }
          };
        };

        connectWs();
      } catch (err) {
        if (mounted) {
          setBootstrapError(
            err instanceof Error ? err.message : 'Unable to connect to Kestrel relay.'
          );
          setLoading(false);
        }
      }
    };

    init();
    return () => {
      mounted = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // Auto-expire Focus Mode timer
  useEffect(() => {
    if (!focusState.enabled || !focusState.endsAt) return;
    const msLeft = focusState.endsAt - Date.now();
    const clearFocus = () => {
      fetch('/api/focus', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false, presetLabel: 'Off', endsAt: null }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((next) => {
          if (next) setFocusState(next);
        })
        .catch(() => {});
    };
    if (msLeft <= 0) {
      clearFocus();
      return;
    }
    const t = window.setTimeout(clearFocus, msLeft);
    return () => window.clearTimeout(t);
  }, [focusState.enabled, focusState.endsAt]);

  // Inactivity Auto-Lock timer
  useEffect(() => {
    if (!lockConfig.enabled || lockConfig.autoLockMinutes <= 0 || isAppLocked) return;
    let timerId = window.setTimeout(() => setIsAppLocked(true), lockConfig.autoLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => setIsAppLocked(true), lockConfig.autoLockMinutes * 60_000);
    };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [lockConfig.enabled, lockConfig.autoLockMinutes, isAppLocked]);

  useEffect(() => {
    const brand = monetization.whiteLabel.active
      ? monetization.whiteLabel.brandName || 'Kestrel'
      : 'Kestrel';
    document.title = `${brand} — Encrypted Team & Family Communication`;
  }, [monetization.whiteLabel.active, monetization.whiteLabel.brandName]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || conversations[0],
    [conversations, activeConversationId]
  );

  const allContacts = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const c of conversations) {
      for (const p of c.participants) {
        map.set(p.id, p);
      }
    }
    return Array.from(map.values());
  }, [conversations]);

  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  );

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    setMobileShowChat(true);
    setInspectedMessage(null);
    const conv = conversations.find((c) => c.id === id);
    if (conv && conv.unreadCount > 0) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unreadCount: 0 }),
      });
    }
  };

  const handleCreateConversation = async (payload: {
    name: string;
    kind: ConversationKind;
    description: string;
    isLocked: boolean;
  }) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Conversation & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Unable to create encrypted thread.');
    }
    setConversations((prev) => (prev.some((c) => c.id === data.id) ? prev : [data, ...prev]));
    setActiveConversationId(data.id);
    setActiveTab('chats');
    setMobileShowChat(true);
  };

  const handleSendMessage = async (payload: {
    text: string;
    attachment?: DecentralizedAttachment;
    replyToId?: string;
    safetyNotice?: string;
    wasFiltered?: boolean;
  }) => {
    if (!activeConversation) return;
    const threadMessages = decryptedByConv[activeConversation.id] || [];
    const encrypted = await encryptMessagePayload(
      activeConversation.id,
      activeConversation.roomSalt,
      activeConversation.keyEpoch,
      payload
    );

    const envelope: Partial<EncryptedMessageEnvelope> = {
      id: `msg_${crypto.randomUUID().slice(0, 8)}`,
      conversationId: activeConversation.id,
      senderId: 'me',
      senderName: myProfile ? `${myProfile.displayName} (@${myProfile.username})` : 'You',
      senderAvatarUrl: '/src/assets/images/avatar_marcus_1794645820744.jpg',
      createdAt: Date.now(),
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      ratchetIndex: threadMessages.length + 1,
      keyEpoch: activeConversation.keyEpoch,
      cipherSuite: encrypted.cipherSuite,
      senderFingerprint: deviceFingerprint,
      reactions: {},
    };

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) throw new Error('Relay server rejected encrypted message.');
    const saved = (await res.json()) as EncryptedMessageEnvelope;
    setEnvelopes((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
  };

  const handleReactMessage = async (messageId: string, emoji: string) => {
    const res = await fetch(`/api/messages/${encodeURIComponent(messageId)}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, actorId: 'me' }),
    });
    if (res.ok) {
      const updated = (await res.json()) as EncryptedMessageEnvelope;
      setEnvelopes((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    }
  };

  const handleRotateKeyEpoch = async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/rotate-key`, {
      method: 'POST',
    });
    if (res.ok) {
      const updated = (await res.json()) as Conversation;
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  const handleToggleLockThread = async (conversationId: string, nextLocked: boolean) => {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLocked: nextLocked }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Conversation;
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (!nextLocked) {
        setUnlockedThreadIds((prev) => prev.filter((id) => id !== conversationId));
      }
    }
  };

  const handleUpdateFocus = async (patch: Partial<FocusState>) => {
    const res = await fetch('/api/focus', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as FocusState;
      setFocusState(updated);
    }
  };

  const handleToggleQuickFocus = () => {
    if (focusState.enabled) {
      handleUpdateFocus({ enabled: false, presetLabel: 'Off', endsAt: null });
    } else {
      handleUpdateFocus({
        enabled: true,
        presetLabel: '25m Deep Work',
        endsAt: Date.now() + 25 * 60_000,
      });
    }
  };

  const handleUpdateLockConfig = (next: BiometricLockConfig) => {
    setLockConfig(next);
    localStorage.setItem('kestrel_lock_config', JSON.stringify(next));
  };

  const handleUpdateGuardianPolicy = async (patch: Partial<GuardianPolicy>) => {
    const res = await fetch('/api/guardian', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as GuardianPolicy;
      setGuardianPolicy(updated);
    }
  };

  const handleAuditLog = async (entry: {
    ruleTriggered: string;
    actionTaken: 'Redacted' | 'Blocked' | 'Quarantined';
    preview: string;
  }) => {
    if (!activeConversation) return;
    await fetch('/api/guardian/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...entry, conversationId: activeConversation.id }),
    });
  };

  const handleCreateCalendarEvent = async (payload: {
    title: string;
    conversationId: string;
    startIso: string;
    endIso: string;
    location: string;
    notes: string;
    provider: CalendarEventItem['provider'];
  }) => {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const created = (await res.json()) as CalendarEventItem;
    setCalendarEvents((prev) =>
      prev.some((e) => e.id === created.id) ? prev : [created, ...prev]
    );
    return created;
  };

  const handleDispatchTask = async (payload: {
    provider: ProductivityDispatch['provider'];
    title: string;
    summary: string;
    conversationId: string;
  }) => {
    const res = await fetch('/api/integrations/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ProductivityDispatch & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Dispatch limit reached.');
    }
    setDispatches((prev) => (prev.some((d) => d.id === data.id) ? prev : [data, ...prev]));
  };

  const handlePairDevice = async (name: string, platform: DeviceSession['platform']) => {
    const res = await fetch('/api/devices/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, platform }),
    });
    const data = (await res.json()) as DeviceSession & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Linked device limit reached.');
    }
    setDevices((prev) => (prev.some((d) => d.id === data.id) ? prev : [data, ...prev]));
  };

  const handleRevokeDevice = async (id: string) => {
    await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  const handleForceSync = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'sync:ping' }));
    }
    fetch('/api/bootstrap')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.devices) setDevices(data.devices);
        if (data.vaultBlobs) setVaultBlobs(data.vaultBlobs);
      })
      .catch(() => {});
  };

  const sendCallSignal = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: 'call:signal', payload }));
    }
  }, []);

  const handleEndVoiceCall = async (durationSec: number) => {
    if (!activeCallConv) return;
    const conv = activeCallConv;
    setActiveCallConv(null);
    await fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conv.id,
        targetName: conv.name,
        direction: conv.kind === 'team' ? 'team' : 'outgoing',
        durationSec,
        startedAt: Date.now() - durationSec * 1000,
        cipherSuite: 'DTLS-SRTP + AES-256-GCM',
      }),
    });
  };

  const isGuardianUnlocked = !lockConfig.requireForGuardian || guardianUnlocked;
  const isSettingsUnlocked = !lockConfig.requireForSettings || settingsUnlocked;

  if (loading) {
    return (
      <div className="h-[100dvh] w-screen bg-[#090C10] flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="font-display text-base font-semibold text-slate-100">
            Initializing Kestrel Keystore
          </p>
          <p className="text-xs text-slate-400">
            Deriving ECDH P-256 identity and decrypting local threads...
          </p>
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="h-[100dvh] w-screen bg-[#090C10] flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl bg-[#10151C] border border-white/[0.08] p-6 text-center space-y-4">
          <h1 className="font-display text-lg font-semibold text-slate-100">
            Encrypted Relay Unavailable
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">{bootstrapError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold transition-colors"
          >
            Reconnect Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#090C10] text-slate-100 flex">
      <NavRail
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (tab === 'chats' && activeTab === 'chats') {
            setMobileShowChat(false);
          }
          setActiveTab(tab);
        }}
        focusState={focusState}
        onToggleFocus={handleToggleQuickFocus}
        onLockApp={() => setIsAppLocked(true)}
        totalUnread={totalUnread}
        childModeActive={guardianPolicy.childProfileActive}
      />

      {activeTab === 'chats' && activeConversation && (
        <>
          <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex w-full md:w-auto'} h-full`}>
            <ThreadSidebar
              conversations={conversations}
              activeConversationId={activeConversation.id}
              onSelectConversation={handleSelectConversation}
              messagesByConversation={decryptedByConv}
              focusState={focusState}
              onOpenFocusSettings={() => setActiveTab('security')}
              onCreateConversation={handleCreateConversation}
              childProfileActive={guardianPolicy.childProfileActive}
              myProfile={myProfile}
              onOpenAddContact={(prefill) => {
                setPrefilledContactQuery(prefill || '');
                setShowAddContactModal(true);
              }}
              onOpenMyIdentity={() => setShowMyIdentityModal(true)}
              brandName={
                monetization.whiteLabel.active ? monetization.whiteLabel.brandName : 'Kestrel'
              }
              brandTagline={
                monetization.whiteLabel.active
                  ? monetization.whiteLabel.brandTagline
                  : 'Chiat-Ratchet E2EE · Synced'
              }
              planName={
                monetization.planId === 'enterprise'
                  ? 'Kestrel Enterprise'
                  : monetization.planId === 'team'
                    ? 'Kestrel Team'
                    : monetization.planId === 'plus'
                      ? 'Kestrel Plus'
                      : 'Kestrel Free'
              }
              onOpenPlans={() => setActiveTab('monetization')}
            />
          </div>

          <div className={`${mobileShowChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 h-full`}>
            <ChatViewport
              conversation={activeConversation}
              messages={decryptedByConv[activeConversation.id] || []}
              rightDrawerTab={rightDrawerTab}
              onToggleRightDrawer={(tab) =>
                setRightDrawerTab((prev) => (prev === tab ? null : tab))
              }
              onSendMessage={handleSendMessage}
              onReactMessage={handleReactMessage}
              onStartVoiceCall={(conv) => setActiveCallConv(conv)}
              onToggleLockThread={handleToggleLockThread}
              onUnlockThreadRequest={(cid) => {
                if (!lockConfig.enabled && !lockConfig.biometricEnrolled && !lockConfig.pinHash) {
                  setUnlockedThreadIds((prev) => [...prev, cid]);
                } else {
                  setPendingAuthTarget({ type: 'thread', conversationId: cid });
                }
              }}
              isThreadUnlockedInSession={unlockedThreadIds.includes(activeConversation.id)}
              guardianPolicy={guardianPolicy}
              focusState={focusState}
              onAuditLog={handleAuditLog}
              onInspectMessage={(msg) => {
                setInspectedMessage(msg);
                setRightDrawerTab('security');
              }}
              typingUserName={typingByConv[activeConversation.id] || null}
              onTypingChange={(isTyping) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      event: 'typing:update',
                      payload: {
                        conversationId: activeConversation.id,
                        senderName: myProfile?.displayName || 'Teammate',
                        isTyping,
                        fromDevice: deviceId,
                      },
                    })
                  );
                }
              }}
              onMobileBack={() => setMobileShowChat(false)}
            />
          </div>

          {rightDrawerTab && (
            <RightDrawer
              activeTab={rightDrawerTab}
              onClose={() => setRightDrawerTab(null)}
              onSelectTab={(tab) => setRightDrawerTab(tab)}
              conversation={activeConversation}
              messages={decryptedByConv[activeConversation.id] || []}
              inspectedMessage={inspectedMessage}
              deviceFingerprint={deviceFingerprint}
              onRotateKeyEpoch={handleRotateKeyEpoch}
              calendarEvents={calendarEvents}
              onCreateCalendarEvent={handleCreateCalendarEvent}
              onDispatchTask={handleDispatchTask}
              monetization={monetization}
              onOpenPlans={() => setActiveTab('monetization')}
            />
          )}
        </>
      )}

      {activeTab === 'calls' && (
        <CallsView
          conversations={conversations}
          callLogs={callLogs}
          onStartVoiceCall={(conv) => setActiveCallConv(conv)}
        />
      )}

      {activeTab === 'calendar' && (
        <CalendarProductivityView
          conversations={conversations}
          calendarEvents={calendarEvents}
          dispatches={dispatches}
          onCreateCalendarEvent={handleCreateCalendarEvent}
          onDispatchTask={handleDispatchTask}
          onOpenPlans={() => setActiveTab('monetization')}
        />
      )}

      {activeTab === 'vault' && (
        <DevicesVaultView
          devices={devices}
          currentDeviceId={deviceId}
          vaultBlobs={vaultBlobs}
          conversations={conversations}
          storageQuotaBytes={monetization.storageQuotaBytes}
          maxDevices={monetization.limits.maxDevices}
          onUpgradeStorage={() => setActiveTab('monetization')}
          onOpen3DTopology={() => setActiveTab('spatial')}
          onPairDevice={handlePairDevice}
          onRevokeDevice={handleRevokeDevice}
          onForceSync={handleForceSync}
        />
      )}

      {activeTab === 'spatial' && (
        <SpatialVaultScene
          devices={devices}
          vaultBlobs={vaultBlobs}
          conversations={conversations}
          activeConversation={activeConversation}
          onRotateKeyEpoch={handleRotateKeyEpoch}
          onForceSync={handleForceSync}
        />
      )}

      {activeTab === 'guardian' && (
        <GuardianSafetyView
          policy={guardianPolicy}
          contacts={allContacts}
          isUnlocked={isGuardianUnlocked}
          onRequestUnlock={() => setPendingAuthTarget({ type: 'guardian' })}
          onUpdatePolicy={handleUpdateGuardianPolicy}
        />
      )}

      {activeTab === 'security' && (
        <LockSettingsView
          lockConfig={lockConfig}
          isSettingsUnlocked={isSettingsUnlocked}
          onRequestUnlockSettings={() => setPendingAuthTarget({ type: 'settings' })}
          onUpdateLockConfig={handleUpdateLockConfig}
          onLockNow={() => setIsAppLocked(true)}
          focusState={focusState}
          onUpdateFocus={handleUpdateFocus}
        />
      )}

      {activeTab === 'monetization' && (
        <MonetizationView
          monetization={monetization}
          vaultBlobs={vaultBlobs}
          devicesCount={devices.length}
          conversationsCount={conversations.length}
          myProfile={myProfile}
          onMonetizationUpdated={setMonetization}
          onProfileUpdated={(profile) => {
            setMyProfile(profile);
            setDirectoryUsers((prev) => {
              const filtered = prev.filter((u) => u.id !== profile.id);
              return [profile, ...filtered];
            });
          }}
        />
      )}

      {activeCallConv && (
        <VoiceCallOverlay
          conversation={activeCallConv}
          deviceId={deviceId}
          sendSignal={sendCallSignal}
          incomingSignal={incomingCallSignal}
          onEndCall={handleEndVoiceCall}
        />
      )}

      <OfflineIndicator />

      {isAppLocked && (
        <AppLockScreen
          lockConfig={lockConfig}
          onUnlock={() => setIsAppLocked(false)}
        />
      )}

      {pendingAuthTarget && (
        <AppLockScreen
          lockConfig={lockConfig}
          title="Authentication Required"
          subtitle="Verify your biometric passkey or security PIN to unlock this protected area."
          onUnlock={() => {
            if (pendingAuthTarget.type === 'settings') setSettingsUnlocked(true);
            if (pendingAuthTarget.type === 'guardian') setGuardianUnlocked(true);
            if (pendingAuthTarget.type === 'thread') {
              setUnlockedThreadIds((prev) => [...prev, pendingAuthTarget.conversationId]);
            }
            setPendingAuthTarget(null);
          }}
          onCancel={() => setPendingAuthTarget(null)}
        />
      )}

      {showAddContactModal && (
        <AddContactModal
          directoryUsers={directoryUsers}
          initialQuery={prefilledContactQuery}
          onClose={() => {
            setShowAddContactModal(false);
            setPrefilledContactQuery('');
          }}
          onContactAdded={(conv) => {
            setConversations((prev) =>
              prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]
            );
            setActiveConversationId(conv.id);
            setActiveTab('chats');
            setMobileShowChat(true);
          }}
        />
      )}

      {showMyIdentityModal && (
        <MyIdentityModal
          currentProfile={myProfile}
          onClose={() => setShowMyIdentityModal(false)}
          onProfileSaved={(profile) => {
            setMyProfile(profile);
            setDirectoryUsers((prev) => {
              const filtered = prev.filter((u) => u.id !== profile.id);
              return [profile, ...filtered];
            });
          }}
        />
      )}
    </div>
  );
}
