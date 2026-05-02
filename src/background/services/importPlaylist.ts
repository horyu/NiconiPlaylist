import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import type { Playlist } from "@/lib/types";

import { getStoredPlaylists, setLastActivePlaylistId, setStoredPlaylists } from "./playlistStore";

export const DEFAULT_PLAYLIST_TITLE_SOURCE = {
  sharedUrlImport: "共有URLインポート",
  videoIdInput: "動画ID入力",
} as const;

function createPlaylistId(): string {
  return crypto.randomUUID();
}

function formatDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

type PlaylistDraft = Pick<Playlist, "videoIds" | "title" | "memo">;
type CreateStoredPlaylistOptions = {
  defaultTitleSource?: string;
};

function createDefaultPlaylistTitleBySource(source: string): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    formatDatePart(now.getMonth() + 1),
    formatDatePart(now.getDate()),
  ].join("/");
  const time = [
    formatDatePart(now.getHours()),
    formatDatePart(now.getMinutes()),
    formatDatePart(now.getSeconds()),
  ].join(":");

  return `${timestamp} ${time} ${source}`;
}

export async function createStoredPlaylist(
  draft: PlaylistDraft,
  options?: CreateStoredPlaylistOptions,
): Promise<Playlist> {
  const playlist: Playlist = {
    id: createPlaylistId(),
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
