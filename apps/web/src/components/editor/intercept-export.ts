export function interceptExport(href: string, onExport: ((href: string) => void) | undefined) {
  if (!onExport) return undefined;
  return (e: { preventDefault(): void }) => {
    e.preventDefault();
    onExport(href);
  };
}
