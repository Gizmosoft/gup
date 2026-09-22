import {
  fetchKeyStatus,
  fetchPreKeyBundle,
  fetchPublishedIdentity,
  publishKeys,
  replenishOneTimePreKeys,
  type PreKeyBundleDto,
} from '@/api/keys.api';
import { NotFoundError } from '@/api/errors';
import * as signalRepository from '@/db/repositories/signal.repository';
import { IdentityMismatchError, PeerKeysMissingError, SignalCryptoError } from './errors';
import { bytesToBase64, base64ToBytes } from './encoding';
import {
  generateAdditionalOneTimePreKeys,
  generateAndStoreIdentity,
  hasLocalIdentity,
  loadLocalIdentity,
  loadOneTimePreKeys,
  removeOneTimePreKey,
  setIdentityOwnerUserId,
  setNextOtpkId,
  type LocalIdentity,
} from './key-storage';
import {
  createInboundSessionFromPreKey,
  createOutboundSession,
  decryptMessage,
  deserializeSession,
  encryptMessage,
  encryptPreKeyMessage,
  parseWireMessage,
  serializeSession,
  type SessionRecord,
  type SignalWireMessage,
} from './session-cipher';
import type { PreKeyBundle } from './x3dh';

const OTPK_REPLENISH_THRESHOLD = 30;
const OTPK_REPLENISH_BATCH = 100;

function bundleFromDto(dto: PreKeyBundleDto): PreKeyBundle {
  return {
    identityKey: base64ToBytes(dto.identityKey),
    registrationId: dto.registrationId,
    signedPreKey: {
      keyId: dto.signedPreKey.keyId,
      publicKey: base64ToBytes(dto.signedPreKey.publicKey),
      signature: base64ToBytes(dto.signedPreKey.signature),
    },
    oneTimePreKey: dto.oneTimePreKey
      ? {
          keyId: dto.oneTimePreKey.keyId,
          publicKey: base64ToBytes(dto.oneTimePreKey.publicKey),
        }
      : null,
  };
}

async function requireLocalIdentity(): Promise<LocalIdentity> {
  const identity = await loadLocalIdentity();
  if (!identity) {
    throw new SignalCryptoError('Local Signal identity is not initialized');
  }
  return identity;
}

async function loadSession(peerUserId: number): Promise<SessionRecord | null> {
  const raw = await signalRepository.getSessionState(peerUserId);
  return raw ? deserializeSession(raw) : null;
}

async function persistSession(peerUserId: number, session: SessionRecord): Promise<void> {
  await signalRepository.saveSessionState(peerUserId, serializeSession(session));
}

async function assertTrustedIdentity(peerUserId: number, identityKey: Uint8Array): Promise<void> {
  const encoded = bytesToBase64(identityKey);
  const trusted = await signalRepository.getTrustedIdentity(peerUserId);
  if (!trusted) {
    await signalRepository.trustIdentity(peerUserId, encoded);
    return;
  }
  if (trusted !== encoded) {
    throw new IdentityMismatchError(peerUserId);
  }
}

async function publishLocalIdentity(identity: LocalIdentity): Promise<void> {
  await publishKeys({
    registrationId: identity.registrationId,
    identityKey: bytesToBase64(identity.identity.publicKey),
    signedPreKey: {
      keyId: identity.signedPreKey.keyId,
      publicKey: bytesToBase64(identity.signedPreKey.keyPair.publicKey),
      signature: bytesToBase64(identity.signedPreKey.signature),
    },
    oneTimePreKeys: identity.oneTimePreKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: bytesToBase64(k.keyPair.publicKey),
    })),
  });
}

/**
 * Ensures local identity exists and is published to the server.
 */
export async function ensureKeysPublished(userId: number): Promise<void> {
  let identity = await loadLocalIdentity();
  if (!identity) {
    identity = await generateAndStoreIdentity(100);
  }

  const status = await fetchKeyStatus();
  const localKeysMatchServer =
    status.published && status.registrationId === identity.registrationId;

  if (!localKeysMatchServer) {
    await publishLocalIdentity(identity);
  }

  await setIdentityOwnerUserId(userId);

  const localOtpks = (await loadOneTimePreKeys()).length;
  if (
    localOtpks < OTPK_REPLENISH_THRESHOLD ||
    (localKeysMatchServer && status.oneTimePreKeysRemaining < OTPK_REPLENISH_THRESHOLD)
  ) {
    await replenishOneTimePreKeysIfNeeded();
  }
}

