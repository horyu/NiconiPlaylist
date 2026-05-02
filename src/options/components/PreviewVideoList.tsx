import { For } from "solid-js";

import { VideoListItem } from "@/options/components/VideoListItem";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type PreviewVideoListProps = {
  videoIds: string[];
  videoMetadataState: VideoMetadataState | undefined;
};

export function PreviewVideoList(props: PreviewVideoListProps) {
  return (
    <ul class="space-y-2">
      <For each={props.videoIds}>
        {(videoId) => {
          const videoMetadata = () => props.videoMetadataState?.videoMetadataMap[videoId];
          const ownerMetadata = () => {
            const ownerId = videoMetadata()?.ownerId;
            return ownerId ? props.videoMetadataState?.ownersMap[ownerId] : undefined;
          };

          return (
            <VideoListItem
              videoId={videoId}
              videoMetadata={videoMetadata()}
              ownerMetadata={ownerMetadata()}
            />
          );
        }}
      </For>
    </ul>
  );
}
