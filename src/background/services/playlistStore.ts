import { browser } from "wxt/browser";

import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { Playlist, PlaylistId } from "@/lib/types";

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Playlist>;

  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.videoIds) &&
    candidate.videoIds.every((videoId) => typeof videoId === "string") &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.memo === undefined || typeof candidate.memo === "string")
  );
}

export async function getStoredPlaylists(): Promise<Playlist[]> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.playlists);
  const value = stored[STORAGE_KEYS.playlists];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlaylist);
}

export async function setStoredPlaylists(playlists: Playlist[]): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.playlists]: playlists,
  });
}

export async function getLastActivePlaylistId(): Promise<PlaylistId | null> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.lastActivePlaylistId);
  const value = stored[STORAGE_KEYS.lastActivePlaylistId];

  return typeof value === "string" ? value : null;
}

export async function setLastActivePlaylistId(playlistId: PlaylistId | null): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.lastActivePlaylistId]: playlistId,
  });
}
