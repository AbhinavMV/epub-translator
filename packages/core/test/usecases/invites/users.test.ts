import { describe, expect, it } from "vitest";
import {
  ConflictError,
  deleteUser,
  disableUser,
  enableUser,
  listUsers,
  NotFoundError,
  recoveryLinkFor,
} from "../../../src/index.ts";
import { FakeAuthAdmin, MemoryAppUsers } from "./auth-fakes.ts";

async function setup() {
  const users = new MemoryAppUsers();
  const admin = new FakeAuthAdmin();
  const a = await admin.createUser("admin@x.io", "pw");
  const b = await admin.createUser("reader@x.io", "pw");
  await users.upsert({ id: a.id, role: "admin", disabled: false });
  await users.upsert({ id: b.id, role: "user", disabled: false });
  return { users, admin, adminId: a.id, readerId: b.id };
}

describe("user management", () => {
  it("lists users with their emails", async () => {
    const { users, admin } = await setup();
    const out = await listUsers({ users, admin });
    expect(out.map((u) => [u.email, u.role, u.disabled])).toEqual([
      ["admin@x.io", "admin", false],
      ["reader@x.io", "user", false],
    ]);
  });

  it("disables in both the app table and the auth provider", async () => {
    const { users, admin, adminId, readerId } = await setup();
    await disableUser({ users, admin }, { actorId: adminId, userId: readerId });
    expect(users.rows.get(readerId)?.disabled).toBe(true);
    expect(admin.users.get(readerId)?.banned).toBe(true);
  });

  it("enables again", async () => {
    const { users, admin, adminId, readerId } = await setup();
    await disableUser({ users, admin }, { actorId: adminId, userId: readerId });
    await enableUser({ users, admin }, { actorId: adminId, userId: readerId });
    expect(users.rows.get(readerId)?.disabled).toBe(false);
    expect(admin.users.get(readerId)?.banned).toBe(false);
  });

  it("refuses to act on yourself", async () => {
    const { users, admin, adminId } = await setup();
    await expect(
      disableUser({ users, admin }, { actorId: adminId, userId: adminId }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      deleteUser({ users, admin }, { actorId: adminId, userId: adminId }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects unknown users", async () => {
    const { users, admin, adminId } = await setup();
    await expect(
      disableUser({ users, admin }, { actorId: adminId, userId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deletes from the auth provider and the app table", async () => {
    const { users, admin, adminId, readerId } = await setup();
    await deleteUser({ users, admin }, { actorId: adminId, userId: readerId });
    expect(admin.users.has(readerId)).toBe(false);
    expect(users.rows.has(readerId)).toBe(false);
  });

  it("builds a recovery link for the user's email", async () => {
    const { users, admin, readerId } = await setup();
    const link = await recoveryLinkFor({ users, admin }, readerId);
    expect(link).toContain("reader@x.io");
  });
});
