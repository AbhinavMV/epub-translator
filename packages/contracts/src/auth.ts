import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 72;
export const DEFAULT_INVITE_HOURS = 72;
export const MAX_INVITE_HOURS = 24 * 30;

export const AuthModeSchema = z.enum(["none", "supabase"]);
export type AuthMode = z.infer<typeof AuthModeSchema>;

export const AppConfigSchema = z.object({
  authMode: AuthModeSchema,
  supabaseUrl: z.string().nullable(),
  supabasePublishableKey: z.string().nullable(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const AppRoleSchema = z.enum(["admin", "user"]);
export type AppRole = z.infer<typeof AppRoleSchema>;

export const MeSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: AppRoleSchema,
  isAdmin: z.boolean(),
});
export type Me = z.infer<typeof MeSchema>;

export const InviteStatusSchema = z.enum(["pending", "used", "expired"]);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const InviteSummarySchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  status: InviteStatusSchema,
});
export type InviteSummary = z.infer<typeof InviteSummarySchema>;

export const CreateInviteBodySchema = z.object({
  email: z.string().trim().email().optional(),
  expiresInHours: z.number().int().min(1).max(MAX_INVITE_HOURS).default(DEFAULT_INVITE_HOURS),
});
export type CreateInviteBody = z.input<typeof CreateInviteBodySchema>;

export const CreatedInviteSchema = z.object({
  invite: InviteSummarySchema,
  token: z.string(),
});
export type CreatedInvite = z.infer<typeof CreatedInviteSchema>;

export const AcceptInviteBodySchema = z.object({
  token: z.string().min(1),
  email: z.string().trim().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});
export type AcceptInviteBody = z.infer<typeof AcceptInviteBodySchema>;

export const UserSummarySchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  role: AppRoleSchema,
  disabled: z.boolean(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const RecoveryLinkSchema = z.object({ link: z.string() });
export type RecoveryLink = z.infer<typeof RecoveryLinkSchema>;
