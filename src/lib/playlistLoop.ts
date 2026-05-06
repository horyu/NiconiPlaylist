import type { RepeatPreset, RepeatPresetMode, RepeatSettings } from "@/lib/types";

type RepeatPresetInput =
  | {
      id?: string;
      mode?: "count";
      count?: number;
    }
  | {
      id?: string;
      mode?: "duration";
      durationSeconds?: number;
    };

type RepeatSettingsInput = {
  activeRepeatPresetId?: string | null;
  presets?: RepeatPresetInput[];
};

export const DEFAULT_REPEAT_PRESETS: RepeatPreset[] = [
  {
    id: "default-repeat-count-2",
    mode: "count",
    count: 2,
  },
  {
    id: "default-repeat-duration-600",
    mode: "duration",
    durationSeconds: 10 * 60,
  },
];

function createRepeatPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `repeat-preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRepeatPreset(
  mode: RepeatPresetMode,
  value?: number,
  id?: string,
): RepeatPreset {
  if (mode === "count") {
    return {
      id: id ?? createRepeatPresetId(),
      mode,
      count: Math.max(Number.isInteger(value) ? (value ?? 1) : 1, 1),
    };
  }

  return {
    id: id ?? createRepeatPresetId(),
    mode,
    durationSeconds: Math.max(Number.isInteger(value) ? (value ?? 1) : 1, 1),
  };
}

function sanitizeRepeatPreset(preset: RepeatPresetInput): RepeatPreset | null {
  if (preset.mode === "count") {
    return createRepeatPreset("count", preset.count, preset.id);
  }

  if (preset.mode === "duration") {
    return createRepeatPreset("duration", preset.durationSeconds, preset.id);
  }

  return null;
}

export function sanitizeRepeatSettings(
  settings: RepeatSettingsInput | null | undefined,
): RepeatSettings {
  if (!settings) {
    return {
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS.map((preset) => ({ ...preset })),
    };
  }

  const presets =
    settings.presets
      ?.map((preset) => sanitizeRepeatPreset(preset))
      .filter((preset): preset is RepeatPreset => preset !== null) ?? [];
  const normalizedPresets = presets;
  const activeRepeatPresetId =
    typeof settings.activeRepeatPresetId === "string" &&
    normalizedPresets.some((preset) => preset.id === settings.activeRepeatPresetId)
      ? settings.activeRepeatPresetId
      : null;

  return {
    activeRepeatPresetId,
    presets: normalizedPresets.map((preset) => ({ ...preset })),
  };
}

export function resolveActiveRepeatPreset(settings: RepeatSettings): RepeatPreset | null {
  if (!settings.activeRepeatPresetId) {
    return null;
  }

  return settings.presets.find((preset) => preset.id === settings.activeRepeatPresetId) ?? null;
}

export function formatRepeatPresetLabel(preset: RepeatPreset): string {
  if (preset.mode === "count") {
    return `${preset.count}回リピート`;
  }

  const minutes = Math.floor(preset.durationSeconds / 60);
  const seconds = preset.durationSeconds % 60;

  if (seconds === 0) {
    return `${minutes}分リピート`;
  }

  if (minutes === 0) {
    return `${seconds}秒リピート`;
  }

  return `${minutes}分${seconds}秒リピート`;
}

export function shouldRepeatCurrentVideo(
  settings: RepeatSettings,
  completedPlaybackCount: number,
  durationSeconds: number,
): boolean {
  const activeRepeatPreset = resolveActiveRepeatPreset(settings);

  if (!activeRepeatPreset) {
    return false;
  }

  if (activeRepeatPreset.mode === "count") {
    return completedPlaybackCount < activeRepeatPreset.count;
  }

  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return completedPlaybackCount * durationSeconds < activeRepeatPreset.durationSeconds;
  }

  return false;
}
