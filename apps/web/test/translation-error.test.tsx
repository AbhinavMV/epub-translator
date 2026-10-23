import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranslationError } from "@/components/editor/translation-error";

describe("TranslationError", () => {
  it("renders nothing without an error", () => {
    const { container } = render(<TranslationError chapterError={null} jobError={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the chapter error", () => {
    render(<TranslationError chapterError="Gave up after 6 attempts: HTTP 529" jobError={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Gave up after 6 attempts: HTTP 529");
  });

  it("explains how to fix an authentication failure", () => {
    render(
      <TranslationError
        chapterError={null}
        jobError="HTTP 401: authentication failed — check the provider API key in apps/api/.env"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/restart the app/i);
  });
});
