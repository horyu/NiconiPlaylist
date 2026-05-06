import { sanitizeRepeatSettings } from "@/lib/playlistLoop";
import type { RepeatSettings } from "@/lib/types";

import { getStorageData, setStorageData } from "./storage";

export async function getStoredRepeatSettings() {
  const { repeatSettings } = await getStorageData(["repeatSettings"]);

  return sanitizeRepeatSettings(repeatSettings);
}

export async function setStoredRepeatSettings(repeatSettings: RepeatSettings): Promise<void> {
  await setStorageData({
    repeatSettings: sanitizeRepeatSettings(repeatSettings),
  });
}
