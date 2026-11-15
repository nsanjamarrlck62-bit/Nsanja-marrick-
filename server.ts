import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'kestrel-store.json');
const VAULT_DIR = path.join(DATA_DIR, 'vault');

const AVATARS = {
  elena: '/src/assets/images/avatar_elena_1794645820461.jpg',
  marcus: '/src/assets/images/avatar_marcus_1794645820744.jpg',
  priya: '/src/assets/images/avatar_priya_1794645820867.jpg',
  maya: '/src/assets/images/avatar_maya_1794645820387.jpg',
};

interface ParticipantRecord {
  id: string;
  name: string;
  username?: string;
  phoneNumber?: string;
  role: string;
  avatarUrl: string;
  fingerprint: string;
  isChildAccount?: boolean;
  approvedForChild?: boolean;
}

interface DirectoryUserRecord {
  id: string;
  displayName: string;
  username: string;
  phoneNumber: string;
  role: string;
  avatarUrl: string;
  fingerprint: string;
  createdAt: number;
}

interface ConversationRecord {
  id: string;
  name: string;
  kind: 'team' | 'direct' | 'family';
  description: string;
  avatarUrl?: string;
  participants: ParticipantRecord[];
  roomSalt: string;
  keyEpoch: number;
  isLocked?: boolean;
  isVipBypass?: boolean;
  unreadCount: number;
  lastMessageAt: number;
}

interface MessageEnvelopeRecord {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string;
  createdAt: number;
  ciphertext: string;
  iv: string;
  ratchetIndex: number;
  keyEpoch: number;
  cipherSuite: string;
  senderFingerprint: string;
  reactions: Record<string, string[]>;
}

