export type ConversationKind = 'team' | 'direct' | 'family';

export interface Participant {
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

export interface DirectoryUser {
  id: string;
  displayName: string;
  username: string;
  phoneNumber: string;
  role: string;
  avatarUrl: string;
  fingerprint: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  name: string;
  kind: ConversationKind;
  description: string;
  avatarUrl?: string;
  participants: Participant[];
  roomSalt: string;
  keyEpoch: number;
  isLocked?: boolean;
  isVipBypass?: boolean;
  unreadCount: number;
  lastMessageAt: number;
}

export interface DecentralizedAttachment {
  cid: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  iv: string;
  sha256: string;
  storageNodes: string[];
  kind: 'image' | 'audio' | 'file';
  durationSec?: number;
}

export interface MessagePayload {
  text: string;
  attachment?: DecentralizedAttachment;
  replyToId?: string;
  safetyNotice?: string;
  wasFiltered?: boolean;
}

export interface EncryptedMessageEnvelope {
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

export interface DecryptedMessage extends EncryptedMessageEnvelope {
  plaintext: MessagePayload;
  decryptionVerified: boolean;
}

export interface DeviceSession {
  id: string;
  name: string;
  platform: 'Web' | 'macOS' | 'iOS' | 'Linux' | 'Windows';
  lastSyncAt: number;
  connectedAt: number;
  isOnline: boolean;
  fingerprint: string;
}

export interface FocusState {
  enabled: boolean;
  presetLabel: string;
  endsAt: number | null;
  silenceSounds: boolean;
  hideUnreadBadges: boolean;
  allowVipBypass: boolean;
  autoReplyText: string;
}

export interface CalendarEventItem {
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

export interface ProductivityDispatch {
  id: string;
  provider: 'Linear' | 'Jira' | 'Notion' | 'CalDAV Webhook';
  title: string;
  summary: string;
  conversationId: string;
  externalRef: string;
  status: 'Synced' | 'Queued';
  dispatchedAt: number;
}

export interface GuardianAuditEntry {
  id: string;
  timestamp: number;
  conversationId: string;
  ruleTriggered: string;
  actionTaken: 'Redacted' | 'Blocked' | 'Quarantined';
  preview: string;
}

export interface GuardianPolicy {
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
  auditLog: GuardianAuditEntry[];
}

export interface CallLogEntry {
  id: string;
  conversationId: string;
  targetName: string;
  direction: 'outgoing' | 'incoming' | 'team';
  durationSec: number;
  startedAt: number;
  cipherSuite: string;
  verified: boolean;
}

export interface BiometricLockConfig {
  enabled: boolean;
  biometricEnrolled: boolean;
  credentialId: string | null;
  credentialLabel: string | null;
  pinHash: string | null;
  autoLockMinutes: number;
  requireForSettings: boolean;
  requireForGuardian: boolean;
}

export interface ChatSummaryResult {
  overview: string;
  keyDecisions: string[];
  actionItems: {
    task: string;
    owner: string;
    dueHint: string;
  }[];
  openQuestions: string[];
  generatedAt: number;
  messageCount: number;
}

export type PlanTierId = 'free' | 'plus' | 'team' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';
export type StorageTierId = 'free_2gb' | 'vault_100gb' | 'vault_1tb';

export interface PlanLimits {
  aiSummariesMonthly: number; // -1 = unlimited
  maxDevices: number; // -1 = unlimited
  maxConversations: number; // -1 = unlimited
  dispatchesMonthly: number; // -1 = unlimited
  vaultQuotaBytes: number;
  whiteLabelIncluded: boolean;
}

export interface UsageCounters {
  aiSummariesUsed: number;
  dispatchesUsed: number;
  cycleResetAt: number;
}

export interface PremiumHandleRecord {
  id: string;
  handle: string;
  tier: 'Short 3-4 Char' | 'Brand / VIP';
  priceUsd: number;
  ownerName: string;
  assignedToMe: boolean;
  purchasedAt: number;
}

export interface WhiteLabelLicense {
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

export interface BillingInvoiceRecord {
  id: string;
  category: 'Plan Subscription' | 'Vanity Handle' | 'Vault Storage' | 'White-Label License';
  description: string;
  amountUsd: number;
  billingCycle: 'One-Time' | 'Monthly' | 'Annual';
  status: 'Paid';
  createdAt: number;
}

export interface MonetizationState {
  planId: PlanTierId;
  billingCycle: BillingCycle;
  seats: number;
  limits: PlanLimits;
  usage: UsageCounters;
  storageTier: StorageTierId;
  storageQuotaBytes: number;
  reservedHandles: PremiumHandleRecord[];
  whiteLabel: WhiteLabelLicense;
  invoices: BillingInvoiceRecord[];
}

