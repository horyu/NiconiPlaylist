import { For } from "solid-js";

import type { VideoId } from "@/lib/types";
import { VideoListItem } from "@/options/components/VideoListItem";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type PlaylistDetailVideoListProps = {
  videoIds: VideoId[];
  videoMetadataState: VideoMetadataState | undefined;
};

export function PlaylistDetailVideoList(props: PlaylistDetailVideoListProps) {
  return (
    <div
      class="space-y-3"
      style={{
        "content-visibility": "auto",
        "contain-intrinsic-size": "50vh",
      }}
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-medium text-stone-100">動画一覧</p>
        <p class="text-xs text-stone-500">将来的に追加・削除・並び替えをここへ集約します。</p>
      </div>

      <ul class="space-y-2">
        <For each={props.videoIds}>
          {(videoId, index) => {
            const videoMetadata = () => props.videoMetadataState?.videoMetadataMap[videoId];
            const ownerMetadata = () => {
              const ownerId = videoMetadata()?.ownerId;
              return ownerId ? props.videoMetadataState?.ownersMap[ownerId] : undefined;
            };

            return (
              <VideoListItem
                indexLabel={(index() + 1).toString()}
                videoId={videoId}
                videoMetadata={videoMetadata()}
                ownerMetadata={ownerMetadata()}
              />
            );
          }}
        </For>
      </ul>
    </div>
  );
}
