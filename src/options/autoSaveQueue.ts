export type AutoSaveQueueOptions<T> = {
  getSnapshot: () => T;
  onError: (error: unknown) => void;
  onSaveStart?: () => void;
  save: (snapshot: T) => Promise<void>;
  cancelTimeout?: (handle: unknown) => void;
  scheduleTimeout?: (callback: () => void, delayMs: number) => unknown;
};

export type AutoSaveQueue = {
  dispose: () => Promise<void>;
  flush: () => Promise<void>;
  schedule: (delayMs: number) => void;
};

export function createAutoSaveQueue<T>(options: AutoSaveQueueOptions<T>): AutoSaveQueue {
  const scheduleTimeout =
    options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelTimeout =
    options.cancelTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let timeoutHandle: unknown = null;
  let requestedVersion = 0;
  let persistedVersion = 0;
  let saveInFlight: Promise<void> | null = null;
  let disposed = false;

  function clearScheduledSave(): void {
    if (timeoutHandle !== null) {
      cancelTimeout(timeoutHandle);
      timeoutHandle = null;
    }
  }

  async function persistLatest(): Promise<void> {
    while (persistedVersion !== requestedVersion) {
      const currentVersion = requestedVersion;
      const snapshot = options.getSnapshot();

      try {
        await options.save(snapshot);
        persistedVersion = currentVersion;
      } catch (error) {
        options.onError(error);
        return;
      }
    }
  }

  async function flush(): Promise<void> {
    clearScheduledSave();

    if (saveInFlight) {
      return saveInFlight;
    }

    if (persistedVersion === requestedVersion) {
      return;
    }

    options.onSaveStart?.();
    saveInFlight = persistLatest().finally(() => {
      saveInFlight = null;
    });
    return saveInFlight;
  }

  function schedule(delayMs: number): void {
    if (disposed) {
      return;
    }

    requestedVersion += 1;
    clearScheduledSave();
    timeoutHandle = scheduleTimeout(() => {
      timeoutHandle = null;
      void flush();
    }, delayMs);
  }

  async function dispose(): Promise<void> {
    disposed = true;
    clearScheduledSave();
    await flush();
  }

  return {
    dispose,
    flush,
    schedule,
  };
}
