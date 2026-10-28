import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadDropzone } from "@/components/upload-dropzone";

const epub = new File(["x"], "book.epub", { type: "application/epub+zip" });
const txt = new File(["x"], "notes.txt", { type: "text/plain" });

describe("UploadDropzone", () => {
  it("dropzone rejects non-epub files", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    await userEvent.setup({ applyAccept: false }).upload(screen.getByTestId("epub-input"), txt);
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/\.epub/i);
  });

  it("rejects non-epub drops", () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [txt] } });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("accepts an epub drop", () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [epub] } });
    expect(onUpload).toHaveBeenCalledWith(epub);
  });

  it("rejects a file above the size limit", () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} maxBytes={0} />);
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [epub] } });
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than/i);
  });

  it("describes where hosted books live", () => {
    render(<UploadDropzone onUpload={() => {}} hosted />);
    expect(screen.getByText(/stored privately/i)).toBeInTheDocument();
  });
});
