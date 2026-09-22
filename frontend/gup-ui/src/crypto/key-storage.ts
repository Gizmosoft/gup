import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/secure-storage';

import { base64ToBytes, bytesToBase64 } from './encoding';
import {
  generateIdentityKeyPair,
  generateX25519KeyPair,
  randomRegistrationId,
  sign,
  type KeyPair,
} from './noble-primitives';

const IDENTITY_PUBLIC = 'gup.signal.identity.public';
const IDENTITY_PRIVATE = 'gup.signal.identity.private';
const REGISTRATION_ID = 'gup.signal.registrationId';
const SIGNED_PREKEY = 'gup.signal.signedPreKey';
const ONETIME_PREKEYS = 'gup.signal.oneTimePreKeys';
const ONETIME_PREKEYS_CHUNK_COUNT = 'gup.signal.oneTimePreKeys.chunkCount';
const NEXT_OTPK_ID = 'gup.signal.nextOtpkId';
const NEXT_SPK_ID = 'gup.signal.nextSpkId';
const OWNER_USER_ID = 'gup.signal.ownerUserId';

/** Android SecureStore rejects values over 2048 bytes; 100 OTPKs in one JSON blob exceed that. */
const OTPK_CHUNK_SIZE = 12;

export type StoredSignedPreKey = {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
};

export type StoredOneTimePreKey = {
  keyId: number;
  publicKey: string;
  privateKey: string;
};

export type LocalIdentity = {
  identity: KeyPair;
  registrationId: number;
  signedPreKey: {
    keyId: number;
    keyPair: KeyPair;
    signature: Uint8Array;
  };
  oneTimePreKeys: Array<{ keyId: number; keyPair: KeyPair }>;
};

async function setItem(key: string, value: string): Promise<void> {
  await setSecureItem(key, value);
}

async function getItem(key: string): Promise<string | null> {
  return getSecureItem(key);
}

export async function hasLocalIdentity(): Promise<boolean> {
  const pub = await getItem(IDENTITY_PUBLIC);
  return pub != null;
}

export async function loadIdentityKeyPair(): Promise<KeyPair | null> {
  const publicKey = await getItem(IDENTITY_PUBLIC);
  const privateKey = await getItem(IDENTITY_PRIVATE);
  if (!publicKey || !privateKey) {
    return null;
  }
  return {
    publicKey: base64ToBytes(publicKey),
    privateKey: base64ToBytes(privateKey),
  };
}

export async function loadRegistrationId(): Promise<number | null> {
  const raw = await getItem(REGISTRATION_ID);
  return raw != null ? Number(raw) : null;
}

export async function loadSignedPreKey(): Promise<StoredSignedPreKey | null> {
  const raw = await getItem(SIGNED_PREKEY);
  return raw ? (JSON.parse(raw) as StoredSignedPreKey) : null;
}

function otpkChunkKey(index: number): string {
  return `${ONETIME_PREKEYS}.${index}`;
}

export async function loadOneTimePreKeys(): Promise<StoredOneTimePreKey[]> {
  try {
    return await loadOneTimePreKeysUnsafe();
  } catch {
    return [];
  }
}

async function loadOneTimePreKeysUnsafe(): Promise<StoredOneTimePreKey[]> {
  const chunkCountRaw = await getItem(ONETIME_PREKEYS_CHUNK_COUNT);
  if (chunkCountRaw != null) {
    const chunkCount = Number(chunkCountRaw);
    const keys: StoredOneTimePreKey[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const raw = await getItem(otpkChunkKey(i));
      if (raw) {
        keys.push(...(JSON.parse(raw) as StoredOneTimePreKey[]));
      }
    }
    return keys;
  }

  const legacy = await getItem(ONETIME_PREKEYS);
  if (!legacy) {
    return [];
  }
  const keys = JSON.parse(legacy) as StoredOneTimePreKey[];
  await saveOneTimePreKeys(keys);
  return keys;
}

export async function saveOneTimePreKeys(keys: StoredOneTimePreKey[]): Promise<void> {
  const chunks: StoredOneTimePreKey[][] = [];
  for (let i = 0; i < keys.length; i += OTPK_CHUNK_SIZE) {
    chunks.push(keys.slice(i, i + OTPK_CHUNK_SIZE));
  }
  await setItem(ONETIME_PREKEYS_CHUNK_COUNT, String(chunks.length));
  for (let i = 0; i < chunks.length; i++) {
    await setItem(otpkChunkKey(i), JSON.stringify(chunks[i]));
  }
  let extra = chunks.length;
  while (true) {
    const leftover = await getItem(otpkChunkKey(extra));
    if (leftover == null) {
      break;
    }
    await deleteSecureItem(otpkChunkKey(extra));
    extra += 1;
  }
  await deleteSecureItem(ONETIME_PREKEYS);
}

async function clearOneTimePreKeys(): Promise<void> {
  const chunkCountRaw = await getItem(ONETIME_PREKEYS_CHUNK_COUNT);
  const chunkCount = chunkCountRaw != null ? Number(chunkCountRaw) : 0;
  for (let i = 0; i < chunkCount; i++) {
    await deleteSecureItem(otpkChunkKey(i));
  }
  await deleteSecureItem(ONETIME_PREKEYS);
  await deleteSecureItem(ONETIME_PREKEYS_CHUNK_COUNT);
}

