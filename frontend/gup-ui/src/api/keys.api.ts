import { apiRequest } from '@/api/client';
import { API_PATHS } from '@/constants/api-paths';

export type SignedPreKeyPublicDto = {
  keyId: number;
  publicKey: string;
  signature: string;
};

export type OneTimePreKeyPublicDto = {
  keyId: number;
  publicKey: string;
};

export type PreKeyBundleDto = {
  userId: number;
  registrationId: number;
  identityKey: string;
  signedPreKey: SignedPreKeyPublicDto;
  oneTimePreKey: OneTimePreKeyPublicDto | null;
};

export type KeyStatusDto = {
  published: boolean;
  registrationId: number | null;
  oneTimePreKeysRemaining: number;
  currentSignedPreKeyId: number | null;
};

export type PublishedIdentityDto = {
  userId: number;
  registrationId: number;
  identityKey: string;
};

export type PublishKeysBody = {
  registrationId: number;
  identityKey: string;
  signedPreKey: SignedPreKeyPublicDto;
  oneTimePreKeys: OneTimePreKeyPublicDto[];
};

export async function publishKeys(body: PublishKeysBody): Promise<void> {
  await apiRequest<void>(API_PATHS.keys.publish, {
    method: 'PUT',
    body,
  });
}

export async function fetchPreKeyBundle(userId: number): Promise<PreKeyBundleDto> {
  return apiRequest<PreKeyBundleDto>(API_PATHS.keys.bundle(userId));
}

export async function replenishOneTimePreKeys(
  oneTimePreKeys: OneTimePreKeyPublicDto[]
): Promise<void> {
  await apiRequest<void>(API_PATHS.keys.onetime, {
    method: 'POST',
    body: { oneTimePreKeys },
  });
}

export async function fetchKeyStatus(): Promise<KeyStatusDto> {
  return apiRequest<KeyStatusDto>(API_PATHS.keys.status);
}

export async function fetchPublishedIdentity(userId: number): Promise<PublishedIdentityDto> {
  return apiRequest<PublishedIdentityDto>(API_PATHS.keys.identity(userId));
}
