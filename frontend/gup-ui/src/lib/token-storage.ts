import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/secure-storage';

const AUTH_TOKEN_KEY = 'gup.auth.token';

/** Read the persisted JWT, or null if logged out / first launch. */
export async function getAuthToken(): Promise<string | null> {
	return getSecureItem(AUTH_TOKEN_KEY);
}

/** Persist the JWT after register or login. */
export async function setAuthToken(token: string): Promise<void> {
	await setSecureItem(AUTH_TOKEN_KEY, token);
}

/** Remove the JWT on logout or after a 401. */
export async function clearAuthToken(): Promise<void> {
	await deleteSecureItem(AUTH_TOKEN_KEY);
}
