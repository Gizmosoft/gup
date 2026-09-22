import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createOrFetchConversation } from '@/api/conversations.api';
import { isApiError } from '@/api/errors';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { queryKeys } from '@/constants/query-keys';
import { VALIDATION } from '@/constants/validation';
import { upsertConversationFromResponse } from '@/db/sync/conversation-sync';
import { useUserSearch } from '@/features/search/hooks/useUserSearch';
import { getInitials } from '@/lib/format';
import { useChatDrafts } from '@/providers/ChatDraftProvider';
import { queryClient } from '@/providers/QueryProvider';
import type { UserPublicResponse } from '@/types/user';

/** Search route (/search). Find users and start a 1:1 conversation. */
export default function SearchScreen() {
  const { registerConversation } = useChatDrafts();
  const [query, setQuery] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [startingUserId, setStartingUserId] = useState<number | null>(null);
  const { data, isLoading, isFetching, isError, error, refetch } = useUserSearch(query);

  const handleSelectUser = async (user: UserPublicResponse) => {
    setApiError(null);
    setStartingUserId(user.id);
    try {
      const conversation = await createOrFetchConversation({ targetUserId: user.id });
      await upsertConversationFromResponse(conversation);
      await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      registerConversation(conversation);
      router.replace(`/chat/${conversation.conversationId}` as Href);
    } catch (err) {
      setApiError(isApiError(err) ? err.message : 'Failed to start conversation');
    } finally {
      setStartingUserId(null);
    }
  };

  const trimmedQuery = query.trim();
  const showLoading = trimmedQuery.length > 0 && (isLoading || isFetching);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/' as Href);
              }
            }}
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Find people</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.searchBox}>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by username..."
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={VALIDATION.username.max}
          />
        </View>

        {apiError ? <Text style={styles.error}>{apiError}</Text> : null}

        {showLoading ? (
          <LoadingState message="Searching…" />
        ) : isError && trimmedQuery.length > 0 ? (
          <ErrorState
            message={error?.message ?? 'Search failed'}
            onRetry={() => refetch()}
          />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const displayName = item.displayName ?? item.username;
              const isStarting = startingUserId === item.id;

              return (
                <Pressable
                  style={styles.resultRow}
                  onPress={() => handleSelectUser(item)}
                  disabled={isStarting}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
                  </View>
                  <View style={styles.resultContent}>
                    <Text style={styles.displayName}>{displayName}</Text>
                    <Text style={styles.username}>@{item.username}</Text>
                  </View>
                  {isStarting ? <ActivityIndicator color="#1A1B3A" /> : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              trimmedQuery.length > 0 ? (
                <EmptyState title="No users found" subtitle="Try a different username" />
              ) : (
                <EmptyState
                  title="Find someone to chat with"
                  subtitle="Type a username to search"
                />
              )
            }
            contentContainerStyle={styles.listContent}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  backText: {
    color: '#1A1B3A',
    fontWeight: '600',
    fontSize: 16,
    width: 60,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1B3A',
  },
  headerSpacer: {
    width: 60,
  },
  searchBox: {
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A1B3A',
    backgroundColor: '#fafafa',
  },
  error: {
    color: '#c62828',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    flexGrow: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1B3A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
  },
  resultContent: {
    flex: 1,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1B3A',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});
