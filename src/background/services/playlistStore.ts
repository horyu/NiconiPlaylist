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

function resolvePlaybackIndex(
  playlist: Playlist,
  videoId: VideoId,
  previousPlaybackContext: PlaybackContext | undefined,
): number | null {
  const matchingIndices = playlist.videoIds.reduce<number[]>((indices, currentVideoId, index) => {
    if (currentVideoId === videoId) {
      indices.push(index);
    }

    return indices;
  }, []);

  if (matchingIndices.length === 0) {
    return null;
  }

  if (!previousPlaybackContext || previousPlaybackContext.playlistId !== playlist.id) {
    return matchingIndices[0]!;
  }

  if (playlist.videoIds[previousPlaybackContext.currentIndex] === videoId) {
    return previousPlaybackContext.currentIndex;
  }

  const nextIndex = previousPlaybackContext.currentIndex + 1;

  if (playlist.videoIds[nextIndex] === videoId) {
    return nextIndex;
  }

  return (
    matchingIndices.find((index) => index >= previousPlaybackContext.currentIndex) ??
    matchingIndices[0]!
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
  const [playlists, lastActivePlaylistId, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
    getStoredPlaybackContexts(),
  ]);
  const nextPlaylists = playlists.filter((playlist) => playlist.id !== playlistId);
  const nextPlaybackContexts = playbackContexts.filter(
    (context) => context.playlistId !== playlistId,
  );

  await Promise.all([
    setStoredPlaylists(nextPlaylists),
    setStoredPlaybackContexts(nextPlaybackContexts),
  ]);

  if (lastActivePlaylistId === playlistId) {
    await setLastActivePlaylistId(nextPlaylists[0]?.id ?? null);
  }
}

export async function getStoredPlaybackContextByTabId(
  tabId: number,
): Promise<PlaybackContext | null> {
  const playbackContexts = await getStoredPlaybackContexts();
  return playbackContexts.find((context) => context.tabId === tabId) ?? null;
}

export async function setStoredPlaybackContextIndex(
  tabId: number,
  playlistId: PlaylistId,
  currentIndex: number,
): Promise<PlaybackContext> {
  const [playlists, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getStoredPlaybackContexts(),
  ]);
  const playlist = playlists.find((currentPlaylist) => currentPlaylist.id === playlistId);

  if (!playlist) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  if (currentIndex < 0 || currentIndex >= playlist.videoIds.length) {
    throw new Error("指定した再生位置がプレイリスト範囲外です。");
  }

  const playbackContext: PlaybackContext = {
    playlistId,
    tabId,
    currentIndex,
  };
  const nextPlaybackContexts = playbackContexts.filter((context) => context.tabId !== tabId);

  nextPlaybackContexts.push(playbackContext);

  await Promise.all([
    setStoredPlaybackContexts(nextPlaybackContexts),
    setLastActivePlaylistId(playlistId),
  ]);

  return playbackContext;
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
  const previousPlaybackContext = playbackContexts.find((context) => context.tabId === tabId);
  const currentIndex: number | null = activePlaylist
    ? resolvePlaybackIndex(activePlaylist, videoId, previousPlaybackContext)
    : null;

  const nextPlaybackContexts = playbackContexts.filter((context) => context.tabId !== tabId);

  if (!activePlaylist || currentIndex === null || currentIndex < 0) {
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
