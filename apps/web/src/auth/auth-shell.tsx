import type { ReactNode } from "react";
import { AppMark } from "@/components/app-mark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <AppMark />
        <span className="font-serif text-lg font-semibold">EPUB Translator</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
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
