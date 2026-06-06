import type { PlaylistId } from "@/lib/types";

export type PopupPlaybackTransitionMode = "after-current-ended" | "immediate";

export type PopupStartPlaybackMessage = {
  type: "popup:start-playback";
  activeTabId: number | null;
  playbackTabId: number | null;
  playlistId: PlaylistId;
  index: number;
  transitionMode?: PopupPlaybackTransitionMode;
};

export type PopupGetPendingPlaybackEndNavigationMessage = {
  type: "popup:get-pending-playback-end-navigation";
};

export type PopupMessage = PopupStartPlaybackMessage | PopupGetPendingPlaybackEndNavigationMessage;

export type PopupPendingPlaybackEndNavigationResponse = Record<
  number,
  {
    nextIndex: number;
    playlistId: PlaylistId;
  }
>;
