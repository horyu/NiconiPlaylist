import { formatCompactTimestamp } from "@/lib/dateTime";
import { isOwnerMetadata, isPlaylist, isVideoMetadata } from "@/lib/typeGuards";
import type { Playlist, PlaylistId } from "@/lib/types";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

import { DEFAULT_PLAYLIST_TITLE_SOURCE, createStoredPlaylist } from "./importPlaylist";
import { getStoredPlaylists } from "./playlistStore";
import {
  getStoredOwnersMap,
  getStoredVideoMetadataMap,
  mergeStoredVideoMetadata,
} from "./videoMetadataStore";

const PLAYLIST_JSON_VERSION = 1;

export type PlaylistJsonDraft = Pick<
  Playlist,
  "createdAt" | "updatedAt" | "lastPlayedAt" | "lastCompletedAt" | "memo" | "title" | "videoIds"
>;

export type PlaylistJsonPayload = {
  exportedAt: string;
  owners: Record<OwnerId, OwnerMetadata>;
  playlist: PlaylistJsonDraft;
  version: number;
  videoMetadata: Record<string, VideoMetadata>;
};

type ExportPlaylistJsonOptions = {
  includeMemo?: boolean;
  includeTitle?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePlaylistJsonDraft(value: unknown): PlaylistJsonDraft {
  if (!isRecord(value)) {
    throw new Error("プレイリスト JSON の playlist が不正です。");
  }

  const playlistCandidate: Partial<Playlist> = value;

  if (!isPlaylist({ ...playlistCandidate, id: "temporary-playlist-id" })) {
    throw new Error("プレイリスト JSON の playlist が不正です。");
  }

  return {
    createdAt: playlistCandidate.createdAt as string,
    lastCompletedAt: playlistCandidate.lastCompletedAt as string | null,
    lastPlayedAt: playlistCandidate.lastPlayedAt as string | null,
    memo: playlistCandidate.memo,
    title: playlistCandidate.title,
    updatedAt: playlistCandidate.updatedAt as string,
    videoIds: playlistCandidate.videoIds as string[],
  };
}

function normalizeVideoMetadataMap(value: unknown): Record<string, VideoMetadata> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, VideoMetadata] =>
      isVideoMetadata(entry[1]),
    ),
  );
}

function normalizeOwnersMap(value: unknown): Record<OwnerId, OwnerMetadata> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [OwnerId, OwnerMetadata] =>
      isOwnerMetadata(entry[1]),
    ),
  );
}

export function parsePlaylistJsonPayload(payload: unknown): PlaylistJsonPayload {
  if (!isRecord(payload)) {
    throw new Error("プレイリスト JSON の形式が不正です。");
  }

  const playlist = normalizePlaylistJsonDraft(payload.playlist);
  const videoMetadata = normalizeVideoMetadataMap(payload.videoMetadata);
  const referencedOwnerIds = new Set(
    Object.values(videoMetadata).flatMap((metadata) =>
      metadata.ownerId ? [metadata.ownerId] : [],
    ),
  );
  const owners = Object.fromEntries(
    Object.entries(normalizeOwnersMap(payload.owners)).filter(([ownerId]) =>
      referencedOwnerIds.has(ownerId),
    ),
  );

  return {
    exportedAt:
      typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
    owners,
    playlist,
    version: typeof payload.version === "number" ? payload.version : PLAYLIST_JSON_VERSION,
    videoMetadata,
  };
}

export async function exportPlaylistJson(
  playlistId: PlaylistId,
  options?: ExportPlaylistJsonOptions,
): Promise<PlaylistJsonPayload> {
  const [playlists, videoMetadataMap, ownersMap] = await Promise.all([
    getStoredPlaylists(),
    getStoredVideoMetadataMap(),
    getStoredOwnersMap(),
  ]);
  const playlist = playlists.find((currentPlaylist) => currentPlaylist.id === playlistId);

  if (!playlist) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  const referencedVideoIds = new Set(playlist.videoIds);
  const playlistVideoMetadata = Object.fromEntries(
    Object.entries(videoMetadataMap).filter(([videoId]) => referencedVideoIds.has(videoId)),
  );
  const referencedOwnerIds = new Set(
    Object.values(playlistVideoMetadata).flatMap((metadata) =>
      metadata.ownerId ? [metadata.ownerId] : [],
    ),
  );
  const playlistOwners = Object.fromEntries(
    Object.entries(ownersMap).filter(([ownerId]) => referencedOwnerIds.has(ownerId)),
  );

  return {
    exportedAt: new Date().toISOString(),
    owners: playlistOwners,
    playlist: {
      createdAt: playlist.createdAt,
      lastCompletedAt: playlist.lastCompletedAt,
      lastPlayedAt: playlist.lastPlayedAt,
      memo: options?.includeMemo ? playlist.memo : undefined,
      title: options?.includeTitle ? playlist.title : undefined,
      updatedAt: playlist.updatedAt,
      videoIds: [...playlist.videoIds],
    },
    version: PLAYLIST_JSON_VERSION,
    videoMetadata: playlistVideoMetadata,
  };
}

export async function importPlaylistJson(payload: unknown): Promise<Playlist> {
  const normalizedPayload = parsePlaylistJsonPayload(payload);
  const nextPlaylist = await createStoredPlaylist(normalizedPayload.playlist, {
    defaultTitleSource: DEFAULT_PLAYLIST_TITLE_SOURCE.playlistJsonImport,
  });

  await mergeStoredVideoMetadata(
    {
      videoMetadata: normalizedPayload.videoMetadata,
      owners: normalizedPayload.owners,
    },
    {
      overwriteExisting: false,
    },
  );

  return nextPlaylist;
}

export function createPlaylistJsonFilename(): string {
  return `NiconiPlaylistPlaylist-${formatCompactTimestamp(new Date())}.json`;
}
