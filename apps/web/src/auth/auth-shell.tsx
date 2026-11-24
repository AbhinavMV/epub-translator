import { BookOpenText } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

export function AuthShell({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm min-w-0 flex-col gap-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <BookOpenText className="size-4" />
          </span>
          <span className="font-serif text-lg font-semibold">EPUB Translator</span>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl leading-tight font-medium">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        {footer ? <p className="text-sm text-muted-foreground">{footer}</p> : null}
      </div>
    </main>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function Field({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input id={id} {...props} />
    </div>
  );
}
