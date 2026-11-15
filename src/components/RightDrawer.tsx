import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  CalendarPlus,
  ExternalLink,
  Download,
  Send,
  Lock,
} from 'lucide-react';
import type {
  CalendarEventItem,
  ChatSummaryResult,
  Conversation,
  DecryptedMessage,
  MonetizationState,
  ProductivityDispatch,
} from '../types/kestrel';
import type { RightDrawerTab } from './ChatViewport';
import { buildGoogleCalendarUrl, downloadIcsEvent } from '../utils/calendarExport';
import { Mini3DVaultEmblem } from './three/Mini3DVaultEmblem';

interface RightDrawerProps {
  activeTab: Exclude<RightDrawerTab, null>;
  onClose: () => void;
  onSelectTab: (tab: Exclude<RightDrawerTab, null>) => void;
  conversation: Conversation;
  messages: DecryptedMessage[];
  inspectedMessage: DecryptedMessage | null;
  deviceFingerprint: string;
  onRotateKeyEpoch: (conversationId: string) => Promise<void>;
  calendarEvents: CalendarEventItem[];
  onCreateCalendarEvent: (payload: {
    title: string;
    conversationId: string;
    startIso: string;
    endIso: string;
    location: string;
    notes: string;
    provider: CalendarEventItem['provider'];
  }) => Promise<CalendarEventItem>;
  onDispatchTask: (payload: {
    provider: ProductivityDispatch['provider'];
    title: string;
    summary: string;
    conversationId: string;
  }) => Promise<void>;
  monetization?: MonetizationState;
  onOpenPlans?: () => void;
}

