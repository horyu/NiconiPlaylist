import type { Playlist, PlaylistId } from "@/lib/types";

export const MESSAGE_TYPES = {
  getPopupState: "playlist:get-popup-state",
} as const;

export type PopupStateMessage = {
  type: (typeof MESSAGE_TYPES)["getPopupState"];
};

export type PopupStateResponse = {
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
};

export type RuntimeMessage = PopupStateMessage;
