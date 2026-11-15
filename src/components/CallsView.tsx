import React from 'react';
import { Phone, ShieldCheck, PhoneOutgoing, PhoneIncoming, Users } from 'lucide-react';
import type { CallLogEntry, Conversation } from '../types/kestrel';

interface CallsViewProps {
  conversations: Conversation[];
  callLogs: CallLogEntry[];
  onStartVoiceCall: (conversation: Conversation) => void;
}

export const CallsView: React.FC<CallsViewProps> = ({
  conversations,
  callLogs,
  onStartVoiceCall,
}) => {
  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins}m ${String(rem).padStart(2, '0')}s`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Encrypted Voice Calls
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Peer-to-peer WebRTC voice sessions secured with DTLS-SRTP and verified device keys.
          </p>
        </div>

        {/* Quick Dial */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Start Encrypted Call
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="p-4 rounded-xl bg-[#10151C] border border-white/[0.07] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#19212C] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center">
                    {conv.avatarUrl || conv.participants[0]?.avatarUrl ? (
                      <img
                        src={conv.avatarUrl || conv.participants[0]?.avatarUrl}
                        alt={conv.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{conv.name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      Epoch {conv.keyEpoch} · {conv.participants.length} verified member
                      {conv.participants.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onStartVoiceCall(conv)}
                  className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Call History Table */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Verified Call History
          </h2>
          <div className="rounded-xl bg-[#10151C] border border-white/[0.07] overflow-hidden">
            {callLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No encrypted calls logged yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] font-medium text-slate-400">
                    <th className="py-3 px-4">Thread / Contact</th>
                    <th className="py-3 px-4">Cipher Suite</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-xs">
                  {callLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {log.direction === 'incoming' ? (
                            <PhoneIncoming className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : log.direction === 'team' ? (
                            <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <PhoneOutgoing className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <span className="font-medium text-slate-100">{log.targetName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{log.cipherSuite}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-400">
                        {new Date(log.startedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                        {formatDuration(log.durationSec)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
