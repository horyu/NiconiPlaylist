import type { PlaylistId, VideoId } from "@/lib/types";

type PlaybackEndNavigationOverride = {
  nextIndex: number;
  nextVideoId: VideoId;
  playlistId: PlaylistId;
};

const overrideByTabId = new Map<number, PlaybackEndNavigationOverride>();

export function clearPlaybackEndNavigationOverride(tabId: number): void {
  overrideByTabId.delete(tabId);
}

export function consumePlaybackEndNavigationOverride(
  tabId: number,
): PlaybackEndNavigationOverride | null {
  const override = overrideByTabId.get(tabId) ?? null;

  if (override) {
    overrideByTabId.delete(tabId);
  }

  return override;
}

export function getPlaybackEndNavigationOverride(
  tabId: number,
): PlaybackEndNavigationOverride | null {
  return overrideByTabId.get(tabId) ?? null;
}

export function getPlaybackEndNavigationOverrides(): ReadonlyMap<
  number,
  PlaybackEndNavigationOverride
> {
  return overrideByTabId;
}

export function setPlaybackEndNavigationOverride(
  tabId: number,
  playlistId: PlaylistId,
  nextIndex: number,
  nextVideoId: VideoId,
): void {
  overrideByTabId.set(tabId, {
    nextIndex,
    nextVideoId,
    playlistId,
  });
}
