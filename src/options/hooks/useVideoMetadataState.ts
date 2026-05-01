import { createResource, onCleanup, onMount } from "solid-js";
import { browser } from "wxt/browser";

import {
  getStoredOwnersMap,
  getStoredVideoMetadataMap,
} from "@/background/services/videoMetadataStore";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export type VideoMetadataState = {
  ownersMap: Record<string, OwnerMetadata>;
  videoMetadataMap: Record<string, VideoMetadata>;
};

async function fetchVideoMetadataState(): Promise<VideoMetadataState> {
  const [videoMetadataMap, ownersMap] = await Promise.all([
    getStoredVideoMetadataMap(),
    getStoredOwnersMap(),
  ]);

  return {
    ownersMap,
    videoMetadataMap,
  };
}

export function useVideoMetadataState() {
  const [state, controls] = createResource(fetchVideoMetadataState);

  onMount(() => {
    const handleStorageChanged = (changes: Record<string, unknown>) => {
      if (changes[STORAGE_KEYS.videoMetadata] || changes[STORAGE_KEYS.owners]) {
        void controls.refetch();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChanged);

    onCleanup(() => {
      browser.storage.onChanged.removeListener(handleStorageChanged);
    });
  });

  return [state, controls] as const;
}
