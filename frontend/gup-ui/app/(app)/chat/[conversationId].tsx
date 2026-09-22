import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ListRenderItem,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ChatInput } from '@/features/chat/components/ChatInput';
import { ChatErrorBoundary } from '@/features/chat/components/ChatErrorBoundary';
import { MessageBubble } from '@/features/chat/components/MessageBubble';
import { useChatConnection } from '@/features/chat/hooks/useChatConnection';
import { useChatSubscription } from '@/features/chat/hooks/useChatSubscription';
import { flattenMessages, useMessages } from '@/features/chat/hooks/useMessages';
import { sendMessageSchema } from '@/features/chat/schemas';
import { useConversations } from '@/features/conversations/hooks/useConversations';
import { useAuth } from '@/providers/AuthProvider';
import { useChatDrafts } from '@/providers/ChatDraftProvider';
import { chatClient } from '@/websocket/chat.client';
import { sendOutboundMessage, type OutboundAttachment } from '@/websocket/message-sync';
import type { MessageResponse } from '@/types/message';
import { useQueryClient } from '@tanstack/react-query';

/** Chat route (/chat/:conversationId). Message history + real-time send/receive. */
export default function ChatScreen() {
  const { conversationId: rawConversationId } = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = Number(rawConversationId);
  const insets = useSafeAreaInsets();
  const [composerHeight, setComposerHeight] = useState(72);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: conversations } = useConversations();
  const { getDraftText, setDraftText, getOtherUser, clearDraft, registerConversation } =
    useChatDrafts();
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMessages(conversationId);
  const [chatError, setChatError] = useState<string | null>(null);
  const { isConnected, statusMessage } = useChatConnection();
  const listRef = useRef<FlatList<MessageResponse>>(null);
  const previousMessageCountRef = useRef(0);

  useChatSubscription(conversationId);

  useEffect(() => {
    chatClient.setErrorHandler((message) => setChatError(message));
    return () => chatClient.setErrorHandler(null);
  }, []);

  const conversation = conversations?.find((item) => item.conversationId === conversationId);
  const otherUser = conversation?.otherUser ?? getOtherUser(conversationId);
  const headerTitle = otherUser?.displayName ?? otherUser?.username ?? 'Chat';
  const draftText = getDraftText(conversationId);

  useEffect(() => {
    if (conversation) {
      registerConversation(conversation);
    }
  }, [conversation, registerConversation]);

  const handleDraftChange = useCallback(
    (text: string) => {
      if (!otherUser) {
        return;
      }
      setDraftText(conversationId, otherUser, text);
    },
    [conversationId, otherUser, setDraftText]
  );

  const handleSend = useCallback(
    async (content: string, attachment?: OutboundAttachment) => {
      const parsed = sendMessageSchema.safeParse({
        content,
        hasAttachment: attachment != null,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid message');
      }

      if (!user) {
        return;
      }

      setChatError(null);
      try {
        await sendOutboundMessage(
          queryClient,
          conversationId,
          user.id,
          parsed.data.content,
          attachment
        );
        clearDraft(conversationId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setChatError(message);
        throw err;
      }
    },
    [conversationId, clearDraft, queryClient, user]
  );

  const messages = useMemo(() => flattenMessages(data?.pages), [data?.pages]);

  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Keep the viewport pinned to the latest message when new ones arrive.
  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    if (messages.length > previousCount && previousCount > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleLoadOlder = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  const renderMessage: ListRenderItem<MessageResponse> = ({ item }) => (
    <MessageBubble
      message={item}
      isOwnMessage={item.senderId === user?.id}
      senderId={user?.id}
    />
  );

  const onComposerLayout = useCallback((event: LayoutChangeEvent) => {
    setComposerHeight(event.nativeEvent.layout.height);
  }, []);

  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState message="Invalid conversation" />
      </SafeAreaView>
    );
  }

  return (
    <ChatErrorBoundary>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/' as Href);
            }
          }}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {chatError ? <Text style={styles.bannerError}>{chatError}</Text> : null}

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {isLoading ? (
          <LoadingState message="Loading messages…" />
        ) : isError ? (
          <ErrorState
            message={error?.message ?? 'Failed to load messages'}
            onRetry={() => refetch()}
          />
        ) : (
          <FlatList
            ref={listRef}
            style={styles.messageList}
            data={displayMessages}
            inverted
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMessage}
            onEndReached={handleLoadOlder}
            onEndReachedThreshold={0.2}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
              autoscrollToTopThreshold: 24,
            }}
            contentContainerStyle={
              displayMessages.length === 0
                ? styles.emptyMessages
                : { paddingTop: composerHeight }
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.loaderFooter}>
                  <ActivityIndicator color="#1A1B3A" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.invertedEmpty}>
                <EmptyState
                  title="No messages yet"
                  subtitle="Say hello to start the conversation"
                />
              </View>
            }
          />
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          <ChatInput
            value={draftText}
            onChangeText={handleDraftChange}
            onSend={handleSend}
            sendDisabled={!isConnected}
            hint={isConnected ? null : statusMessage ?? 'Connecting to chat…'}
            onLayout={onComposerLayout}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ChatErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 60,
  },
  backText: {
    color: '#1A1B3A',
    fontWeight: '600',
    fontSize: 16,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B3A',
  },
  headerSpacer: {
    width: 60,
  },
  bannerError: {
    backgroundColor: '#fdecea',
    color: '#c62828',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 13,
  },
  loaderFooter: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyMessages: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  invertedEmpty: {
    transform: [{ scaleY: -1 }],
  },
});
