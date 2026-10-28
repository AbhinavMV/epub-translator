import { DEFAULT_INVITE_HOURS, type InviteSummary, type UserSummary } from "@et/contracts";
import { Link } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
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
import { AppMark } from "@/components/app-mark";
import { ThemeToggle } from "@/components/theme-toggle";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <h2 id={id} className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
      {children}
    </h2>
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
        <div className="flex flex-col gap-1.5">
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-hours" className="text-sm font-medium">
            Expires in (hours)
          </label>
          <Input
            id="invite-hours"
            type="number"
            min={1}
            className="w-28"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Create invite
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>For</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(invites.data ?? []).map((invite: InviteSummary) => (
            <TableRow key={invite.id}>
              <TableCell>{invite.email ?? "Anyone with the link"}</TableCell>
              <TableCell>
                <Badge variant={invite.status === "pending" ? "default" : "secondary"}>
                  {invite.status}
                </Badge>
              </TableCell>
              <TableCell>{new Date(invite.expiresAt).toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Revoke invite for ${invite.email ?? "anyone"}`}
                  onClick={() => revoke.mutate(invite.id)}
                >
                  Revoke
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(users.data ?? []).map((user) => {
            const label = user.email ?? user.id;
            return (
              <TableRow key={user.id}>
                <TableCell>{label}</TableCell>
                <TableCell>{user.role}</TableCell>
                <TableCell>
                  <Badge variant={user.disabled ? "destructive" : "secondary"}>
                    {user.disabled ? "disabled" : "active"}
                  </Badge>
                </TableCell>
                <TableCell className="space-x-1 text-right">
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
                        onClick={() =>
                          setDisabled.mutate({ id: user.id, disabled: !user.disabled })
                        }
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
              This removes the account and everything they imported or translated. It cannot be
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
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex items-center gap-3">
        <AppMark />
        <h1 className="min-w-0 flex-1 font-serif text-xl font-semibold">Admin</h1>
        <Link to="/" className="text-sm underline">
          Library
        </Link>
        <ThemeToggle />
      </header>
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
    </div>
  );
}
