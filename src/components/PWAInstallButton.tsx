import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Download,
  Smartphone,
  X,
  Copy,
  Check,
  ExternalLink,
  Share,
  PlusSquare,
  MoreVertical,
  Share2,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-20 z-50 flex items-center gap-2 rounded-lg bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-[#090C10] shadow-lg">
      <span>Offline Mode · Cached messages available</span>
    </div>
  );
};

interface PWAInstallButtonProps {
  compact?: boolean;
  variant?: 'button' | 'rail' | 'header';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  variant,
}) => {
  const resolvedVariant = variant ?? (compact ? 'rail' : 'button');
  const { isInstallable, isInstalled, isIOS, canShare, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'android' | 'ios'>('android');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const bubblewrapCmd = `npx @bubblewrap/cli init --manifest="${appUrl}/manifest.webmanifest" && npx @bubblewrap/cli build`;

  useEffect(() => {
    if (isIOS) {
      setActivePlatform('ios');
    }
  }, [isIOS]);

  useEffect(() => {
    if (!showModal || !appUrl) return;
    let active = true;
    QRCode.toDataURL(appUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#E2E8F0',
        light: '#090C10',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // ignore QR error
      });
    return () => {
      active = false;
    };
  }, [showModal, appUrl]);

  if (isInstalled && resolvedVariant !== 'button') {
    return null;
  }

  const handleCopy = async (text: string, type: 'url' | 'cmd') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedCmd(true);
        setTimeout(() => setCopiedCmd(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const handleShareLink = async () => {
    if (!canShare || !appUrl) return;
    try {
      await navigator.share({
        title: 'Kestrel Secure Chat',
        text: 'Install Kestrel encrypted chat on your phone:',
        url: appUrl,
      });
    } catch {
      // user cancelled share
    }
  };

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) setShowModal(true);
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {resolvedVariant === 'rail' ? (
        <button
          type="button"
          onClick={handlePrimaryClick}
          title={isInstallable ? 'Install Kestrel App' : 'Download on Android & iPhone'}
          aria-label="Download Kestrel on Android and iPhone"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/12 border border-transparent hover:border-emerald-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Download className="w-5 h-5" />
        </button>
      ) : resolvedVariant === 'header' ? (
        <button
          type="button"
          onClick={handlePrimaryClick}
          title="Download on Android & iPhone"
          aria-label="Download on Android and iPhone"
          className="h-9 w-9 rounded-lg bg-[#161E29] hover:bg-[#1E2837] border border-white/[0.08] text-slate-200 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <Smartphone className="w-4 h-4 text-emerald-400" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handlePrimaryClick}
          className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isInstallable ? 'Install App' : 'Get Android & iPhone App'}</span>
        </button>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-[#11161E] border border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-slate-100">
                    Download Kestrel on Android & iPhone
                  </h2>
                  <p className="text-xs text-slate-400">
                    Install directly on your phone home screen — no Play Store or App Store needed.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close install guide"
                className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* QR Code + Direct Phone Link Bar */}
            <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] flex flex-col sm:flex-row items-center gap-4">
              {qrDataUrl && (
                <div className="p-2 rounded-xl bg-[#090C10] border border-white/[0.1] shrink-0">
                  <img
                    src={qrDataUrl}
                    alt="Scan with phone camera to open Kestrel"
                    className="w-28 h-28 rounded-lg"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-2 text-center sm:text-left">
                <p className="text-xs font-semibold text-slate-100">
                  Scan QR code with your Android or iPhone camera
                </p>
                <p className="text-[11px] font-mono text-slate-400 truncate bg-[#10151C] px-2.5 py-1.5 rounded-lg border border-white/[0.06]">
                  {appUrl}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(appUrl, 'url')}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Phone Link</span>
                      </>
                    )}
                  </button>
                  {canShare && (
                    <button
                      type="button"
                      onClick={handleShareLink}
                      className="h-8 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Send to Phone</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Platform Switcher */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#090C10] rounded-xl border border-white/[0.07]">
              <button
                type="button"
                onClick={() => setActivePlatform('android')}
                className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                  activePlatform === 'android'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Android Phone
              </button>
              <button
                type="button"
                onClick={() => setActivePlatform('ios')}
                className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                  activePlatform === 'ios'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                iPhone / iPad (iOS)
              </button>
            </div>

            {activePlatform === 'android' ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-emerald-300">
                      Instant Install on Android (Chrome / Edge / Samsung)
                    </p>
                    {isInstallable && (
                      <button
                        type="button"
                        onClick={install}
                        className="h-7 px-3 rounded-md bg-emerald-500 hover:bg-emerald-400 text-[#05110B] text-[11px] font-semibold shrink-0"
                      >
                        Install Now
                      </button>
                    )}
                  </div>
                  <ol className="space-y-1.5 text-slate-300 list-decimal list-inside">
                    <li>Open the link above in <strong className="text-white">Google Chrome</strong> on your Android phone.</li>
                    <li className="flex items-center gap-1 flex-wrap">
                      <span>Tap the</span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#161E29] text-slate-100 font-medium">
                        <MoreVertical className="w-3 h-3" /> Menu
                      </span>
                      <span>icon in the top-right corner, then tap</span>
                      <strong className="text-white">Install app</strong>
                      <span>or</span>
                      <strong className="text-white">Add to Home screen</strong>.
                    </li>
                    <li>Confirm <strong className="text-white">Install</strong> — Android installs it directly as a full-screen app without Play Store.</li>
                  </ol>
                  <a
                    href="/manifest.webmanifest"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 pt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Inspect Web App Manifest</span>
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-2.5 text-xs">
                  <p className="font-semibold text-slate-100">
                    Standalone `.apk` File (Sideload / Google Drive Distribution)
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Build a signed <code className="text-emerald-300">.apk</code> via the included{' '}
                    <code className="text-slate-200">.github/workflows/build-android-apk.yml</code>{' '}
                    workflow (<code className="text-slate-200">capacitor.config.ts</code>) or wrap this live URL using Google’s Bubblewrap CLI:
                  </p>
                  <div className="p-2.5 rounded-lg bg-[#10151C] border border-white/[0.06] font-mono text-[11px] text-slate-300 break-all">
                    {bubblewrapCmd}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(bubblewrapCmd, 'cmd')}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCmd ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied APK Command</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy APK Build Command</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-[#090C10] border border-white/[0.07] space-y-3 text-xs text-slate-300">
                  <p className="font-semibold text-emerald-300">
                    Install on iPhone / iPad via Safari (Standalone App)
                  </p>
                  <ol className="space-y-2.5 text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>
                        Open the Kestrel link in <strong className="text-white">Safari</strong> on your iPhone (if you scanned from another app, tap Open in Safari).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span>Tap the</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#161E29] text-slate-100 font-medium">
                          <Share className="w-3 h-3 text-emerald-400" /> Share
                        </span>
                        <span>button at the bottom of Safari’s toolbar.</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span>Scroll down, tap</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#161E29] text-slate-100 font-medium">
                          <PlusSquare className="w-3 h-3 text-emerald-400" /> Add to Home Screen
                        </span>
                        <span>and tap <strong className="text-white">Add</strong>.</span>
                      </span>
                    </li>
                  </ol>
                  <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                    Kestrel launches full-screen from your iPhone Home Screen with offline message caching, Face ID / Touch ID WebAuthn lock, and push-ready standalone storage.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">Native iOS App Store / TestFlight:</span>{' '}
                  This workspace includes <code className="text-slate-200">capacitor.config.ts</code> configured with{' '}
                  <code className="text-emerald-300">iosScheme: &apos;https&apos;</code> for compiling a native Xcode <code className="text-slate-200">.ipa</code> bundle via <code className="text-slate-200">npx cap add ios</code>.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