export async function removeOneTimePreKey(keyId: number): Promise<KeyPair | null> {
  const keys = await loadOneTimePreKeys();
  const match = keys.find((k) => k.keyId === keyId);
  if (!match) {
    return null;
  }
  await saveOneTimePreKeys(keys.filter((k) => k.keyId !== keyId));
  return {
    publicKey: base64ToBytes(match.publicKey),
    privateKey: base64ToBytes(match.privateKey),
  };
}

export async function getNextOtpkId(): Promise<number> {
  const raw = await getItem(NEXT_OTPK_ID);
  return raw != null ? Number(raw) : 1;
}

export async function setNextOtpkId(next: number): Promise<void> {
  await setItem(NEXT_OTPK_ID, String(next));
}

export async function getNextSpkId(): Promise<number> {
  const raw = await getItem(NEXT_SPK_ID);
  return raw != null ? Number(raw) : 1;
}

export async function setNextSpkId(next: number): Promise<void> {
  await setItem(NEXT_SPK_ID, String(next));
}

export async function getIdentityOwnerUserId(): Promise<number | null> {
  const raw = await getItem(OWNER_USER_ID);
  if (raw == null || raw === '') {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setIdentityOwnerUserId(userId: number): Promise<void> {
  await setItem(OWNER_USER_ID, String(userId));
}

export async function generateAndStoreIdentity(otpkCount = 100): Promise<LocalIdentity> {
  const identity = generateIdentityKeyPair();
  const registrationId = randomRegistrationId();
  const spkId = 1;
  const signedPreKeyPair = generateX25519KeyPair();
  const signature = sign(signedPreKeyPair.publicKey, identity.privateKey);

  const oneTimePreKeys: Array<{ keyId: number; keyPair: KeyPair }> = [];
  const storedOtpks: StoredOneTimePreKey[] = [];
  for (let i = 0; i < otpkCount; i++) {
    const keyId = i + 1;
    const keyPair = generateX25519KeyPair();
    oneTimePreKeys.push({ keyId, keyPair });
    storedOtpks.push({
      keyId,
      publicKey: bytesToBase64(keyPair.publicKey),
      privateKey: bytesToBase64(keyPair.privateKey),
    });
  }

  await setItem(IDENTITY_PUBLIC, bytesToBase64(identity.publicKey));
  await setItem(IDENTITY_PRIVATE, bytesToBase64(identity.privateKey));
  await setItem(REGISTRATION_ID, String(registrationId));
  await setItem(
    SIGNED_PREKEY,
    JSON.stringify({
      keyId: spkId,
      publicKey: bytesToBase64(signedPreKeyPair.publicKey),
      privateKey: bytesToBase64(signedPreKeyPair.privateKey),
      signature: bytesToBase64(signature),
    } satisfies StoredSignedPreKey)
  );
  await saveOneTimePreKeys(storedOtpks);
  await setNextOtpkId(otpkCount + 1);
  await setNextSpkId(spkId + 1);

  return {
    identity,
    registrationId,
    signedPreKey: {
      keyId: spkId,
      keyPair: signedPreKeyPair,
      signature,
    },
    oneTimePreKeys,
  };
}

export async function loadLocalIdentity(): Promise<LocalIdentity | null> {
  const identity = await loadIdentityKeyPair();
  const registrationId = await loadRegistrationId();
  const signed = await loadSignedPreKey();
  if (!identity || registrationId == null || !signed) {
    return null;
  }
  const otpks = await loadOneTimePreKeys();
  return {
    identity,
    registrationId,
    signedPreKey: {
      keyId: signed.keyId,
      keyPair: {
        publicKey: base64ToBytes(signed.publicKey),
        privateKey: base64ToBytes(signed.privateKey),
      },
      signature: base64ToBytes(signed.signature),
    },
    oneTimePreKeys: otpks.map((k) => ({
      keyId: k.keyId,
      keyPair: {
        publicKey: base64ToBytes(k.publicKey),
        privateKey: base64ToBytes(k.privateKey),
      },
    })),
  };
}

export async function generateAdditionalOneTimePreKeys(
  count: number
): Promise<Array<{ keyId: number; keyPair: KeyPair }>> {
  let nextId = await getNextOtpkId();
  const existing = await loadOneTimePreKeys();
  const created: Array<{ keyId: number; keyPair: KeyPair }> = [];
  for (let i = 0; i < count; i++) {
    const keyId = nextId++;
    const keyPair = generateX25519KeyPair();
    created.push({ keyId, keyPair });
    existing.push({
      keyId,
      publicKey: bytesToBase64(keyPair.publicKey),
      privateKey: bytesToBase64(keyPair.privateKey),
    });
  }
  await saveOneTimePreKeys(existing);
  await setNextOtpkId(nextId);
  return created;
}

export async function clearLocalSignalKeys(): Promise<void> {
  await deleteSecureItem(IDENTITY_PUBLIC);
  await deleteSecureItem(IDENTITY_PRIVATE);
  await deleteSecureItem(REGISTRATION_ID);
  await deleteSecureItem(SIGNED_PREKEY);
  await clearOneTimePreKeys();
  await deleteSecureItem(NEXT_OTPK_ID);
  await deleteSecureItem(NEXT_SPK_ID);
  await deleteSecureItem(OWNER_USER_ID);
}
