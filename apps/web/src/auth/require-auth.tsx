import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { mode, status, recovery } = useAuth();
  if (mode === "none") return children;
  if (status === "loading") {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }
  if (recovery) return <Navigate to="/reset" replace />;
  if (status === "signedOut") return <Navigate to="/signin" replace />;
  return children;
}
