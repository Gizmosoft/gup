import { listConversations } from '@/api/conversations.api';
import { listPendingInbox } from '@/api/inbox.api';
import { decryptFromPeer, ensureKeysPublished } from '@/crypto';
import { reconcileLocalStateForUser } from '@/lib/clear-local-state';
import * as conversationRepository from '@/db/repositories/conversation.repository';
import * as messageRepository from '@/db/repositories/message.repository';
import { syncConversationsFromServer } from '@/db/sync/conversation-sync';
import { queueDeliveryAck } from '@/websocket/message-sync';
import type { AttachmentSummary, ChatMessageBroadcast, EncryptionType } from '@/types/message';
import { envelopeToMessage } from '@/types/message';

function pendingToBroadcast(pending: {
  id: string;
  conversationId: number;
  senderId: number;
  content: string;
  sentAt: string;
  serverReceivedAt: string | null;
  type: ChatMessageBroadcast['type'];
  encryption?: EncryptionType;
  attachment?: ChatMessageBroadcast['attachment'];
}): ChatMessageBroadcast {
  return {
    id: pending.id,
    conversationId: pending.conversationId,
    senderId: pending.senderId,
    content: pending.content,
    sentAt: pending.sentAt,
    serverReceivedAt: pending.serverReceivedAt,
    type: pending.type,
    encryption: pending.encryption ?? 'NONE',
    attachment: pending.attachment ?? null,
  };
}

/** Upserts conversation metadata from the server (covers new threads started elsewhere). */
export async function resyncConversationsFromServer(): Promise<void> {
  const conversations = await listConversations();
  await syncConversationsFromServer(conversations);
}

/** Fetches pending outbox rows for the authenticated user and persists them locally. */
export async function resyncPendingInbox(recipientUserId: number): Promise<void> {
  const pending = await listPendingInbox();
  const ackedAt = new Date().toISOString();

  for (const item of pending) {
    const broadcast = pendingToBroadcast(item);
    let plaintext = broadcast.content;
    if ((broadcast.encryption ?? 'NONE') === 'SIGNAL_V1') {
      try {
        plaintext = await decryptFromPeer(broadcast.senderId, broadcast.content);
      } catch (error) {
        console.warn('Failed to decrypt pending inbox message', broadcast.id, error);
        plaintext = '[Unable to decrypt message]';
      }
    }

    await messageRepository.insertMessage(
      envelopeToMessage(
        { ...broadcast, content: plaintext, encryption: 'NONE', attachment: broadcast.attachment },
        'SENT'
      )
    );
    await conversationRepository.updateLastMessage(
      String(broadcast.conversationId),
      previewForPendingMessage(plaintext, broadcast.attachment),
      broadcast.sentAt
    );
    queueDeliveryAck({
      messageId: broadcast.id,
      conversationId: broadcast.conversationId,
      recipientId: recipientUserId,
      ackedAt,
    });
  }
}

/** Seeds SQLite from the server after login or session restore. */
export async function bootstrapLocalStore(recipientUserId: number): Promise<void> {
  await reconcileLocalStateForUser(recipientUserId);
  await resyncConversationsFromServer();
  // Identity must exist before decrypting SIGNAL_V1 pending rows.
  await ensureKeysPublished(recipientUserId);
  await resyncPendingInbox(recipientUserId);
}

function previewForPendingMessage(
  content: string,
  attachment?: AttachmentSummary | null
): string {
  if (content.trim()) {
    return content;
  }
  if (!attachment) {
    return '';
  }
  if (attachment.mimeType.startsWith('image/')) {
    return '📷 Photo';
  }
  if (attachment.mimeType.startsWith('video/')) {
    return '🎬 Video';
  }
  if (attachment.mimeType.startsWith('audio/')) {
    return '🎵 Audio';
  }
  return '📎 Attachment';
}
