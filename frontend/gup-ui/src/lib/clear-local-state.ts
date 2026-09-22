import { fetchKeyStatus } from '@/api/keys.api';
import {
  clearLocalSignalKeys,
  getIdentityOwnerUserId,
  loadLocalIdentity,
  setIdentityOwnerUserId,
} from '@/crypto/key-storage';
import { wipeLocalDatabase } from '@/db/client';
import { clearStoredDrafts } from '@/lib/draft-storage';
import { clearGupWebStorage } from '@/lib/secure-storage';
import { clearAuthToken } from '@/lib/token-storage';

/**
 * Drops JWT, drafts, Signal secrets, web localStorage, and SQLite rows.
 * Used on voluntary logout and 401/session timeout.
 */
export async function clearAllLocalClientState(): Promise<void> {
  await clearAuthToken();
  await clearStoredDrafts();
  await clearLocalSignalKeys();
  clearGupWebStorage();
  await wipeLocalDatabase();
}

/**
 * Prevents a newly logged-in account from reusing another account's
 * identity keys or ratchet sessions on this device.
 */
export async function reconcileLocalStateForUser(userId: number): Promise<void> {
  const identity = await loadLocalIdentity();
  const owner = await getIdentityOwnerUserId();

  if (owner === userId && identity) {
    return;
  }

  if (owner != null && owner !== userId) {
    await discardLocalCryptoState();
    return;
  }

  if (!identity) {
    await wipeLocalDatabase();
    return;
  }

  const status = await fetchKeyStatus();
  if (status.published && status.registrationId === identity.registrationId) {
    await setIdentityOwnerUserId(userId);
    return;
  }

  await discardLocalCryptoState();
}

async function discardLocalCryptoState(): Promise<void> {
  await clearLocalSignalKeys();
  await wipeLocalDatabase();
}
