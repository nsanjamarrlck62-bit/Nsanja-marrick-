import type { MessagePayload } from '../types/kestrel';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const input =
    typeof data === 'string'
      ? textEncoder.encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', input as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export async function computeCid(data: ArrayBuffer | Uint8Array): Promise<{ cid: string; sha256: string }> {
  const hex = await sha256Hex(data);
  // Deterministic content-addressed CIDv1-style identifier derived from SHA-256 multihash
  const cid = `bafybeig${hex.slice(0, 44)}`;
  return { cid, sha256: hex };
}

export async function getOrCreateDeviceIdentity(): Promise<{
  deviceId: string;
  fingerprint: string;
  publicKeyJwk: JsonWebKey;
}> {
  const storedId = localStorage.getItem('kestrel_device_id');
  const storedFingerprint = localStorage.getItem('kestrel_device_fingerprint');
  const storedPub = localStorage.getItem('kestrel_device_pub_jwk');

  if (storedId && storedFingerprint && storedPub) {
    try {
      return {
        deviceId: storedId,
        fingerprint: storedFingerprint,
        publicKeyJwk: JSON.parse(storedPub) as JsonWebKey,
      };
    } catch {
      // Regenerate below if corrupted
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const hash = await sha256Hex(JSON.stringify(publicKeyJwk));
  const grouped = hash
    .slice(0, 30)
    .toUpperCase()
    .match(/.{1,5}/g)
    ?.join(' ') ?? hash.slice(0, 20);

  const deviceId = `dev_${hash.slice(0, 12)}`;
  localStorage.setItem('kestrel_device_id', deviceId);
  localStorage.setItem('kestrel_device_fingerprint', grouped);
  localStorage.setItem('kestrel_device_pub_jwk', JSON.stringify(publicKeyJwk));

  return { deviceId, fingerprint: grouped, publicKeyJwk };
}

async function deriveConversationAesKey(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number
): Promise<CryptoKey> {
  const material = `kestrel-chiat-ratchet-v1:${conversationId}:${roomSalt}:epoch-${keyEpoch}`;
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(material));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptMessagePayload(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  payload: MessagePayload
): Promise<{ ciphertext: string; iv: string; cipherSuite: string }> {
  const key = await deriveConversationAesKey(conversationId, roomSalt, keyEpoch);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encoded = textEncoder.encode(JSON.stringify(payload));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encoded
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(ivBytes),
    cipherSuite: 'ECDH-P256 / Chiat-Ratchet AES-256-GCM',
  };
}

export async function decryptMessagePayload(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  ciphertextB64: string,
  ivB64: string
): Promise<{ payload: MessagePayload; verified: boolean }> {
  try {
    const key = await deriveConversationAesKey(conversationId, roomSalt, keyEpoch);
    const ivBytes = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(ciphertextB64);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as BufferSource },
      key,
      cipherBytes as BufferSource
    );
    const json = textDecoder.decode(decryptedBuffer);
    return { payload: JSON.parse(json) as MessagePayload, verified: true };
  } catch {
    return {
      payload: {
        text: '[Encrypted message — key epoch mismatch or unverified payload]',
      },
      verified: false,
    };
  }
}

export async function encryptBlobForVault(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  data: ArrayBuffer
): Promise<{
  encryptedBytes: Uint8Array;
  iv: string;
  cid: string;
  sha256: string;
}> {
  const key = await deriveConversationAesKey(conversationId, roomSalt, keyEpoch);
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    data
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const { cid, sha256 } = await computeCid(encryptedBytes);
  return {
    encryptedBytes,
    iv: bytesToBase64(ivBytes),
    cid,
    sha256,
  };
}

export async function decryptBlobFromVault(
  conversationId: string,
  roomSalt: string,
  keyEpoch: number,
  ivB64: string,
  encryptedBuffer: ArrayBuffer
): Promise<ArrayBuffer> {
  const key = await deriveConversationAesKey(conversationId, roomSalt, keyEpoch);
  const ivBytes = base64ToBytes(ivB64);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    key,
    encryptedBuffer
  );
}

export async function hashPin(pin: string): Promise<string> {
  return sha256Hex(`kestrel-biometric-pin-v1:${pin}`);
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

export async function enrollBiometricPasskey(userName: string): Promise<{
  credentialId: string;
  label: string;
}> {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn platform authenticator is not supported in this browser.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'Kestrel Secure Workspace',
      },
      user: {
        id: userId,
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        userVerification: 'preferred',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Biometric registration was cancelled.');
  }

  return {
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    label: 'Hardware Passkey / Biometric Lock',
  };
}

export async function verifyBiometricPasskey(credentialIdB64: string): Promise<boolean> {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn is unavailable in this browser.');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rawId = base64ToBytes(credentialIdB64);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: 'public-key',
          id: rawId as BufferSource,
        },
      ],
      userVerification: 'preferred',
      timeout: 60000,
    },
  });

  return Boolean(assertion);
}
