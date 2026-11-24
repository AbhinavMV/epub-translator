import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { useState } from "react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHosted } from "@/keys/hosted-context";
import { KeysDialog } from "@/keys/keys-dialog";
import { type ThemeName, usePrefs } from "@/lib/reader-settings-store";

export const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: "light", label: "Light", swatch: "#fcfcfd" },
  { value: "sepia", label: "Sepia", swatch: "#efe4cf" },
  { value: "dark", label: "Dark", swatch: "#0a0b0d" },
  { value: "system", label: "System", swatch: "linear-gradient(135deg, #fcfcfd 50%, #0a0b0d 50%)" },
];

const ITEM = "min-h-9 coarse:min-h-11";

function SignOutItem() {
  const auth = useAuth();
  const navigate = useNavigate();
  return (
    <DropdownMenuItem
      className={ITEM}
      onSelect={async () => {
        await auth.signOut();
        await navigate({ to: "/signin", replace: true });
      }}
    >
      <LogOut /> Sign out
    </DropdownMenuItem>
  );
}

export function SettingsMenu() {
  const [prefs, setPrefs] = usePrefs();
  const auth = useAuth();
  const hosted = useHosted();
  const [keysOpen, setKeysOpen] = useState(false);
  const signedIn = auth.mode !== "none" && auth.status === "signedIn";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <SlidersHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-64 max-w-(--radix-dropdown-menu-content-available-width)"
        >
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={prefs.theme}
            onValueChange={(theme) => setPrefs({ theme: theme as ThemeName })}
            className="grid grid-cols-4 gap-1.5 px-1 pb-1"
          >
            {THEMES.map((t) => (
              <DropdownMenuPrimitive.RadioItem
                key={t.value}
                value={t.value}
                onSelect={(e) => e.preventDefault()}
                className="flex min-w-0 cursor-default flex-col items-center gap-1.5 rounded-md border px-1 py-2 text-xs outline-hidden select-none focus:bg-accent data-[state=checked]:border-primary data-[state=checked]:ring-1 data-[state=checked]:ring-primary data-[state=checked]:ring-inset"
              >
                <span
                  aria-hidden
                  className="block h-5 w-7 rounded-[5px] border border-foreground/30"
                  style={{ background: t.swatch }}
                />
                {t.label}
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {signedIn || hosted ? <DropdownMenuSeparator /> : null}
          {signedIn && auth.me?.email ? (
            <DropdownMenuLabel className="font-normal break-all text-muted-foreground">
              {auth.me.email}
            </DropdownMenuLabel>
          ) : null}
          {hosted ? (
            <DropdownMenuItem className={ITEM} onSelect={() => setKeysOpen(true)}>
              <KeyRound /> API keys
            </DropdownMenuItem>
          ) : null}
          {signedIn && auth.me?.isAdmin ? (
            <DropdownMenuItem asChild className={ITEM}>
              <Link to="/admin">
                <ShieldCheck /> Admin
              </Link>
            </DropdownMenuItem>
          ) : null}
          {signedIn ? <SignOutItem /> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <KeysDialog open={keysOpen} onOpenChange={setKeysOpen} />
    </>
  );
}
