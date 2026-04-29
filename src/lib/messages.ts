import type { Playlist, PlaylistId } from "@/lib/types";

export const MESSAGE_TYPES = {
  getPlaylistsState: "playlist:get-playlists-state",
  importSharedPlaylist: "playlist:import-shared-playlist",
} as const;

export type GetPlaylistsStateMessage = {
  type: (typeof MESSAGE_TYPES)["getPlaylistsState"];
};

export type PlaylistsStateResponse = {
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
};

export type ImportSharedPlaylistMessage = {
  type: (typeof MESSAGE_TYPES)["importSharedPlaylist"];
  sharedUrl: string;
};

export type ImportSharedPlaylistResponse = {
  playlist: Playlist;
};

export type RuntimeMessage = GetPlaylistsStateMessage | ImportSharedPlaylistMessage;
