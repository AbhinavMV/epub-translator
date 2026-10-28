import type { CreateInviteBody } from "@et/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminApi } from "./admin-api";

const INVITES = ["admin", "invites"] as const;
const USERS = ["admin", "users"] as const;

export function useInvites() {
  const api = useAdminApi();
  return useQuery({ queryKey: INVITES, queryFn: () => api.listInvites() });
}

export function useCreateInvite() {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInviteBody) => api.createInvite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES }),
  });
}

export function useRevokeInvite() {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.revokeInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES }),
  });
}

export function useUsers() {
  const api = useAdminApi();
  return useQuery({ queryKey: USERS, queryFn: () => api.listUsers() });
}

export function useSetUserDisabled() {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; disabled: boolean }) => api.setUserDisabled(v.id, v.disabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}

export function useResetLink() {
  const api = useAdminApi();
  return useMutation({ mutationFn: (id: string) => api.resetLink(id) });
}

export function useDeleteUser() {
  const api = useAdminApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
  });
}
