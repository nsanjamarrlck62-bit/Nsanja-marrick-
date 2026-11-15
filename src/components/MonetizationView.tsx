import React, { useEffect, useMemo, useState } from 'react';
import {
  AtSign,
  HardDrive,
  Building2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Download,
  Receipt,
  Sparkles,
  Check,
  Layers,
  Gauge,
  Minus,
  Plus,
} from 'lucide-react';
import type {
  BillingCycle,
  DirectoryUser,
  MonetizationState,
  PlanTierId,
  StorageTierId,
  WhiteLabelLicense,
} from '../types/kestrel';
import type { VaultBlobRecord } from './DevicesVaultView';

interface MonetizationViewProps {
  monetization: MonetizationState;
  vaultBlobs: VaultBlobRecord[];
  devicesCount: number;
  conversationsCount: number;
  myProfile: DirectoryUser | null;
  onMonetizationUpdated: (next: MonetizationState) => void;
  onProfileUpdated: (profile: DirectoryUser) => void;
}

type StudioSection = 'plans' | 'handles' | 'storage' | 'whitelabel' | 'invoices';

const FEATURED_HANDLES = ['ops', 'ceo', 'sec', 'nova', 'mint', 'lab'];

const PLAN_CARDS: {
  id: PlanTierId;
  name: string;
  tagline: string;
  monthlyUsd: number;
  annualMonthlyEqUsd: number;
  perSeat: boolean;
  features: string[];
}[] = [
  {
    id: 'free',
    name: 'Kestrel Free',
    tagline: 'Personal encrypted chat & basic sync',
    monthlyUsd: 0,
    annualMonthlyEqUsd: 0,
    perSeat: false,
    features: [
      '2 GB Encrypted Cloud Vault',
      '5 AI Chat Summaries / month',
      'Up to 3 linked devices',
      'Up to 8 encrypted threads',
      '5 tool dispatches / month',
    ],
  },
  {
    id: 'plus',
    name: 'Kestrel Plus',
    tagline: 'For power users & Child Guard families',
    monthlyUsd: 6,
    annualMonthlyEqUsd: 4.83,
    perSeat: false,
    features: [
      '100 GB Encrypted Cloud Vault',
      '50 AI Chat Summaries / month',
      'Up to 8 linked devices',
      'Up to 30 encrypted threads',
      '50 tool dispatches / month',
    ],
  },
  {
    id: 'team',
    name: 'Kestrel Team',
    tagline: 'Zero-knowledge collaboration for orgs',
    monthlyUsd: 14,
    annualMonthlyEqUsd: 11.17,
    perSeat: true,
    features: [
      '1 TB Encrypted Cloud Vault',
      'Unlimited AI Chat Summaries',
      'Up to 25 linked devices',
      'Unlimited encrypted threads',
      'Unlimited Linear, Jira & Notion dispatches',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom scale, compliance & white-label',
    monthlyUsd: 29,
    annualMonthlyEqUsd: 23.17,
    perSeat: true,
    features: [
      '5 TB Encrypted Cloud Vault',
      'Unlimited AI Chat Summaries',
      'Unlimited linked devices & threads',
      'Unlimited tool & CalDAV dispatches',
      'White-Label Studio ready',
    ],
  },
];

const STORAGE_PLANS: {
  id: StorageTierId;
  name: string;
  quotaLabel: string;
  priceLabel: string;
  description: string;
  pinsLabel: string;
}[] = [
  {
    id: 'free_2gb',
    name: 'Vault Free',
    quotaLabel: '2 GB',
    priceLabel: '$0 / mo',
    description: 'Standard encrypted voice notes, photos, and document CIDs.',
    pinsLabel: '2 distributed pinning nodes',
  },
  {
    id: 'vault_100gb',
    name: 'Vault Plus',
    quotaLabel: '100 GB',
    priceLabel: '$2.99 / mo',
    description: 'Expanded zero-knowledge cloud media archive for heavy daily chats.',
    pinsLabel: '4 geo-redundant pinning nodes',
  },
  {
    id: 'vault_1tb',
    name: 'Vault Pro',
    quotaLabel: '1 TB',
    priceLabel: '$9.99 / mo',
    description: 'Full team & family encrypted backup vault with priority CID relay.',
    pinsLabel: '6 global pinning nodes + SLA',
  },
];

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
}