export async function replenishOneTimePreKeysIfNeeded(): Promise<void> {
  if (!(await hasLocalIdentity())) {
    return;
  }
  const status = await fetchKeyStatus();
  if (!status.published) {
    return;
  }
  const localCount = (await loadOneTimePreKeys()).length;
  if (status.oneTimePreKeysRemaining >= OTPK_REPLENISH_THRESHOLD && localCount >= OTPK_REPLENISH_THRESHOLD) {
    return;
  }

  if (localCount === 0) {
    await setNextOtpkId(1);
  }

  const created = await generateAdditionalOneTimePreKeys(OTPK_REPLENISH_BATCH);
  await replenishOneTimePreKeys(
    created.map((k) => ({
      keyId: k.keyId,
      publicKey: bytesToBase64(k.keyPair.publicKey),
    }))
  );
}

/**
 * Encrypts plaintext for a peer. Creates an X3DH session when none exists.
 */
export async function encryptForPeer(peerUserId: number, plaintext: string): Promise<string> {
  const local = await requireLocalIdentity();
  let session = await loadSession(peerUserId);

  if (session) {
    try {
      const published = await fetchPublishedIdentity(peerUserId);
      if (published.identityKey !== bytesToBase64(session.remoteIdentityKey)) {
        console.warn('Peer identity changed; resetting Signal session', peerUserId);
        await resetSessionWithPeer(peerUserId);
        session = null;
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new PeerKeysMissingError(peerUserId);
      }
      throw error;
    }
  }

  if (!session) {
    let bundleDto: PreKeyBundleDto;
    try {
      bundleDto = await fetchPreKeyBundle(peerUserId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new PeerKeysMissingError(peerUserId);
      }
      throw error;
    }

    await assertTrustedIdentity(peerUserId, base64ToBytes(bundleDto.identityKey));
    const { session: outbound, firstMessageMeta } = createOutboundSession(
      local.identity,
      local.registrationId,
      bundleFromDto(bundleDto)
    );
    const ciphertext = encryptPreKeyMessage(outbound, plaintext, firstMessageMeta);
    await persistSession(peerUserId, outbound);
    return ciphertext;
  }

  await assertTrustedIdentity(peerUserId, session.remoteIdentityKey);
  const ciphertext = encryptMessage(session, plaintext);
  await persistSession(peerUserId, session);
  return ciphertext;
}

async function establishInboundPreKeySession(
  peerUserId: number,
  local: LocalIdentity,
  wire: SignalWireMessage,
  ciphertext: string
): Promise<string> {
  if (wire.t !== 'prekey' || !wire.ik || !wire.spkId) {
    throw new SignalCryptoError('No session and message is not a PreKey message');
  }

  await assertTrustedIdentity(peerUserId, base64ToBytes(wire.ik));

  if (wire.spkId !== local.signedPreKey.keyId) {
    throw new SignalCryptoError('Signed prekey id mismatch for inbound PreKey message');
  }

  const otpk = wire.opkId != null ? await removeOneTimePreKey(wire.opkId) : null;
  if (wire.opkId != null && otpk == null) {
    throw new SignalCryptoError(`Missing local one-time prekey ${wire.opkId} for inbound PreKey message`);
  }
  const session = createInboundSessionFromPreKey(
    local.identity,
    local.registrationId,
    local.signedPreKey.keyPair,
    otpk,
    wire
  );
  const plaintext = decryptMessage(session, ciphertext);
  await persistSession(peerUserId, session);
  return plaintext;
}

/**
 * Decrypts an inbound SIGNAL_V1 payload from a peer.
 */
export async function decryptFromPeer(peerUserId: number, ciphertext: string): Promise<string> {
  const local = await requireLocalIdentity();
  const wire = parseWireMessage(ciphertext);
  const session = await loadSession(peerUserId);

  if (session) {
    try {
      if (wire.ik) {
        await assertTrustedIdentity(peerUserId, base64ToBytes(wire.ik));
      } else {
        await assertTrustedIdentity(peerUserId, session.remoteIdentityKey);
      }
      const plaintext = decryptMessage(session, ciphertext);
      await persistSession(peerUserId, session);
      return plaintext;
    } catch (error) {
      if (wire.t === 'prekey') {
        console.warn('Rebuilding Signal session from inbound PreKey', peerUserId, error);
        await resetSessionWithPeer(peerUserId);
      } else {
        console.warn('Dropping stale Signal session after decrypt failure', peerUserId, error);
        await resetSessionWithPeer(peerUserId);
        throw error;
      }
    }
  }

  return establishInboundPreKeySession(peerUserId, local, wire, ciphertext);
}

export async function resetSessionWithPeer(peerUserId: number): Promise<void> {
  await signalRepository.deleteSession(peerUserId);
  await signalRepository.clearTrustedIdentity(peerUserId);
}

export { computeSafetyNumber, formatSafetyNumber } from './safety-number';