export const RightDrawer: React.FC<RightDrawerProps> = ({
  activeTab,
  onClose,
  onSelectTab,
  conversation,
  messages,
  inspectedMessage,
  deviceFingerprint,
  onRotateKeyEpoch,
  calendarEvents,
  onCreateCalendarEvent,
  onDispatchTask,
  monetization,
  onOpenPlans,
}) => {
  const [summary, setSummary] = useState<ChatSummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summaryLimitHit, setSummaryLimitHit] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [dispatchedMessage, setDispatchedMessage] = useState('');

  // Quick calendar form state
  const [evtTitle, setEvtTitle] = useState(`${conversation.name} Sync`);
  const [evtDate, setEvtDate] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [evtTime, setEvtTime] = useState('10:00');
  const [evtNotes, setEvtNotes] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);

  const handleGenerateSummary = async () => {
    if (messages.length === 0 || summarizing) return;
    setSummarizing(true);
    setSummaryError('');
    setSummaryLimitHit(false);
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationName: conversation.name,
          messages: messages.map((m) => ({
            sender: m.senderId === 'me' ? 'You' : m.senderName,
            time: new Date(m.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            text: m.plaintext.text,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.limitReached) setSummaryLimitHit(true);
        throw new Error(data.error || 'Failed to generate AI summary');
      }
      setSummary(data as ChatSummaryResult);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Unable to summarize conversation.');
    } finally {
      setSummarizing(false);
    }
  };

  const handleRotateEpoch = async () => {
    setRotating(true);
    try {
      await onRotateKeyEpoch(conversation.id);
    } finally {
      setRotating(false);
    }
  };

  const handleQuickCalendarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evtTitle.trim() || creatingEvent) return;
    setCreatingEvent(true);
    try {
      const start = new Date(`${evtDate}T${evtTime}:00`);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      await onCreateCalendarEvent({
        title: evtTitle.trim(),
        conversationId: conversation.id,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        location: 'Kestrel Encrypted Voice Room',
        notes: evtNotes.trim() || `Scheduled from ${conversation.name}`,
        provider: 'Kestrel Calendar',
      });
      setEvtNotes('');
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleSendActionToLinear = async (task: string, owner: string) => {
    await onDispatchTask({
      provider: 'Linear',
      title: task,
      summary: `Owner: ${owner} · From ${conversation.name}`,
      conversationId: conversation.id,
    });
    setDispatchedMessage(`Synced "${task.slice(0, 32)}..." to Linear`);
    setTimeout(() => setDispatchedMessage(''), 3500);
  };

  const targetMsg = inspectedMessage || messages[messages.length - 1] || null;
  const threadEvents = calendarEvents.filter((e) => e.conversationId === conversation.id);

  return (
    <aside className="w-[340px] shrink-0 bg-[#10151C] border-l border-white/[0.07] flex flex-col h-full">
      {/* Drawer Header */}
      <div className="h-16 px-4 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-1 bg-[#090C10] rounded-lg border border-white/[0.06]">
          {(
            [
              { id: 'summary', label: 'AI Brief' },
              { id: 'security', label: 'E2EE' },
              { id: 'calendar', label: 'Calendar' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-[#1A222D] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close side drawer"
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'summary' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-display text-sm font-semibold text-slate-100">
                  AI Conversation Digest
                </h3>
                {monetization && (
                  <span className="text-[11px] font-mono tabular-nums text-emerald-300">
                    {monetization.limits.aiSummariesMonthly === -1
                      ? 'Unlimited'
                      : `${monetization.usage.aiSummariesUsed}/${monetization.limits.aiSummariesMonthly} used`}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Summarizes decrypted local messages ephemerally without retaining plaintext on relay servers.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={summarizing || messages.length === 0}
              className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>{summarizing ? 'Analyzing Thread...' : 'Summarize Thread with AI'}</span>
            </button>

            {summaryError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 space-y-2">
                <p>{summaryError}</p>
                {summaryLimitHit && onOpenPlans && (
                  <button
                    type="button"
                    onClick={onOpenPlans}
                    className="h-7 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-[11px] font-semibold"
                  >
                    Upgrade Plan
                  </button>
                )}
              </div>
            )}

            {dispatchedMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs text-emerald-200">
                {dispatchedMessage}
              </div>
            )}

            {summary ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07]">
                  <p className="text-xs font-medium text-emerald-300 mb-1.5">Executive Overview</p>
                  <p className="text-xs text-slate-200 leading-relaxed">{summary.overview}</p>
                </div>

                {summary.keyDecisions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">Key Decisions</p>
                    <ul className="space-y-1.5">
                      {summary.keyDecisions.map((d, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-slate-300 p-2.5 rounded-lg bg-[#090C10] border border-white/[0.06]"
                        >
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.actionItems.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-300">Action Items</p>
                    <div className="space-y-2">
                      {summary.actionItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2"
                        >
                          <p className="text-xs text-slate-100 font-medium">{item.task}</p>
                          <p className="text-[11px] text-slate-400">
                            {item.owner} · {item.dueHint}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleSendActionToLinear(item.task, item.owner)}
                              className="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[11px] font-medium text-slate-200 flex items-center gap-1 transition-colors"
                            >
                              <Send className="w-3 h-3" />
                              <span>Sync to Linear</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEvtTitle(item.task.slice(0, 50));
                                setEvtNotes(`Owner: ${item.owner} (${item.dueHint})`);
                                onSelectTab('calendar');
                              }}
                              className="h-7 px-2.5 rounded-md bg-emerald-500/12 hover:bg-emerald-500/20 text-[11px] font-medium text-emerald-300 flex items-center gap-1 transition-colors"
                            >
                              <CalendarPlus className="w-3 h-3" />
                              <span>Schedule</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.openQuestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-300">Open Questions</p>
                    {summary.openQuestions.map((q, idx) => (
                      <p
                        key={idx}
                        className="text-xs text-slate-400 p-2.5 rounded-lg bg-[#090C10] border border-white/[0.06]"
                      >
                        {q}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.06] text-xs text-slate-400">
                Click above to extract decisions, owners, and calendar tasks from the current {messages.length} encrypted messages.
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Chiat-Ratchet Session</span>
                </span>
                <span className="text-xs font-mono tabular-nums text-emerald-400">
                  Epoch {conversation.keyEpoch}
                </span>
              </div>
              <div className="flex justify-center py-1">
                <Mini3DVaultEmblem size={144} epochNumber={conversation.keyEpoch} />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Forward-secure ECDH P-256 + HKDF-SHA256 + AES-256-GCM authenticated encryption.
              </p>
              <button
                type="button"
                onClick={handleRotateEpoch}
                disabled={rotating}
                className="w-full h-8 rounded-lg bg-[#18202B] hover:bg-[#212C3B] border border-white/[0.08] text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
                <span>{rotating ? 'Rotating Keys...' : 'Rotate Room Key Epoch'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2">
              <p className="text-xs font-semibold text-slate-200">Your Device Safety Number</p>
              <p className="font-mono text-xs text-emerald-300 leading-relaxed tracking-wider tabular-nums">
                {deviceFingerprint}
              </p>
              <p className="text-[11px] text-slate-500">
                Compare this safety number out-of-band with team members to verify zero MITM interference.
              </p>
            </div>

            {targetMsg && (
              <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ciphertext Proof (#{targetMsg.ratchetIndex})</span>
                  </p>
                  <span className="text-[11px] font-mono text-slate-500">
                    {targetMsg.decryptionVerified ? 'Auth Tag OK' : 'Epoch Mismatch'}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 mb-0.5">IV (96-bit)</p>
                  <p className="font-mono text-[11px] text-slate-300 break-all bg-[#10151C] p-2 rounded border border-white/[0.05]">
                    {targetMsg.iv}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 mb-0.5">AES-256-GCM Ciphertext</p>
                  <p className="font-mono text-[11px] text-slate-400 break-all bg-[#10151C] p-2 rounded border border-white/[0.05] max-h-24 overflow-y-auto">
                    {targetMsg.ciphertext}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-100 mb-1">
                Schedule Team Event
              </h3>
              <p className="text-xs text-slate-400">
                Creates a synced event with instant `.ics` & Google Calendar export.
              </p>
            </div>

            <form onSubmit={handleQuickCalendarSubmit} className="space-y-3 p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07]">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={evtTitle}
                  onChange={(e) => setEvtTitle(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-[#10151C] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={evtDate}
                    onChange={(e) => setEvtDate(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg bg-[#10151C] border border-white/[0.08] text-xs text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Time</label>
                  <input
                    type="time"
                    value={evtTime}
                    onChange={(e) => setEvtTime(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg bg-[#10151C] border border-white/[0.08] text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Agenda Notes</label>
                <input
                  type="text"
                  value={evtNotes}
                  onChange={(e) => setEvtNotes(e.target.value)}
                  placeholder="Optional meeting context"
                  className="w-full h-9 px-2.5 rounded-lg bg-[#10151C] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={creatingEvent}
                className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold transition-colors"
              >
                {creatingEvent ? 'Syncing...' : 'Add to Calendar'}
              </button>
            </form>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-300">Linked Events ({threadEvents.length})</p>
              {threadEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No upcoming events linked to this thread.</p>
              ) : (
                threadEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2"
                  >
                    <p className="text-xs font-medium text-slate-100">{ev.title}</p>
                    <p className="text-[11px] font-mono tabular-nums text-slate-400">
                      {new Date(ev.startIso).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => downloadIcsEvent(ev)}
                        className="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-[11px] text-slate-200 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>.ICS</span>
                      </button>
                      <a
                        href={buildGoogleCalendarUrl(ev)}
                        target="_blank"
                        rel="noreferrer"
                        className="h-7 px-2.5 rounded-md bg-emerald-500/12 hover:bg-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Google Cal</span>
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
