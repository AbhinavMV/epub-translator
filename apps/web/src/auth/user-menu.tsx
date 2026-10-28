import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "./auth-context";

export function UserMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.mode === "none" || auth.status !== "signedIn") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Account menu">
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          {auth.me?.email ?? "Signed in"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {auth.me?.isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldCheck /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={async () => {
            await auth.signOut();
            await navigate({ to: "/signin", replace: true });
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
