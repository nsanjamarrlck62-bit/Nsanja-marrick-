import React, { useState } from 'react';
import { ShieldCheck, Lock, EyeOff, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { GuardianPolicy, Participant } from '../types/kestrel';
import { evaluateMessageSafety } from '../utils/safetyFilter';

interface GuardianSafetyViewProps {
  policy: GuardianPolicy;
  contacts: Participant[];
  isUnlocked: boolean;
  onRequestUnlock: () => void;
  onUpdatePolicy: (patch: Partial<GuardianPolicy>) => Promise<void>;
}

export const GuardianSafetyView: React.FC<GuardianSafetyViewProps> = ({
  policy,
  contacts,
  isUnlocked,
  onRequestUnlock,
  onUpdatePolicy,
}) => {
  const [sandboxInput, setSandboxInput] = useState(
    'Meet me at 420 Pine Street or call 415-555-0192 and check https://bit.ly/free-prize'
  );

  const previewResult = evaluateMessageSafety(sandboxInput, {
    ...policy,
    childProfileActive: true,
    safeMessageFiltering: true,
  });

  if (!isUnlocked) {
    return (
      <div className="flex-1 bg-[#090C10] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#10151C] border border-white/[0.08] rounded-2xl p-7 text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-100 mb-2">
            Guardian Controls Protected
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-5">
            Children’s privacy settings, allowlists, and safe filtering policies require biometric or PIN verification before changes can be made.
          </p>
          <button
            type="button"
            onClick={onRequestUnlock}
            className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold transition-colors"
          >
            Authenticate to Open Guardian Panel
          </button>
        </div>
      </div>
    );
  }

  const toggleApprovedContact = (id: string) => {
    const exists = policy.approvedContactIds.includes(id);
    const next = exists
      ? policy.approvedContactIds.filter((c) => c !== id)
      : [...policy.approvedContactIds, id];
    onUpdatePolicy({ approvedContactIds: next });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              Children’s Privacy & Safe Filtering
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              On-device safe message filtering runs locally prior to AES-256-GCM encryption—protecting kids without server-side surveillance.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onUpdatePolicy({ childProfileActive: !policy.childProfileActive })}
            className={`h-10 px-4 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
              policy.childProfileActive
                ? 'bg-emerald-500 text-[#05110B] border-emerald-400'
                : 'bg-[#10151C] text-slate-200 border-white/[0.1] hover:bg-[#18202B]'
            }`}
          >
            {policy.childProfileActive ? 'Child Safe Profile: Active' : 'Enable Child Safe Profile'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Protection Rules */}
          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>On-Device Filtering Rules</span>
            </h2>

            <div className="space-y-3">
              {(
                [
                  {
                    key: 'safeMessageFiltering',
                    label: 'Safe Message Filtering',
                    desc: 'Masks profanity and abusive phrases locally before sending or rendering.',
                  },
                  {
                    key: 'blockPiiSharing',
                    label: 'PII Leak Shield',
                    desc: 'Redacts phone numbers, emails, street addresses, and payment numbers.',
                  },
                  {
                    key: 'blockUnsafeLinks',
                    label: 'Unsafe & Shortened Link Blocker',
                    desc: 'Strips unverified URL shorteners and suspicious domains.',
                  },
                  {
                    key: 'blurUnapprovedMedia',
                    label: 'Blur Incoming Media Until Reviewed',
                    desc: 'Applies a local privacy blur over incoming images until explicitly revealed.',
                  },
                  {
                    key: 'allowlistOnly',
                    label: 'Strict Contact Allowlist',
                    desc: 'Quarantines messages from senders outside the guardian-approved list.',
                  },
                ] as const
              ).map((rule) => {
                const checked = Boolean(policy[rule.key]);
                return (
                  <label
                    key={rule.key}
                    className="flex items-start justify-between gap-4 p-3 rounded-xl bg-[#090C10] border border-white/[0.06] cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-medium text-slate-100">{rule.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{rule.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onUpdatePolicy({ [rule.key]: !checked })}
                      className="mt-1 rounded border-white/20 bg-[#10151C] text-emerald-500 focus:ring-emerald-500"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          {/* Contact Allowlist & Quiet Hours */}
          <div className="space-y-6">
            <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-3">
              <h2 className="font-display text-base font-semibold text-slate-100">
                Approved Contact Allowlist
              </h2>
              <p className="text-xs text-slate-400">
                Only checked contacts can reach a protected child account when Strict Allowlist is enabled.
              </p>

              <div className="space-y-2 pt-1">
                {contacts.map((contact) => {
                  const approved = policy.approvedContactIds.includes(contact.id);
                  return (
                    <label
                      key={contact.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#090C10] border border-white/[0.06] cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={contact.avatarUrl}
                          alt={contact.name}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-100 truncate">
                            {contact.name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">{contact.role}</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={approved}
                        onChange={() => toggleApprovedContact(contact.id)}
                        className="rounded border-white/20 bg-[#10151C] text-emerald-500"
                      />
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Bedtime Quiet Hours</span>
                </h2>
                <input
                  type="checkbox"
                  checked={policy.quietHoursEnabled}
                  onChange={() => onUpdatePolicy({ quietHoursEnabled: !policy.quietHoursEnabled })}
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Start Hour (24h)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={policy.quietStartHour}
                    onChange={(e) =>
                      onUpdatePolicy({ quietStartHour: Number(e.target.value) || 21 })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono tabular-nums text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">End Hour (24h)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={policy.quietEndHour}
                    onChange={(e) =>
                      onUpdatePolicy({ quietEndHour: Number(e.target.value) || 7 })
                    }
                    className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono tabular-nums text-slate-100"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Interactive Safe Filter Sandbox */}
        <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-emerald-400" />
            <span>Safe Filter Live Verification Sandbox</span>
          </h2>
          <p className="text-xs text-slate-400">
            Test how the local engine sanitizes addresses, phone numbers, emails, or shortened links before encryption.
          </p>
          <input
            type="text"
            value={sandboxInput}
            onChange={(e) => setSandboxInput(e.target.value)}
            className="w-full h-10 px-3.5 rounded-xl bg-[#090C10] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Sanitized Output</span>
              {previewResult.wasModified ? (
                <span className="text-amber-300 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{previewResult.triggers.join(' · ')}</span>
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Clean</span>
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-200">{previewResult.sanitizedText}</p>
          </div>
        </section>

        {/* Audit Log */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Local Safety Audit Log ({policy.auditLog.length})
          </h2>
          <div className="rounded-xl bg-[#10151C] border border-white/[0.07] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] font-medium text-slate-400">
                  <th className="py-3 px-4">Rule</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Details</th>
                  <th className="py-3 px-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-xs">
                {policy.auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-3 px-4 font-medium text-slate-100">{entry.ruleTriggered}</td>
                    <td className="py-3 px-4 text-amber-300">{entry.actionTaken}</td>
                    <td className="py-3 px-4 text-slate-400">{entry.preview}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
