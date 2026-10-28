import { ConflictError, NotFoundError } from "../../domain/errors.ts";
import type { AppRole, AppUserRepository, AuthAdmin } from "../../ports/auth.ts";

export interface UserDeps {
  users: AppUserRepository;
  admin: AuthAdmin;
}

export interface UserAction {
  actorId: string;
  userId: string;
}

export interface ManagedUser {
  id: string;
  email: string | null;
  role: AppRole;
  disabled: boolean;
}

export async function listUsers({ users, admin }: UserDeps): Promise<ManagedUser[]> {
  const [rows, accounts] = await Promise.all([users.list(), admin.listUsers()]);
  const emails = new Map(accounts.map((a) => [a.id, a.email]));
  return rows.map((u) => ({ ...u, email: emails.get(u.id) ?? null }));
}

async function target({ users }: UserDeps, action: UserAction): Promise<void> {
  if (action.actorId === action.userId) throw new ConflictError("You cannot do this to yourself");
  if (!(await users.get(action.userId))) throw new NotFoundError("User", action.userId);
}

async function setDisabled(deps: UserDeps, action: UserAction, disabled: boolean): Promise<void> {
  await target(deps, action);
  await deps.users.setDisabled(action.userId, disabled);
  await deps.admin.banUser(action.userId, disabled);
}

export const disableUser = (deps: UserDeps, action: UserAction) => setDisabled(deps, action, true);

export const enableUser = (deps: UserDeps, action: UserAction) => setDisabled(deps, action, false);

export async function deleteUser(deps: UserDeps, action: UserAction): Promise<void> {
  await target(deps, action);
  await deps.admin.deleteUser(action.userId);
  await deps.users.delete(action.userId);
}

export async function recoveryLinkFor(deps: UserDeps, userId: string): Promise<string> {
  if (!(await deps.users.get(userId))) throw new NotFoundError("User", userId);
  const account = (await deps.admin.listUsers()).find((a) => a.id === userId);
  if (!account) throw new NotFoundError("User", userId);
  return deps.admin.recoveryLink(account.email);
}
