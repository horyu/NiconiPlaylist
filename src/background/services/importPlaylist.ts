import { formatSlashTimestampWithSeconds } from "@/lib/dateTime";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import type { Playlist } from "@/lib/types";

import { getStoredPlaylists, setLastActivePlaylistId, setStoredPlaylists } from "./playlistStore";

export const DEFAULT_PLAYLIST_TITLE_SOURCE = {
  playlistJsonImport: "プレイリストJSONインポート",
  sharedUrlImport: "共有URLインポート",
  videoIdInput: "動画ID入力",
} as const;

function createPlaylistId(): string {
  return crypto.randomUUID();
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type PlaylistDraft = Pick<Playlist, "videoIds" | "title" | "memo"> &
  Partial<Pick<Playlist, "createdAt" | "updatedAt" | "lastPlayedAt" | "lastCompletedAt">>;
type CreateStoredPlaylistOptions = {
  defaultTitleSource?: string;
};

function createPlaylistTimestamps(
  now: Date,
): Pick<Playlist, "createdAt" | "updatedAt" | "lastPlayedAt" | "lastCompletedAt"> {
  const isoString = now.toISOString();

  return {
    createdAt: isoString,
    updatedAt: isoString,
    lastPlayedAt: null,
    lastCompletedAt: null,
  };
}

function createDefaultPlaylistTitleBySource(source: string): string {
  return `${formatSlashTimestampWithSeconds(new Date())} ${source}`;
}

export async function createStoredPlaylist(
  draft: PlaylistDraft,
  options?: CreateStoredPlaylistOptions,
): Promise<Playlist> {
  const now = new Date();
  const fallbackTimestamps = createPlaylistTimestamps(now);
  const playlist: Playlist = {
    id: createPlaylistId(),
    createdAt: draft.createdAt ?? fallbackTimestamps.createdAt,
    updatedAt: draft.updatedAt ?? fallbackTimestamps.updatedAt,
    lastPlayedAt: draft.lastPlayedAt ?? fallbackTimestamps.lastPlayedAt,
    lastCompletedAt: draft.lastCompletedAt ?? fallbackTimestamps.lastCompletedAt,
    popupHidden: false,
    title:
      normalizeOptionalText(draft.title) ??
      createDefaultPlaylistTitleBySource(
        options?.defaultTitleSource ?? DEFAULT_PLAYLIST_TITLE_SOURCE.videoIdInput,
      ),
    memo: normalizeOptionalText(draft.memo),
    videoIds: draft.videoIds,
  };

  const playlists = await getStoredPlaylists();

  await setStoredPlaylists([...playlists, playlist]);
  await setLastActivePlaylistId(playlist.id);

  return playlist;
}

export async function importSharedPlaylist(
  sharedUrl: string,
  overrides?: Partial<Pick<Playlist, "title" | "memo">>,
): Promise<Playlist> {
  const draft = parseSharedPlaylistUrl(sharedUrl);
  return createStoredPlaylist(
    {
      ...draft,
      title: overrides?.title ?? draft.title,
      memo: overrides?.memo ?? draft.memo,
    },
    {
      defaultTitleSource: DEFAULT_PLAYLIST_TITLE_SOURCE.sharedUrlImport,
    },
  );
}
