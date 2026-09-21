import { deleteSecureItem, getSecureItem, setSecureItem } from '@/lib/secure-storage';

import type { UserPublicResponse } from '@/types/user';

const DRAFTS_KEY = 'gup.chat.drafts';

export type StoredChatDraft = {
	conversationId: number;
	otherUser: UserPublicResponse;
	draftText: string;
};

export async function loadStoredDrafts(): Promise<StoredChatDraft[]> {
	const raw = await getSecureItem(DRAFTS_KEY);
	if (!raw) {
		return [];
	}

	try {
		const parsed = JSON.parse(raw) as StoredChatDraft[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

export async function saveStoredDrafts(drafts: StoredChatDraft[]): Promise<void> {
	if (drafts.length === 0) {
		await deleteSecureItem(DRAFTS_KEY);
		return;
	}

	await setSecureItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export async function clearStoredDrafts(): Promise<void> {
	await deleteSecureItem(DRAFTS_KEY);
}
