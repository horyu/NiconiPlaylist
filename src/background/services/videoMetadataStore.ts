import { getStorageData, mutateStorage } from "@/background/services/storage";
import { isOwnerMetadata, isVideoMetadata } from "@/lib/typeGuards";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export async function getStoredVideoMetadataMap(): Promise<Record<string, VideoMetadata>> {
  const { videoMetadata } = await getStorageData(["videoMetadata"]);

  return videoMetadata;
}

export async function getStoredOwnersMap(): Promise<Record<OwnerId, OwnerMetadata>> {
  const { owners } = await getStorageData(["owners"]);

  return owners;
}

export async function mergeStoredVideoMetadata(
  updates: {
    owners?: Record<OwnerId, OwnerMetadata>;
    videoMetadata?: Record<string, VideoMetadata>;
  },
  options?: {
    overwriteExisting?: boolean;
  },
): Promise<void> {
  await mutateStorage(["videoMetadata", "owners"], ({ videoMetadata, owners }) => {
    const storedVideoMetadata = Object.fromEntries(
      Object.entries(videoMetadata).filter((entry): entry is [string, VideoMetadata] =>
        isVideoMetadata(entry[1]),
      ),
    );
    const storedOwners = Object.fromEntries(
      Object.entries(owners).filter((entry): entry is [OwnerId, OwnerMetadata] =>
        isOwnerMetadata(entry[1]),
      ),
    );
    const overwriteExisting = options?.overwriteExisting ?? true;

    return {
      updates: {
        videoMetadata: overwriteExisting
          ? { ...storedVideoMetadata, ...updates.videoMetadata }
          : { ...updates.videoMetadata, ...storedVideoMetadata },
        owners: overwriteExisting
          ? { ...storedOwners, ...updates.owners }
          : { ...updates.owners, ...storedOwners },
      },
      result: undefined,
    };
  });
}
