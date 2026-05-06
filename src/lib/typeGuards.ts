import type { PlaybackContext, PlaybackSettings, Playlist, RepeatPreset } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Playlist>;

  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.videoIds) &&
    candidate.videoIds.every((videoId) => typeof videoId === "string") &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.memo === undefined || typeof candidate.memo === "string")
  );
}

export function isPlaybackContext(value: unknown): value is PlaybackContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackContext>;

  return (
    typeof candidate.playlistId === "string" &&
    typeof candidate.tabId === "number" &&
    Number.isInteger(candidate.tabId) &&
    typeof candidate.currentIndex === "number" &&
    Number.isInteger(candidate.currentIndex)
  );
}

export function isPlaybackSettings(value: unknown): value is PlaybackSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackSettings>;

  return (
    (candidate.playlistRepeatEnabled === undefined ||
      typeof candidate.playlistRepeatEnabled === "boolean") &&
    (candidate.activeRepeatPresetId === null ||
      candidate.activeRepeatPresetId === undefined ||
      typeof candidate.activeRepeatPresetId === "string") &&
    Array.isArray(candidate.presets) &&
    candidate.presets.every(isRepeatPreset)
  );
}

function isRepeatPreset(value: unknown): value is RepeatPreset {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RepeatPreset>;

  if (typeof candidate.id !== "string") {
    return false;
  }

  if (candidate.mode === "count") {
    return (
      typeof candidate.count === "number" &&
      Number.isInteger(candidate.count) &&
      candidate.count >= 1
    );
  }

  if (candidate.mode === "duration") {
    return (
      typeof candidate.durationSeconds === "number" &&
      Number.isInteger(candidate.durationSeconds) &&
      candidate.durationSeconds >= 1
    );
  }

  return false;
}

export function isVideoMetadata(value: unknown): value is VideoMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<VideoMetadata>;

  return (
    typeof candidate.watchId === "string" &&
    typeof candidate.title === "string" &&
    !!candidate.thumbnail &&
    typeof candidate.thumbnail === "object" &&
    (candidate.duration === null || typeof candidate.duration === "number") &&
    (candidate.ownerId === null ||
      candidate.ownerId === undefined ||
      typeof candidate.ownerId === "string") &&
    typeof candidate.fetchedAt === "string"
  );
}

export function isOwnerMetadata(value: unknown): value is OwnerMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OwnerMetadata>;

  return (
    typeof candidate.id === "string" &&
    (candidate.name === null ||
      candidate.name === undefined ||
      typeof candidate.name === "string") &&
    (candidate.type === null ||
      candidate.type === undefined ||
      typeof candidate.type === "string") &&
    (candidate.iconUrl === null ||
      candidate.iconUrl === undefined ||
      typeof candidate.iconUrl === "string") &&
    typeof candidate.fetchedAt === "string"
  );
}
