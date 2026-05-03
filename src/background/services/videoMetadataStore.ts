import { getStorageData, setStorageData } from "@/background/services/storage";
import { isOwnerMetadata, isVideoMetadata } from "@/lib/typeGuards";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export async function getStoredVideoMetadataMap(): Promise<Record<string, VideoMetadata>> {
  const { videoMetadata } = await getStorageData(["videoMetadata"]);

  if (!videoMetadata || typeof videoMetadata !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(videoMetadata).filter((entry): entry is [string, VideoMetadata] =>
      isVideoMetadata(entry[1]),
    ),
  );
}

export async function setStoredVideoMetadataMap(
  videoMetadataMap: Record<string, VideoMetadata>,
): Promise<void> {
  await setStorageData({ videoMetadata: videoMetadataMap });
}

export async function getStoredOwnersMap(): Promise<Record<OwnerId, OwnerMetadata>> {
  const { owners } = await getStorageData(["owners"]);

  if (!owners || typeof owners !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(owners).filter((entry): entry is [OwnerId, OwnerMetadata] =>
      isOwnerMetadata(entry[1]),
    ),
  );
}

export async function setStoredOwnersMap(ownersMap: Record<OwnerId, OwnerMetadata>): Promise<void> {
  await setStorageData({ owners: ownersMap });
}
