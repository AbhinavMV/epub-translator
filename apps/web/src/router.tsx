import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApplyTheme } from "@/lib/theme";
import { BookPage } from "@/routes/book";
import { LibraryPage } from "@/routes/library";
import { ReaderPage } from "@/routes/reader";

function Root() {
  const theme = useApplyTheme();
  return (
    <TooltipProvider delayDuration={300}>
      <Outlet />
      <Toaster theme={theme === "dark" ? "dark" : "light"} position="bottom-right" />
    </TooltipProvider>
  );
}

const rootRoute = createRootRoute({ component: Root });

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

const routeTree = rootRoute.addChildren([libraryRoute, bookRoute, readerRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
