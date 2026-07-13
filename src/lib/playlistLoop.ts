import type {
  PlaybackCompletionSettings,
  PlaybackNavigationSettings,
  PlaybackResumeTabMode,
  PlaybackSettings,
  Playlist,
  RepeatPreset,
  RepeatPresetMode,
} from "@/lib/types";

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
    }
  | {
      id?: string;
      mode?: "min" | "max";
      count?: number;
      durationSeconds?: number;
    };

type PlaybackSettingsInput = {
  playlistRepeatEnabled?: boolean;
  resumeTabMode?: PlaybackResumeTabMode;
  activeRepeatPresetId?: string | null;
  presets?: RepeatPresetInput[];
  navigation?: Partial<PlaybackNavigationSettings>;
  completion?: Partial<PlaybackCompletionSettings>;
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

export const DEFAULT_PLAYBACK_COMPLETION_SETTINGS: PlaybackCompletionSettings = {
  playSoundEnabled: false,
  soundVolume: 50,
  soundRepeatCount: 1,
  focusTabEnabled: false,
  alertEnabled: false,
};

export const DEFAULT_PLAYBACK_RESUME_TAB_MODE: PlaybackResumeTabMode = "new-tab";

export const DEFAULT_PLAYBACK_NAVIGATION_SETTINGS: PlaybackNavigationSettings = {
  restorePreviousTabEnabled: false,
  restorePreviousTabDelayMs: 1500,
};

function createRepeatPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `repeat-preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRepeatPreset(
  mode: Extract<RepeatPresetMode, "count" | "duration">,
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

export function createCombinedRepeatPreset(
  mode: Extract<RepeatPresetMode, "min" | "max">,
  count?: number,
  durationSeconds?: number,
  id?: string,
): RepeatPreset {
  return {
    id: id ?? createRepeatPresetId(),
    mode,
    count: Math.max(Number.isInteger(count) ? (count ?? 1) : 1, 1),
    durationSeconds: Math.max(Number.isInteger(durationSeconds) ? (durationSeconds ?? 1) : 1, 1),
  };
}

function sanitizeRepeatPreset(preset: RepeatPresetInput): RepeatPreset | null {
  if (preset.mode === "count") {
    return createRepeatPreset("count", preset.count, preset.id);
  }

  if (preset.mode === "duration") {
    return createRepeatPreset("duration", preset.durationSeconds, preset.id);
  }

  if (preset.mode === "min" || preset.mode === "max") {
    return createCombinedRepeatPreset(preset.mode, preset.count, preset.durationSeconds, preset.id);
  }

  return null;
}

function sanitizePlaybackCompletionSettings(
  settings: Partial<PlaybackCompletionSettings> | null | undefined,
): PlaybackCompletionSettings {
  const alertEnabled = settings?.alertEnabled === true;

  return {
    playSoundEnabled: !alertEnabled && settings?.playSoundEnabled === true,
    soundVolume: Math.min(Math.max(Math.trunc(settings?.soundVolume ?? 50), 0), 100),
    soundRepeatCount: Math.max(Math.trunc(settings?.soundRepeatCount ?? 1), 1),
    focusTabEnabled: settings?.focusTabEnabled === true,
    alertEnabled,
  };
}

function sanitizePlaybackNavigationSettings(
  settings: Partial<PlaybackNavigationSettings> | null | undefined,
): PlaybackNavigationSettings {
  const restorePreviousTabEnabled = settings?.restorePreviousTabEnabled === true;
  const delayMs = Math.max(
    Math.trunc(
      settings?.restorePreviousTabDelayMs ??
        DEFAULT_PLAYBACK_NAVIGATION_SETTINGS.restorePreviousTabDelayMs,
    ),
    0,
  );

  return {
    restorePreviousTabEnabled,
    restorePreviousTabDelayMs: restorePreviousTabEnabled ? Math.max(delayMs, 100) : delayMs,
  };
}

export function sanitizePlaybackSettings(
  settings: PlaybackSettingsInput | null | undefined,
): PlaybackSettings {
  if (!settings) {
    return {
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS.map((preset) => ({ ...preset })),
      navigation: { ...DEFAULT_PLAYBACK_NAVIGATION_SETTINGS },
      completion: { ...DEFAULT_PLAYBACK_COMPLETION_SETTINGS },
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
    playlistRepeatEnabled: settings.playlistRepeatEnabled === true,
    resumeTabMode:
      settings.resumeTabMode === "replace-current-tab" ? "replace-current-tab" : "new-tab",
    activeRepeatPresetId,
    presets: normalizedPresets.map((preset) => ({ ...preset })),
    navigation: sanitizePlaybackNavigationSettings(settings.navigation),
    completion: sanitizePlaybackCompletionSettings(settings.completion),
  };
}

export function resolveActiveRepeatPreset(settings: PlaybackSettings): RepeatPreset | null {
  if (!settings.activeRepeatPresetId) {
    return null;
  }

  return settings.presets.find((preset) => preset.id === settings.activeRepeatPresetId) ?? null;
}

export function resolvePlaylistPlaybackSettings(
  globalSettings: PlaybackSettings,
  playlist: Pick<Playlist, "repeatPresetId"> | null | undefined,
): PlaybackSettings {
  if (!playlist || playlist.repeatPresetId === undefined) {
    return globalSettings;
  }

  const activeRepeatPresetId =
    typeof playlist.repeatPresetId === "string" &&
    globalSettings.presets.some((preset) => preset.id === playlist.repeatPresetId)
      ? playlist.repeatPresetId
      : null;

  return {
    ...globalSettings,
    activeRepeatPresetId,
  };
}

export function formatRepeatPresetLabel(
  preset: RepeatPreset,
  options?: { includeRepeatSuffix?: boolean },
): string {
  const suffix = options?.includeRepeatSuffix === false ? "" : "リピート";

  if (preset.mode === "count") {
    return `${preset.count}回${suffix}`;
  }

  const formatDuration = (durationSeconds: number) => {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;

    if (seconds === 0) {
      return `${minutes}分`;
    }

    if (minutes === 0) {
      return `${seconds}秒`;
    }

    return `${minutes}分${seconds}秒`;
  };

  if (preset.mode === "duration") {
    return `${formatDuration(preset.durationSeconds)}${suffix}`;
  }

  const modeLabel = preset.mode === "min" ? "短い方" : "長い方";

  return `${modeLabel}（${preset.count}回 / ${formatDuration(preset.durationSeconds)}）${suffix}`;
}

export function shouldRepeatCurrentVideo(
  settings: PlaybackSettings,
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

  const hasValidDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;

  if (activeRepeatPreset.mode === "duration") {
    return (
      hasValidDuration &&
      completedPlaybackCount * durationSeconds < activeRepeatPreset.durationSeconds
    );
  }

  const repeatByCount = completedPlaybackCount < activeRepeatPreset.count;

  if (!hasValidDuration) {
    return repeatByCount;
  }

  const repeatByDuration =
    completedPlaybackCount * durationSeconds < activeRepeatPreset.durationSeconds;

  return activeRepeatPreset.mode === "min"
    ? repeatByCount && repeatByDuration
    : repeatByCount || repeatByDuration;
}
