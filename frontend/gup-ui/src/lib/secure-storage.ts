import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Platform storage for secrets.
 *
 * Native: expo-secure-store (Keychain / Keystore).
 * Web: localStorage — browsers have no equivalent secure enclave; fine for local web
 * debugging, not as strong as native secure storage.
 */
export async function getSecureItem(key: string): Promise<string | null> {
	if (Platform.OS === 'web') {
		return localStorage.getItem(key);
	}
	return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
	if (Platform.OS === 'web') {
		localStorage.setItem(key, value);
		return;
	}
	await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
	if (Platform.OS === 'web') {
		localStorage.removeItem(key);
		return;
	}
	await SecureStore.deleteItemAsync(key);
}
