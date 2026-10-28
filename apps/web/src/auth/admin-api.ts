import {
  ApiErrorSchema,
  type CreatedInvite,
  CreatedInviteSchema,
  type CreateInviteBody,
  type InviteSummary,
  InviteSummarySchema,
  RecoveryLinkSchema,
  type UserSummary,
  UserSummarySchema,
} from "@et/contracts";
import { createContext, useContext } from "react";
import { ApiRequestError } from "@/api/client";
import type { FetchFn } from "./authed-fetch";

export interface AdminApi {
  listInvites(): Promise<InviteSummary[]>;
  createInvite(body: CreateInviteBody): Promise<CreatedInvite>;
  revokeInvite(id: string): Promise<void>;
  listUsers(): Promise<UserSummary[]>;
  setUserDisabled(id: string, disabled: boolean): Promise<void>;
  resetLink(id: string): Promise<string>;
  deleteUser(id: string): Promise<void>;
  acceptInvite(body: { token: string; email: string; password: string }): Promise<void>;
}

export function createHttpAdminApi(fetchFn: FetchFn = (...args) => fetch(...args)): AdminApi {
  async function call(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchFn(`/api${path}`, init);
    } catch {
      throw new ApiRequestError("Cannot reach the API server", 0);
    }
    if (!res.ok) {
      const body = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      throw new ApiRequestError(
        body.success ? body.data.error : `Request failed (${res.status})`,
        res.status,
      );
    }
    return res;
  }
  const post = (path: string, body?: unknown) =>
    call(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const enc = encodeURIComponent;

  return {
    async listInvites() {
      const data: unknown = await (await call("/admin/invites")).json();
      return InviteSummarySchema.array().parse(data);
    },
    async createInvite(body) {
      return CreatedInviteSchema.parse(await (await post("/admin/invites", body)).json());
    },
    async revokeInvite(id) {
      await call(`/admin/invites/${enc(id)}`, { method: "DELETE" });
    },
    async listUsers() {
      const data: unknown = await (await call("/admin/users")).json();
      return UserSummarySchema.array().parse(data);
    },
    async setUserDisabled(id, disabled) {
      await post(`/admin/users/${enc(id)}/${disabled ? "disable" : "enable"}`);
    },
    async resetLink(id) {
      const res = await post(`/admin/users/${enc(id)}/reset-link`);
      return RecoveryLinkSchema.parse(await res.json()).link;
    },
    async deleteUser(id) {
      await call(`/admin/users/${enc(id)}`, { method: "DELETE" });
    },
    async acceptInvite(body) {
      await post("/invites/accept", body);
    },
  };
}

const AdminApiContext = createContext<AdminApi | null>(null);

export const AdminApiProvider = AdminApiContext.Provider;

export function useAdminApi(): AdminApi {
  const api = useContext(AdminApiContext);
  if (!api) throw new Error("AdminApiProvider is missing");
  return api;
}