export const MonetizationView: React.FC<MonetizationViewProps> = ({
  monetization,
  vaultBlobs,
  devicesCount,
  conversationsCount,
  myProfile,
  onMonetizationUpdated,
  onProfileUpdated,
}) => {
  const [section, setSection] = useState<StudioSection>('plans');

  // Plan tiers state
  const [cycle, setCycle] = useState<BillingCycle>(monetization.billingCycle || 'monthly');
  const [seats, setSeats] = useState<number>(monetization.seats || 3);
  const [updatingPlan, setUpdatingPlan] = useState<PlanTierId | null>(null);
  const [planNotice, setPlanNotice] = useState('');

  // #3: Premium Handles state
  const [handleInput, setHandleInput] = useState('');
  const [assignPrimary, setAssignPrimary] = useState(true);
  const [handleCheck, setHandleCheck] = useState<{
    usernameValid: boolean;
    usernameAvailable: boolean;
    usernameOwnerName: string | null;
  } | null>(null);
  const [reservingHandle, setReservingHandle] = useState(false);
  const [handleFeedback, setHandleFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // #4: Storage tier state
  const [updatingTier, setUpdatingTier] = useState<StorageTierId | null>(null);

  // #5: White-label state
  const [wlTier, setWlTier] = useState<WhiteLabelLicense['tier']>(
    monetization.whiteLabel.tier === 'None'
      ? 'Starter Org ($199/mo)'
      : monetization.whiteLabel.tier
  );
  const [wlBrandName, setWlBrandName] = useState(monetization.whiteLabel.brandName || 'Kestrel');
  const [wlTagline, setWlTagline] = useState(
    monetization.whiteLabel.brandTagline || 'Chiat-Ratchet E2EE · Synced'
  );
  const [wlDomain, setWlDomain] = useState(monetization.whiteLabel.customDomain || '');
  const [wlBundleId, setWlBundleId] = useState(
    monetization.whiteLabel.bundleId || 'app.kestrel.secure'
  );
  const [wlAccent, setWlAccent] = useState<WhiteLabelLicense['accentColor']>(
    monetization.whiteLabel.accentColor || 'emerald'
  );
  const [savingWl, setSavingWl] = useState(false);
  const [wlSavedMessage, setWlSavedMessage] = useState('');

  useEffect(() => {
    setCycle(monetization.billingCycle);
    setSeats(monetization.seats);
  }, [monetization.billingCycle, monetization.seats]);

  useEffect(() => {
    setWlBrandName(monetization.whiteLabel.brandName);
    setWlTagline(monetization.whiteLabel.brandTagline);
    setWlDomain(monetization.whiteLabel.customDomain);
    setWlBundleId(monetization.whiteLabel.bundleId);
    setWlAccent(monetization.whiteLabel.accentColor);
    if (monetization.whiteLabel.tier !== 'None') {
      setWlTier(monetization.whiteLabel.tier);
    }
  }, [monetization.whiteLabel]);

  const normalizedHandle = handleInput.trim().replace(/^@+/, '').toLowerCase();
  const handlePriceUsd = normalizedHandle.length > 0 && normalizedHandle.length <= 4 ? 29 : 12;

  useEffect(() => {
    if (!normalizedHandle) {
      setHandleCheck(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          username: normalizedHandle,
          excludeUserId: myProfile?.id || 'me',
        });
        const res = await fetch(`/api/identity/check?${params.toString()}`);
        if (res.ok) setHandleCheck(await res.json());
      } catch {
        // ignore transient error
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [normalizedHandle, myProfile?.id]);

  const usedVaultBytes = useMemo(
    () => vaultBlobs.reduce((sum, b) => sum + (b.sizeBytes || 0), 0),
    [vaultBlobs]
  );

  const usageMeters = useMemo(() => {
    const lim = monetization.limits;
    const usg = monetization.usage;
    return [
      {
        label: 'AI Chat Summaries',
        used: usg.aiSummariesUsed,
        limit: lim.aiSummariesMonthly,
        usedText: `${usg.aiSummariesUsed}`,
        limitText: lim.aiSummariesMonthly === -1 ? 'Unlimited' : `${lim.aiSummariesMonthly} / mo`,
      },
      {
        label: 'Encrypted Cloud Vault',
        used: usedVaultBytes,
        limit: monetization.storageQuotaBytes,
        usedText: formatStorageSize(usedVaultBytes),
        limitText: formatStorageSize(monetization.storageQuotaBytes),
      },
      {
        label: 'Linked Devices',
        used: devicesCount,
        limit: lim.maxDevices,
        usedText: `${devicesCount}`,
        limitText: lim.maxDevices === -1 ? 'Unlimited' : `${lim.maxDevices} max`,
      },
      {
        label: 'Encrypted Threads',
        used: conversationsCount,
        limit: lim.maxConversations,
        usedText: `${conversationsCount}`,
        limitText: lim.maxConversations === -1 ? 'Unlimited' : `${lim.maxConversations} max`,
      },
      {
        label: 'Tool Dispatches',
        used: usg.dispatchesUsed,
        limit: lim.dispatchesMonthly,
        usedText: `${usg.dispatchesUsed}`,
        limitText: lim.dispatchesMonthly === -1 ? 'Unlimited' : `${lim.dispatchesMonthly} / mo`,
      },
    ];
  }, [monetization, usedVaultBytes, devicesCount, conversationsCount]);

  const handleSelectPlan = async (planId: PlanTierId) => {
    if (updatingPlan) return;
    setUpdatingPlan(planId);
    setPlanNotice('');
    try {
      const res = await fetch('/api/monetization/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, billingCycle: cycle, seats }),
      });
      if (res.ok) {
        const next = (await res.json()) as MonetizationState;
        onMonetizationUpdated(next);
        const card = PLAN_CARDS.find((p) => p.id === planId);
        setPlanNotice(`Active plan updated to ${card?.name || planId} (${cycle}). Usage limits refreshed immediately.`);
      }
    } finally {
      setUpdatingPlan(null);
    }
  };

  const handleReserveVanity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedHandle || reservingHandle) return;
    setReservingHandle(true);
    setHandleFeedback(null);
    try {
      const res = await fetch('/api/monetization/handles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: normalizedHandle,
          assignAsPrimary: assignPrimary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHandleFeedback({ type: 'err', text: data.error || 'Could not reserve handle.' });
        return;
      }
      onMonetizationUpdated(data.monetization as MonetizationState);
      if (data.myProfile) onProfileUpdated(data.myProfile as DirectoryUser);
      setHandleFeedback({
        type: 'ok',
        text: `Reserved @${normalizedHandle} exclusively${assignPrimary ? ' and set as your primary handle' : ''}.`,
      });
      setHandleInput('');
    } finally {
      setReservingHandle(false);
    }
  };

  const handleSelectStorageTier = async (tierId: StorageTierId) => {
    if (updatingTier || tierId === monetization.storageTier) return;
    setUpdatingTier(tierId);
    try {
      const res = await fetch('/api/monetization/storage-tier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
      });
      if (res.ok) {
        onMonetizationUpdated((await res.json()) as MonetizationState);
      }
    } finally {
      setUpdatingTier(null);
    }
  };

  const handleSaveWhiteLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingWl) return;
    setSavingWl(true);
    setWlSavedMessage('');
    try {
      const res = await fetch('/api/monetization/white-label', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: true,
          tier: wlTier,
          brandName: wlBrandName,
          brandTagline: wlTagline,
          customDomain: wlDomain,
          bundleId: wlBundleId,
          accentColor: wlAccent,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as MonetizationState;
        onMonetizationUpdated(updated);
        setWlSavedMessage(
          `White-label brand "${updated.whiteLabel.brandName}" is live across the workspace.`
        );
      }
    } finally {
      setSavingWl(false);
    }
  };

  const handleDisableWhiteLabel = async () => {
    setSavingWl(true);
    setWlSavedMessage('');
    try {
      const res = await fetch('/api/monetization/white-label', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: false,
          tier: 'None',
          brandName: 'Kestrel',
          brandTagline: 'Chiat-Ratchet E2EE · Synced',
          accentColor: 'emerald',
        }),
      });
      if (res.ok) {
        onMonetizationUpdated((await res.json()) as MonetizationState);
        setWlSavedMessage('Restored default Kestrel branding.');
      }
    } finally {
      setSavingWl(false);
    }
  };

  const handleDownloadWhiteLabelKit = () => {
    const payload = {
      licenseKey: monetization.whiteLabel.licenseKey || 'PREVIEW-UNACTIVATED',
      tier: monetization.whiteLabel.tier,
      appName: wlBrandName,
      tagline: wlTagline,
      customDomain: wlDomain || 'chat.example.com',
      capacitor: {
        appId: wlBundleId || 'app.kestrel.secure',
        appName: wlBrandName,
        webDir: 'dist',
      },
      pwaManifest: {
        name: wlBrandName,
        short_name: wlBrandName.slice(0, 12),
        theme_color: '#090C10',
        accent: wlAccent,
      },
      security: {
        cipherSuite: 'Chiat-Ratchet AES-256-GCM + ECDH P-256',
        decentralizedCidPinning: true,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(wlBrandName || 'kestrel').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-whitelabel-config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalRevenueUsd = useMemo(
    () => monetization.invoices.reduce((sum, inv) => sum + inv.amountUsd, 0),
    [monetization.invoices]
  );

  const activePlanCard = PLAN_CARDS.find((p) => p.id === monetization.planId) || PLAN_CARDS[0];

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              Plans, Usage Limits & Monetization
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time workspace quota metering, subscription tiers, vanity @usernames, vault storage, and white-label licensing.
            </p>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-[#10151C] border border-white/[0.08] text-right">
            <p className="text-[11px] text-slate-400">
              Current Plan · <span className="text-emerald-300 font-medium">{activePlanCard.name}</span>
            </p>
            <p className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
              ${totalRevenueUsd.toFixed(2)} billed · {monetization.invoices.length} tx
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#10151C] border border-white/[0.07] w-fit">
          {(
            [
              { id: 'plans', label: 'Plans & Usage Limits', icon: Layers },
              { id: 'handles', label: 'Vanity @Handles', icon: AtSign },
              { id: 'storage', label: 'Vault Storage', icon: HardDrive },
              { id: 'whitelabel', label: 'White-Label', icon: Building2 },
              { id: 'invoices', label: `Invoices (${monetization.invoices.length})`, icon: Receipt },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = section === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSection(t.id)}
                className={`h-9 px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* SECTION 1: PLANS & LIVE USAGE LIMITS */}
        {section === 'plans' && (
          <div className="space-y-6">
            {/* Live Usage Quotas Card */}
            <section className="p-6 rounded-2xl bg-[#10151C] border border-white/[0.08] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Gauge className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-100">
                      Live Workspace Usage & Enforced Quotas
                    </h2>
                    <p className="text-xs text-slate-400">
                      Limits reset on{' '}
                      <span className="font-mono text-slate-300">
                        {new Date(monetization.usage.cycleResetAt).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-emerald-300">
                  {activePlanCard.name} · {monetization.billingCycle === 'annual' ? 'Annual' : 'Monthly'}
                  {activePlanCard.perSeat ? ` · ${monetization.seats} seats` : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {usageMeters.map((m) => {
                  const isUnlimited = m.limit === -1;
                  const pct = isUnlimited
                    ? 12
                    : Math.min(100, Math.round((m.used / Math.max(1, m.limit)) * 100));
                  const barColor = isUnlimited
                    ? 'bg-emerald-500/60'
                    : pct >= 100
                      ? 'bg-rose-500'
                      : pct >= 80
                        ? 'bg-amber-400'
                        : 'bg-emerald-500';
                  return (
                    <div
                      key={m.label}
                      className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2"
                    >
                      <p className="text-xs font-medium text-slate-300 truncate">{m.label}</p>
                      <p className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                        {m.usedText}{' '}
                        <span className="text-[11px] font-normal text-slate-400">/ {m.limitText}</span>
                      </p>
                      <div className="w-full h-1.5 rounded-full bg-[#151C26] overflow-hidden">
                        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Billing Cycle & Seats Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-1">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#10151C] border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setCycle('monthly')}
                  className={`h-8 px-3.5 rounded-lg text-xs font-medium transition-colors ${
                    cycle === 'monthly'
                      ? 'bg-[#1B2330] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setCycle('annual')}
                  className={`h-8 px-3.5 rounded-lg text-xs font-medium transition-colors ${
                    cycle === 'annual'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Annual (Save 20%)
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Team / Enterprise Seats:</span>
                <div className="flex items-center gap-1 bg-[#10151C] border border-white/[0.08] rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setSeats((s) => Math.max(1, s - 1))}
                    aria-label="Decrease seats"
                    className="w-7 h-7 rounded hover:bg-white/[0.06] flex items-center justify-center text-slate-300"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono text-xs font-semibold text-slate-100 tabular-nums">
                    {seats}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSeats((s) => Math.min(500, s + 1))}
                    aria-label="Increase seats"
                    className="w-7 h-7 rounded hover:bg-white/[0.06] flex items-center justify-center text-slate-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {planNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{planNotice}</span>
              </div>
            )}

            {/* 4 Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {PLAN_CARDS.map((card) => {
                const isCurrent =
                  monetization.planId === card.id &&
                  monetization.billingCycle === cycle &&
                  (!card.perSeat || monetization.seats === seats);
                const unitDisplay = cycle === 'annual' ? card.annualMonthlyEqUsd : card.monthlyUsd;
                return (
                  <div
                    key={card.id}
                    className={`p-5 rounded-2xl border flex flex-col justify-between gap-5 ${
                      monetization.planId === card.id
                        ? 'bg-[#0D1A16] border-emerald-500/45'
                        : 'bg-[#10151C] border-white/[0.08]'
                    }`}
                  >
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display text-base font-semibold text-slate-100">
                            {card.name}
                          </h3>
                          {monetization.planId === card.id && (
                            <span className="text-[11px] font-medium text-emerald-300">Active</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{card.tagline}</p>
                      </div>

                      <div>
                        <p className="font-display text-3xl font-bold text-slate-100 tabular-nums">
                          ${unitDisplay.toFixed(unitDisplay % 1 === 0 ? 0 : 2)}
                          <span className="text-xs font-normal text-slate-400">
                            {card.perSeat ? ' / user / mo' : ' / mo'}
                          </span>
                        </p>
                        {card.perSeat && (
                          <p className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">
                            Est. ${(unitDisplay * seats).toFixed(0)}/mo for {seats} seats
                          </p>
                        )}
                      </div>

                      <ul className="space-y-2 text-xs text-slate-300 pt-1 border-t border-white/[0.06]">
                        {card.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || updatingPlan === card.id}
                      onClick={() => handleSelectPlan(card.id)}
                      className={`w-full h-10 rounded-xl text-xs font-semibold transition-colors ${
                        isCurrent
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-[#05110B]'
                      }`}
                    >
                      {isCurrent
                        ? 'Current Plan'
                        : updatingPlan === card.id
                          ? 'Updating Plan...'
                          : card.id === 'free'
                            ? 'Switch to Free'
                            : `Select ${card.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 2: PREMIUM HANDLES (#3) */}
        {section === 'handles' && (
          <section className="p-6 rounded-2xl bg-[#10151C] border border-white/[0.08] space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <AtSign className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    Premium Unique @Usernames & Vanity Handles
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    3–4 character ultra-short handles ($29 one-time) and brand/VIP handles ($12 one-time) are globally locked and cannot be reused by anyone else.
                  </p>
                </div>
              </div>
              {myProfile && (
                <div className="px-3 py-1.5 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs font-mono text-slate-300">
                  Active Handle: <span className="text-emerald-300">@{myProfile.username}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <form onSubmit={handleReserveVanity} className="lg:col-span-2 space-y-3.5">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <AtSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={handleInput}
                      onChange={(e) => setHandleInput(e.target.value.replace(/^@+/, ''))}
                      placeholder="Search vanity handle (e.g. ops, studio, vip)"
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      reservingHandle ||
                      !normalizedHandle ||
                      Boolean(handleCheck && (!handleCheck.usernameValid || !handleCheck.usernameAvailable))
                    }
                    className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-[#05110B] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {reservingHandle
                        ? 'Reserving...'
                        : normalizedHandle
                          ? `Reserve @${normalizedHandle} ($${handlePriceUsd})`
                          : 'Reserve Handle'}
                    </span>
                  </button>
                </div>

                {normalizedHandle && handleCheck && (
                  <p
                    className={`text-xs flex items-center gap-1.5 ${
                      handleCheck.usernameValid && handleCheck.usernameAvailable
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {!handleCheck.usernameValid ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Use 3–24 lowercase letters, numbers, or underscores.</span>
                      </>
                    ) : handleCheck.usernameAvailable ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          @{normalizedHandle} is available ·{' '}
                          {normalizedHandle.length <= 4
                            ? 'Short 3–4 Char Tier ($29 one-time)'
                            : 'Brand / VIP Tier ($12 one-time)'}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>
                          Already claimed by {handleCheck.usernameOwnerName || 'another account'} — cannot be reused.
                        </span>
                      </>
                    )}
                  </p>
                )}

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignPrimary}
                    onChange={(e) => setAssignPrimary(e.target.checked)}
                    className="rounded border-white/20 bg-[#090C10] text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Immediately activate as my primary Kestrel @username</span>
                </label>

                {handleFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs border ${
                      handleFeedback.type === 'ok'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    {handleFeedback.text}
                  </div>
                )}

                <div className="pt-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Featured Ultra-Short Handles
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {FEATURED_HANDLES.map((h) => {
                      const isTaken = monetization.reservedHandles.some((r) => r.handle === h);
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={isTaken}
                          onClick={() => setHandleInput(h)}
                          className={`p-2.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-2 ${
                            isTaken
                              ? 'bg-[#090C10]/60 border-white/[0.05] text-slate-500 cursor-not-allowed'
                              : 'bg-[#090C10] hover:border-emerald-500/40 border-white/[0.08] text-slate-200'
                          }`}
                        >
                          <span className="font-mono text-xs font-medium">@{h}</span>
                          <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                            {isTaken ? 'Owned' : h.length <= 4 ? '$29' : '$12'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>

              <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-3">
                <p className="text-xs font-semibold text-slate-200">
                  Your Reserved Vanity Handles ({monetization.reservedHandles.length})
                </p>
                {monetization.reservedHandles.length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    No premium handles reserved yet. Pick a short handle on the left to lock it to your identity.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {monetization.reservedHandles.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg bg-[#10151C] border border-white/[0.06] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-semibold text-emerald-300 truncate">
                            @{item.handle}
                          </p>
                          <p className="text-[11px] text-slate-400">{item.tier}</p>
                        </div>
                        <span className="font-mono text-xs text-slate-300 tabular-nums shrink-0">
                          ${item.priceUsd}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: VAULT STORAGE UPGRADES (#4) */}
        {section === 'storage' && (
          <section className="p-6 rounded-2xl bg-[#10151C] border border-white/[0.08] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    Encrypted Cloud Vault Storage Upgrades
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Monetize decentralized AES-256-GCM CID pinning capacity for encrypted files, photos, and voice notes.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-mono text-slate-200 tabular-nums">
                  {formatStorageSize(usedVaultBytes)} /{' '}
                  {formatStorageSize(monetization.storageQuotaBytes)} used
                </p>
                <p className="text-[11px] text-slate-400">{vaultBlobs.length} pinned CID blobs</p>
              </div>
            </div>

            <div className="w-full h-2 rounded-full bg-[#090C10] border border-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0.5, (usedVaultBytes / Math.max(1, monetization.storageQuotaBytes)) * 100)
                  )}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STORAGE_PLANS.map((plan) => {
                const isCurrent = monetization.storageTier === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`p-5 rounded-xl border flex flex-col justify-between gap-4 ${
                      isCurrent
                        ? 'bg-[#0D1A16] border-emerald-500/45'
                        : 'bg-[#090C10] border-white/[0.07]'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-100">{plan.name}</span>
                        <span className="font-mono text-xs font-semibold text-emerald-300 tabular-nums">
                          {plan.priceLabel}
                        </span>
                      </div>
                      <p className="font-display text-2xl font-bold text-slate-100 tabular-nums">
                        {plan.quotaLabel}
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed">{plan.description}</p>
                      <p className="text-[11px] font-mono text-slate-400 pt-1">{plan.pinsLabel}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isCurrent || updatingTier === plan.id}
                      onClick={() => handleSelectStorageTier(plan.id)}
                      className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        isCurrent
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 cursor-default'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-[#05110B]'
                      }`}
                    >
                      {isCurrent ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Active Storage Tier</span>
                        </>
                      ) : updatingTier === plan.id ? (
                        <span>Updating Quota...</span>
                      ) : (
                        <span>Upgrade to {plan.quotaLabel}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 4: WHITE-LABEL LICENSING (#5) */}
        {section === 'whitelabel' && (
          <section className="p-6 rounded-2xl bg-[#10151C] border border-white/[0.08] space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    White-Label Licensing Studio
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Rebrand the platform for clinics, schools, enterprises, or private networks and export a ready-to-build Android APK / iOS / Web deployment kit.
                  </p>
                </div>
              </div>

              {monetization.whiteLabel.licenseKey && (
                <div className="px-3 py-1.5 rounded-lg bg-[#090C10] border border-emerald-500/30 flex items-center gap-2 text-xs font-mono text-emerald-300">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{monetization.whiteLabel.licenseKey}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveWhiteLabel} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Licensing Tier
                </label>
                <select
                  value={wlTier}
                  onChange={(e) => setWlTier(e.target.value as WhiteLabelLicense['tier'])}
                  className="w-full h-10 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-xs text-slate-100"
                >
                  <option value="Starter Org ($199/mo)">
                    Starter Org ($199/mo) — Up to 50 seats + Custom Brand Web/PWA
                  </option>
                  <option value="Enterprise Source ($799/mo)">
                    Enterprise Source ($799/mo) — 500 seats + Custom APK/IPA + Relay Nodes
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom App / Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={wlBrandName}
                  onChange={(e) => setWlBrandName(e.target.value)}
                  placeholder="e.g. MedVault Secure"
                  className="w-full h-10 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Workspace Subtitle / Tagline
                </label>
                <input
                  type="text"
                  value={wlTagline}
                  onChange={(e) => setWlTagline(e.target.value)}
                  placeholder="e.g. HIPAA-Ready Encrypted Comms"
                  className="w-full h-10 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Domain & Mobile Bundle ID
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={wlDomain}
                    onChange={(e) => setWlDomain(e.target.value)}
                    placeholder="chat.acme.org"
                    className="h-10 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={wlBundleId}
                    onChange={(e) => setWlBundleId(e.target.value)}
                    placeholder="org.acme.chat"
                    className="h-10 px-3 rounded-xl bg-[#090C10] border border-white/[0.1] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Brand Accent:</span>
                  {(['emerald', 'sky', 'amber', 'violet'] as const).map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setWlAccent(color)}
                      className={`h-8 px-3 rounded-lg text-xs font-medium capitalize border transition-colors ${
                        wlAccent === color
                          ? 'bg-[#1A222D] border-emerald-400 text-slate-100'
                          : 'bg-[#090C10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {monetization.whiteLabel.active && (
                    <button
                      type="button"
                      onClick={handleDisableWhiteLabel}
                      disabled={savingWl}
                      className="h-9 px-3 rounded-lg bg-[#090C10] hover:bg-white/[0.06] border border-white/[0.08] text-xs text-slate-300"
                    >
                      Reset to Kestrel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadWhiteLabelKit}
                    className="h-9 px-3.5 rounded-lg bg-[#161E29] hover:bg-[#1E2837] border border-white/[0.08] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Export Brand Kit JSON</span>
                  </button>
                  <button
                    type="submit"
                    disabled={savingWl}
                    className="h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold"
                  >
                    {savingWl ? 'Activating...' : 'Activate & Apply Brand'}
                  </button>
                </div>
              </div>
            </form>

            {wlSavedMessage && (
              <p className="text-xs text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{wlSavedMessage}</span>
              </p>
            )}
          </section>
        )}

        {/* SECTION 5: INVOICES LEDGER */}
        {section === 'invoices' && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>Invoices & License Ledger ({monetization.invoices.length})</span>
            </h2>
            <div className="rounded-xl bg-[#10151C] border border-white/[0.07] overflow-hidden">
              {monetization.invoices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Switch to a paid plan, reserve a vanity handle, upgrade vault storage, or activate a white-label license to record your first invoice.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-[11px] font-medium text-slate-400">
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Cycle</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] text-xs">
                    {monetization.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-white/[0.02]">
                        <td className="py-3 px-4 font-medium text-emerald-300">{inv.category}</td>
                        <td className="py-3 px-4 text-slate-200">{inv.description}</td>
                        <td className="py-3 px-4 text-slate-400">{inv.billingCycle}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100">
                          ${inv.amountUsd.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
