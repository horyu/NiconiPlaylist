import type { Accessor } from "solid-js";

import type { PopupState } from "@/background/services/popupState";
import type { Playlist, PlaylistId } from "@/lib/types";

export function createActivePlaylist(
  popupState: Accessor<PopupState | undefined>,
): Accessor<Playlist | null> {
  return () =>
    popupState()?.playlists.find(
      (playlist) => playlist.id === popupState()?.lastActivePlaylistId,
    ) ?? null;
}

export function createActivePlaylistAliveTabId(
  activePlaylist: Accessor<Playlist | null>,
  aliveTabIdByPlaylistId: Accessor<Partial<Record<PlaylistId, number>>>,
): Accessor<number | null> {
  return () => {
    const playlist = activePlaylist();

    if (!playlist) {
      return null;
    }

    return aliveTabIdByPlaylistId()[playlist.id] ?? null;
  };
}

export function createCurrentPlaybackIndex(
  popupState: Accessor<PopupState | undefined>,
  activePlaylist: Accessor<Playlist | null>,
  activePlaylistAliveTabId: Accessor<number | null>,
): Accessor<number | null> {
  return () => {
    const state = popupState();
    const playlist = activePlaylist();

    if (!state || !playlist) {
      return null;
    }

    const activeTabPlaybackContext =
      state.activeTabId === null
        ? null
        : state.playbackContexts.find((context) => context.tabId === state.activeTabId);
    const alivePlaylistTabId = activePlaylistAliveTabId();
    const alivePlaylistPlaybackContext =
      alivePlaylistTabId === null
        ? null
        : (state.playbackContexts.find((context) => context.tabId === alivePlaylistTabId) ?? null);
    const playlistPlaybackContext =
      activeTabPlaybackContext?.playlistId === playlist.id
        ? activeTabPlaybackContext
        : alivePlaylistPlaybackContext?.playlistId === playlist.id
          ? alivePlaylistPlaybackContext
          : (state.playbackContexts.find((context) => context.playlistId === playlist.id) ?? null);

    return playlistPlaybackContext?.currentIndex ?? null;
  };
}
