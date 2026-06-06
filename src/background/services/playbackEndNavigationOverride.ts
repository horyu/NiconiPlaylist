import { browser } from "wxt/browser";

import type { PlaylistId, VideoId } from "@/lib/types";

type PlaybackEndNavigationOverride = {
  nextIndex: number;
  nextVideoId: VideoId;
  playlistId: PlaylistId;
};

const STORAGE_KEY = "playbackEndNavigationOverrides";
const overrideByTabId = new Map<number, PlaybackEndNavigationOverride>();

function getOverrideStorage(): typeof browser.storage.session | null {
  const storage = browser.storage?.session;

  if (
    !storage ||
    typeof storage.get !== "function" ||
    typeof storage.set !== "function" ||
    typeof storage.remove !== "function"
  ) {
    return null;
  }

  return storage;
}

function isPlaybackEndNavigationOverride(value: unknown): value is PlaybackEndNavigationOverride {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.playlistId === "string" &&
    typeof candidate.nextVideoId === "string" &&
    typeof candidate.nextIndex === "number" &&
    Number.isInteger(candidate.nextIndex)
  );
}

async function readOverridesMap(): Promise<Map<number, PlaybackEndNavigationOverride>> {
  const storage = getOverrideStorage();

  if (!storage) {
    return new Map(overrideByTabId);
  }

  const stored = await storage.get(STORAGE_KEY);
  const rawOverrides = stored[STORAGE_KEY];

  if (typeof rawOverrides !== "object" || rawOverrides === null) {
    return new Map();
  }

  const nextOverrides = new Map<number, PlaybackEndNavigationOverride>();

  for (const [tabIdText, override] of Object.entries(rawOverrides)) {
    const tabId = Number.parseInt(tabIdText, 10);

    if (!Number.isInteger(tabId) || !isPlaybackEndNavigationOverride(override)) {
      continue;
    }

    nextOverrides.set(tabId, override);
  }

  return nextOverrides;
}

async function writeOverridesMap(
  overrides: ReadonlyMap<number, PlaybackEndNavigationOverride>,
): Promise<void> {
  overrideByTabId.clear();

  for (const [tabId, override] of overrides) {
    overrideByTabId.set(tabId, override);
  }

  const storage = getOverrideStorage();

  if (!storage) {
    return;
  }

  if (overrideByTabId.size === 0) {
    await storage.remove(STORAGE_KEY);
    return;
  }

  await storage.set({
    [STORAGE_KEY]: Object.fromEntries(overrideByTabId),
  });
}

export async function clearPlaybackEndNavigationOverride(tabId: number): Promise<void> {
  const overrides = await readOverridesMap();

  if (!overrides.has(tabId)) {
    return;
  }

  overrides.delete(tabId);
  await writeOverridesMap(overrides);
}

export async function consumePlaybackEndNavigationOverride(
  tabId: number,
): Promise<PlaybackEndNavigationOverride | null> {
  const overrides = await readOverridesMap();
  const override = overrides.get(tabId) ?? null;

  if (!override) {
    return null;
  }

  overrides.delete(tabId);
  await writeOverridesMap(overrides);
  return override;
}

export async function getPlaybackEndNavigationOverride(
  tabId: number,
): Promise<PlaybackEndNavigationOverride | null> {
  const overrides = await readOverridesMap();

  return overrides.get(tabId) ?? null;
}

export async function getPlaybackEndNavigationOverrides(): Promise<
  ReadonlyMap<number, PlaybackEndNavigationOverride>
> {
  return readOverridesMap();
}

export async function setPlaybackEndNavigationOverride(
  tabId: number,
  playlistId: PlaylistId,
  nextIndex: number,
  nextVideoId: VideoId,
): Promise<void> {
  const overrides = await readOverridesMap();

  overrides.set(tabId, {
    nextIndex,
    nextVideoId,
    playlistId,
  });

  await writeOverridesMap(overrides);
}
