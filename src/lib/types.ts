export type VideoId = string;

export type PlaylistId = string;

export type Playlist = {
  id: PlaylistId;
  videoIds: VideoId[];
  title?: string;
  memo?: string;
};

export type PlaybackContext = {
  playlistId: PlaylistId;
  tabId: number;
  currentIndex: number;
};
