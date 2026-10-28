import { KeyRound, Lock, LockOpen } from "lucide-react";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HOSTED_FALLBACKS } from "@/translate/hosted-api";
import {
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  readConcurrency,
  saveConcurrency,
} from "@/translate/settings";
import { KEYED_PROVIDERS, type KeyedProvider } from "./envelope";
import { type Hosted, useHosted, useVaultSnapshot } from "./hosted-context";
import { VaultError } from "./vault";

const NO_AUTOFILL = {
  autoComplete: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const;

const MIN_PASSPHRASE = 8;

const HINTS: Partial<Record<KeyedProvider, string>> = {
  gemini:
    "In Google AI Studio, restrict this key to the Generative Language API. Google rejects unrestricted keys from browsers.",
};

function messageOf(err: unknown): string {
  if (err instanceof VaultError) return err.message;
  return err instanceof Error ? err.message : "Something went wrong";
}

function UnlockForm({ hosted, onDone }: { hosted: Hosted; onDone: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await hosted.vault.unlock(passphrase);
      setPassphrase("");
      onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 text-sm">
        <span aria-hidden="true">Passphrase</span>
        <Input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          aria-label="Passphrase"
          {...NO_AUTOFILL}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || passphrase === ""}>
        <LockOpen />
        Unlock
      </Button>
    </form>
  );
}

function ProviderRow({ hosted, provider }: { hosted: Hosted; provider: KeyedProvider }) {
  const snapshot = useVaultSnapshot(hosted.vault);
  const saved = snapshot?.keys.find((k) => k.provider === provider);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await hosted.vault.setKey(provider, draft);
      setDraft("");
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const label = HOSTED_FALLBACKS[provider].label;
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {saved ? `saved · ending ${saved.last4}` : "no key"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            aria-label={`${saved ? "Replace" : "Add"} ${label} key`}
          >
            {saved ? "Replace" : "Add key"}
          </Button>
          {saved ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void hosted.vault.forget(provider)}
              aria-label={`Forget ${label} key`}
            >
              Forget
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <Input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste API key"
            aria-label={`${label} API key`}
            {...NO_AUTOFILL}
          />
          {HINTS[provider] ? (
            <p className="text-xs text-muted-foreground">{HINTS[provider]}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="self-start" disabled={draft.trim() === ""}>
            Save key
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function SetupForm({ hosted }: { hosted: Hosted }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm !== "" && confirm !== passphrase;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await hosted.vault.initialize(passphrase);
      setPassphrase("");
      setConfirm("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Choose a passphrase to protect your keys on this device. It is never sent anywhere and
        cannot be recovered; if you forget it you will need to enter your keys again.
      </p>
      <Input
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Passphrase"
        aria-label="New passphrase"
        {...NO_AUTOFILL}
      />
      <Input
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repeat passphrase"
        aria-label="Repeat passphrase"
        {...NO_AUTOFILL}
      />
      {mismatch ? <p className="text-sm text-destructive">The passphrases do not match.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={passphrase.length < MIN_PASSPHRASE || passphrase !== confirm}>
        <Lock />
        Set passphrase
      </Button>
      <p className="text-xs text-muted-foreground">At least {MIN_PASSPHRASE} characters.</p>
    </form>
  );
}

function ConcurrencyField() {
  const [value, setValue] = useState(() => readConcurrency(window.localStorage));
  return (
    <label className="flex items-center gap-2 text-sm">
      Parallel requests
      <select
        className="rounded-md border bg-background px-2 py-1 text-sm"
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          setValue(next);
          saveConcurrency(window.localStorage, next);
        }}
      >
        {Array.from(
          { length: MAX_CONCURRENCY - MIN_CONCURRENCY + 1 },
          (_, i) => i + MIN_CONCURRENCY,
        ).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function KeysBody({ hosted, onDone }: { hosted: Hosted; onDone: () => void }) {
  const snapshot = useVaultSnapshot(hosted.vault);
  if (!snapshot) return null;
  if (snapshot.status === "empty") return <SetupForm hosted={hosted} />;
  if (snapshot.status === "locked") {
    return (
      <div className="flex flex-col gap-3">
        <UnlockForm hosted={hosted} onDone={onDone} />
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-destructive"
          onClick={() => void hosted.vault.reset()}
        >
          Forgot it? Remove all keys from this device
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {KEYED_PROVIDERS.map((p) => (
          <ProviderRow key={p} hosted={hosted} provider={p} />
        ))}
      </ul>
      <ConcurrencyField />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => hosted.vault.lock()}
      >
        <Lock />
        Lock now
      </Button>
    </div>
  );
}

export function KeysDialog() {
  const hosted = useHosted();
  const [open, setOpen] = useState(false);
  const snapshot = useVaultSnapshot(hosted?.vault);
  if (!hosted) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound />
          <span className="hidden sm:inline">AI keys</span>
          {snapshot?.status === "locked" ? <Lock className="size-3 text-muted-foreground" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI keys</DialogTitle>
          <DialogDescription>
            Keys stay on this device, encrypted with your passphrase. They are sent only to the AI
            provider you pick, never to this app's server. They lock after 30 idle minutes.
          </DialogDescription>
        </DialogHeader>
        <KeysBody hosted={hosted} onDone={() => undefined} />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function UnlockDialog() {
  const hosted = useHosted();
  const pending = useSyncExternalStore(
    (listener) => hosted?.unlock.subscribe(listener) ?? (() => {}),
    () => hosted?.unlock.pending ?? false,
  );
  if (!hosted) return null;

  return (
    <Dialog open={pending} onOpenChange={(open) => !open && hosted.unlock.dismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Unlock your AI keys</DialogTitle>
          <DialogDescription>
            Enter your passphrase to use the keys saved on this device.
          </DialogDescription>
        </DialogHeader>
        <UnlockForm hosted={hosted} onDone={() => hosted.unlock.fulfil()} />
      </DialogContent>
    </Dialog>
  );
}
