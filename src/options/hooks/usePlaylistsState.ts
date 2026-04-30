import { createResource } from "solid-js";

import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
import type { Playlist } from "@/lib/types";

export type PlaylistsState = {
  playlists: Playlist[];
  lastActivePlaylistId: string | null;
};

async function fetchPlaylistsState(): Promise<PlaylistsState> {
  const [playlists, lastActivePlaylistId] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
  ]);

  return {
    playlists,
    lastActivePlaylistId,
  };
}

export function usePlaylistsState() {
  const [state, controls] = createResource(fetchPlaylistsState);
  return [state, controls] as const;
}
