import { createResource } from "solid-js";

import {
  getLastActivePlaylistId,
  getStoredPlaybackContexts,
  getStoredPlaylists,
} from "@/background/services/playlistStore";
import type { PlaybackContext, Playlist } from "@/lib/types";

export type PlaylistsState = {
  lastActivePlaylistId: string | null;
  playbackContexts: PlaybackContext[];
  playlists: Playlist[];
};

async function fetchPlaylistsState(): Promise<PlaylistsState> {
  const [playlists, lastActivePlaylistId, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
    getStoredPlaybackContexts(),
  ]);

  return {
    lastActivePlaylistId,
    playbackContexts,
    playlists,
  };
}

export function usePlaylistsState() {
  const [state, controls] = createResource(fetchPlaylistsState);
  return [state, controls] as const;
}
