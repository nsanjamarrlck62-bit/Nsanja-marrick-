import React, { useState } from 'react';
import { Fingerprint, Lock, KeyRound, BellOff, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { BiometricLockConfig, FocusState } from '../types/kestrel';
import {
  enrollBiometricPasskey,
  hashPin,
  isWebAuthnAvailable,
  verifyBiometricPasskey,
} from '../utils/crypto';

interface LockSettingsViewProps {
  lockConfig: BiometricLockConfig;
  isSettingsUnlocked: boolean;
  onRequestUnlockSettings: () => void;
  onUpdateLockConfig: (next: BiometricLockConfig) => void;
  onLockNow: () => void;
  focusState: FocusState;
  onUpdateFocus: (patch: Partial<FocusState>) => Promise<void>;
}

export const LockSettingsView: React.FC<LockSettingsViewProps> = ({
  lockConfig,
  isSettingsUnlocked,
  onRequestUnlockSettings,
  onUpdateLockConfig,
  onLockNow,
  focusState,
  onUpdateFocus,
}) => {
  const [pinDraft, setPinDraft] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (lockConfig.requireForSettings && !isSettingsUnlocked) {
    return (
      <div className="flex-1 bg-[#090C10] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#10151C] border border-white/[0.08] rounded-2xl p-7 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Fingerprint className="w-6 h-6" />
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-100 mb-2">
            Biometric Lock Required
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-5">
            Lock Settings are protected by your enrolled authentication factor. Verify to configure passkeys, PINs, or auto-lock rules.
          </p>
          <button
            type="button"
            onClick={onRequestUnlockSettings}
            className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold transition-colors"
          >
            Authenticate to Open Lock Settings
          </button>
        </div>
      </div>
    );
  }

  const handleEnrollPasskey = async () => {
    setErrorMessage('');
    setStatusMessage('');
    setBusy(true);
    try {
      const result = await enrollBiometricPasskey('Kestrel Workspace Owner');
      onUpdateLockConfig({
        ...lockConfig,
        enabled: true,
        biometricEnrolled: true,
        credentialId: result.credentialId,
        credentialLabel: result.label,
      });
      setStatusMessage('Hardware WebAuthn biometric passkey enrolled successfully.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? `${err.message} You can also set a salted SHA-256 PIN below.`
          : 'Biometric enrollment failed.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTestPasskey = async () => {
    if (!lockConfig.credentialId) return;
    setErrorMessage('');
    setStatusMessage('');
    setBusy(true);
    try {
      const verified = await verifyBiometricPasskey(lockConfig.credentialId);
      setStatusMessage(verified ? 'Biometric verification succeeded.' : 'Verification rejected.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Biometric test cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinDraft.trim().length < 4) {
      setErrorMessage('Security PIN must be at least 4 digits.');
      return;
    }
    setErrorMessage('');
    const hashed = await hashPin(pinDraft.trim());
    onUpdateLockConfig({
      ...lockConfig,
      enabled: true,
      pinHash: hashed,
    });
    setPinDraft('');
    setStatusMessage('Salted SHA-256 security PIN saved.');
  };

  const applyFocusPreset = (minutes: number | null, label: string) => {
    if (minutes === null) {
      onUpdateFocus({ enabled: false, presetLabel: 'Off', endsAt: null });
    } else {
      onUpdateFocus({
        enabled: true,
        presetLabel: label,
        endsAt: Date.now() + minutes * 60_000,
      });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              Biometric Lock & Focus Mode
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Protect lock settings, encrypted threads, and guardian controls via WebAuthn biometrics and timed Focus Mode.
            </p>
          </div>
          <button
            type="button"
            onClick={onLockNow}
            className="h-10 px-4 rounded-xl bg-[#18202B] hover:bg-[#212C3B] border border-white/[0.1] text-xs font-semibold text-slate-100 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>Lock Workspace Now</span>
          </button>
        </div>

        {(statusMessage || errorMessage) && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              errorMessage
                ? 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                : 'bg-emerald-500/12 border-emerald-500/30 text-emerald-200'
            }`}
          >
            {errorMessage ? (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{errorMessage || statusMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Biometric & PIN Lock */}
          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-400" />
                <span>Biometric Authentication</span>
              </h2>
              <span className="text-xs text-slate-400">
                {isWebAuthnAvailable() ? 'WebAuthn Ready' : 'PIN Mode'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-100">
                    {lockConfig.biometricEnrolled
                      ? lockConfig.credentialLabel || 'Passkey Enrolled'
                      : 'No Hardware Passkey Enrolled'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Touch ID, Face ID, Windows Hello, or FIDO2 hardware key.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEnrollPasskey}
                  disabled={busy}
                  className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold transition-colors"
                >
                  {lockConfig.biometricEnrolled ? 'Re-enroll Passkey' : 'Enroll Biometric Passkey'}
                </button>
                {lockConfig.biometricEnrolled && (
                  <button
                    type="button"
                    onClick={handleTestPasskey}
                    disabled={busy}
                    className="h-9 px-3.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-slate-200 transition-colors"
                  >
                    Test Verification
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleSavePin} className="space-y-2.5">
              <label className="block text-xs font-medium text-slate-300">
                {lockConfig.pinHash ? 'Update Security PIN (SHA-256)' : 'Set Security PIN Fallback'}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value)}
                    placeholder="Enter 4–8 digit PIN"
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  className="h-9 px-3.5 rounded-lg bg-[#18202B] hover:bg-[#222D3D] border border-white/[0.08] text-xs font-medium text-slate-100 whitespace-nowrap"
                >
                  Save PIN
                </button>
              </div>
            </form>

            <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Require authentication to open Lock Settings</span>
                <input
                  type="checkbox"
                  checked={lockConfig.requireForSettings}
                  onChange={() =>
                    onUpdateLockConfig({
                      ...lockConfig,
                      requireForSettings: !lockConfig.requireForSettings,
                    })
                  }
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Require authentication for Child Guardian Controls</span>
                <input
                  type="checkbox"
                  checked={lockConfig.requireForGuardian}
                  onChange={() =>
                    onUpdateLockConfig({
                      ...lockConfig,
                      requireForGuardian: !lockConfig.requireForGuardian,
                    })
                  }
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </label>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Auto-Lock Inactivity Timeout</span>
                <select
                  value={lockConfig.autoLockMinutes}
                  onChange={(e) =>
                    onUpdateLockConfig({
                      ...lockConfig,
                      autoLockMinutes: Number(e.target.value),
                    })
                  }
                  className="h-8 px-2 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono text-slate-100"
                >
                  <option value={0}>Disabled</option>
                  <option value={1}>1 min</option>
                  <option value={5}>5 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                </select>
              </div>
            </div>
          </section>

          {/* Built-in Focus Mode */}
          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-100 flex items-center gap-2">
                <BellOff className="w-4 h-4 text-amber-300" />
                <span>Built-in Focus Mode</span>
              </h2>
              <span className="text-xs text-slate-400">
                {focusState.enabled ? `Active · ${focusState.presetLabel}` : 'Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Off', mins: null },
                { label: '25m Deep Work', mins: 25 },
                { label: '1h Meeting Block', mins: 60 },
                { label: '4h Quiet Hours', mins: 240 },
              ].map((preset) => {
                const isSelected =
                  (preset.mins === null && !focusState.enabled) ||
                  (focusState.enabled && focusState.presetLabel === preset.label);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyFocusPreset(preset.mins, preset.label)}
                    className={`h-10 px-3 rounded-xl text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                        : 'bg-[#090C10] border-white/[0.08] text-slate-300 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Silence notification sounds & desktop alerts</span>
                <input
                  type="checkbox"
                  checked={focusState.silenceSounds}
                  onChange={() => onUpdateFocus({ silenceSounds: !focusState.silenceSounds })}
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Hide unread badge counters during focus</span>
                <input
                  type="checkbox"
                  checked={focusState.hideUnreadBadges}
                  onChange={() =>
                    onUpdateFocus({ hideUnreadBadges: !focusState.hideUnreadBadges })
                  }
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Allow VIP & Family emergency bypass</span>
                <input
                  type="checkbox"
                  checked={focusState.allowVipBypass}
                  onChange={() => onUpdateFocus({ allowVipBypass: !focusState.allowVipBypass })}
                  className="rounded border-white/20 bg-[#090C10] text-emerald-500"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Focus Auto-Status Note
              </label>
              <input
                type="text"
                value={focusState.autoReplyText}
                onChange={(e) => onUpdateFocus({ autoReplyText: e.target.value })}
                className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
