import type { GuardianPolicy } from '../types/kestrel';

export interface SafetyEvaluation {
  allowed: boolean;
  wasModified: boolean;
  sanitizedText: string;
  triggers: string[];
  reason?: string;
}

const PROFANITY_TERMS = [
  'damn',
  'hell',
  'idiot',
  'stupid',
  'moron',
  'hate',
  'kill',
  'loser',
  'shut up',
];

const UNSAFE_URL_PATTERNS = [
  /https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl)\/\S+/gi,
  /https?:\/\/\S*(?:free-robux|phishing|crypto-airdrop|adult|casino|betting)\S*/gi,
];

const PII_PATTERNS: { label: string; regex: RegExp; mask: string }[] = [
  {
    label: 'Email Address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: '[Email Redacted by Child Guard]',
  },
  {
    label: 'Phone Number',
    regex: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    mask: '[Phone Redacted by Child Guard]',
  },
  {
    label: 'Street Address',
    regex: /\b\d{1,5}\s+[A-Za-z0-9\s]{2,25}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)\b/gi,
    mask: '[Address Redacted by Child Guard]',
  },
  {
    label: 'Payment / ID Number',
    regex: /\b(?:\d{3}-\d{2}-\d{4}|(?:\d[ -]*?){13,16})\b/g,
    mask: '[Sensitive Number Redacted]',
  },
];

export function isWithinQuietHours(policy: GuardianPolicy, nowDate = new Date()): boolean {
  if (!policy.quietHoursEnabled) return false;
  const hour = nowDate.getHours();
  if (policy.quietStartHour > policy.quietEndHour) {
    return hour >= policy.quietStartHour || hour < policy.quietEndHour;
  }
  return hour >= policy.quietStartHour && hour < policy.quietEndHour;
}

export function evaluateMessageSafety(
  rawText: string,
  policy: GuardianPolicy,
  options?: { isInbound?: boolean; senderId?: string }
): SafetyEvaluation {
  if (!policy.childProfileActive || !policy.safeMessageFiltering) {
    return {
      allowed: true,
      wasModified: false,
      sanitizedText: rawText,
      triggers: [],
    };
  }

  if (
    options?.isInbound &&
    policy.allowlistOnly &&
    options.senderId &&
    options.senderId !== 'me' &&
    !policy.approvedContactIds.includes(options.senderId)
  ) {
    return {
      allowed: false,
      wasModified: true,
      sanitizedText: '[Message quarantined — sender is not on the guardian allowlist]',
      triggers: ['Unapproved Contact'],
      reason: 'Sender is outside the approved contact allowlist.',
    };
  }

  let sanitizedText = rawText;
  const triggers: string[] = [];

  if (policy.blockPiiSharing) {
    for (const pattern of PII_PATTERNS) {
      if (pattern.regex.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(pattern.regex, pattern.mask);
        triggers.push(`PII Shield (${pattern.label})`);
      }
      pattern.regex.lastIndex = 0;
    }
  }

  if (policy.blockUnsafeLinks) {
    for (const urlRegex of UNSAFE_URL_PATTERNS) {
      if (urlRegex.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(urlRegex, '[Unverified Link Blocked]');
        triggers.push('Unsafe URL Blocker');
      }
      urlRegex.lastIndex = 0;
    }
  }

  for (const term of PROFANITY_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (regex.test(sanitizedText)) {
      sanitizedText = sanitizedText.replace(regex, '••••');
      if (!triggers.includes('Safe Language Filter')) {
        triggers.push('Safe Language Filter');
      }
    }
  }

  return {
    allowed: true,
    wasModified: sanitizedText !== rawText,
    sanitizedText,
    triggers,
    reason: triggers.length > 0 ? `Filtered: ${triggers.join(', ')}` : undefined,
  };
}
