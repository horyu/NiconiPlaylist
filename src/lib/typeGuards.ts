import type {
  PlaybackContext,
  PlaybackDebugEvent,
  PlaybackSettings,
  Playlist,
  RepeatPreset,
} from "@/lib/types";
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
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.lastPlayedAt === null || typeof candidate.lastPlayedAt === "string") &&
    (candidate.lastCompletedAt === null || typeof candidate.lastCompletedAt === "string") &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.memo === undefined || typeof candidate.memo === "string") &&
    (candidate.popupHidden === undefined || typeof candidate.popupHidden === "boolean") &&
    (candidate.repeatPresetId === undefined ||
      candidate.repeatPresetId === null ||
      typeof candidate.repeatPresetId === "string")
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

export function isPlaybackDebugEvent(value: unknown): value is PlaybackDebugEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackDebugEvent>;

  return (
    typeof candidate.occurredAt === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.reason === "string" &&
    (candidate.playlistId === null || typeof candidate.playlistId === "string") &&
    (candidate.tabId === null ||
      (typeof candidate.tabId === "number" && Number.isInteger(candidate.tabId))) &&
    (candidate.videoId === null || typeof candidate.videoId === "string") &&
    (candidate.currentIndex === null ||
      (typeof candidate.currentIndex === "number" && Number.isInteger(candidate.currentIndex))) &&
    (candidate.playlistVideoCount === null ||
      (typeof candidate.playlistVideoCount === "number" &&
        Number.isInteger(candidate.playlistVideoCount) &&
        candidate.playlistVideoCount >= 0)) &&
    (candidate.previousPlaybackContext === null ||
      isPlaybackContext(candidate.previousPlaybackContext))
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
    (candidate.resumeTabMode === undefined ||
      candidate.resumeTabMode === "new-tab" ||
      candidate.resumeTabMode === "replace-current-tab") &&
    (candidate.activeRepeatPresetId === null ||
      candidate.activeRepeatPresetId === undefined ||
      typeof candidate.activeRepeatPresetId === "string") &&
    (candidate.navigation === undefined || isPlaybackNavigationSettings(candidate.navigation)) &&
    (candidate.completion === undefined || isPlaybackCompletionSettings(candidate.completion)) &&
    Array.isArray(candidate.presets) &&
    candidate.presets.every(isRepeatPreset)
  );
}

function isPlaybackNavigationSettings(value: unknown): value is PlaybackSettings["navigation"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackSettings["navigation"]>;

  return (
    (candidate.restorePreviousTabEnabled === undefined ||
      typeof candidate.restorePreviousTabEnabled === "boolean") &&
    (candidate.restorePreviousTabDelayMs === undefined ||
      (typeof candidate.restorePreviousTabDelayMs === "number" &&
        Number.isInteger(candidate.restorePreviousTabDelayMs) &&
        candidate.restorePreviousTabDelayMs >= 0))
  );
}

function isPlaybackCompletionSettings(value: unknown): value is PlaybackSettings["completion"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackSettings["completion"]>;

  return (
    (candidate.playSoundEnabled === undefined || typeof candidate.playSoundEnabled === "boolean") &&
    (candidate.soundVolume === undefined ||
      (typeof candidate.soundVolume === "number" &&
        Number.isInteger(candidate.soundVolume) &&
        candidate.soundVolume >= 0 &&
        candidate.soundVolume <= 100)) &&
    (candidate.soundRepeatCount === undefined ||
      (typeof candidate.soundRepeatCount === "number" &&
        Number.isInteger(candidate.soundRepeatCount) &&
        candidate.soundRepeatCount >= 1)) &&
    (candidate.focusTabEnabled === undefined || typeof candidate.focusTabEnabled === "boolean") &&
    (candidate.alertEnabled === undefined || typeof candidate.alertEnabled === "boolean")
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

  if (candidate.mode === "min" || candidate.mode === "max") {
    return (
      typeof candidate.count === "number" &&
      Number.isInteger(candidate.count) &&
      candidate.count >= 1 &&
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
    (candidate.registeredAt === null ||
      candidate.registeredAt === undefined ||
      typeof candidate.registeredAt === "string") &&
    (candidate.contentType === null ||
      candidate.contentType === undefined ||
      typeof candidate.contentType === "string") &&
    !!candidate.thumbnail &&
    typeof candidate.thumbnail === "object" &&
    (candidate.duration === null || typeof candidate.duration === "number") &&
    (candidate.isChannelVideo === null ||
      candidate.isChannelVideo === undefined ||
      typeof candidate.isChannelVideo === "boolean") &&
    (candidate.isPaymentRequired === null ||
      candidate.isPaymentRequired === undefined ||
      typeof candidate.isPaymentRequired === "boolean") &&
    (candidate.requireSensitiveMasking === null ||
      candidate.requireSensitiveMasking === undefined ||
      typeof candidate.requireSensitiveMasking === "boolean") &&
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
