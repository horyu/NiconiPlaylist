import { describe, expect, test } from "bun:test";

import { createAutoSaveQueue } from "./autoSaveQueue";

function createManualScheduler() {
  const callbacks = new Map<number, () => void>();
  let nextHandle = 0;

  return {
    cancelTimeout(handle: unknown) {
      callbacks.delete(handle as number);
    },
    runScheduled() {
      const scheduledCallbacks = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduledCallbacks) {
        callback();
      }
    },
    scheduleTimeout(callback: () => void) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("createAutoSaveQueue", () => {
  test("連続入力は最後の snapshot だけを保存する", async () => {
    const scheduler = createManualScheduler();
    const savedValues: number[] = [];
    let value = 1;
    const queue = createAutoSaveQueue({
      getSnapshot: () => value,
      onError: () => {},
      save: async (snapshot) => {
        savedValues.push(snapshot);
      },
      ...scheduler,
    });

    queue.schedule(100);
    value = 2;
    queue.schedule(100);
    scheduler.runScheduled();
    await queue.flush();

    expect(savedValues).toEqual([2]);
  });

  test("保存中の追加更新を次の保存として直列実行する", async () => {
    const firstSave = createDeferred();
    const savedValues: number[] = [];
    let value = 1;
    const queue = createAutoSaveQueue({
      getSnapshot: () => value,
      onError: () => {},
      save: async (snapshot) => {
        savedValues.push(snapshot);
        if (snapshot === 1) {
          await firstSave.promise;
        }
      },
    });

    queue.schedule(0);
    const flushPromise = queue.flush();
    value = 2;
    queue.schedule(0);
    firstSave.resolve();
    await flushPromise;

    expect(savedValues).toEqual([1, 2]);
  });

  test("blur 相当の即時要求を flush できる", async () => {
    const savedValues: number[] = [];
    const queue = createAutoSaveQueue({
      getSnapshot: () => 3,
      onError: () => {},
      save: async (snapshot) => {
        savedValues.push(snapshot);
      },
    });

    queue.schedule(0);
    await queue.flush();

    expect(savedValues).toEqual([3]);
  });

  test("dispose 時に未保存の snapshot を保存する", async () => {
    const scheduler = createManualScheduler();
    const savedValues: number[] = [];
    const queue = createAutoSaveQueue({
      getSnapshot: () => 4,
      onError: () => {},
      save: async (snapshot) => {
        savedValues.push(snapshot);
      },
      ...scheduler,
    });

    queue.schedule(100);
    await queue.dispose();
    scheduler.runScheduled();

    expect(savedValues).toEqual([4]);
  });
});
