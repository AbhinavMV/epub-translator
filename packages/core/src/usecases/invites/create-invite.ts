import type { Invite, InviteRepository, RandomSource } from "../../ports/auth.ts";
import type { Clock, Hasher } from "../../ports/system.ts";
import { base64url, hashToken, INVITE_TOKEN_BYTES, normalizeEmail } from "./token.ts";

export interface CreateInviteDeps {
  invites: InviteRepository;
  random: RandomSource;
  hasher: Hasher;
  clock: Clock;
}

export interface CreateInviteInput {
  createdBy: string;
  email?: string | undefined;
  expiresInHours: number;
}

export async function createInvite(
  deps: CreateInviteDeps,
  input: CreateInviteInput,
): Promise<{ invite: Invite; token: string }> {
  const token = base64url(deps.random.bytes(INVITE_TOKEN_BYTES));
  const expiresAt = new Date(deps.clock.now().getTime() + input.expiresInHours * 3_600_000);
  const invite = await deps.invites.create({
    tokenHash: await hashToken(deps.hasher, token),
    email: input.email ? normalizeEmail(input.email) : null,
    createdBy: input.createdBy,
    expiresAt,
  });
  return { invite, token };
}
