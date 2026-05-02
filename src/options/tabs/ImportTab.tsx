import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";
import { DirectInputCreateSection } from "@/options/tabs/DirectInputCreateSection";
import { SharedUrlImportSection } from "@/options/tabs/SharedUrlImportSection";

type ImportTabProps = {
  onImported: () => Promise<void> | void;
  videoMetadataState: VideoMetadataState | undefined;
};

export function ImportTab(props: ImportTabProps) {
  return (
    <div class="space-y-6">
      <SharedUrlImportSection
        onImported={props.onImported}
        videoMetadataState={props.videoMetadataState}
      />
      <DirectInputCreateSection
        onImported={props.onImported}
        videoMetadataState={props.videoMetadataState}
      />
    </div>
  );
}
