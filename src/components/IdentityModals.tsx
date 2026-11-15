import React, { useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  AtSign,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  UserCheck,
  MessageSquarePlus,
} from 'lucide-react';
import type { Conversation, DirectoryUser } from '../types/kestrel';

const COUNTRY_CODES = [
  { code: '+1', label: 'US / CA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+33', label: 'France (+33)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+55', label: 'Brazil (+55)' },
  { code: '+81', label: 'Japan (+81)' },
  { code: '', label: 'Full +Code' },
];

function buildFullPhone(countryCode: string, localInput: string): string {
  const trimmed = localInput.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    return trimmed;
  }
  const digits = trimmed.replace(/[\s\-().]/g, '');
  if (!countryCode) return digits ? `+${digits}` : '';
  const cleanLocal = digits.replace(/^0+/, '');
  return `${countryCode}${cleanLocal}`;
}

interface AddContactModalProps {
  directoryUsers: DirectoryUser[];
  initialQuery?: string;
  onClose: () => void;
  onContactAdded: (conversation: Conversation) => void;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({
  directoryUsers,
  initialQuery = '',
  onClose,
  onContactAdded,
}) => {
  const initialIsUsername = useMemo(() => {
    const q = initialQuery.trim();
    if (!q) return false;
    return q.startsWith('@') || /[a-zA-Z_]/.test(q);
  }, [initialQuery]);

  const [tab, setTab] = useState<'phone' | 'username'>(initialIsUsername ? 'username' : 'phone');
  const [countryCode, setCountryCode] = useState<string>(() =>
    initialQuery.trim().startsWith('+') ? '' : '+1'
  );
  const [phoneInput, setPhoneInput] = useState(() =>
    !initialIsUsername ? initialQuery.trim() : ''
  );
  const [usernameInput, setUsernameInput] = useState(() =>
    initialIsUsername ? initialQuery.trim().replace(/^@+/, '') : ''
  );
  const [contactName, setContactName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [checkResult, setCheckResult] = useState<{
    usernameValid: boolean;
    usernameAvailable: boolean;
    usernameOwnerName: string | null;
    usernameOwner: DirectoryUser | null;
    phoneValid: boolean;
    phoneAvailable: boolean;
    phoneOwnerName: string | null;
    phoneOwner: DirectoryUser | null;
  } | null>(null);

  const composedPhone = useMemo(
    () => buildFullPhone(countryCode, phoneInput),
    [countryCode, phoneInput]
  );

  useEffect(() => {
    setError('');
    const targetPhone = tab === 'phone' ? composedPhone : '';
    const targetUsername = tab === 'username' ? usernameInput.trim() : '';

    if (!targetPhone && !targetUsername) {
      setCheckResult(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (targetPhone) params.set('phoneNumber', targetPhone);
        if (targetUsername) params.set('username', targetUsername);
        const res = await fetch(`/api/identity/check?${params.toString()}`);
        if (res.ok) {
          setCheckResult(await res.json());
        }
      } catch {
        // ignore transient errors
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [tab, composedPhone, usernameInput]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composedPhone || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/contacts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'phone',
          phoneNumber: composedPhone,
          displayName: contactName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start chat with that phone number.');
        return;
      }
      onContactAdded(data.conversation as Conversation);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = usernameInput.trim().replace(/^@+/, '');
    if (!cleaned || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/contacts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'username',
          username: cleaned,
          displayName: contactName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start chat with that @username.');
        return;
      }
      onContactAdded(data.conversation as Conversation);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickChatUser = async (user: DirectoryUser) => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/contacts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          user.username
            ? { mode: 'username', username: user.username }
            : { mode: 'phone', phoneNumber: user.phoneNumber }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not open chat.');
        return;
      }
      onContactAdded(data.conversation as Conversation);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const availableDirectory = directoryUsers.filter((u) => u.id !== 'me');

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#11161E] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-100">
              New Chat by Number or @Username
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter anyone’s phone number (like WhatsApp) or unique @username to chat instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add contact"
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090C10] border border-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              setTab('phone');
              setError('');
            }}
            className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              tab === 'phone'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phone Number</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('username');
              setError('');
            }}
            className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              tab === 'username'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <AtSign className="w-3.5 h-3.5" />
            <span>@Username</span>
          </button>
        </div>

        {tab === 'phone' ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Phone Number
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  aria-label="Country code"
                  className="h-10 px-2.5 rounded-xl bg-[#090C10] border border-white/[0.1] text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.label} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  autoFocus
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder={countryCode ? '415 555 0199' : '+1 415 555 0199'}
                  className="flex-1 min-w-0 h-10 px-3.5 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {phoneInput.trim() && checkResult && (
                <div className="mt-2">
                  {!checkResult.phoneValid ? (
                    <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Enter a valid phone number (7–15 digits).</span>
                    </p>
                  ) : checkResult.phoneOwner ? (
                    <div className="p-3 rounded-xl bg-[#090C10] border border-emerald-500/35 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={checkResult.phoneOwner.avatarUrl}
                          alt={checkResult.phoneOwner.displayName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100 truncate">
                            {checkResult.phoneOwner.displayName}
                          </p>
                          <p className="text-[11px] font-mono text-emerald-300 truncate">
                            {[
                              checkResult.phoneOwner.username
                                ? `@${checkResult.phoneOwner.username}`
                                : '',
                              checkResult.phoneOwner.phoneNumber,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-400 shrink-0">
                        On Kestrel
                      </span>
                    </div>
                  ) : !checkResult.phoneAvailable ? (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>This is your own registered Kestrel phone number.</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Ready to save {composedPhone} and start encrypted chat</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {!checkResult?.phoneOwner && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contact Name <span className="text-slate-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins (or leave blank for number)"
                  className="w-full h-9 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !phoneInput.trim()}
              className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Starting Encrypted Chat...'
                  : checkResult?.phoneOwner
                    ? `Chat with ${checkResult.phoneOwner.displayName}`
                    : 'Add Number & Start Chat'}
              </span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleUsernameSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Unique @Username
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value.replace(/^@+/, ''))}
                  placeholder="priya_nair or sarah_ops"
                  className="w-full h-10 pl-9 pr-3.5 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {usernameInput.trim() && checkResult && (
                <div className="mt-2">
                  {!checkResult.usernameValid ? (
                    <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Use 3–24 lowercase letters, numbers, or underscores.</span>
                    </p>
                  ) : checkResult.usernameOwner ? (
                    <div className="p-3 rounded-xl bg-[#090C10] border border-emerald-500/35 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={checkResult.usernameOwner.avatarUrl}
                          alt={checkResult.usernameOwner.displayName}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-100 truncate">
                            {checkResult.usernameOwner.displayName}
                          </p>
                          <p className="text-[11px] font-mono text-emerald-300 truncate">
                            {[
                              `@${checkResult.usernameOwner.username}`,
                              checkResult.usernameOwner.phoneNumber,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-emerald-400 shrink-0">
                        Verified Handle
                      </span>
                    </div>
                  ) : !checkResult.usernameAvailable ? (
                    <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>That @username belongs to your own account.</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        @{usernameInput.trim().toLowerCase()} is unclaimed — ready to lock & chat
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {!checkResult?.usernameOwner && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Display Name <span className="text-slate-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Jordan Patel"
                  className="w-full h-9 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !usernameInput.trim()}
              className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Starting Encrypted Chat...'
                  : checkResult?.usernameOwner
                    ? `Chat with @${checkResult.usernameOwner.username}`
                    : 'Add @Username & Start Chat'}
              </span>
            </button>
          </form>
        )}

        {/* Saved Directory Contacts */}
        <div className="space-y-2 pt-1 border-t border-white/[0.06]">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pt-1">
            Directory & Contacts ({availableDirectory.length})
          </p>
          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
            {availableDirectory.map((u) => (
              <div
                key={u.id}
                className="p-2.5 rounded-xl bg-[#090C10] border border-white/[0.06] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={u.avatarUrl}
                    alt={u.displayName}
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-100 truncate">{u.displayName}</p>
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      {[u.username ? `@${u.username}` : '', u.phoneNumber]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleQuickChatUser(u)}
                  className="h-7 px-3 rounded-lg bg-white/[0.06] hover:bg-emerald-500 hover:text-[#05110B] text-xs font-medium text-slate-200 transition-colors shrink-0"
                >
                  Chat
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface MyIdentityModalProps {
  currentProfile: DirectoryUser | null;
  onClose: () => void;
  onProfileSaved: (profile: DirectoryUser) => void;
}

export const MyIdentityModal: React.FC<MyIdentityModalProps> = ({
  currentProfile,
  onClose,
  onProfileSaved,
}) => {
  const [displayName, setDisplayName] = useState(currentProfile?.displayName || '');
  const [username, setUsername] = useState(currentProfile?.username || '');
  const [phoneNumber, setPhoneNumber] = useState(currentProfile?.phoneNumber || '');
  const [role, setRole] = useState(currentProfile?.role || 'Workspace Owner');
  const [availability, setAvailability] = useState<{
    usernameValid: boolean;
    usernameAvailable: boolean;
    usernameOwnerName: string | null;
    phoneValid: boolean;
    phoneAvailable: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!username.trim() && !phoneNumber.trim()) {
      setAvailability(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (username.trim()) params.set('username', username.trim());
        if (phoneNumber.trim()) params.set('phoneNumber', phoneNumber.trim());
        params.set('excludeUserId', currentProfile?.id || 'me');
        const res = await fetch(`/api/identity/check?${params.toString()}`);
        if (res.ok) setAvailability(await res.json());
      } catch {
        // ignore
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [username, phoneNumber, currentProfile?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/identity/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          phoneNumber: phoneNumber.trim(),
          role: role.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not claim identity.');
        return;
      }
      onProfileSaved(data as DirectoryUser);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#11161E] border border-white/[0.1] rounded-2xl p-6 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-100">
                Your Unique Kestrel Identity
              </h2>
              <p className="text-xs text-slate-400">
                Once claimed, your @username and number cannot be used by anyone else.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Exclusive @Username
            </label>
            <div className="relative">
              <AtSign className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="alex_rivera"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {username.trim() && availability && (
              <p
                className={`mt-1 text-[11px] flex items-center gap-1 ${
                  availability.usernameValid && availability.usernameAvailable
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {!availability.usernameValid ? (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>3–24 chars: lowercase letters, numbers, underscores only.</span>
                  </>
                ) : availability.usernameAvailable ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>@{username.replace(/^@+/, '').toLowerCase()} is available</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>
                      Already taken by {availability.usernameOwnerName || 'another user'}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Exclusive Phone Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+14155550199"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {phoneNumber.trim() && availability && (
              <p
                className={`mt-1 text-[11px] flex items-center gap-1 ${
                  availability.phoneValid && availability.phoneAvailable
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {!availability.phoneValid ? (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>Enter country code + 7–15 digits (e.g. +14155550199).</span>
                  </>
                ) : availability.phoneAvailable ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Phone number is available</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" />
                    <span>Phone number is already claimed by another user</span>
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Title / Role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.1] text-xs text-slate-100"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-xs font-medium text-slate-300 hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold"
            >
              {saving ? 'Reserving...' : 'Claim Unique Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
