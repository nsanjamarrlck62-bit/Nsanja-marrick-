import React, { useState } from 'react';
import {
  Laptop,
  Smartphone,
  HardDrive,
  RefreshCw,
  Trash2,
  Plus,
  Download,
  CheckCircle2,
  ShieldCheck,
  Box,
} from 'lucide-react';
import type { Conversation, DeviceSession } from '../types/kestrel';
import { decryptBlobFromVault } from '../utils/crypto';
import { PWAInstallButton } from './PWAInstallButton';

export interface VaultBlobRecord {
  cid: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  iv: string;
  sha256: string;
  conversationId: string;
  keyEpoch: number;
  storageNodes: string[];
  uploadedAt: number;
}

interface DevicesVaultViewProps {
  devices: DeviceSession[];
  currentDeviceId: string;
  vaultBlobs: VaultBlobRecord[];
  conversations: Conversation[];
  storageQuotaBytes?: number;
  maxDevices?: number;
  onUpgradeStorage?: () => void;
  onOpen3DTopology?: () => void;
  onPairDevice: (name: string, platform: DeviceSession['platform']) => Promise<void>;
  onRevokeDevice: (id: string) => Promise<void>;
  onForceSync: () => void;
}

export const DevicesVaultView: React.FC<DevicesVaultViewProps> = ({
  devices,
  currentDeviceId,
  vaultBlobs,
  conversations,
  storageQuotaBytes = 2 * 1024 * 1024 * 1024,
  maxDevices = 3,
  onUpgradeStorage,
  onOpen3DTopology,
  onPairDevice,
  onRevokeDevice,
  onForceSync,
}) => {
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newPlatform, setNewPlatform] = useState<DeviceSession['platform']>('Linux');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const [syncCode, setSyncCode] = useState(() =>
    Math.random().toString(36).substring(2, 8).toUpperCase()
  );
  const [decryptingCid, setDecryptingCid] = useState<string | null>(null);
  const [verifiedCid, setVerifiedCid] = useState<string | null>(null);

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceName.trim() || pairing) return;
    setPairing(true);
    setPairError('');
    try {
      await onPairDevice(newDeviceName.trim(), newPlatform);
      setNewDeviceName('');
      setSyncCode(Math.random().toString(36).substring(2, 8).toUpperCase());
    } catch (err) {
      setPairError(err instanceof Error ? err.message : 'Unable to link device.');
    } finally {
      setPairing(false);
    }
  };

  const handleDecryptAndDownload = async (blobMeta: VaultBlobRecord) => {
    const conv = conversations.find((c) => c.id === blobMeta.conversationId);
    if (!conv) return;
    setDecryptingCid(blobMeta.cid);
    try {
      const res = await fetch(`/api/vault/blobs/${encodeURIComponent(blobMeta.cid)}`);
      if (!res.ok) throw new Error('Blob unavailable');
      const encryptedBuffer = await res.arrayBuffer();
      const plainBuffer = await decryptBlobFromVault(
        conv.id,
        conv.roomSalt,
        blobMeta.keyEpoch,
        blobMeta.iv,
        encryptedBuffer
      );
      const plainBlob = new Blob([plainBuffer], { type: blobMeta.mimeType });
      const url = URL.createObjectURL(plainBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = blobMeta.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setVerifiedCid(blobMeta.cid);
    } finally {
      setDecryptingCid(null);
    }
  };

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#090C10] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              Cross-Platform Sync & Decentralized Vault
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time WebSocket state synchronization across devices and content-addressed encrypted CID media nodes.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {onOpen3DTopology && (
              <button
                type="button"
                onClick={onOpen3DTopology}
                className="h-9 px-3.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Box className="w-3.5 h-3.5" />
                <span>Inspect 3D Vault Mesh</span>
              </button>
            )}
            <PWAInstallButton />
            <button
              type="button"
              onClick={onForceSync}
              className="h-9 px-4 rounded-lg bg-[#121720] hover:bg-[#19212C] border border-white/[0.08] text-xs font-medium text-slate-100 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sync All Devices Now</span>
            </button>
          </div>
        </div>

        {/* Devices & Pairing Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Linked Devices ({devices.length} / {maxDevices === -1 ? 'Unlimited' : maxDevices})
            </h2>
            <div className="space-y-2.5">
              {devices.map((dev) => {
                const isThisDevice = dev.id === currentDeviceId;
                return (
                  <div
                    key={dev.id}
                    className="p-4 rounded-xl bg-[#10151C] border border-white/[0.07] flex items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#161E29] border border-white/[0.08] flex items-center justify-center text-emerald-400 shrink-0">
                        {dev.platform === 'iOS' ? (
                          <Smartphone className="w-5 h-5" />
                        ) : (
                          <Laptop className="w-5 h-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-100 truncate">{dev.name}</p>
                          {isThisDevice && (
                            <span className="text-[11px] font-medium text-emerald-400">
                              · Current Session
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {dev.platform} · {dev.isOnline ? 'Connected via WebSocket' : 'Last synced'}{' '}
                          <span className="font-mono tabular-nums">
                            {new Date(dev.lastSyncAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 mt-1 truncate">
                          Key FP: {dev.fingerprint}
                        </p>
                      </div>
                    </div>

                    {!isThisDevice && (
                      <button
                        type="button"
                        onClick={() => onRevokeDevice(dev.id)}
                        title="Revoke Device Access"
                        className="h-8 px-2.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/15 text-slate-400 hover:text-rose-300 border border-white/[0.07] text-xs flex items-center gap-1 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Revoke</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-[#10151C] border border-white/[0.07] space-y-4 h-fit">
            <h2 className="font-display text-base font-semibold text-slate-100">
              Pair New Device
            </h2>
            <div className="p-3.5 rounded-xl bg-[#090C10] border border-white/[0.07] text-center">
              <p className="text-[11px] text-slate-400 mb-1">Ephemeral Sync Pairing Code</p>
              <p className="font-mono text-2xl font-semibold tracking-[0.25em] text-emerald-300 tabular-nums">
                {syncCode}
              </p>
            </div>

            <form onSubmit={handlePair} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Device Label</label>
                <input
                  type="text"
                  required
                  value={newDeviceName}
                  onChange={(e) => setNewDeviceName(e.target.value)}
                  placeholder="e.g. ThinkPad X1 Workstation"
                  className="w-full h-9 px-3 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Platform</label>
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value as DeviceSession['platform'])}
                  className="w-full h-9 px-2.5 rounded-lg bg-[#090C10] border border-white/[0.08] text-xs text-slate-100"
                >
                  <option value="Linux">Linux Desktop</option>
                  <option value="macOS">macOS Desktop</option>
                  <option value="Windows">Windows Desktop</option>
                  <option value="iOS">iOS Mobile</option>
                  <option value="Web">Web Client</option>
                </select>
              </div>
              {pairError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 space-y-1.5">
                  <p>{pairError}</p>
                  {onUpgradeStorage && (
                    <button
                      type="button"
                      onClick={onUpgradeStorage}
                      className="h-7 px-2.5 rounded-md bg-emerald-500 text-[#05110B] text-[11px] font-semibold"
                    >
                      Upgrade Plan
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={pairing || !newDeviceName.trim()}
                className="w-full h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{pairing ? 'Authorizing Key...' : 'Link Device Session'}</span>
              </button>
            </form>
          </section>
        </div>

        {/* Decentralized CID Vault Table */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-400" />
              <span>
                Decentralized Content-Addressed Vault ({vaultBlobs.length} Blobs ·{' '}
                {formatBytes(vaultBlobs.reduce((s, b) => s + b.sizeBytes, 0))} /{' '}
                {storageQuotaBytes >= 1024 ** 4
                  ? '1 TB'
                  : storageQuotaBytes >= 1024 ** 3
                    ? `${Math.round(storageQuotaBytes / 1024 ** 3)} GB`
                    : formatBytes(storageQuotaBytes)}
                )
              </span>
            </h2>
            {onUpgradeStorage && (
              <button
                type="button"
                onClick={onUpgradeStorage}
                className="h-8 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-300 transition-colors"
              >
                Upgrade Vault Storage
              </button>
            )}
          </div>

          <div className="rounded-xl bg-[#10151C] border border-white/[0.07] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] font-medium text-slate-400">
                  <th className="py-3 px-4">File Name</th>
                  <th className="py-3 px-4">Content Identifier (CID)</th>
                  <th className="py-3 px-4">Pinned Nodes</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] text-xs">
                {vaultBlobs.map((blob) => (
                  <tr key={blob.cid} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-medium text-slate-100">
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{blob.name}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {blob.cid.slice(0, 24)}...
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {blob.storageNodes.length} distributed pins
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                      {formatBytes(blob.sizeBytes)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDecryptAndDownload(blob)}
                        disabled={decryptingCid === blob.cid}
                        className="h-7 px-2.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        {verifiedCid === blob.cid ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        <span>{decryptingCid === blob.cid ? 'Decrypting...' : 'Decrypt'}</span>
                      </button>
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
