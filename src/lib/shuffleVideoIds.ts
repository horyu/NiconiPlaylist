import type { VideoId } from "./types";

export function shuffleVideoIds(videoIds: VideoId[]): VideoId[] {
  const nextVideoIds = [...videoIds];

  for (let index = nextVideoIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const currentVideoId = nextVideoIds[index]!;

    nextVideoIds[index] = nextVideoIds[randomIndex]!;
    nextVideoIds[randomIndex] = currentVideoId;
  }

  return nextVideoIds;
}
