import type { AuthAdmin, AuthUser } from "@et/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseAdminApi = Pick<
  SupabaseClient["auth"]["admin"],
  "createUser" | "deleteUser" | "updateUserById" | "generateLink" | "listUsers"
>;

export interface SupabaseAuthAdminOptions {
  recoveryRedirectTo?: string | undefined;
}

const BAN_FOREVER = "876000h";
const PAGE_SIZE = 200;
const MAX_PAGES = 25;

export class AuthProviderError extends Error {
  constructor() {
    super("Auth provider request failed");
    this.name = "AuthProviderError";
  }
}

function unwrap<T extends { data: unknown; error: unknown }>(result: T): T["data"] {
  if (result.error) throw new AuthProviderError();
  return result.data;
}

export class SupabaseAuthAdmin implements AuthAdmin {
  constructor(
    private readonly api: SupabaseAdminApi,
    private readonly options: SupabaseAuthAdminOptions = {},
  ) {}

  async createUser(email: string, password: string): Promise<{ id: string }> {
    const { user } = unwrap(await this.api.createUser({ email, password, email_confirm: true }));
    if (!user) throw new AuthProviderError();
    return { id: user.id };
  }

  async deleteUser(id: string): Promise<void> {
    unwrap(await this.api.deleteUser(id));
  }

  async banUser(id: string, banned: boolean): Promise<void> {
    unwrap(await this.api.updateUserById(id, { ban_duration: banned ? BAN_FOREVER : "none" }));
  }

  async recoveryLink(email: string): Promise<string> {
    const { properties } = unwrap(
      await this.api.generateLink({
        type: "recovery",
        email,
        ...(this.options.recoveryRedirectTo
          ? { options: { redirectTo: this.options.recoveryRedirectTo } }
          : {}),
      }),
    );
    if (!properties?.action_link) throw new AuthProviderError();
    return properties.action_link;
  }

  async listUsers(): Promise<AuthUser[]> {
    const out: AuthUser[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { users } = unwrap(await this.api.listUsers({ page, perPage: PAGE_SIZE }));
      for (const u of users) if (u.email) out.push({ id: u.id, email: u.email });
      if (users.length < PAGE_SIZE) break;
    }
    return out;
  }
}

export function createSupabaseAuthAdmin(
  supabaseUrl: string,
  secretKey: string,
  options: SupabaseAuthAdminOptions = {},
): SupabaseAuthAdmin {
  const client = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseAuthAdmin(client.auth.admin, options);
}
