import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import type { Playlist } from "@/lib/types";

import { getStoredPlaylists, setLastActivePlaylistId, setStoredPlaylists } from "./playlistStore";
import { ensureVideoMetadataForVideoIds } from "./videoMetadata";

function createPlaylistId(): string {
  return crypto.randomUUID();
}

function formatDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function createImportedPlaylistTitle(videoIds: string[]): string {
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
  const firstVideoId = videoIds[0] ?? "unknown";

  return `${timestamp} ${time} ${firstVideoId}`;
}

export async function importSharedPlaylist(sharedUrl: string): Promise<Playlist> {
  const draft = parseSharedPlaylistUrl(sharedUrl);
  const playlist: Playlist = {
    id: createPlaylistId(),
    title: draft.title ?? createImportedPlaylistTitle(draft.videoIds),
    memo: draft.memo,
    videoIds: draft.videoIds,
  };

  const playlists = await getStoredPlaylists();

  await setStoredPlaylists([...playlists, playlist]);
  await setLastActivePlaylistId(playlist.id);
  try {
    await ensureVideoMetadataForVideoIds(playlist.videoIds);
  } catch (error) {
    console.warn("動画メタデータの取得に失敗しました。", error);
  }

  return playlist;
}
