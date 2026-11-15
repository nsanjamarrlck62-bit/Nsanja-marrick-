import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Sparkles,
  ShieldCheck,
  CalendarPlus,
  Lock,
  Unlock,
  Paperclip,
  Mic,
  Send,
  FileText,
  Download,
  Reply,
  X,
  Eye,
  EyeOff,
  CheckCheck,
  AlertTriangle,
  Smile,
  Search,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import type {
  Conversation,
  DecryptedMessage,
  DecentralizedAttachment,
  GuardianPolicy,
  FocusState,
} from '../types/kestrel';
import { decryptBlobFromVault, encryptBlobForVault } from '../utils/crypto';
import { evaluateMessageSafety, isWithinQuietHours } from '../utils/safetyFilter';
import { Avatar } from './Avatar';

export type RightDrawerTab = 'summary' | 'security' | 'calendar' | null;

interface ChatViewportProps {
  conversation: Conversation;
  messages: DecryptedMessage[];
  rightDrawerTab: RightDrawerTab;
  onToggleRightDrawer: (tab: Exclude<RightDrawerTab, null>) => void;
  onSendMessage: (payload: {
    text: string;
    attachment?: DecentralizedAttachment;
    replyToId?: string;
    safetyNotice?: string;
    wasFiltered?: boolean;
  }) => Promise<void>;
  onReactMessage: (messageId: string, emoji: string) => Promise<void>;
  onStartVoiceCall: (conversation: Conversation) => void;
  onToggleLockThread: (conversationId: string, nextLocked: boolean) => void;
  onUnlockThreadRequest: (conversationId: string) => void;
  isThreadUnlockedInSession: boolean;
  guardianPolicy: GuardianPolicy;
  focusState: FocusState;
  onAuditLog: (entry: { ruleTriggered: string; actionTaken: 'Redacted' | 'Blocked' | 'Quarantined'; preview: string }) => void;
  onInspectMessage: (msg: DecryptedMessage) => void;
  typingUserName?: string | null;
  onTypingChange?: (isTyping: boolean) => void;
  onMobileBack?: () => void;
}

