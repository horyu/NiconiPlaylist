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
    const playbackTabId = activePlaylistAliveTabId();

    if (!state || !playlist) {
      return null;
    }

    if (playbackTabId === null) {
      const playlistContexts = state.playbackContexts.filter(
        (context) => context.playlistId === playlist.id,
      );

      if (playlistContexts.length === 0) {
        return null;
      }

      return Math.max(...playlistContexts.map((context) => context.currentIndex));
    }

    const playbackContext = state.playbackContexts.find(
      (context) => context.tabId === playbackTabId,
    );

    if (playbackContext?.playlistId !== playlist.id) {
      return null;
    }

    return playbackContext.currentIndex ?? null;
  };
}
