import { browser } from "wxt/browser";

import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

function isVideoMetadata(value: unknown): value is VideoMetadata {
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

function isOwnerMetadata(value: unknown): value is OwnerMetadata {
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

export async function getStoredVideoMetadataMap(): Promise<Record<string, VideoMetadata>> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.videoMetadata);
  const value = stored[STORAGE_KEYS.videoMetadata];

  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, VideoMetadata] =>
      isVideoMetadata(entry[1]),
    ),
  );
}

export async function setStoredVideoMetadataMap(
  videoMetadataMap: Record<string, VideoMetadata>,
): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.videoMetadata]: videoMetadataMap,
  });
}

export async function getStoredOwnersMap(): Promise<Record<OwnerId, OwnerMetadata>> {
  const stored = await browser.storage.local.get(STORAGE_KEYS.owners);
  const value = stored[STORAGE_KEYS.owners];

  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [OwnerId, OwnerMetadata] =>
      isOwnerMetadata(entry[1]),
    ),
  );
}

export async function setStoredOwnersMap(ownersMap: Record<OwnerId, OwnerMetadata>): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.owners]: ownersMap,
  });
}
