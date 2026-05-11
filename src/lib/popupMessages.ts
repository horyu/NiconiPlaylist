import type { PlaylistId } from "@/lib/types";

export type PopupMessage = {
  type: "popup:start-playback";
  activeTabId: number | null;
  playbackTabId: number | null;
  playlistId: PlaylistId;
  index: number;
};
