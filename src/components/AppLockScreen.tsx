import React, { useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import type { BiometricLockConfig } from '../types/kestrel';
import { hashPin, verifyBiometricPasskey } from '../utils/crypto';
import { Mini3DVaultEmblem } from './three/Mini3DVaultEmblem';

interface AppLockScreenProps {
  lockConfig: BiometricLockConfig;
  title?: string;
  subtitle?: string;
  onUnlock: () => void;
  onCancel?: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  lockConfig,
  title = 'Kestrel Workspace Locked',
  subtitle = 'Verify with your hardware biometric passkey or security PIN to decrypt local session keys.',
  onUnlock,
  onCancel,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleBiometricUnlock = async () => {
    if (!lockConfig.credentialId) {
      setError('No WebAuthn passkey enrolled yet. Use your security PIN.');
      return;
    }
    setError('');
    setVerifying(true);
    try {
      const ok = await verifyBiometricPasskey(lockConfig.credentialId);
      if (ok) {
        onUnlock();
      } else {
        setError('Biometric verification could not be confirmed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric authentication cancelled.');
    } finally {
      setVerifying(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setError('');
    setVerifying(true);
    try {
      const enteredHash = await hashPin(pinInput.trim());
      if (!lockConfig.pinHash || enteredHash === lockConfig.pinHash) {
        setPinInput('');
        onUnlock();
      } else {
        setError('Incorrect security PIN. Please try again.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(9, 12, 16, 0.94)' }}
    >
      <div className="w-full max-w-md bg-[#11161E] border border-white/[0.1] rounded-2xl p-7 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-5">
          <Mini3DVaultEmblem size={148} locked accentColor="amber" className="mb-2" />
          <h2 className="font-display text-xl font-semibold text-slate-100 mb-1.5">{title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{subtitle}</p>
        </div>

        {lockConfig.biometricEnrolled && lockConfig.credentialId && (
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={verifying}
            className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-sm font-semibold flex items-center justify-center gap-2 transition-colors mb-4"
          >
            <Fingerprint className="w-5 h-5" />
            <span>{verifying ? 'Awaiting Biometric Sensor...' : 'Unlock with Touch ID / Passkey'}</span>
          </button>
        )}

        {lockConfig.pinHash ? (
          <form onSubmit={handlePinSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-slate-300">
              Security PIN Fallback
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter security PIN"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={verifying || !pinInput.trim()}
                className="h-10 px-4 rounded-lg bg-[#1C2430] hover:bg-[#242F3E] text-slate-100 text-xs font-semibold border border-white/[0.08] transition-colors whitespace-nowrap"
              >
                Verify PIN
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Quick unlock active (no PIN configured yet).</span>
            </div>
            <button
              type="button"
              onClick={onUnlock}
              className="h-8 px-3 rounded-lg bg-emerald-500 text-[#05110B] text-xs font-semibold whitespace-nowrap"
            >
              Unlock
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {onCancel && (
          <div className="mt-5 pt-4 border-t border-white/[0.06] flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