interface VaultBlobMeta {
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

interface DeviceSessionRecord {
  id: string;
  name: string;
  platform: 'Web' | 'macOS' | 'iOS' | 'Linux' | 'Windows';
  lastSyncAt: number;
  connectedAt: number;
  isOnline: boolean;
  fingerprint: string;
}

interface FocusStateRecord {
  enabled: boolean;
  presetLabel: string;
  endsAt: number | null;
  silenceSounds: boolean;
  hideUnreadBadges: boolean;
  allowVipBypass: boolean;
  autoReplyText: string;
}

interface CalendarEventRecord {
  id: string;
  title: string;
  conversationId?: string;
  startIso: string;
  endIso: string;
  location: string;
  notes: string;
  attendees: string[];
  provider: 'Kestrel Calendar' | 'Google Calendar' | 'Outlook / ICS';
}

interface ProductivityDispatchRecord {
  id: string;
  provider: 'Linear' | 'Jira' | 'Notion' | 'CalDAV Webhook';
  title: string;
  summary: string;
  conversationId: string;
  externalRef: string;
  status: 'Synced' | 'Queued';
  dispatchedAt: number;
}

interface GuardianAuditRecord {
  id: string;
  timestamp: number;
  conversationId: string;
  ruleTriggered: string;
  actionTaken: 'Redacted' | 'Blocked' | 'Quarantined';
  preview: string;
}

interface GuardianPolicyRecord {
  childProfileActive: boolean;
  safeMessageFiltering: boolean;
  blockPiiSharing: boolean;
  blockUnsafeLinks: boolean;
  blurUnapprovedMedia: boolean;
  allowlistOnly: boolean;
  approvedContactIds: string[];
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  auditLog: GuardianAuditRecord[];
}

interface CallLogRecord {
  id: string;
  conversationId: string;
  targetName: string;
  direction: 'outgoing' | 'incoming' | 'team';
  durationSec: number;
  startedAt: number;
  cipherSuite: string;
  verified: boolean;
}

type PlanTierId = 'free' | 'plus' | 'team' | 'enterprise';
type BillingCycle = 'monthly' | 'annual';
type StorageTierId = 'free_2gb' | 'vault_100gb' | 'vault_1tb';

interface PlanLimitsRecord {
  aiSummariesMonthly: number;
  maxDevices: number;
  maxConversations: number;
  dispatchesMonthly: number;
  vaultQuotaBytes: number;
  whiteLabelIncluded: boolean;
}

interface UsageCountersRecord {
  aiSummariesUsed: number;
  dispatchesUsed: number;
  cycleResetAt: number;
}

interface PremiumHandleRecord {
  id: string;
  handle: string;
  tier: 'Short 3-4 Char' | 'Brand / VIP';
  priceUsd: number;
  ownerName: string;
  assignedToMe: boolean;
  purchasedAt: number;
}

interface WhiteLabelLicenseRecord {
  active: boolean;
  tier: 'None' | 'Starter Org ($199/mo)' | 'Enterprise Source ($799/mo)';
  brandName: string;
  brandTagline: string;
  accentColor: 'emerald' | 'sky' | 'amber' | 'violet';
  customDomain: string;
  bundleId: string;
  licenseKey: string | null;
  seatsIncluded: number;
  updatedAt: number;
}

interface BillingInvoiceRecord {
  id: string;
  category: 'Plan Subscription' | 'Vanity Handle' | 'Vault Storage' | 'White-Label License';
  description: string;
  amountUsd: number;
  billingCycle: 'One-Time' | 'Monthly' | 'Annual';
  status: 'Paid';
  createdAt: number;
}

interface MonetizationStateRecord {
  planId: PlanTierId;
  billingCycle: BillingCycle;
  seats: number;
  limits: PlanLimitsRecord;
  usage: UsageCountersRecord;
  storageTier: StorageTierId;
  storageQuotaBytes: number;
  reservedHandles: PremiumHandleRecord[];
  whiteLabel: WhiteLabelLicenseRecord;
  invoices: BillingInvoiceRecord[];
}

interface KestrelStore {
  conversations: ConversationRecord[];
  messages: MessageEnvelopeRecord[];
  vaultBlobs: VaultBlobMeta[];
  devices: DeviceSessionRecord[];
  focusState: FocusStateRecord;
  calendarEvents: CalendarEventRecord[];
  dispatches: ProductivityDispatchRecord[];
  guardianPolicy: GuardianPolicyRecord;
  callLogs: CallLogRecord[];
  directoryUsers: DirectoryUserRecord[];
  myProfile: DirectoryUserRecord | null;
  monetization: MonetizationStateRecord;
}

const PLAN_DEFINITIONS: Record<
  PlanTierId,
  {
    name: string;
    monthlyUsd: number;
    annualUsd: number;
    perSeat: boolean;
    storageTier: StorageTierId;
    limits: PlanLimitsRecord;
  }
> = {
  free: {
    name: 'Kestrel Free',
    monthlyUsd: 0,
    annualUsd: 0,
    perSeat: false,
    storageTier: 'free_2gb',
    limits: {
      aiSummariesMonthly: 5,
      maxDevices: 3,
      maxConversations: 8,
      dispatchesMonthly: 5,
      vaultQuotaBytes: 2 * 1024 * 1024 * 1024,
      whiteLabelIncluded: false,
    },
  },
  plus: {
    name: 'Kestrel Plus',
    monthlyUsd: 6,
    annualUsd: 58,
    perSeat: false,
    storageTier: 'vault_100gb',
    limits: {
      aiSummariesMonthly: 50,
      maxDevices: 8,
      maxConversations: 30,
      dispatchesMonthly: 50,
      vaultQuotaBytes: 100 * 1024 * 1024 * 1024,
      whiteLabelIncluded: false,
    },
  },
  team: {
    name: 'Kestrel Team',
    monthlyUsd: 14,
    annualUsd: 134,
    perSeat: true,
    storageTier: 'vault_1tb',
    limits: {
      aiSummariesMonthly: -1,
      maxDevices: 25,
      maxConversations: -1,
      dispatchesMonthly: -1,
      vaultQuotaBytes: 1024 * 1024 * 1024 * 1024,
      whiteLabelIncluded: false,
    },
  },
  enterprise: {
    name: 'Enterprise',
    monthlyUsd: 29,
    annualUsd: 278,
    perSeat: true,
    storageTier: 'vault_1tb',
    limits: {
      aiSummariesMonthly: -1,
      maxDevices: -1,
      maxConversations: -1,
      dispatchesMonthly: -1,
      vaultQuotaBytes: 5 * 1024 * 1024 * 1024 * 1024,
      whiteLabelIncluded: true,
    },
  },
};

const STORAGE_TIER_QUOTAS: Record<StorageTierId, { bytes: number; priceUsd: number; label: string }> = {
  free_2gb: {
    bytes: 2 * 1024 * 1024 * 1024,
    priceUsd: 0,
    label: 'Vault Free (2 GB)',
  },
  vault_100gb: {
    bytes: 100 * 1024 * 1024 * 1024,
    priceUsd: 2.99,
    label: 'Vault Plus (100 GB)',
  },
  vault_1tb: {
    bytes: 1024 * 1024 * 1024 * 1024,
    priceUsd: 9.99,
    label: 'Vault Pro (1 TB)',
  },
};

function createDefaultMonetizationState(): MonetizationStateRecord {
  const now = Date.now();
  return {
    planId: 'free',
    billingCycle: 'monthly',
    seats: 3,
    limits: { ...PLAN_DEFINITIONS.free.limits },
    usage: {
      aiSummariesUsed: 0,
      dispatchesUsed: 0,
      cycleResetAt: now + 30 * 24 * 60 * 60 * 1000,
    },
    storageTier: 'free_2gb',
    storageQuotaBytes: STORAGE_TIER_QUOTAS.free_2gb.bytes,
    reservedHandles: [],
    whiteLabel: {
      active: false,
      tier: 'None',
      brandName: 'Kestrel',
      brandTagline: 'Chiat-Ratchet E2EE · Synced',
      accentColor: 'emerald',
      customDomain: '',
      bundleId: 'app.kestrel.secure',
      licenseKey: null,
      seatsIncluded: 25,
      updatedAt: now,
    },
    invoices: [],
  };
}

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

function normalizePhoneNumber(raw: string): string {
  let cleaned = raw.trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

function isValidPhoneNumber(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function buildDefaultDirectoryUsers(now: number): DirectoryUserRecord[] {
  return [
    {
      id: 'usr_elena',
      displayName: 'Elena Vance',
      username: 'elena_vance',
      phoneNumber: '+14155550101',
      role: 'Security Architect',
      avatarUrl: AVATARS.elena,
      fingerprint: '48291 09412 77310 55192 84012 31904',
      createdAt: now - 30 * 24 * 60 * 60 * 1000,
    },
    {
      id: 'usr_marcus',
      displayName: 'Marcus Chen',
      username: 'marcus_chen',
      phoneNumber: '+14155550102',
      role: 'VP Engineering',
      avatarUrl: AVATARS.marcus,
      fingerprint: '91023 44182 62019 33812 19042 77215',
      createdAt: now - 28 * 24 * 60 * 60 * 1000,
    },
    {
      id: 'usr_priya',
      displayName: 'Priya Nair',
      username: 'priya_nair',
      phoneNumber: '+14155550103',
      role: 'Design Systems Director',
      avatarUrl: AVATARS.priya,
      fingerprint: '55102 88391 12049 66401 73920 11842',
      createdAt: now - 25 * 24 * 60 * 60 * 1000,
    },
    {
      id: 'usr_maya',
      displayName: 'Maya Lin',
      username: 'maya_lin',
      phoneNumber: '+14155550104',
      role: 'Family · Protected Profile',
      avatarUrl: AVATARS.maya,
      fingerprint: '33018 77291 49012 88201 64109 55283',
      createdAt: now - 20 * 24 * 60 * 60 * 1000,
    },
  ];
}

function deriveRoomKeyNode(conversationId: string, roomSalt: string, keyEpoch: number): Buffer {
  const material = `kestrel-chiat-ratchet-v1:${conversationId}:${roomSalt}:epoch-${keyEpoch}`;
  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

function encryptPayloadNode(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  payload: Record<string, unknown>
): { ciphertext: string; iv: string } {
  const key = deriveRoomKeyNode(conversationId, roomSalt, keyEpoch);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
}

function encryptBytesNode(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  rawBuffer: Buffer
): { encryptedBytes: Buffer; iv: string; cid: string; sha256: string } {
  const key = deriveRoomKeyNode(conversationId, roomSalt, keyEpoch);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encryptedBytes = Buffer.concat([cipher.update(rawBuffer), cipher.final(), cipher.getAuthTag()]);
  const sha256 = crypto.createHash('sha256').update(encryptedBytes).digest('hex');
  return {
    encryptedBytes,
    iv: iv.toString('base64'),
    cid: `bafybeig${sha256.slice(0, 44)}`,
    sha256,
  };
}

async function createSeedStore(): Promise<KestrelStore> {
  const now = Date.now();
  const min = 60_000;

  const participants: Record<string, ParticipantRecord> = {
    elena: {
      id: 'usr_elena',
      name: 'Elena Vance',
      username: 'elena_vance',
      phoneNumber: '+14155550101',
      role: 'Security Architect',
      avatarUrl: AVATARS.elena,
      fingerprint: '48291 09412 77310 55192 84012 31904',
      approvedForChild: true,
    },
    marcus: {
      id: 'usr_marcus',
      name: 'Marcus Chen',
      username: 'marcus_chen',
      phoneNumber: '+14155550102',
      role: 'VP Engineering',
      avatarUrl: AVATARS.marcus,
      fingerprint: '91023 44182 62019 33812 19042 77215',
      approvedForChild: true,
    },
    priya: {
      id: 'usr_priya',
      name: 'Priya Nair',
      username: 'priya_nair',
      phoneNumber: '+14155550103',
      role: 'Design Systems Director',
      avatarUrl: AVATARS.priya,
      fingerprint: '55102 88391 12049 66401 73920 11842',
      approvedForChild: false,
    },
    maya: {
      id: 'usr_maya',
      name: 'Maya Lin',
      username: 'maya_lin',
      phoneNumber: '+14155550104',
      role: 'Family · Protected Profile',
      avatarUrl: AVATARS.maya,
      fingerprint: '33018 77291 49012 88201 64109 55283',
      isChildAccount: true,
      approvedForChild: true,
    },
  };

  const conversations: ConversationRecord[] = [
    {
      id: 'conv_security_core',
      name: 'Core Security & Protocol',
      kind: 'team',
      description: 'Zero-knowledge key rotation, Chiat-ratchet audits, and release readiness.',
      participants: [participants.elena, participants.marcus, participants.priya],
      roomSalt: 'salt_kestrel_sec_core_991a',
      keyEpoch: 4,
      isVipBypass: true,
      unreadCount: 2,
      lastMessageAt: now - 4 * min,
    },
    {
      id: 'conv_product_launch',
      name: 'Q4 Product Launch',
      kind: 'team',
      description: 'Cross-functional launch timeline, customer briefings, and calendar milestones.',
      participants: [participants.marcus, participants.priya, participants.elena],
      roomSalt: 'salt_kestrel_launch_742b',
      keyEpoch: 2,
      unreadCount: 0,
      lastMessageAt: now - 38 * min,
    },
    {
      id: 'conv_elena_dm',
      name: 'Elena Vance',
      kind: 'direct',
      description: 'Direct encrypted channel · Hardware key verified',
      avatarUrl: AVATARS.elena,
      participants: [participants.elena],
      roomSalt: 'salt_kestrel_elena_dm_318c',
      keyEpoch: 7,
      isVipBypass: true,
      isLocked: false,
      unreadCount: 1,
      lastMessageAt: now - 16 * min,
    },
    {
      id: 'conv_family_maya',
      name: 'Family Safe Circle (Maya)',
      kind: 'family',
      description: 'Guardian-protected family channel with safe message filtering active.',
      avatarUrl: AVATARS.maya,
      participants: [participants.maya, participants.elena],
      roomSalt: 'salt_kestrel_family_604d',
      keyEpoch: 3,
      isVipBypass: true,
      unreadCount: 0,
      lastMessageAt: now - 110 * min,
    },
  ];

  // Seed one encrypted decentralized document blob in the local CID vault
  const specDoc = Buffer.from(
    [
      'KESTREL ZERO-KNOWLEDGE PROTOCOL SPECIFICATION (v4.2)',
      '====================================================',
      '1. Transport & Payload: ECDH P-256 + HKDF-SHA256 + AES-256-GCM (Chiat Double Ratchet).',
      '2. Decentralized Media Vault: Content-addressed CIDv1 (SHA-256), client-side encrypted prior to upload.',
      '3. Retention: Server relays and stores ciphertext envelopes only; decryption keys remain on verified user devices.',
      '4. Compliance: Team key rotation every 7 days or manual epoch bump.',
    ].join('\n'),
    'utf8'
  );
  const encryptedSpec = encryptBytesNode('conv_security_core', 'salt_kestrel_sec_core_991a', 4, specDoc);
  await fs.mkdir(VAULT_DIR, { recursive: true });
  await fs.writeFile(path.join(VAULT_DIR, `${encryptedSpec.cid}.enc`), encryptedSpec.encryptedBytes);

  const vaultBlobs: VaultBlobMeta[] = [
    {
      cid: encryptedSpec.cid,
      name: 'Kestrel-Ratchet-Audit-v4.txt',
      mimeType: 'text/plain',
      sizeBytes: specDoc.byteLength,
      iv: encryptedSpec.iv,
      sha256: encryptedSpec.sha256,
      conversationId: 'conv_security_core',
      keyEpoch: 4,
      storageNodes: ['eu-west-relay-01', 'us-east-pin-04', 'local-indexeddb-mirror'],
      uploadedAt: now - 52 * min,
    },
  ];

  const seedRawMessages: {
    id: string;
    conv: ConversationRecord;
    sender: ParticipantRecord | { id: 'me'; name: string; avatarUrl: string; fingerprint: string };
    offsetMin: number;
    ratchetIndex: number;
    payload: Record<string, unknown>;
    reactions?: Record<string, string[]>;
  }[] = [
    {
      id: 'msg_101',
      conv: conversations[0],
      sender: participants.elena,
      offsetMin: 68,
      ratchetIndex: 1,
      payload: {
        text: 'Completed the Chiat-ratchet forward secrecy audit for v4.2. Ephemeral key rotation passed all 10,000 test vectors without nonce reuse.',
      },
      reactions: { '✓': ['usr_marcus', 'me'] },
    },
    {
      id: 'msg_102',
      conv: conversations[0],
      sender: participants.marcus,
      offsetMin: 52,
      ratchetIndex: 2,
      payload: {
        text: 'Uploaded the signed specification into the decentralized CID vault. Please verify the SHA-256 fingerprint before tomorrow’s architecture review.',
        attachment: {
          cid: encryptedSpec.cid,
          name: 'Kestrel-Ratchet-Audit-v4.txt',
          mimeType: 'text/plain',
          sizeBytes: specDoc.byteLength,
          iv: encryptedSpec.iv,
          sha256: encryptedSpec.sha256,
          storageNodes: ['eu-west-relay-01', 'us-east-pin-04', 'local-indexeddb-mirror'],
          kind: 'file',
        },
      },
    },
    {
      id: 'msg_103',
      conv: conversations[0],
      sender: participants.priya,
      offsetMin: 24,
      ratchetIndex: 3,
      payload: {
        text: 'Design review action item: I will finalize the biometric lock screen and Focus Mode countdown sheet by Thursday 15:00. Can Marcus sync the Linear ticket?',
      },
    },
    {
      id: 'msg_104',
      conv: conversations[0],
      sender: participants.marcus,
      offsetMin: 12,
      ratchetIndex: 4,
      payload: {
        text: 'Confirmed—we decided to ship hardware WebAuthn passkeys alongside a salted PIN fallback so every desktop and mobile client unlocks smoothly. Let us schedule a 30-minute security sign-off call tomorrow at 10:00 AM.',
      },
    },
    {
      id: 'msg_105',
      conv: conversations[0],
      sender: participants.elena,
      offsetMin: 4,
      ratchetIndex: 5,
      payload: {
        text: 'Sounds good. Also remind Legal that zero plaintext telemetry leaves the device; only explicit user-triggered AI summary batches are processed ephemerally.',
      },
    },
    {
      id: 'msg_201',
      conv: conversations[1],
      sender: participants.marcus,
      offsetMin: 95,
      ratchetIndex: 1,
      payload: {
        text: 'Enterprise onboarding docs and Calendar ICS templates are locked for the Q4 launch cohort.',
      },
    },
    {
      id: 'msg_202',
      conv: conversations[1],
      sender: participants.priya,
      offsetMin: 38,
      ratchetIndex: 2,
      payload: {
        text: 'Shared the launch deck timeline with Design Ops. Let us confirm whether the live press briefing moves to Friday at 14:00.',
      },
    },
    {
      id: 'msg_301',
      conv: conversations[2],
      sender: participants.elena,
      offsetMin: 16,
      ratchetIndex: 1,
      payload: {
        text: 'Verified your new Web device fingerprint over the out-of-band channel. Ready whenever you want to test an encrypted voice call.',
      },
    },
    {
      id: 'msg_401',
      conv: conversations[3],
      sender: participants.maya,
      offsetMin: 110,
      ratchetIndex: 1,
      payload: {
        text: 'Hi! Just finished robotics club. Can you pick me up at 17:30 by the north library entrance?',
      },
    },
  ];

  const messages: MessageEnvelopeRecord[] = seedRawMessages.map((item) => {
    const enc = encryptPayloadNode(item.conv.id, item.conv.roomSalt, item.conv.keyEpoch, item.payload);
    return {
      id: item.id,
      conversationId: item.conv.id,
      senderId: item.sender.id,
      senderName: item.sender.name,
      senderAvatarUrl: item.sender.avatarUrl,
      createdAt: now - item.offsetMin * min,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      ratchetIndex: item.ratchetIndex,
      keyEpoch: item.conv.keyEpoch,
      cipherSuite: 'ECDH-P256 / Chiat-Ratchet AES-256-GCM',
      senderFingerprint: item.sender.fingerprint,
      reactions: item.reactions ?? {},
    };
  });

  const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);

  const friday = new Date(now + 48 * 60 * 60 * 1000);
  friday.setHours(14, 0, 0, 0);
  const fridayEnd = new Date(friday.getTime() + 45 * 60 * 1000);

  const calendarEvents: CalendarEventRecord[] = [
    {
      id: 'evt_sec_signoff',
      title: 'Kestrel v4.2 Security & Key Rotation Sign-Off',
      conversationId: 'conv_security_core',
      startIso: tomorrow.toISOString(),
      endIso: tomorrowEnd.toISOString(),
      location: 'Kestrel Encrypted Voice Room',
      notes: 'Verify Chiat-ratchet test vectors and WebAuthn lock settings across desktop/mobile.',
      attendees: ['Elena Vance', 'Marcus Chen', 'Priya Nair'],
      provider: 'Kestrel Calendar',
    },
    {
      id: 'evt_launch_sync',
      title: 'Q4 Enterprise Rollout & Press Readiness',
      conversationId: 'conv_product_launch',
      startIso: friday.toISOString(),
      endIso: fridayEnd.toISOString(),
      location: 'Google Calendar Bridge',
      notes: 'Finalize Linear release checklist and customer migration guides.',
      attendees: ['Marcus Chen', 'Priya Nair'],
      provider: 'Google Calendar',
    },
  ];

  const dispatches: ProductivityDispatchRecord[] = [
    {
      id: 'disp_1',
      provider: 'Linear',
      title: 'SEC-418: Finalize WebAuthn biometric fallback UX',
      summary: 'Synced from Core Security & Protocol discussion on hardware passkey lock.',
      conversationId: 'conv_security_core',
      externalRef: 'LIN-418',
      status: 'Synced',
      dispatchedAt: now - 28 * min,
    },
    {
      id: 'disp_2',
      provider: 'Notion',
      title: 'Q4 Customer Zero-Knowledge Architecture Brief',
      summary: 'Published encrypted digest and decentralized CID verification steps.',
      conversationId: 'conv_product_launch',
      externalRef: 'NOTION-892',
      status: 'Synced',
      dispatchedAt: now - 74 * min,
    },
  ];

  const devices: DeviceSessionRecord[] = [
    {
      id: 'dev_macbook_pro',
      name: 'MacBook Pro 16" (Desktop)',
      platform: 'macOS',
      lastSyncAt: now - 3 * min,
      connectedAt: now - 48 * 60 * min,
      isOnline: true,
      fingerprint: '77420 11893 64012 99201 33410 51928',
    },
    {
      id: 'dev_iphone_16',
      name: 'iPhone 16 Pro (Face ID)',
      platform: 'iOS',
      lastSyncAt: now - 11 * min,
      connectedAt: now - 72 * 60 * min,
      isOnline: true,
      fingerprint: '19204 88312 45091 22710 66120 40912',
    },
  ];

  const callLogs: CallLogRecord[] = [
    {
      id: 'call_1',
      conversationId: 'conv_elena_dm',
      targetName: 'Elena Vance',
      direction: 'incoming',
      durationSec: 412,
      startedAt: now - 190 * min,
      cipherSuite: 'DTLS-SRTP + AES-256-GCM',
      verified: true,
    },
    {
      id: 'call_2',
      conversationId: 'conv_security_core',
      targetName: 'Core Security & Protocol',
      direction: 'team',
      durationSec: 1280,
      startedAt: now - 26 * 60 * min,
      cipherSuite: 'MLS-SRTP + Chiat-Ratchet',
      verified: true,
    },
  ];

  return {
    conversations,
    messages,
    vaultBlobs,
    devices,
    focusState: {
      enabled: false,
      presetLabel: 'Off',
      endsAt: null,
      silenceSounds: true,
      hideUnreadBadges: true,
      allowVipBypass: true,
      autoReplyText: 'In Focus Mode — encrypted messages are queued and will be reviewed shortly.',
    },
    calendarEvents,
    dispatches,
    guardianPolicy: {
      childProfileActive: false,
      safeMessageFiltering: true,
      blockPiiSharing: true,
      blockUnsafeLinks: true,
      blurUnapprovedMedia: true,
      allowlistOnly: true,
      approvedContactIds: ['usr_elena', 'usr_marcus', 'usr_maya'],
      quietHoursEnabled: true,
      quietStartHour: 21,
      quietEndHour: 7,
      auditLog: [
        {
          id: 'aud_1',
          timestamp: now - 140 * min,
          conversationId: 'conv_family_maya',
          ruleTriggered: 'PII Shield (Phone Number)',
          actionTaken: 'Redacted',
          preview: 'Masked outbound phone number before encryption.',
        },
      ],
    },
    callLogs,
    directoryUsers: buildDefaultDirectoryUsers(now),
    myProfile: null,
    monetization: createDefaultMonetizationState(),
  };
}

let store: KestrelStore;

async function loadOrInitStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(VAULT_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    store = JSON.parse(raw) as KestrelStore;
    let mutated = false;
    if (!Array.isArray(store.directoryUsers) || store.directoryUsers.length === 0) {
      store.directoryUsers = buildDefaultDirectoryUsers(Date.now());
      mutated = true;
    }
    if (typeof store.myProfile === 'undefined') {
      store.myProfile = null;
      mutated = true;
    }
    if (!store.monetization) {
      store.monetization = createDefaultMonetizationState();
      mutated = true;
    } else {
      const defaults = createDefaultMonetizationState();
      if (!store.monetization.planId) {
        store.monetization.planId = defaults.planId;
        mutated = true;
      }
      if (!store.monetization.billingCycle) {
        store.monetization.billingCycle = defaults.billingCycle;
        mutated = true;
      }
      if (!store.monetization.seats) {
        store.monetization.seats = defaults.seats;
        mutated = true;
      }
      if (!store.monetization.limits) {
        store.monetization.limits = PLAN_DEFINITIONS[store.monetization.planId]?.limits || defaults.limits;
        mutated = true;
      }
      if (!store.monetization.usage) {
        store.monetization.usage = defaults.usage;
        mutated = true;
      }
    }
    if (mutated) await persistStore();
  } catch {
    store = await createSeedStore();
    await persistStore();
  }
}

let writeQueue = Promise.resolve();
function persistStore(): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const tempPath = `${STORE_PATH}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
    await fs.rename(tempPath, STORE_PATH);
  });
  return writeQueue;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  await loadOrInitStore();

  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const socketToDevice = new Map<WebSocket, string>();

  function broadcast(event: string, payload: unknown, excludeSocket?: WebSocket) {
    const frame = JSON.stringify({ event, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && client !== excludeSocket) {
        client.send(frame);
      }
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; payload?: Record<string, unknown> };
        if (msg.event === 'device:hello' && msg.payload) {
          const deviceId = String(msg.payload.id || '');
          const name = String(msg.payload.name || 'Web Browser Session');
          const platform = (msg.payload.platform as DeviceSessionRecord['platform']) || 'Web';
          const fingerprint = String(msg.payload.fingerprint || '00000 00000 00000');
          if (deviceId) {
            socketToDevice.set(ws, deviceId);
            const existing = store.devices.find((d) => d.id === deviceId);
            const now = Date.now();
            if (existing) {
              existing.isOnline = true;
              existing.lastSyncAt = now;
              existing.name = name;
              existing.fingerprint = fingerprint;
            } else {
              store.devices.unshift({
                id: deviceId,
                name,
                platform,
                lastSyncAt: now,
                connectedAt: now,
                isOnline: true,
                fingerprint,
              });
            }
            await persistStore();
            broadcast('devices:updated', store.devices);
          }
        } else if (msg.event === 'call:signal' && msg.payload) {
          // Relay WebRTC SDP offer/answer/ICE candidates & call control across tabs/devices
          broadcast('call:signal', msg.payload, ws);
        } else if (msg.event === 'typing:update' && msg.payload) {
          broadcast('typing:update', msg.payload, ws);
        } else if (msg.event === 'sync:ping') {
          const devId = socketToDevice.get(ws);
          if (devId) {
            const dev = store.devices.find((d) => d.id === devId);
            if (dev) {
              dev.lastSyncAt = Date.now();
              await persistStore();
            }
          }
          ws.send(JSON.stringify({ event: 'sync:ack', payload: { timestamp: Date.now() } }));
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on('close', async () => {
      const devId = socketToDevice.get(ws);
      socketToDevice.delete(ws);
      if (devId) {
        const dev = store.devices.find((d) => d.id === devId);
        if (dev) {
          dev.isOnline = false;
          dev.lastSyncAt = Date.now();
          await persistStore();
          broadcast('devices:updated', store.devices);
        }
      }
    });
  });

  // Bootstrap state
  app.get('/api/bootstrap', (_req, res) => {
    res.json(store);
  });

  // Check unique username & phone number availability
  app.get('/api/identity/check', (req, res) => {
    const rawUsername = String(req.query.username || '');
    const rawPhone = String(req.query.phoneNumber || '');
    const excludeId = String(req.query.excludeUserId || '');

    const username = rawUsername ? normalizeUsername(rawUsername) : '';
    const phoneNumber = rawPhone ? normalizePhoneNumber(rawPhone) : '';

    const usernameOwner = username
      ? store.directoryUsers.find((u) => u.username === username && u.id !== excludeId) ||
        (store.monetization.reservedHandles.some((h) => h.handle === username)
          ? { displayName: 'Reserved Vanity Handle', id: 'reserved' }
          : undefined)
      : undefined;
    const phoneOwner = phoneNumber
      ? store.directoryUsers.find((u) => u.phoneNumber === phoneNumber && u.id !== excludeId)
      : undefined;

    res.json({
      username: username || null,
      usernameValid: username ? isValidUsername(username) : true,
      usernameAvailable: username ? !usernameOwner : true,
      usernameOwnerName: usernameOwner ? usernameOwner.displayName : null,
      usernameOwner: usernameOwner && usernameOwner.id !== 'me' ? usernameOwner : null,
      phoneNumber: phoneNumber || null,
      phoneValid: phoneNumber ? isValidPhoneNumber(phoneNumber) : true,
      phoneAvailable: phoneNumber ? !phoneOwner : true,
      phoneOwnerName: phoneOwner ? phoneOwner.displayName : null,
      phoneOwner: phoneOwner && phoneOwner.id !== 'me' ? phoneOwner : null,
    });
  });

  // Claim or update own unique @username and phone number (globally reserved; cannot be used by anyone else)
  app.put('/api/identity/me', async (req, res) => {
    const { displayName, username: rawUsername, phoneNumber: rawPhone, role } = req.body as {
      displayName?: string;
      username?: string;
      phoneNumber?: string;
      role?: string;
    };

    const username = normalizeUsername(rawUsername || '');
    const phoneNumber = normalizePhoneNumber(rawPhone || '');

    if (!displayName || !displayName.trim()) {
      res.status(400).json({ error: 'Display name is required.' });
      return;
    }
    if (!isValidUsername(username)) {
      res.status(400).json({
        error: 'Username must be 3–24 characters using lowercase letters, numbers, or underscores.',
      });
      return;
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      res.status(400).json({
        error: 'Enter a valid phone number with country code (e.g. +14155550199).',
      });
      return;
    }

    const myId = store.myProfile?.id || 'me';
    const existingUsername = store.directoryUsers.find(
      (u) => u.username === username && u.id !== myId
    );
    if (existingUsername) {
      res.status(409).json({
        error: `Username @${username} is already claimed by ${existingUsername.displayName} and cannot be used by anyone else.`,
      });
      return;
    }

    const existingPhone = store.directoryUsers.find(
      (u) => u.phoneNumber === phoneNumber && u.id !== myId
    );
    if (existingPhone) {
      res.status(409).json({
        error: `Phone number ${phoneNumber} is already registered to another account and cannot be reused.`,
      });
      return;
    }

    const fpHex = crypto.randomBytes(15).toString('hex').toUpperCase();
    const profile: DirectoryUserRecord = {
      id: myId,
      displayName: displayName.trim(),
      username,
      phoneNumber,
      role: (role || 'Workspace Member').trim(),
      avatarUrl: AVATARS.marcus,
      fingerprint: store.myProfile?.fingerprint || fpHex.match(/.{1,5}/g)?.join(' ') || fpHex,
      createdAt: store.myProfile?.createdAt || Date.now(),
    };

    store.myProfile = profile;
    const idx = store.directoryUsers.findIndex((u) => u.id === myId);
    if (idx >= 0) {
      store.directoryUsers[idx] = profile;
    } else {
      store.directoryUsers.unshift(profile);
    }

    await persistStore();
    broadcast('directory:updated', {
      directoryUsers: store.directoryUsers,
      myProfile: store.myProfile,
    });
    res.json(profile);
  });

  // Lookup user by exact phone number or unique @username
  app.get('/api/directory/lookup', (req, res) => {
    const rawQuery = String(req.query.q || '').trim();
    if (!rawQuery) {
      res.status(400).json({ error: 'Enter a phone number or @username to search.' });
      return;
    }
    const asUsername = normalizeUsername(rawQuery);
    const asPhone = normalizePhoneNumber(rawQuery);

    const found = store.directoryUsers.find(
      (u) =>
        u.id !== 'me' &&
        (u.username === asUsername || (asPhone.length >= 7 && u.phoneNumber === asPhone))
    );

    if (!found) {
      res.status(404).json({
        error: 'No registered user found with that phone number or @username.',
      });
      return;
    }
    res.json(found);
  });

  // Add someone by phone number or @username (WhatsApp-style) while enforcing global uniqueness
  app.post('/api/contacts/add', async (req, res) => {
    const {
      query,
      mode,
      displayName,
      username: rawUsername,
      phoneNumber: rawPhone,
      role,
    } = req.body as {
      query?: string;
      mode?: 'lookup' | 'register' | 'phone' | 'username';
      displayName?: string;
      username?: string;
      phoneNumber?: string;
      role?: string;
    };

    let targetUser: DirectoryUserRecord | undefined;
    const avatarPool = [AVATARS.elena, AVATARS.priya, AVATARS.marcus, AVATARS.maya];

    if (mode === 'phone') {
      const phoneNumber = normalizePhoneNumber(rawPhone || query || '');
      if (!isValidPhoneNumber(phoneNumber)) {
        res.status(400).json({
          error: 'Enter a valid phone number with country code (e.g. +1 415 555 0199).',
        });
        return;
      }
      if (store.myProfile && store.myProfile.phoneNumber === phoneNumber) {
        res.status(409).json({
          error: 'That phone number belongs to your own Kestrel identity.',
        });
        return;
      }

      const existingByPhone = store.directoryUsers.find(
        (u) => u.id !== 'me' && u.phoneNumber === phoneNumber
      );

      if (existingByPhone) {
        targetUser = existingByPhone;
      } else {
        const optionalUsername = rawUsername ? normalizeUsername(rawUsername) : '';
        if (optionalUsername) {
          if (!isValidUsername(optionalUsername)) {
            res.status(400).json({
              error: 'Username must be 3–24 characters using lowercase letters, numbers, or underscores.',
            });
            return;
          }
          const usernameConflict = store.directoryUsers.find((u) => u.username === optionalUsername);
          if (usernameConflict) {
            res.status(409).json({
              error: `Username @${optionalUsername} is already claimed by ${usernameConflict.displayName} and cannot be used by anyone else.`,
            });
            return;
          }
        }

        const fpHex = crypto.randomBytes(15).toString('hex').toUpperCase();
        targetUser = {
          id: `usr_${crypto.randomBytes(4).toString('hex')}`,
          displayName: displayName?.trim() || phoneNumber,
          username: optionalUsername,
          phoneNumber,
          role: (role || 'Direct Contact').trim(),
          avatarUrl: avatarPool[store.directoryUsers.length % avatarPool.length],
          fingerprint: fpHex.match(/.{1,5}/g)?.join(' ') || fpHex,
          createdAt: Date.now(),
        };
        store.directoryUsers.push(targetUser);
        broadcast('directory:updated', {
          directoryUsers: store.directoryUsers,
          myProfile: store.myProfile,
        });
      }
    } else if (mode === 'username') {
      const username = normalizeUsername(rawUsername || query || '');
      if (!isValidUsername(username)) {
        res.status(400).json({
          error: 'Username must be 3–24 characters using lowercase letters, numbers, or underscores.',
        });
        return;
      }
      if (store.myProfile && store.myProfile.username === username) {
        res.status(409).json({
          error: `Username @${username} belongs to your own Kestrel identity.`,
        });
        return;
      }

      const existingByUsername = store.directoryUsers.find(
        (u) => u.id !== 'me' && u.username === username
      );

      if (existingByUsername) {
        targetUser = existingByUsername;
      } else {
        const optionalPhone = rawPhone ? normalizePhoneNumber(rawPhone) : '';
        if (optionalPhone) {
          if (!isValidPhoneNumber(optionalPhone)) {
            res.status(400).json({
              error: 'Phone number must include country code and 7–15 digits.',
            });
            return;
          }
          const phoneConflict = store.directoryUsers.find((u) => u.phoneNumber === optionalPhone);
          if (phoneConflict) {
            res.status(409).json({
              error: `Phone number ${optionalPhone} is already registered to ${phoneConflict.displayName} and cannot be used by anyone else.`,
            });
            return;
          }
        }

        const fpHex = crypto.randomBytes(15).toString('hex').toUpperCase();
        targetUser = {
          id: `usr_${crypto.randomBytes(4).toString('hex')}`,
          displayName: displayName?.trim() || `@${username}`,
          username,
          phoneNumber: optionalPhone,
          role: (role || 'Verified Handle').trim(),
          avatarUrl: avatarPool[store.directoryUsers.length % avatarPool.length],
          fingerprint: fpHex.match(/.{1,5}/g)?.join(' ') || fpHex,
          createdAt: Date.now(),
        };
        store.directoryUsers.push(targetUser);
        broadcast('directory:updated', {
          directoryUsers: store.directoryUsers,
          myProfile: store.myProfile,
        });
      }
    } else if (mode === 'register') {
      const username = normalizeUsername(rawUsername || '');
      const phoneNumber = normalizePhoneNumber(rawPhone || '');
      if (!displayName || !displayName.trim()) {
        res.status(400).json({ error: 'Contact name is required.' });
        return;
      }
      if (!isValidUsername(username)) {
        res.status(400).json({
          error: 'Username must be 3–24 characters using lowercase letters, numbers, or underscores.',
        });
        return;
      }
      if (!isValidPhoneNumber(phoneNumber)) {
        res.status(400).json({
          error: 'Phone number must contain 7–15 digits (e.g. +14155550188).',
        });
        return;
      }

      const usernameConflict = store.directoryUsers.find((u) => u.username === username);
      if (usernameConflict) {
        res.status(409).json({
          error: `Username @${username} was already created by ${usernameConflict.displayName} and cannot be used by anyone else.`,
        });
        return;
      }

      const phoneConflict = store.directoryUsers.find((u) => u.phoneNumber === phoneNumber);
      if (phoneConflict) {
        res.status(409).json({
          error: `Phone number ${phoneNumber} is already registered to ${phoneConflict.displayName} and cannot be used by anyone else.`,
        });
        return;
      }

      const fpHex = crypto.randomBytes(15).toString('hex').toUpperCase();
      targetUser = {
        id: `usr_${crypto.randomBytes(4).toString('hex')}`,
        displayName: displayName.trim(),
        username,
        phoneNumber,
        role: (role || 'Verified Contact').trim(),
        avatarUrl: avatarPool[store.directoryUsers.length % avatarPool.length],
        fingerprint: fpHex.match(/.{1,5}/g)?.join(' ') || fpHex,
        createdAt: Date.now(),
      };
      store.directoryUsers.push(targetUser);
      broadcast('directory:updated', {
        directoryUsers: store.directoryUsers,
        myProfile: store.myProfile,
      });
    } else {
      const rawQ = (query || '').trim();
      const asUsername = normalizeUsername(rawQ);
      const asPhone = normalizePhoneNumber(rawQ);
      targetUser = store.directoryUsers.find(
        (u) =>
          u.id !== 'me' &&
          ((asUsername && u.username === asUsername) ||
            (asPhone.length >= 7 && u.phoneNumber === asPhone))
      );
      if (!targetUser) {
        res.status(404).json({
          error: 'No account matched that phone number or @username.',
        });
        return;
      }
    }

    // Reuse existing direct conversation if already added
    const existingConv = store.conversations.find(
      (c) =>
        c.kind === 'direct' &&
        c.participants.some(
          (p) =>
            p.id === targetUser!.id ||
            (targetUser!.username && p.username === targetUser!.username) ||
            (targetUser!.phoneNumber && p.phoneNumber === targetUser!.phoneNumber)
        )
    );
    if (existingConv) {
      await persistStore();
      res.json({ conversation: existingConv, user: targetUser, existing: true });
      return;
    }

    const identityLabel = [
      targetUser.username ? `@${targetUser.username}` : '',
      targetUser.phoneNumber || '',
    ]
      .filter(Boolean)
      .join(' · ');

    const newConv: ConversationRecord = {
      id: `conv_${crypto.randomBytes(4).toString('hex')}`,
      name: targetUser.displayName,
      kind: 'direct',
      description: identityLabel || 'Encrypted Direct Chat',
      avatarUrl: targetUser.avatarUrl,
      participants: [
        {
          id: targetUser.id,
          name: targetUser.displayName,
          username: targetUser.username,
          phoneNumber: targetUser.phoneNumber,
          role: targetUser.role,
          avatarUrl: targetUser.avatarUrl,
          fingerprint: targetUser.fingerprint,
          approvedForChild: false,
        },
      ],
      roomSalt: `salt_${crypto.randomBytes(8).toString('hex')}`,
      keyEpoch: 1,
      unreadCount: 0,
      lastMessageAt: Date.now(),
    };

    store.conversations.unshift(newConv);
    await persistStore();
    broadcast('conversation:created', newConv);
    res.status(201).json({ conversation: newConv, user: targetUser, existing: false });
  });

  // Create a new encrypted conversation
  app.post('/api/conversations', async (req, res) => {
    const { name, kind, description, isLocked } = req.body as {
      name?: string;
      kind?: 'team' | 'direct' | 'family';
      description?: string;
      isLocked?: boolean;
    };
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Conversation name is required.' });
      return;
    }
    const maxConv = store.monetization.limits.maxConversations;
    if (maxConv !== -1 && store.conversations.length >= maxConv) {
      res.status(402).json({
        error: `Thread limit reached (${store.conversations.length}/${maxConv} on ${PLAN_DEFINITIONS[store.monetization.planId].name}). Upgrade your plan for more channels.`,
        limitReached: true,
        limitKey: 'conversations',
      });
      return;
    }

    const newConv: ConversationRecord = {
      id: `conv_${crypto.randomBytes(4).toString('hex')}`,
      name: name.trim(),
      kind: kind || 'team',
      description: (description || 'End-to-end encrypted channel').trim(),
      participants: [
        {
          id: 'usr_elena',
          name: 'Elena Vance',
          role: 'Security Architect',
          avatarUrl: AVATARS.elena,
          fingerprint: '48291 09412 77310 55192 84012 31904',
          approvedForChild: true,
        },
      ],
      roomSalt: `salt_${crypto.randomBytes(8).toString('hex')}`,
      keyEpoch: 1,
      isLocked: Boolean(isLocked),
      unreadCount: 0,
      lastMessageAt: Date.now(),
    };

    store.conversations.unshift(newConv);
    await persistStore();
    broadcast('conversation:created', newConv);
    res.status(201).json(newConv);
  });

  // Toggle lock or rotate Chiat-ratchet key epoch for forward secrecy
  app.post('/api/conversations/:id/rotate-key', async (req, res) => {
    const conv = store.conversations.find((c) => c.id === req.params.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    conv.keyEpoch += 1;
    await persistStore();
    broadcast('conversation:updated', conv);
    res.json(conv);
  });

  app.patch('/api/conversations/:id', async (req, res) => {
    const conv = store.conversations.find((c) => c.id === req.params.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    const { isLocked, isVipBypass, unreadCount } = req.body as Partial<ConversationRecord>;
    if (typeof isLocked === 'boolean') conv.isLocked = isLocked;
    if (typeof isVipBypass === 'boolean') conv.isVipBypass = isVipBypass;
    if (typeof unreadCount === 'number') conv.unreadCount = unreadCount;
    await persistStore();
    broadcast('conversation:updated', conv);
    res.json(conv);
  });

  // Post encrypted message envelope (strictly ciphertext + IV, zero plaintext accepted)
  app.post('/api/messages', async (req, res) => {
    const envelope = req.body as Partial<MessageEnvelopeRecord>;
    if (!envelope.conversationId || !envelope.ciphertext || !envelope.iv) {
      res.status(400).json({ error: 'Zero-knowledge relay requires ciphertext and iv.' });
      return;
    }

    const conv = store.conversations.find((c) => c.id === envelope.conversationId);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    const existingMessages = store.messages.filter((m) => m.conversationId === conv.id);
    const saved: MessageEnvelopeRecord = {
      id: envelope.id || `msg_${crypto.randomBytes(6).toString('hex')}`,
      conversationId: conv.id,
      senderId: envelope.senderId || 'me',
      senderName: envelope.senderName || 'You',
      senderAvatarUrl: envelope.senderAvatarUrl || AVATARS.marcus,
      createdAt: envelope.createdAt || Date.now(),
      ciphertext: envelope.ciphertext,
      iv: envelope.iv,
      ratchetIndex: envelope.ratchetIndex ?? existingMessages.length + 1,
      keyEpoch: envelope.keyEpoch ?? conv.keyEpoch,
      cipherSuite: envelope.cipherSuite || 'ECDH-P256 / Chiat-Ratchet AES-256-GCM',
      senderFingerprint: envelope.senderFingerprint || '00000 00000',
      reactions: envelope.reactions || {},
    };

    if (!store.messages.some((m) => m.id === saved.id)) {
      store.messages.push(saved);
    }
    conv.lastMessageAt = saved.createdAt;
    await persistStore();
    broadcast('message:created', saved);
    res.status(201).json(saved);
  });

  // Toggle reaction on an encrypted message
  app.post('/api/messages/:id/react', async (req, res) => {
    const msg = store.messages.find((m) => m.id === req.params.id);
    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    const { emoji, actorId } = req.body as { emoji?: string; actorId?: string };
    if (!emoji || !actorId) {
      res.status(400).json({ error: 'emoji and actorId are required.' });
      return;
    }
    const current = msg.reactions[emoji] || [];
    if (current.includes(actorId)) {
      msg.reactions[emoji] = current.filter((id) => id !== actorId);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji] = [...current, actorId];
    }
    await persistStore();
    broadcast('message:updated', msg);
    res.json(msg);
  });

  // Decentralized encrypted blob upload (base64 encrypted bytes)
  app.post('/api/vault/blobs', async (req, res) => {
    const { cid, name, mimeType, sizeBytes, iv, sha256, conversationId, keyEpoch, encryptedBase64 } =
      req.body as {
        cid?: string;
        name?: string;
        mimeType?: string;
        sizeBytes?: number;
        iv?: string;
        sha256?: string;
        conversationId?: string;
        keyEpoch?: number;
        encryptedBase64?: string;
      };

    if (!cid || !encryptedBase64 || !iv || !sha256 || !conversationId) {
      res.status(400).json({ error: 'Missing required CID vault fields.' });
      return;
    }

    const safeCid = cid.replace(/[^a-zA-Z0-9_-]/g, '');
    const encryptedBytes = Buffer.from(encryptedBase64, 'base64');
    const currentUsedBytes = store.vaultBlobs.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
    const incomingSize = sizeBytes || encryptedBytes.byteLength;
    if (currentUsedBytes + incomingSize > store.monetization.storageQuotaBytes) {
      res.status(413).json({
        error: 'Encrypted Cloud Vault storage quota exceeded. Upgrade your Vault Storage plan to pin more CIDs.',
        limitReached: true,
        limitKey: 'storage',
      });
      return;
    }
    await fs.writeFile(path.join(VAULT_DIR, `${safeCid}.enc`), encryptedBytes);

    const meta: VaultBlobMeta = {
      cid: safeCid,
      name: name || 'encrypted-blob.bin',
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: sizeBytes || encryptedBytes.byteLength,
      iv,
      sha256,
      conversationId,
      keyEpoch: keyEpoch ?? 1,
      storageNodes: ['eu-west-relay-01', 'us-east-pin-04', 'local-indexeddb-mirror'],
      uploadedAt: Date.now(),
    };

    if (!store.vaultBlobs.some((b) => b.cid === safeCid)) {
      store.vaultBlobs.unshift(meta);
    }
    await persistStore();
    broadcast('vault:updated', store.vaultBlobs);
    res.status(201).json(meta);
  });

  // Serve raw encrypted blob by CID (server never decrypts)
  app.get('/api/vault/blobs/:cid', async (req, res) => {
    const safeCid = req.params.cid.replace(/[^a-zA-Z0-9_-]/g, '');
    const blobPath = path.join(VAULT_DIR, `${safeCid}.enc`);
    try {
      const buf = await fs.readFile(blobPath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-CID', safeCid);
      res.send(buf);
    } catch {
      res.status(404).json({ error: 'CID blob not found in decentralized vault.' });
    }
  });

  // AI-Powered Chat Summaries via server-side Gemini API
  app.post('/api/ai/summarize', async (req, res) => {
    const { conversationName, messages } = req.body as {
      conversationName?: string;
      messages?: { sender: string; time: string; text: string }[];
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'No messages provided to summarize.' });
      return;
    }

    const aiLimit = store.monetization.limits.aiSummariesMonthly;
    if (aiLimit !== -1 && store.monetization.usage.aiSummariesUsed >= aiLimit) {
      res.status(402).json({
        error: `Monthly AI Summary limit reached (${store.monetization.usage.aiSummariesUsed}/${aiLimit} on ${PLAN_DEFINITIONS[store.monetization.planId].name}). Upgrade to Plus or Team for higher limits.`,
        limitReached: true,
        limitKey: 'aiSummaries',
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in server secrets.',
      });
      return;
    }

    const transcript = messages
      .slice(-40)
      .map((m) => `[${m.time}] ${m.sender}: ${m.text}`)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Summarize this conversation from "${conversationName || 'Team Channel'}". Extract an executive overview, concrete decisions made, actionable tasks with owner and suggested due hint, and any unresolved questions.\n\nTranscript:\n${transcript}`,
        config: {
          systemInstruction:
            'You are an executive communications assistant inside an encrypted enterprise messaging app. Be concise, accurate, and grounded strictly in the provided messages.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING },
              keyDecisions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              actionItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    task: { type: Type.STRING },
                    owner: { type: Type.STRING },
                    dueHint: { type: Type.STRING },
                  },
                },
              },
              openQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as {
        overview?: string;
        keyDecisions?: string[];
        actionItems?: { task: string; owner: string; dueHint: string }[];
        openQuestions?: string[];
      };

      store.monetization.usage.aiSummariesUsed += 1;
      await persistStore();
      broadcast('monetization:updated', store.monetization);

      res.json({
        overview: parsed.overview || 'Summary generated.',
        keyDecisions: parsed.keyDecisions || [],
        actionItems: parsed.actionItems || [],
        openQuestions: parsed.openQuestions || [],
        generatedAt: Date.now(),
        messageCount: messages.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to summarize conversation.';
      res.status(500).json({ error: message });
    }
  });

  // Pair & revoke cross-platform devices
  app.post('/api/devices/pair', async (req, res) => {
    const maxDev = store.monetization.limits.maxDevices;
    if (maxDev !== -1 && store.devices.length >= maxDev) {
      res.status(402).json({
        error: `Device sync limit reached (${store.devices.length}/${maxDev} on ${PLAN_DEFINITIONS[store.monetization.planId].name}). Upgrade your plan to link more devices.`,
        limitReached: true,
        limitKey: 'devices',
      });
      return;
    }
    const { name, platform } = req.body as {
      name?: string;
      platform?: DeviceSessionRecord['platform'];
    };
    const now = Date.now();
    const fpHash = crypto.randomBytes(15).toString('hex').toUpperCase();
    const fingerprint = fpHash.match(/.{1,5}/g)?.join(' ') || fpHash;
    const newDevice: DeviceSessionRecord = {
      id: `dev_${crypto.randomBytes(4).toString('hex')}`,
      name: (name || 'Paired Workstation').trim(),
      platform: platform || 'Linux',
      lastSyncAt: now,
      connectedAt: now,
      isOnline: true,
      fingerprint,
    };
    store.devices.unshift(newDevice);
    await persistStore();
    broadcast('devices:updated', store.devices);
    res.status(201).json(newDevice);
  });

  app.delete('/api/devices/:id', async (req, res) => {
    store.devices = store.devices.filter((d) => d.id !== req.params.id);
    await persistStore();
    broadcast('devices:updated', store.devices);
    res.json({ ok: true });
  });

  // Focus Mode sync across devices
  app.put('/api/focus', async (req, res) => {
    const next = req.body as Partial<FocusStateRecord>;
    store.focusState = { ...store.focusState, ...next };
    await persistStore();
    broadcast('focus:updated', store.focusState);
    res.json(store.focusState);
  });

  // Calendar events
  app.post('/api/calendar/events', async (req, res) => {
    const body = req.body as Partial<CalendarEventRecord>;
    if (!body.title || !body.startIso || !body.endIso) {
      res.status(400).json({ error: 'title, startIso, and endIso are required.' });
      return;
    }
    const created: CalendarEventRecord = {
      id: `evt_${crypto.randomBytes(4).toString('hex')}`,
      title: body.title.trim(),
      conversationId: body.conversationId,
      startIso: body.startIso,
      endIso: body.endIso,
      location: body.location || 'Kestrel Encrypted Voice Room',
      notes: body.notes || '',
      attendees: body.attendees || ['Team'],
      provider: body.provider || 'Kestrel Calendar',
    };
    store.calendarEvents.unshift(created);
    await persistStore();
    broadcast('calendar:updated', store.calendarEvents);
    res.status(201).json(created);
  });

  // Productivity tool dispatch (Linear, Jira, Notion, CalDAV)
  app.post('/api/integrations/dispatch', async (req, res) => {
    const { provider, title, summary, conversationId } = req.body as Partial<ProductivityDispatchRecord>;
    if (!provider || !title) {
      res.status(400).json({ error: 'provider and title are required.' });
      return;
    }
    const dispatchLimit = store.monetization.limits.dispatchesMonthly;
    if (dispatchLimit !== -1 && store.monetization.usage.dispatchesUsed >= dispatchLimit) {
      res.status(402).json({
        error: `Monthly integration dispatch limit reached (${store.monetization.usage.dispatchesUsed}/${dispatchLimit} on ${PLAN_DEFINITIONS[store.monetization.planId].name}). Upgrade to Team for unlimited dispatches.`,
        limitReached: true,
        limitKey: 'dispatches',
      });
      return;
    }
    const prefix =
      provider === 'Linear' ? 'LIN' : provider === 'Jira' ? 'SEC' : provider === 'Notion' ? 'NOTION' : 'CAL';
    const created: ProductivityDispatchRecord = {
      id: `disp_${crypto.randomBytes(4).toString('hex')}`,
      provider,
      title: title.trim(),
      summary: (summary || 'Dispatched from encrypted Kestrel thread').trim(),
      conversationId: conversationId || 'conv_security_core',
      externalRef: `${prefix}-${Math.floor(100 + Math.random() * 899)}`,
      status: 'Synced',
      dispatchedAt: Date.now(),
    };
    store.dispatches.unshift(created);
    store.monetization.usage.dispatchesUsed += 1;
    await persistStore();
    broadcast('dispatches:updated', store.dispatches);
    broadcast('monetization:updated', store.monetization);
    res.status(201).json(created);
  });

  // Guardian & Children's Privacy Policy sync + audit entry
  app.put('/api/guardian', async (req, res) => {
    const next = req.body as Partial<GuardianPolicyRecord>;
    store.guardianPolicy = { ...store.guardianPolicy, ...next };
    await persistStore();
    broadcast('guardian:updated', store.guardianPolicy);
    res.json(store.guardianPolicy);
  });

  app.post('/api/guardian/audit', async (req, res) => {
    const entry = req.body as Partial<GuardianAuditRecord>;
    const record: GuardianAuditRecord = {
      id: `aud_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      conversationId: entry.conversationId || 'conv_family_maya',
      ruleTriggered: entry.ruleTriggered || 'Safe Message Filter',
      actionTaken: entry.actionTaken || 'Redacted',
      preview: entry.preview || 'Filtered message content locally before transmission.',
    };
    store.guardianPolicy.auditLog.unshift(record);
    store.guardianPolicy.auditLog = store.guardianPolicy.auditLog.slice(0, 30);
    await persistStore();
    broadcast('guardian:updated', store.guardianPolicy);
    res.status(201).json(record);
  });

  // Record call log
  app.post('/api/calls/log', async (req, res) => {
    const body = req.body as Partial<CallLogRecord>;
    const log: CallLogRecord = {
      id: `call_${crypto.randomBytes(4).toString('hex')}`,
      conversationId: body.conversationId || 'conv_elena_dm',
      targetName: body.targetName || 'Voice Call',
      direction: body.direction || 'outgoing',
      durationSec: body.durationSec ?? 0,
      startedAt: body.startedAt ?? Date.now(),
      cipherSuite: body.cipherSuite || 'DTLS-SRTP + AES-256-GCM',
      verified: true,
    };
    store.callLogs.unshift(log);
    await persistStore();
    broadcast('calls:updated', store.callLogs);
    res.status(201).json(log);
  });

  // Switch / Upgrade Plan Tier & Usage Limits
  app.put('/api/monetization/plan', async (req, res) => {
    const { planId, billingCycle, seats } = req.body as {
      planId?: PlanTierId;
      billingCycle?: BillingCycle;
      seats?: number;
    };
    if (!planId || !PLAN_DEFINITIONS[planId]) {
      res.status(400).json({ error: 'Invalid plan tier selected.' });
      return;
    }

    const plan = PLAN_DEFINITIONS[planId];
    const nextCycle: BillingCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
    const nextSeats = Math.max(1, Math.min(500, Math.round(seats || store.monetization.seats || 1)));

    store.monetization.planId = planId;
    store.monetization.billingCycle = nextCycle;
    store.monetization.seats = nextSeats;
    store.monetization.limits = { ...plan.limits };
    store.monetization.storageTier = plan.storageTier;
    store.monetization.storageQuotaBytes = plan.limits.vaultQuotaBytes;

    const unitPrice = nextCycle === 'annual' ? plan.annualUsd : plan.monthlyUsd;
    const totalPrice = plan.perSeat ? unitPrice * nextSeats : unitPrice;
    if (totalPrice > 0) {
      store.monetization.invoices.unshift({
        id: `inv_${crypto.randomBytes(4).toString('hex')}`,
        category: 'Plan Subscription',
        description: `${plan.name} (${plan.perSeat ? `${nextSeats} seats · ` : ''}${nextCycle})`,
        amountUsd: totalPrice,
        billingCycle: nextCycle === 'annual' ? 'Annual' : 'Monthly',
        status: 'Paid',
        createdAt: Date.now(),
      });
    }

    await persistStore();
    broadcast('monetization:updated', store.monetization);
    res.json(store.monetization);
  });

  // Monetization #3: Reserve a Premium Unique @Username / Vanity Handle
  app.post('/api/monetization/handles', async (req, res) => {
    const { handle: rawHandle, assignAsPrimary } = req.body as {
      handle?: string;
      assignAsPrimary?: boolean;
    };
    const handle = normalizeUsername(rawHandle || '');
    if (!isValidUsername(handle)) {
      res.status(400).json({
        error: 'Handle must be 3–24 characters using lowercase letters, numbers, or underscores.',
      });
      return;
    }

    const myId = store.myProfile?.id || 'me';
    const directoryConflict = store.directoryUsers.find(
      (u) => u.username === handle && u.id !== myId
    );
    const reservedConflict = store.monetization.reservedHandles.find((h) => h.handle === handle);
    if (directoryConflict || reservedConflict) {
      res.status(409).json({
        error: `@${handle} is already claimed and locked exclusively. Choose another handle.`,
      });
      return;
    }

    const isShort = handle.length <= 4;
    const tier: PremiumHandleRecord['tier'] = isShort ? 'Short 3-4 Char' : 'Brand / VIP';
    const priceUsd = isShort ? 29 : 12;
    const now = Date.now();
    const ownerName = store.myProfile?.displayName || 'Workspace Owner';

    const record: PremiumHandleRecord = {
      id: `hdl_${crypto.randomBytes(4).toString('hex')}`,
      handle,
      tier,
      priceUsd,
      ownerName,
      assignedToMe: Boolean(assignAsPrimary),
      purchasedAt: now,
    };

    if (assignAsPrimary) {
      store.monetization.reservedHandles.forEach((h) => {
        h.assignedToMe = false;
      });
      const fpHex = crypto.randomBytes(15).toString('hex').toUpperCase();
      const updatedProfile: DirectoryUserRecord = store.myProfile
        ? { ...store.myProfile, username: handle }
        : {
            id: 'me',
            displayName: 'Workspace Owner',
            username: handle,
            phoneNumber: '+14155550199',
            role: 'Workspace Owner',
            avatarUrl: AVATARS.marcus,
            fingerprint: fpHex.match(/.{1,5}/g)?.join(' ') || fpHex,
            createdAt: now,
          };
      store.myProfile = updatedProfile;
      const idx = store.directoryUsers.findIndex((u) => u.id === updatedProfile.id);
      if (idx >= 0) store.directoryUsers[idx] = updatedProfile;
      else store.directoryUsers.unshift(updatedProfile);
      broadcast('directory:updated', {
        directoryUsers: store.directoryUsers,
        myProfile: store.myProfile,
      });
    }

    store.monetization.reservedHandles.unshift(record);
    store.monetization.invoices.unshift({
      id: `inv_${crypto.randomBytes(4).toString('hex')}`,
      category: 'Vanity Handle',
      description: `Exclusive @${handle} reservation (${tier})`,
      amountUsd: priceUsd,
      billingCycle: 'One-Time',
      status: 'Paid',
      createdAt: now,
    });

    await persistStore();
    broadcast('monetization:updated', store.monetization);
    res.status(201).json({
      handle: record,
      monetization: store.monetization,
      myProfile: store.myProfile,
    });
  });

  // Monetization #4: Upgrade / Switch Encrypted Cloud Vault Storage Tier
  app.put('/api/monetization/storage-tier', async (req, res) => {
    const { tierId } = req.body as { tierId?: StorageTierId };
    if (!tierId || !STORAGE_TIER_QUOTAS[tierId]) {
      res.status(400).json({ error: 'Invalid storage tier selected.' });
      return;
    }

    const plan = STORAGE_TIER_QUOTAS[tierId];
    store.monetization.storageTier = tierId;
    store.monetization.storageQuotaBytes = plan.bytes;

    if (plan.priceUsd > 0) {
      store.monetization.invoices.unshift({
        id: `inv_${crypto.randomBytes(4).toString('hex')}`,
        category: 'Vault Storage',
        description: `${plan.label} encrypted CID pinning subscription`,
        amountUsd: plan.priceUsd,
        billingCycle: 'Monthly',
        status: 'Paid',
        createdAt: Date.now(),
      });
    }

    await persistStore();
    broadcast('monetization:updated', store.monetization);
    res.json(store.monetization);
  });

  // Monetization #5: Activate & Configure White-Label Brand License
  app.put('/api/monetization/white-label', async (req, res) => {
    const body = req.body as Partial<WhiteLabelLicenseRecord>;
    const tier = body.tier || 'Starter Org ($199/mo)';
    const active = tier !== 'None' && (body.active ?? true);
    const now = Date.now();
    const existingKey = store.monetization.whiteLabel.licenseKey;
    const generatedKey = active
      ? existingKey || `KSL-WL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
      : null;

    const seatsIncluded =
      tier === 'Enterprise Source ($799/mo)' ? 500 : tier === 'Starter Org ($199/mo)' ? 50 : 25;

    store.monetization.whiteLabel = {
      active,
      tier,
      brandName: (body.brandName || 'Kestrel').trim() || 'Kestrel',
      brandTagline: (body.brandTagline || 'Chiat-Ratchet E2EE · Synced').trim(),
      accentColor: body.accentColor || 'emerald',
      customDomain: (body.customDomain || '').trim(),
      bundleId: (body.bundleId || 'app.kestrel.secure').trim(),
      licenseKey: generatedKey,
      seatsIncluded,
      updatedAt: now,
    };

    if (active) {
      const amountUsd = tier === 'Enterprise Source ($799/mo)' ? 799 : 199;
      store.monetization.invoices.unshift({
        id: `inv_${crypto.randomBytes(4).toString('hex')}`,
        category: 'White-Label License',
        description: `${tier} · ${store.monetization.whiteLabel.brandName}`,
        amountUsd,
        billingCycle: 'Monthly',
        status: 'Paid',
        createdAt: now,
      });
    }

    await persistStore();
    broadcast('monetization:updated', store.monetization);
    res.json(store.monetization);
  });

  // Vite middleware in dev, static assets in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const sanitized = result.code.replace(
          /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
          'const transport = { async connect() {}, async disconnect() {}, async send() {}, async invoke() { return { result: void 0 }; } };'
        );
        res.type('application/javascript').send(sanitized);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Kestrel encrypted relay running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Kestrel server:', err);
  process.exit(1);
});
