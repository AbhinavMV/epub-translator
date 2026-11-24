import { DEFAULT_INVITE_HOURS, type InviteSummary, type UserSummary } from "@et/contracts";
import { Copy } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
  useCreateInvite,
  useDeleteUser,
  useInvites,
  useResetLink,
  useRevokeInvite,
  useSetUserDisabled,
  useUsers,
} from "@/auth/admin-queries";
import { useAuth } from "@/auth/auth-context";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function inviteLink(origin: string, token: string): string {
  return `${origin}/invite#t=${token}`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy; select the text instead");
  }
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

const INVITE_COLUMNS = "sm:grid-cols-[minmax(0,2fr)_auto_minmax(0,1.5fr)_auto]";
const USER_COLUMNS = "sm:grid-cols-[minmax(0,2fr)_auto_auto_auto]";

function RowList({
  labelledBy,
  columns,
  headers,
  empty,
  children,
}: {
  labelledBy: string;
  columns: string;
  headers: readonly string[];
  empty: string | null;
  children: ReactNode;
}) {
  if (empty) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul aria-labelledby={labelledBy} className={cn("grid grid-cols-[minmax(0,1fr)]", columns)}>
      <li
        aria-hidden="true"
        className="hidden border-b pb-2 text-xs font-medium text-muted-foreground sm:col-span-full sm:grid sm:grid-cols-subgrid sm:gap-x-4"
      >
        {headers.map((header, i) => (
          <span key={header} className={i === headers.length - 1 ? "text-right" : undefined}>
            {header}
          </span>
        ))}
      </li>
      {children}
    </ul>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b py-3 last:border-b-0 sm:col-span-full sm:grid sm:grid-cols-subgrid sm:items-center sm:gap-x-4 sm:py-2">
      {children}
    </li>
  );
}

function Who({ children }: { children: ReactNode }) {
  return (
    <p className="min-w-0 basis-full text-sm font-medium [overflow-wrap:anywhere] sm:basis-auto">
      {children}
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="-ml-3 flex basis-full flex-wrap gap-1 sm:ml-0 sm:basis-auto sm:justify-end">
      {children}
    </div>
  );
}

function LinkDialog({
  title,
  description,
  link,
  onClose,
}: {
  title: string;
  description: string;
  link: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input readOnly value={link ?? ""} aria-label="Link" onFocus={(e) => e.target.select()} />
        <DialogFooter>
          <Button variant="outline" onClick={() => link && void copy(link)}>
            <Copy /> Copy link
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvitesSection() {
  const invites = useInvites();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState(String(DEFAULT_INVITE_HOURS));
  const [link, setLink] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const created = await create.mutateAsync({
      ...(email.trim() ? { email: email.trim() } : {}),
      expiresInHours: Number(hours),
    });
    setLink(inviteLink(window.location.origin, created.token));
    setEmail("");
  };

  return (
    <section aria-labelledby="invites-heading" className="flex flex-col gap-4">
      <SectionTitle id="invites-heading">Invites</SectionTitle>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email (optional)
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anyone with the link"
          />
        </div>
        <div className="flex min-w-0 flex-[0_1_9rem] flex-col gap-1.5">
          <label htmlFor="invite-hours" className="text-sm font-medium">
            Expires in (hours)
          </label>
          <Input
            id="invite-hours"
            type="number"
            min={1}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Create invite
        </Button>
      </form>

      <RowList
        labelledBy="invites-heading"
        columns={INVITE_COLUMNS}
        headers={["For", "Status", "Expires", "Actions"]}
        empty={invites.data?.length === 0 ? "No invites yet." : null}
      >
        {(invites.data ?? []).map((invite: InviteSummary) => (
          <Row key={invite.id}>
            <Who>{invite.email ?? "Anyone with the link"}</Who>
            <div>
              <Badge variant={invite.status === "pending" ? "default" : "secondary"}>
                {invite.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground sm:text-foreground">
              <span className="sm:sr-only">Expires </span>
              {new Date(invite.expiresAt).toLocaleString()}
            </p>
            <Actions>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Revoke invite for ${invite.email ?? "anyone"}`}
                onClick={() => revoke.mutate(invite.id)}
              >
                Revoke
              </Button>
            </Actions>
          </Row>
        ))}
      </RowList>

      <LinkDialog
        title="Invite link"
        description="Copy this link now. It is shown only once and cannot be recovered."
        link={link}
        onClose={() => setLink(null)}
      />
    </section>
  );
}

function UsersSection({ selfId }: { selfId: string | null }) {
  const users = useUsers();
  const setDisabled = useSetUserDisabled();
  const resetLink = useResetLink();
  const remove = useDeleteUser();
  const [link, setLink] = useState<string | null>(null);
  const [target, setTarget] = useState<UserSummary | null>(null);

  const onReset = async (user: UserSummary) => {
    setLink(await resetLink.mutateAsync(user.id));
  };

  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-4">
      <SectionTitle id="users-heading">Users</SectionTitle>
      <RowList
        labelledBy="users-heading"
        columns={USER_COLUMNS}
        headers={["Email", "Role", "Status", "Actions"]}
        empty={null}
      >
        {(users.data ?? []).map((user) => {
          const label = user.email ?? user.id;
          return (
            <Row key={user.id}>
              <Who>{label}</Who>
              <p className="text-sm text-muted-foreground sm:text-foreground">{user.role}</p>
              <div>
                <Badge variant={user.disabled ? "destructive" : "secondary"}>
                  {user.disabled ? "disabled" : "active"}
                </Badge>
              </div>
              <Actions>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Reset link for ${label}`}
                  onClick={() => void onReset(user)}
                >
                  Reset link
                </Button>
                {user.id !== selfId && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`${user.disabled ? "Enable" : "Disable"} ${label}`}
                      onClick={() => setDisabled.mutate({ id: user.id, disabled: !user.disabled })}
                    >
                      {user.disabled ? "Enable" : "Disable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${label}`}
                      onClick={() => setTarget(user)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </Actions>
            </Row>
          );
        })}
      </RowList>

      <LinkDialog
        title="Password reset link"
        description="Send this link to the user. It signs them in so they can choose a new password."
        link={link}
        onClose={() => setLink(null)}
      />

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {target?.email ?? "this user"}?</DialogTitle>
            <DialogDescription>
              This removes the account and everything they uploaded or translated. It cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (target) await remove.mutateAsync(target.id);
                setTarget(null);
              }}
            >
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function AdminPage() {
  const auth = useAuth();
  const allowed = auth.mode === "supabase" && auth.me?.isAdmin === true;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader crumbs={[{ kind: "library" }, { kind: "current", label: "Admin" }]} />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
        <h1 className="font-serif text-xl font-semibold">Admin</h1>
        {allowed ? (
          <>
            <InvitesSection />
            <UsersSection selfId={auth.me?.id ?? null} />
          </>
        ) : (
          <p role="alert" className="text-sm text-muted-foreground">
            {auth.mode === "none"
              ? "Administration is only available on the hosted app."
              : "You do not have access to this page."}
          </p>
        )}
      </main>
    </div>
  );
}
