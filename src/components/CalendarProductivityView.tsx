import React, { useState } from 'react';
import { Calendar, Download, ExternalLink, Send, CheckCircle2, Plus } from 'lucide-react';
import type { CalendarEventItem, Conversation, ProductivityDispatch } from '../types/kestrel';
import { buildGoogleCalendarUrl, downloadIcsEvent } from '../utils/calendarExport';

interface CalendarProductivityViewProps {
  conversations: Conversation[];
  calendarEvents: CalendarEventItem[];
  dispatches: ProductivityDispatch[];
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
  onOpenPlans?: () => void;
}

export const CalendarProductivityView: React.FC<CalendarProductivityViewProps> = ({
  conversations,
  calendarEvents,
  dispatches,
  onCreateCalendarEvent,
  onDispatchTask,
  onOpenPlans,
}) => {
  const [title, setTitle] = useState('');
  const [convId, setConvId] = useState(conversations[0]?.id || 'conv_security_core');
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [timeStr, setTimeStr] = useState('11:00');
  const [provider, setProvider] = useState<CalendarEventItem['provider']>('Kestrel Calendar');
  const [notes, setNotes] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  const [taskProvider, setTaskProvider] = useState<ProductivityDispatch['provider']>('Linear');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSummary, setTaskSummary] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState('');

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || savingEvent) return;
    setSavingEvent(true);
    try {
      const start = new Date(`${dateStr}T${timeStr}:00`);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      await onCreateCalendarEvent({
        title: title.trim(),
        conversationId: convId,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        location: provider === 'Google Calendar' ? 'Google Meet / Kestrel' : 'Kestrel Encrypted Voice Room',
        notes: notes.trim() || 'Synced from Kestrel Workspace',
        provider,
      });
      setTitle('');
      setNotes('');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || dispatching) return;
    setDispatching(true);
    setDispatchError('');
    try {
      await onDispatchTask({
        provider: taskProvider,
        title: taskTitle.trim(),
        summary: taskSummary.trim() || 'Created from Kestrel Workspace',
        conversationId: convId,
      });
      setTaskTitle('');
      setTaskSummary('');
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Unable to dispatch task.');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Calendar & Productivity Integrations
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Export `.ics` invites, schedule Google Calendar events, and dispatch tasks directly to Linear, Jira, Notion, or CalDAV.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calendar Scheduler */}
          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Schedule Team Event</span>
              </h2>
              <span className="text-xs text-slate-400">ICS & Google Bridge</span>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Event Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q4 Security Sign-Off"
                  className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Linked Channel</label>
                  <select
                    value={convId}
                    onChange={(e) => setConvId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100"
                  >
                    {conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Calendar Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as CalendarEventItem['provider'])}
                    className="w-full h-9 px-2.5 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100"
                  >
                    <option value="Kestrel Calendar">Kestrel Calendar</option>
                    <option value="Google Calendar">Google Calendar</option>
                    <option value="Outlook / ICS">Outlook / ICS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional agenda or meeting link"
                  className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingEvent || !title.trim()}
                className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{savingEvent ? 'Syncing Event...' : 'Create Synced Event'}</span>
              </button>
            </form>
          </section>

          {/* Productivity Tool Dispatch */}
          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                <span>Dispatch to Productivity Tools</span>
              </h2>
              <span className="text-xs text-slate-400">Linear · Jira · Notion</span>
            </div>

            <form onSubmit={handleDispatch} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Tool</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Linear', 'Jira', 'Notion', 'CalDAV Webhook'] as const).map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => setTaskProvider(tool)}
                      className={`h-8 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap px-2 ${
                        taskProvider === tool
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#090C10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tool === 'CalDAV Webhook' ? 'CalDAV' : tool}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Issue / Page Title</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Audit ECDH key rotation telemetry"
                  className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Context / Description</label>
                <input
                  type="text"
                  value={taskSummary}
                  onChange={(e) => setTaskSummary(e.target.value)}
                  placeholder="Reference thread or owner"
                  className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {dispatchError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3">
                  <p className="text-xs text-red-300">{dispatchError}</p>
                  {onOpenPlans && (
                    <button
                      type="button"
                      onClick={onOpenPlans}
                      className="h-7 px-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-[11px] font-semibold shrink-0 transition-colors"
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={dispatching || !taskTitle.trim()}
                className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{dispatching ? 'Dispatching...' : `Send to ${taskProvider}`}</span>
              </button>
            </form>
          </section>
        </div>

        {/* Upcoming Events List */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Upcoming Synced Events ({calendarEvents.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {calendarEvents.map((ev) => (
              <div
                key={ev.id}
                className="p-4 rounded-xl bg-[#10151C] border border-white/[0.07] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{ev.title}</h3>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {ev.provider}
                    </span>
                  </div>
                  <p className="text-xs font-mono tabular-nums text-emerald-300 mt-1">
                    {new Date(ev.startIso).toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {ev.notes && <p className="text-xs text-slate-400 mt-1.5">{ev.notes}</p>}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => downloadIcsEvent(ev)}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .ICS</span>
                  </button>
                  <a
                    href={buildGoogleCalendarUrl(ev)}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 px-3 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 text-xs font-medium text-emerald-300 flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Google Calendar</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Productivity Dispatches Table */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Synced Productivity Dispatches ({dispatches.length})
          </h2>
          <div className="rounded-xl bg-[#10151C] border border-white/[0.07] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] font-medium text-slate-400">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Tool</th>
                  <th className="py-3 px-4">Title</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-xs">
                {dispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-mono tabular-nums text-emerald-300">
                      {d.externalRef}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{d.provider}</td>
                    <td className="py-3 px-4 text-slate-100 font-medium">{d.title}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{d.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
