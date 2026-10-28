import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { RequireAuth } from "@/auth/require-auth";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApplyTheme } from "@/lib/theme";
import { AdminPage } from "@/routes/admin";
import { BookPage } from "@/routes/book";
import { InvitePage } from "@/routes/invite";
import { LibraryPage } from "@/routes/library";
import { ReaderPage } from "@/routes/reader";
import { ResetPasswordPage } from "@/routes/reset";
import { SignInPage } from "@/routes/signin";

const PUBLIC_PATHS = new Set(["/signin", "/invite", "/reset"]);

function Root() {
  const theme = useApplyTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <TooltipProvider delayDuration={300}>
      {PUBLIC_PATHS.has(pathname) ? (
        <Outlet />
      ) : (
        <RequireAuth>
          <Outlet />
        </RequireAuth>
      )}
      <Toaster theme={theme === "dark" ? "dark" : "light"} position="bottom-right" />
    </TooltipProvider>
  );
}

const rootRoute = createRootRoute({ component: Root });

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  component: SignInPage,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite",
  component: InvitePage,
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset",
  component: ResetPasswordPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});

const bookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/books/$bookId",
  validateSearch: (search: Record<string, unknown>): { chapter?: string } => ({
    chapter: typeof search.chapter === "string" ? search.chapter : undefined,
  }),
  component: BookPage,
});

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/books/$bookId/read/$chapterId",
  validateSearch: (search: Record<string, unknown>): { job?: string } => ({
    job: typeof search.job === "string" ? search.job : undefined,
  }),
  component: ReaderPage,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  inviteRoute,
  resetRoute,
  libraryRoute,
  bookRoute,
  readerRoute,
  adminRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
