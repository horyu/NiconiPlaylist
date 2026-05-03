import { browser } from "wxt/browser";

import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { PlaybackContext, Playlist, PlaylistId, VideoId } from "@/lib/types";

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

function isPlaybackContext(value: unknown): value is PlaybackContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackContext>;

  return (
    typeof candidate.playlistId === "string" &&
    typeof candidate.tabId === "number" &&
    Number.isInteger(candidate.tabId) &&
    typeof candidate.currentIndex === "number" &&
    Number.isInteger(candidate.currentIndex)
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

export async function getStoredPlaybackContexts(): Promise<PlaybackContext[]> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.playbackContexts);
  const value = stored[STORAGE_KEYS.playbackContexts];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPlaybackContext);
}

export async function setStoredPlaybackContexts(
  playbackContexts: PlaybackContext[],
): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.playbackContexts]: playbackContexts,
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

export async function activateStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  const playlists = await getStoredPlaylists();

  if (!playlists.some((playlist) => playlist.id === playlistId)) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  await setLastActivePlaylistId(playlistId);
}

export async function deleteStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  const [playlists, lastActivePlaylistId] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
  ]);
  const nextPlaylists = playlists.filter((playlist) => playlist.id !== playlistId);

  await setStoredPlaylists(nextPlaylists);

  if (lastActivePlaylistId === playlistId) {
    await setLastActivePlaylistId(nextPlaylists[0]?.id ?? null);
  }
}

export async function syncPlaybackContextForVideo(
  tabId: number,
  videoId: VideoId,
): Promise<PlaybackContext | null> {
  const [playlists, lastActivePlaylistId, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
    getStoredPlaybackContexts(),
  ]);

  const activePlaylist = playlists.find((playlist) => playlist.id === lastActivePlaylistId);
  const currentIndex = activePlaylist?.videoIds.findIndex(
    (currentVideoId) => currentVideoId === videoId,
  );

  const nextPlaybackContexts = playbackContexts.filter((context) => context.tabId !== tabId);

  if (!activePlaylist || currentIndex === undefined || currentIndex < 0) {
    await setStoredPlaybackContexts(nextPlaybackContexts);
    return null;
  }

  const playbackContext: PlaybackContext = {
    playlistId: activePlaylist.id,
    tabId,
    currentIndex,
  };

  nextPlaybackContexts.push(playbackContext);
  await setStoredPlaybackContexts(nextPlaybackContexts);

  return playbackContext;
}

export async function resolveNextVideoForPlaybackContext(
  tabId: number,
  videoId: VideoId,
): Promise<{ playbackContext: PlaybackContext | null; nextVideoId: VideoId | null }> {
  const playbackContext = await syncPlaybackContextForVideo(tabId, videoId);

  if (!playbackContext) {
    return {
      playbackContext: null,
      nextVideoId: null,
    };
  }

  const playlists = await getStoredPlaylists();
  const playlist = playlists.find(
    (currentPlaylist) => currentPlaylist.id === playbackContext.playlistId,
  );

  return {
    playbackContext,
    nextVideoId: playlist?.videoIds[playbackContext.currentIndex + 1] ?? null,
  };
}
