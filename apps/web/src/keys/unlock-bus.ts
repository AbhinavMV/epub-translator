export class UnlockBus {
  private waiting: { resolve: () => void; reject: (err: Error) => void }[] = [];
  private readonly listeners = new Set<() => void>();

  get pending(): boolean {
    return this.waiting.length > 0;
  }

  request(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.notify();
    });
  }

  fulfil(): void {
    const waiters = this.waiting;
    this.waiting = [];
    for (const w of waiters) w.resolve();
    this.notify();
  }

  dismiss(): void {
    const waiters = this.waiting;
    this.waiting = [];
    for (const w of waiters) w.reject(new Error("Unlock cancelled"));
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