const AttachmentCard: React.FC<{
  attachment: DecentralizedAttachment;
  conversation: Conversation;
  keyEpoch: number;
  blurMedia: boolean;
}> = ({ attachment, conversation, keyEpoch, blurMedia }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unblurred, setUnblurred] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (attachment.kind === 'image' || attachment.kind === 'audio') {
      setLoading(true);
      fetch(`/api/vault/blobs/${encodeURIComponent(attachment.cid)}`)
        .then((r) => {
          if (!r.ok) throw new Error('Failed to retrieve CID blob');
          return r.arrayBuffer();
        })
        .then((buf) =>
          decryptBlobFromVault(
            conversation.id,
            conversation.roomSalt,
            keyEpoch,
            attachment.iv,
            buf
          )
        )
        .then((plainBuf) => {
          if (!active) return;
          const blob = new Blob([plainBuf], { type: attachment.mimeType });
          createdUrl = URL.createObjectURL(blob);
          setObjectUrl(createdUrl);
        })
        .catch(() => {
          if (active) setError('Unable to decrypt CID media');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.cid, attachment.iv, attachment.kind, attachment.mimeType, conversation.id, conversation.roomSalt, keyEpoch]);

  const handleDownload = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/vault/blobs/${encodeURIComponent(attachment.cid)}`);
      if (!res.ok) throw new Error('CID blob unavailable');
      const encryptedBuf = await res.arrayBuffer();
      const plainBuf = await decryptBlobFromVault(
        conversation.id,
        conversation.roomSalt,
        keyEpoch,
        attachment.iv,
        encryptedBuf
      );
      const blob = new Blob([plainBuf], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Decryption or download failed');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (attachment.kind === 'image') {
    const shouldBlur = blurMedia && !unblurred;
    return (
      <div className="mt-2 rounded-xl overflow-hidden border border-white/[0.08] bg-[#0B0F15] max-w-sm">
        <div className="relative">
          {objectUrl ? (
            <img
              src={objectUrl}
              alt={attachment.name}
              referrerPolicy="no-referrer"
              className={`w-full max-h-64 object-cover transition-all ${shouldBlur ? 'blur-xl scale-105' : ''}`}
            />
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-slate-400">
              {loading ? 'Decrypting CID image...' : error || 'Encrypted image'}
            </div>
          )}
          {shouldBlur && objectUrl && (
            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-4 text-center">
              <EyeOff className="w-5 h-5 text-amber-300 mb-1.5" />
              <p className="text-xs font-medium text-slate-100 mb-2">
                Media shielded by Child Guard
              </p>
              <button
                type="button"
                onClick={() => setUnblurred(true)}
                className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium text-white flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Reveal Media</span>
              </button>
            </div>
          )}
        </div>
        <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-400 border-t border-white/[0.06]">
          <span className="font-mono truncate">{attachment.cid.slice(0, 18)}...</span>
          <button
            type="button"
            onClick={handleDownload}
            className="text-emerald-400 hover:text-emerald-300 font-medium shrink-0"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="mt-2 p-3 rounded-xl border border-white/[0.08] bg-[#0B0F15] max-w-sm">
        <div className="flex items-center justify-between gap-2 mb-2 text-xs text-slate-300">
          <span className="font-medium truncate">Encrypted Voice Note</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-400">
            {attachment.durationSec ? `${attachment.durationSec}s` : formatBytes(attachment.sizeBytes)}
          </span>
        </div>
        {objectUrl ? (
          <audio controls src={objectUrl} className="w-full h-9" />
        ) : (
          <p className="text-xs text-slate-400">{loading ? 'Decrypting audio...' : error}</p>
        )}
        <p className="mt-1.5 text-[11px] font-mono text-slate-500 truncate">
          CID {attachment.cid.slice(0, 22)}...
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 rounded-xl border border-white/[0.08] bg-[#0B0F15] flex items-center justify-between gap-3 max-w-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-100 truncate">{attachment.name}</p>
          <p className="text-[11px] font-mono text-slate-400 truncate tabular-nums">
            {formatBytes(attachment.sizeBytes)} · {attachment.cid.slice(0, 14)}...
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{loading ? '...' : 'Decrypt'}</span>
      </button>
    </div>
  );
};

export const ChatViewport: React.FC<ChatViewportProps> = ({
  conversation,
  messages,
  rightDrawerTab,
  onToggleRightDrawer,
  onSendMessage,
  onReactMessage,
  onStartVoiceCall,
  onToggleLockThread,
  onUnlockThreadRequest,
  isThreadUnlockedInSession,
  guardianPolicy,
  focusState,
  onAuditLog,
  onInspectMessage,
  typingUserName,
  onTypingChange,
  onMobileBack,
}) => {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<DecryptedMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusError, setStatusError] = useState('');
  const [safetyAlert, setSafetyAlert] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [chatSearch, setChatSearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const cancelRecordingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.id, messages.length]);

  useEffect(() => {
    setShowEmojiPicker(false);
    setShowSearchBar(false);
    setChatSearch('');
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    onTypingChange?.(false);
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
    }
    composerRef.current?.focus();
  }, [conversation.id]);

  const quietHoursBlocked = guardianPolicy.childProfileActive && isWithinQuietHours(guardianPolicy);
  const isLockedGate = Boolean(conversation.isLocked && !isThreadUnlockedInSession);

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;

    if (quietHoursBlocked) {
      setSafetyAlert(
        `Child Quiet Hours (${guardianPolicy.quietStartHour}:00–${guardianPolicy.quietEndHour}:00) are active. Outbound messages are paused.`
      );
      return;
    }

    setStatusError('');
    setSafetyAlert('');
    const evaluation = evaluateMessageSafety(draft.trim(), guardianPolicy);
    if (!evaluation.allowed) {
      onAuditLog({
        ruleTriggered: evaluation.triggers[0] || 'Contact Allowlist',
        actionTaken: 'Blocked',
        preview: evaluation.reason || 'Blocked by Guardian policy',
      });
      setSafetyAlert(evaluation.reason || 'Message blocked by Child Safety rules.');
      return;
    }

    if (evaluation.wasModified) {
      onAuditLog({
        ruleTriggered: evaluation.triggers.join(', '),
        actionTaken: 'Redacted',
        preview: `Sanitized message in ${conversation.name}`,
      });
      setSafetyAlert(evaluation.reason || 'Sensitive content was redacted by Child Guard.');
    }

    setSending(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    onTypingChange?.(false);
    try {
      await onSendMessage({
        text: evaluation.sanitizedText,
        replyToId: replyTo?.id,
        wasFiltered: evaluation.wasModified,
        safetyNotice: evaluation.reason,
      });
      setDraft('');
      setReplyTo(null);
      if (composerRef.current) {
        composerRef.current.style.height = 'auto';
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to send encrypted message');
    } finally {
      setSending(false);
    }
  };

  const uploadEncryptedFile = async (
    fileBuffer: ArrayBuffer,
    fileName: string,
    mimeType: string,
    kind: 'image' | 'audio' | 'file',
    durationSec?: number
  ) => {
    setUploading(true);
    setStatusError('');
    try {
      const { encryptedBytes, iv, cid, sha256 } = await encryptBlobForVault(
        conversation.id,
        conversation.roomSalt,
        conversation.keyEpoch,
        fileBuffer
      );

      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < encryptedBytes.length; i += chunk) {
        binary += String.fromCharCode(...encryptedBytes.subarray(i, i + chunk));
      }
      const encryptedBase64 = btoa(binary);

      const res = await fetch('/api/vault/blobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid,
          name: fileName,
          mimeType,
          sizeBytes: fileBuffer.byteLength,
          iv,
          sha256,
          conversationId: conversation.id,
          keyEpoch: conversation.keyEpoch,
          encryptedBase64,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Vault upload failed');
      }

      const attachment: DecentralizedAttachment = {
        cid,
        name: fileName,
        mimeType,
        sizeBytes: fileBuffer.byteLength,
        iv,
        sha256,
        storageNodes: ['eu-west-relay-01', 'us-east-pin-04', 'local-indexeddb-mirror'],
        kind,
        durationSec,
      };

      await onSendMessage({
        text: draft.trim() || (kind === 'audio' ? 'Voice note' : `Shared ${fileName}`),
        attachment,
        replyToId: replyTo?.id,
      });
      setDraft('');
      setReplyTo(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Encrypted upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setStatusError('Maximum encrypted media size is 10 MB.');
      return;
    }
    const buffer = await file.arrayBuffer();
    const kind = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';
    await uploadEncryptedFile(buffer, file.name, file.type || 'application/octet-stream', kind);
  };

  const toggleVoiceRecording = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      return;
    }

    setStatusError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recordStartRef.current = Date.now();
      setRecordSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelRecordingRef.current) {
          cancelRecordingRef.current = false;
          return;
        }
        const durationSec = Math.max(1, Math.round((Date.now() - recordStartRef.current) / 1000));
        const audioBlob = new Blob(recordChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const buf = await audioBlob.arrayBuffer();
        await uploadEncryptedFile(
          buf,
          `voice-note-${Date.now()}.webm`,
          recorder.mimeType || 'audio/webm',
          'audio',
          durationSec
        );
      };

      cancelRecordingRef.current = false;
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setStatusError('Microphone permission unavailable. Allow microphone access to record voice notes.');
    }
  };

  const cancelVoiceRecording = () => {
    if (recording && mediaRecorderRef.current) {
      cancelRecordingRef.current = true;
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    }
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (composerRef.current) {
      composerRef.current.style.height = 'auto';
      composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 112)}px`;
    }
    if (onTypingChange) {
      onTypingChange(val.trim().length > 0);
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      if (val.trim().length > 0) {
        typingTimeoutRef.current = window.setTimeout(() => {
          onTypingChange(false);
        }, 2200);
      }
    }
  };

  const insertEmoji = (emoji: string) => {
    setDraft((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
    composerRef.current?.focus();
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const formatDayLabel = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const visibleMessages = chatSearch.trim()
    ? messages.filter((m) =>
        m.plaintext.text.toLowerCase().includes(chatSearch.trim().toLowerCase()) ||
        m.plaintext.attachment?.name.toLowerCase().includes(chatSearch.trim().toLowerCase())
      )
    : messages;

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥', '🎉', '✅', '🔒', '🚀', '👏', '😊'];
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'];

  return (
    <section className="flex-1 min-w-0 flex flex-col bg-[#090C10] h-full">
      {/* Top Bar */}
      <header className="h-16 shrink-0 px-4 lg:px-5 border-b border-white/[0.07] bg-[#0D1117] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {onMobileBack && (
            <button
              type="button"
              onClick={onMobileBack}
              aria-label="Back to chats"
              className="md:hidden w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-300 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Avatar
            src={conversation.avatarUrl || conversation.participants[0]?.avatarUrl}
            name={conversation.name}
            sizeClass="w-9 h-9"
            fallbackIcon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-100 truncate">
                {conversation.name}
              </h2>
              <span className="text-xs text-slate-500 hidden sm:inline whitespace-nowrap">
                · E2EE
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {typingUserName ? (
                <span className="text-emerald-400 font-medium">{typingUserName} is typing...</span>
              ) : conversation.kind === 'direct' &&
                (conversation.participants[0]?.username || conversation.participants[0]?.phoneNumber) ? (
                [
                  conversation.participants[0].username
                    ? `@${conversation.participants[0].username}`
                    : '',
                  conversation.participants[0].phoneNumber || '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              ) : (
                `${conversation.participants.length} participant${
                  conversation.participants.length === 1 ? '' : 's'
                }`
              )}
              {!typingUserName && focusState.enabled ? ' · Focus Mode active' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onStartVoiceCall(conversation)}
            className="h-9 px-3 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Call</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSearchBar((v) => !v)}
            title="Search Messages in Chat"
            className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
              showSearchBar
                ? 'bg-[#1D2633] border-emerald-500/40 text-emerald-300'
                : 'bg-[#121720] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleRightDrawer('summary')}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              rightDrawerTab === 'summary'
                ? 'bg-[#1D2633] border-emerald-500/40 text-emerald-300'
                : 'bg-[#121720] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">AI Summary</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleRightDrawer('calendar')}
            title="Schedule & Calendar Sync"
            className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
              rightDrawerTab === 'calendar'
                ? 'bg-[#1D2633] border-emerald-500/40 text-emerald-300'
                : 'bg-[#121720] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            <CalendarPlus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleRightDrawer('security')}
            title="E2EE Keys & CID Vault Inspector"
            className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
              rightDrawerTab === 'security'
                ? 'bg-[#1D2633] border-emerald-500/40 text-emerald-300'
                : 'bg-[#121720] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onToggleLockThread(conversation.id, !conversation.isLocked)}
            title={conversation.isLocked ? 'Disable Chat Lock' : 'Lock This Chat'}
            className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
              conversation.isLocked
                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                : 'bg-[#121720] border-white/[0.08] text-slate-400 hover:text-white'
            }`}
          >
            {conversation.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {showSearchBar && (
        <div className="px-5 py-2.5 border-b border-white/[0.07] bg-[#0D1117] flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Search messages in this chat..."
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {chatSearch && (
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              {visibleMessages.length} found
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setChatSearch('');
              setShowSearchBar(false);
            }}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Locked Conversation Gate */}
      {isLockedGate ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full bg-[#10151C] border border-white/[0.08] rounded-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-100 mb-1.5">
              Conversation Protected
            </h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              This thread is protected by Biometric / PIN Lock. Authenticate to decrypt and view messages.
            </p>
            <button
              type="button"
              onClick={() => onUnlockThreadRequest(conversation.id)}
              className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold transition-colors"
            >
              Unlock Conversation
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* WhatsApp-style Message Stream */}
          <div
            className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 space-y-1.5"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at 50% 0%, rgba(16, 185, 129, 0.055), transparent 55%), radial-gradient(rgba(16, 185, 129, 0.035) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 24px 24px',
            }}
          >
            {/* Encryption Banner */}
            <div className="max-w-lg mx-auto text-center py-2 px-4 mb-3 rounded-xl bg-[#10151C]/90 border border-white/[0.06] text-[11px] text-slate-400">
              Messages and voice notes are end-to-end encrypted with Chiat-Ratchet AES-256-GCM.
            </div>

            {visibleMessages.map((msg, idx) => {
              const isMe = msg.senderId === 'me';
              const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
              const isNewDay =
                !prevMsg ||
                new Date(prevMsg.createdAt).toDateString() !==
                  new Date(msg.createdAt).toDateString();
              const isGrouped =
                !isNewDay &&
                prevMsg !== null &&
                prevMsg.senderId === msg.senderId &&
                msg.createdAt - prevMsg.createdAt < 5 * 60_000;

              const repliedMsg = msg.plaintext.replyToId
                ? messages.find((m) => m.id === msg.plaintext.replyToId)
                : undefined;

              const inboundSafety =
                !isMe && guardianPolicy.childProfileActive
                  ? evaluateMessageSafety(msg.plaintext.text, guardianPolicy, {
                      isInbound: true,
                      senderId: msg.senderId,
                    })
                  : null;

              const displayText = inboundSafety ? inboundSafety.sanitizedText : msg.plaintext.text;

              return (
                <React.Fragment key={msg.id}>
                  {isNewDay && (
                    <div className="flex justify-center py-3">
                      <span className="px-3 py-1 rounded-lg bg-[#111720] border border-white/[0.06] text-[11px] font-medium text-slate-400">
                        {formatDayLabel(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex gap-2.5 group ${isMe ? 'justify-end' : 'justify-start'} ${
                      isGrouped ? 'mt-0.5' : 'mt-3'
                    }`}
                  >
                    {!isMe && (
                      <div className="w-8 shrink-0">
                        {!isGrouped && (
                          <Avatar
                            src={msg.senderAvatarUrl}
                            name={msg.senderName}
                            sizeClass="w-8 h-8 mt-0.5"
                          />
                        )}
                      </div>
                    )}

                    <div className={`max-w-[78%] sm:max-w-[68%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`relative rounded-2xl px-3.5 py-2 border text-sm leading-relaxed shadow-sm ${
                          isMe
                            ? `bg-[#123026] border-emerald-500/25 text-slate-100 ${
                                !isGrouped ? 'rounded-tr-sm' : ''
                              }`
                            : `bg-[#141A24] border-white/[0.08] text-slate-100 ${
                                !isGrouped ? 'rounded-tl-sm' : ''
                              }`
                        }`}
                      >
                        {!isMe && !isGrouped && conversation.kind !== 'direct' && (
                          <p className="text-xs font-semibold text-emerald-300 mb-0.5">
                            {msg.senderName}
                          </p>
                        )}

                        {repliedMsg && (
                          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/25 border border-white/[0.07] text-xs text-slate-400">
                            <span className="font-medium text-emerald-300">
                              {repliedMsg.senderId === 'me' ? 'You' : repliedMsg.senderName}:{' '}
                            </span>
                            <span className="line-clamp-1">{repliedMsg.plaintext.text}</span>
                          </div>
                        )}

                        <p className="whitespace-pre-wrap break-words pr-12">{displayText}</p>

                        {(msg.plaintext.wasFiltered || inboundSafety?.wasModified) && (
                          <p className="mt-1 text-[11px] text-amber-300 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {msg.plaintext.safetyNotice || inboundSafety?.reason || 'Filtered by Child Guard'}
                            </span>
                          </p>
                        )}

                        {msg.plaintext.attachment && (
                          <AttachmentCard
                            attachment={msg.plaintext.attachment}
                            conversation={conversation}
                            keyEpoch={msg.keyEpoch}
                            blurMedia={Boolean(
                              !isMe &&
                                guardianPolicy.childProfileActive &&
                                guardianPolicy.blurUnapprovedMedia
                            )}
                          />
                        )}

                        {/* WhatsApp-style inline bottom-right timestamp + double check */}
                        <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5 text-[10px] font-mono tabular-nums text-slate-400/80 select-none">
                          <button
                            type="button"
                            onClick={() => onInspectMessage(msg)}
                            title="Inspect AES-256-GCM Ciphertext"
                            className="hover:text-emerald-300 transition-colors"
                          >
                            {formatTime(msg.createdAt)}
                          </button>
                          {isMe && (
                            <CheckCheck
                              className="w-3.5 h-3.5 text-emerald-400"
                              aria-label="Encrypted & Delivered"
                            />
                          )}
                        </div>
                      </div>

                      {/* Reactions & Quick WhatsApp-style Hover Bar */}
                      <div className="flex items-center gap-1 mt-1 min-h-[22px]">
                        {Object.entries(msg.reactions || {}).map(([emoji, actors]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => onReactMessage(msg.id, emoji)}
                            className={`h-6 px-2 rounded-lg text-[11px] border flex items-center gap-1 transition-colors ${
                              actors.includes('me')
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                : 'bg-[#121720] border-white/[0.08] text-slate-300'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-mono tabular-nums">{actors.length}</span>
                          </button>
                        ))}

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[#121720] border border-white/[0.08] rounded-lg px-1 py-0.5">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => onReactMessage(msg.id, emoji)}
                              className="w-6 h-6 rounded hover:bg-white/[0.08] text-xs flex items-center justify-center transition-colors"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(msg);
                              composerRef.current?.focus();
                            }}
                            title="Reply"
                            className="w-6 h-6 rounded hover:bg-white/[0.08] text-slate-300 flex items-center justify-center transition-colors"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {typingUserName && (
              <div className="flex items-center gap-2 pt-2 text-xs text-emerald-300">
                <span className="px-3 py-1.5 rounded-xl bg-[#141A24] border border-white/[0.08]">
                  {typingUserName} is typing...
                </span>
              </div>
            )}

            <div ref={scrollEndRef} />
          </div>

          {/* WhatsApp-style Composer */}
          <footer className="relative px-4 lg:px-5 py-3 border-t border-white/[0.07] bg-[#0D1117]">
            {showEmojiPicker && (
              <div className="absolute bottom-16 left-5 z-30 p-2.5 rounded-2xl bg-[#141A24] border border-white/[0.1] shadow-2xl grid grid-cols-6 gap-1">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="w-9 h-9 rounded-lg hover:bg-white/[0.08] text-lg flex items-center justify-center transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {safetyAlert && (
              <div className="mb-2.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{safetyAlert}</span>
                </span>
                <button type="button" onClick={() => setSafetyAlert('')} className="text-amber-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {statusError && (
              <div className="mb-2.5 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 flex items-center justify-between gap-2">
                <span>{statusError}</span>
                <button type="button" onClick={() => setStatusError('')} className="text-rose-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {replyTo && (
              <div className="mb-2.5 px-3 py-2 rounded-xl bg-[#121720] border border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="text-emerald-400 font-medium">
                    Replying to {replyTo.senderId === 'me' ? 'yourself' : replyTo.senderName}:{' '}
                  </span>
                  <span className="text-slate-300 truncate">{replyTo.plaintext.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-slate-400 hover:text-slate-200 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {recording ? (
              <div className="flex items-center justify-between gap-3 h-11 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  title="Discard voice note"
                  className="text-rose-300 hover:text-rose-200 flex items-center gap-1.5 text-xs font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Discard</span>
                </button>
                <span className="text-xs font-mono tabular-nums text-rose-200">
                  Recording encrypted voice note · {Math.floor(recordSeconds / 60)}:
                  {String(recordSeconds % 60).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={toggleVoiceRecording}
                  className="h-8 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Voice</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitText} className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Attach encrypted file"
                />

                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  disabled={quietHoursBlocked}
                  title="Emoji"
                  className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 ${
                    showEmojiPicker
                      ? 'bg-[#1A222D] border-emerald-500/40 text-emerald-300'
                      : 'bg-[#121720] hover:bg-[#19212C] border-white/[0.08] text-slate-300'
                  }`}
                >
                  <Smile className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || quietHoursBlocked}
                  title="Attach photo, video, or document"
                  className="h-10 w-10 rounded-xl bg-[#121720] hover:bg-[#19212C] border border-white/[0.08] flex items-center justify-center text-slate-300 transition-colors shrink-0 disabled:opacity-40"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <textarea
                  ref={composerRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && showEmojiPicker) {
                      setShowEmojiPicker(false);
                      return;
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitText(e);
                    }
                  }}
                  disabled={quietHoursBlocked}
                  placeholder={
                    quietHoursBlocked
                      ? 'Quiet Hours active for Child Profile...'
                      : uploading
                        ? 'Encrypting media...'
                        : 'Type a message'
                  }
                  className="flex-1 min-h-[40px] max-h-28 py-2.5 px-3.5 rounded-2xl bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/70 resize-none disabled:opacity-50"
                />

                {draft.trim().length > 0 ? (
                  <button
                    type="submit"
                    disabled={sending || uploading || quietHoursBlocked}
                    aria-label="Send message"
                    className="h-10 w-10 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-[#05110B] flex items-center justify-center transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    disabled={uploading || quietHoursBlocked}
                    title="Hold or tap to record voice message"
                    aria-label="Record voice message"
                    className="h-10 w-10 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-[#05110B] flex items-center justify-center transition-colors shrink-0"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </form>
            )}
          </footer>
        </>
      )}
    </section>
  );
};
