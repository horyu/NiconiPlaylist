export type PlayRepeatedAudioOptions = {
  repeatCount: number;
  volume: number;
};

export async function playRepeatedAudio(
  src: string,
  options: PlayRepeatedAudioOptions,
): Promise<void> {
  const audio = new Audio(src);
  audio.volume = options.volume;

  for (let index = 0; index < options.repeatCount; index += 1) {
    audio.pause();
    audio.currentTime = 0;

    await new Promise<void>((resolve) => {
      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleFinished);
      };
      const handleEnded = () => {
        cleanup();
        resolve();
      };
      const handleFinished = () => {
        cleanup();
        resolve();
      };

      audio.addEventListener("ended", handleEnded, { once: true });
      audio.addEventListener("error", handleFinished, { once: true });
      void audio.play().catch(() => {
        cleanup();
        resolve();
      });
    });
  }
}
