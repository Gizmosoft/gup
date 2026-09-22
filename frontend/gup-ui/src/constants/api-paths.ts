export const API_PATHS = {
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
  },
  users: {
    me: '/api/users/me',
    search: '/api/users/search',
  },
  conversations: {
    list: '/api/conversations',
    presence: (conversationId: number) =>
      `/api/conversations/${conversationId}/participants/presence`,
  },
  inbox: {
    pending: '/api/inbox/pending',
  },
  keys: {
    publish: '/api/keys',
    bundle: (userId: number) => `/api/keys/bundle/${userId}`,
    signedPreKey: '/api/keys/signed-prekey',
    onetime: '/api/keys/onetime',
    status: '/api/keys/status',
    identity: (userId: number) => `/api/keys/identity/${userId}`,
  },
  attachments: {
    intent: '/api/attachments/intent',
    downloadUrl: (attachmentId: string) => `/api/attachments/${attachmentId}/download-url`,
  },
} as const;

export const API_LIMITS = {
  searchDefault: 20,
  searchMax: 100,
} as const;
