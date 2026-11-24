import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLeaveNotice } from "@/components/editor/use-leave-notice";

const toastMessage = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { message: toastMessage } }));

function setup(message: string | null) {
  const root = createRootRoute({ component: Outlet });
  const book = createRoute({
    getParentRoute: () => root,
    path: "/books/$bookId",
    validateSearch: (s: Record<string, unknown>) => ({ chapter: s.chapter as string | undefined }),
    component: function Editor() {
      useLeaveNotice(message);
      return <p>editor</p>;
    },
  });
  const library = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <p>library</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([book, library]),
    history: createMemoryHistory({ initialEntries: ["/books/b1?chapter=c1"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("useLeaveNotice", () => {
  beforeEach(() => toastMessage.mockClear());

  it("says translation continues when you leave the editor mid-chapter", async () => {
    const router = setup("Chapter 1 keeps translating in the background");
    await screen.findByText("editor");
    await act(() => router.navigate({ to: "/" }));
    await screen.findByText("library");
    expect(toastMessage).toHaveBeenCalledWith("Chapter 1 keeps translating in the background");
  });

  it("stays quiet when switching chapters", async () => {
    const router = setup("Chapter 1 keeps translating in the background");
    await screen.findByText("editor");
    await act(() =>
      router.navigate({
        to: "/books/$bookId",
        params: { bookId: "b1" },
        search: { chapter: "c2" },
      }),
    );
    expect(toastMessage).not.toHaveBeenCalled();
  });

  it("stays quiet when nothing is translating", async () => {
    const router = setup(null);
    await screen.findByText("editor");
    await act(() => router.navigate({ to: "/" }));
    await screen.findByText("library");
    expect(toastMessage).not.toHaveBeenCalled();
  });
});
