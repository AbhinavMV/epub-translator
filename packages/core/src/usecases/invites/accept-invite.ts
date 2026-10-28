import { AccountCreationError, InviteInvalidError, RateLimitedError } from "../../domain/errors.ts";
import type {
  AppUserRepository,
  AuthAdmin,
  InviteRepository,
  RateLimiter,
} from "../../ports/auth.ts";
import type { Clock, Hasher } from "../../ports/system.ts";
import { hashToken, normalizeEmail } from "./token.ts";

export interface AcceptInviteDeps {
  invites: InviteRepository;
  users: AppUserRepository;
  admin: AuthAdmin;
  hasher: Hasher;
  clock: Clock;
  rateLimiter: RateLimiter;
}

export interface AcceptInviteInput {
  token: string;
  email: string;
  password: string;
  clientKey: string;
}

async function bestEffort(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // The caller is already failing; a cleanup error must not mask it.
  }
}

export async function acceptInvite(
  deps: AcceptInviteDeps,
  input: AcceptInviteInput,
): Promise<{ id: string }> {
  if (!(await deps.rateLimiter.allow(`invite-accept:${input.clientKey}`))) {
    throw new RateLimitedError();
  }
  const email = normalizeEmail(input.email);
  const tokenHash = await hashToken(deps.hasher, input.token);
  const invite = await deps.invites.consume(tokenHash, email, deps.clock.now());
  if (!invite) throw new InviteInvalidError();

  let created: { id: string };
  try {
    created = await deps.admin.createUser(email, input.password);
  } catch {
    await bestEffort(() => deps.invites.release(invite.id));
    throw new AccountCreationError();
  }
  try {
    await deps.users.upsert({ id: created.id, role: "user", disabled: false });
  } catch {
    await bestEffort(() => deps.admin.deleteUser(created.id));
    await bestEffort(() => deps.invites.release(invite.id));
    throw new AccountCreationError();
  }
  return created;
}
