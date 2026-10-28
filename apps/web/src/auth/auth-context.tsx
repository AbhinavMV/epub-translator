import { type AuthMode, type Me, MeSchema } from "@et/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthClient, AuthSession } from "./auth-client";
import { authedFetch, clearSessionCookie, type FetchFn, syncSessionCookie } from "./authed-fetch";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthState {
  mode: AuthMode;
  status: AuthStatus;
  session: AuthSession | null;
  me: Me | null;
  error: string | null;
  recovery: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setPassword(password: string): Promise<void>;
}

const LOCAL_STATE: AuthState = {
  mode: "none",
  status: "signedIn",
  session: null,
  me: null,
  error: null,
  recovery: false,
  signIn: async () => {},
  signOut: async () => {},
  setPassword: async () => {},
};

const AuthContext = createContext<AuthState>(LOCAL_STATE);

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

interface ProviderProps {
  client: AuthClient | null;
  fetchFn?: FetchFn;
  children: ReactNode;
}

export function AuthProvider({
  client,
  fetchFn = (...args) => fetch(...args),
  children,
}: ProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(client ? "loading" : "signedIn");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const establishedToken = useRef<string | null>(null);

  const drop = useCallback(
    async (message: string | null) => {
      establishedToken.current = null;
      setSession(null);
      setMe(null);
      setError(message);
      setStatus("signedOut");
      await clearSessionCookie(fetchFn);
    },
    [fetchFn],
  );

  const establish = useCallback(
    async (next: AuthSession | null) => {
      if (!client) return;
      if (!next) {
        await drop(null);
        return;
      }
      if (establishedToken.current === next.accessToken) return;
      establishedToken.current = next.accessToken;
      const res = await authedFetch(client, fetchFn)("/api/me");
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && "error" in body ? String(body.error) : null;
        await client.signOut();
        await drop(message ?? "Could not sign in");
        return;
      }
      const parsed = MeSchema.safeParse(await res.json());
      // Book images authenticate with this cookie; set it before anything renders an <img>.
      await syncSessionCookie(fetchFn, next.accessToken);
      setSession(next);
      setMe(parsed.success ? parsed.data : null);
      setError(null);
      setStatus("signedIn");
    },
    [client, drop, fetchFn],
  );

  useEffect(() => {
    if (!client) return;
    let live = true;
    void client.getSession().then((s) => (live ? establish(s) : undefined));
    const off = client.onChange((event, s) => {
      if (!live) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") void drop(null);
      else if (event === "TOKEN_REFRESHED" && s) void syncSessionCookie(fetchFn, s.accessToken);
      else void establish(s);
    });
    return () => {
      live = false;
      off();
    };
  }, [client, drop, establish, fetchFn]);

  const value = useMemo<AuthState>(() => {
    if (!client) return LOCAL_STATE;
    return {
      mode: "supabase",
      status,
      session,
      me,
      error,
      recovery,
      signIn: async (email, password) => {
        await client.signIn(email, password);
        await establish(await client.getSession());
      },
      signOut: async () => {
        await client.signOut();
        await drop(null);
      },
      setPassword: async (password) => {
        await client.updatePassword(password);
        setRecovery(false);
      },
    };
  }, [client, status, session, me, error, recovery, establish, drop]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
