"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  loginApi,
  registerApi,
  refreshTokenApi,
  logoutApi,
  setAccessToken,
  type TokenResponse,
} from "@/app/_libs/healops-api";

interface AuthUser {
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<void>;
  demoLogin: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_TOKEN_KEY = "healops_refresh_token";
const USER_KEY = "healops_user";

// Public routes that don't need auth
const PUBLIC_PATHS = ["/login", "/register", "/pricing", "/unauthorized", "/auth/callback"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    const payload = parts[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const handleTokens = useCallback((tokens: TokenResponse, userInfo?: AuthUser) => {
    setAccessToken(tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);

    // Extract email from JWT if no user info provided
    if (userInfo) {
      setUser(userInfo);
      localStorage.setItem(USER_KEY, JSON.stringify(userInfo));
    } else {
      const payload = parseJwtPayload(tokens.accessToken);
      if (payload?.email) {
        const u: AuthUser = {
          email: payload.email as string,
          firstName: "",
          lastName: "",
        };
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      }
    }
  }, []);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // Try to restore session from refresh token on mount
  useEffect(() => {
    async function restoreSession() {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);

      if (!refreshToken) {
        setLoading(false);
        return;
      }

      try {
        const tokens = await refreshTokenApi(refreshToken);
        handleTokens(tokens);
        if (savedUser) {
          setUser(JSON.parse(savedUser) as AuthUser);
        }
      } catch {
        clearAuth();
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, [handleTokens, clearAuth]);

  // Auto-refresh token before expiry
  useEffect(() => {
    const interval = setInterval(async () => {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return;
      try {
        const tokens = await refreshTokenApi(refreshToken);
        handleTokens(tokens);
      } catch {
        clearAuth();
      }
    }, 13 * 60 * 1000); // Refresh 2 minutes before 15-min expiry

    return () => clearInterval(interval);
  }, [handleTokens, clearAuth]);

  // Redirect unauthenticated users to login (except public paths)
  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPath(pathname)) {
      router.replace("/login");
    }
  }, [user, loading, pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await loginApi(email, password);
      handleTokens(tokens, { email, firstName: "", lastName: "" });
    },
    [handleTokens],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
    ) => {
      const tokens = await registerApi(email, password, firstName, lastName);
      handleTokens(tokens, { email, firstName, lastName });
    },
    [handleTokens],
  );

  const demoLogin = useCallback(() => {
    const demoUser: AuthUser = {
      email: "demo@healops.dev",
      firstName: "Demo",
      lastName: "User",
    };
    // Set a fake token so API calls include Authorization header
    // Backend will reject it, but demo data fallback will kick in
    setAccessToken("demo-token");
    localStorage.setItem(REFRESH_TOKEN_KEY, "demo-refresh");
    localStorage.setItem(USER_KEY, JSON.stringify(demoUser));
    setUser(demoUser);
  }, []);

  const logout = useCallback(() => {
    logoutApi();
    clearAuth();
    router.replace("/login");
  }, [clearAuth, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      loading,
      login,
      register,
      demoLogin,
      logout,
    }),
    [user, loading, login, register, demoLogin, logout],
  );

  // Show nothing while restoring session (avoids flash)
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-brand-cyan border-t-transparent" />
      </div>
    );
  }

  // On public paths, always render (login/register pages need to show)
  // On private paths, only render if authenticated
  if (!user && !isPublicPath(pathname)) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
