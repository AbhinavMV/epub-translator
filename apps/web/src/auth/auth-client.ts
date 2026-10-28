import { createClient } from "@supabase/supabase-js";

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
}

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "PASSWORD_RECOVERY";

export class AuthFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFailure";
  }
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  updatePassword(password: string): Promise<void>;
  onChange(listener: (event: AuthEvent, session: AuthSession | null) => void): () => void;
}

interface RawSession {
  access_token: string;
  user: { id: string; email?: string | undefined };
}

function toSession(raw: RawSession | null): AuthSession | null {
  if (!raw?.user.email) return null;
  return { accessToken: raw.access_token, userId: raw.user.id, email: raw.user.email };
}

const KNOWN_EVENTS = new Set<string>([
  "SIGNED_IN",
  "SIGNED_OUT",
  "TOKEN_REFRESHED",
  "PASSWORD_RECOVERY",
]);

export function createSupabaseAuthClient(url: string, publishableKey: string): AuthClient {
  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new AuthFailure("Incorrect email or password");
    },
    async signOut() {
      await supabase.auth.signOut();
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new AuthFailure("Could not update the password");
    },
    onChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (KNOWN_EVENTS.has(event)) listener(event as AuthEvent, toSession(session));
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
