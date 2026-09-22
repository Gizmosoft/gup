import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { login as loginApi, register as registerApi } from '@/api/auth.api';
import { setTokenGetter, setUnauthorizedHandler } from '@/api/client';
import { getCurrentUser } from '@/api/users.api';
import { bootstrapLocalStore } from '@/db/sync/bootstrap';
import { clearAllLocalClientState } from '@/lib/clear-local-state';
import { getAuthToken, setAuthToken } from '@/lib/token-storage';
import { useDatabaseContext } from '@/providers/DatabaseProvider';
import { queryClient } from '@/providers/QueryProvider';
import type { LoginRequest, RegisterRequest } from '@/types';
import type { UserResponse } from '@/types/user';
import { chatClient } from '@/websocket/chat.client';
import { flushDeliveryAcks } from '@/websocket/message-sync';

type AuthContextValue = {
  user: UserResponse | null;
  token: string | null;
  isLoading: boolean;
  isStoreReady: boolean;
  isAuthenticated: boolean;
  login: (request: LoginRequest) => Promise<void>;
  register: (request: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isReady: isDatabaseReady } = useDatabaseContext();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStoreReady, setIsStoreReady] = useState(false);
  const tokenRef = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setIsStoreReady(false);
    await clearAllLocalClientState();
  }, []);

  const applySession = useCallback((nextToken: string, nextUser: UserResponse) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const warmLocalStore = useCallback(async (currentUser: UserResponse) => {
    setIsStoreReady(false);
    try {
      await bootstrapLocalStore(currentUser.id);
    } catch (error) {
      console.warn('Failed to bootstrap local store / Signal keys', error);
    }
    flushDeliveryAcks();
    queryClient.invalidateQueries();
    setIsStoreReady(true);
  }, []);

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    try {
      const storedToken = await getAuthToken();
      if (!storedToken) {
        setIsStoreReady(true);
        return;
      }

      tokenRef.current = storedToken;
      setToken(storedToken);

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (isDatabaseReady) {
        await warmLocalStore(currentUser);
      }
    } catch {
      await clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, isDatabaseReady, warmLocalStore]);

  useEffect(() => {
    setTokenGetter(() => tokenRef.current);
    setUnauthorizedHandler(async () => {
      chatClient.disconnect();
      queryClient.clear();
      await clearSession();
    });

    void bootstrap();

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [bootstrap, clearSession]);

  useEffect(() => {
    if (!isDatabaseReady || !user || isStoreReady) {
      return;
    }
    void warmLocalStore(user);
  }, [isDatabaseReady, user, isStoreReady, warmLocalStore]);

  const login = useCallback(
    async (request: LoginRequest) => {
      const response = await loginApi(request);
      await setAuthToken(response.token);
      applySession(response.token, response.user);
      await warmLocalStore(response.user);
    },
    [applySession, warmLocalStore]
  );

  const register = useCallback(
    async (request: RegisterRequest) => {
      const response = await registerApi(request);
      await setAuthToken(response.token);
      applySession(response.token, response.user);
      await warmLocalStore(response.user);
    },
    [applySession, warmLocalStore]
  );

  const logout = useCallback(async () => {
    chatClient.disconnect();
    queryClient.clear();
    await clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isStoreReady,
      isAuthenticated: token !== null && user !== null,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, isStoreReady, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
