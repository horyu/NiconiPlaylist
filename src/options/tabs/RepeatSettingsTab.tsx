import { createEffect, createSignal, For, Show } from "solid-js";

import {
  getStoredPlaybackSettings,
  setStoredPlaybackSettings,
} from "@/background/services/playbackSettings";
import {
  createRepeatPreset,
  DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  sanitizePlaybackSettings,
} from "@/lib/playlistLoop";
import { playRepeatedAudio } from "@/lib/playRepeatedAudio";
import type { PlaybackCompletionSettings, PlaybackResumeTabMode, RepeatPreset } from "@/lib/types";
import type { OptionsToast } from "@/options/toast";
import completionSoundPath from "~/assets/ui-soft-glass-ping.mp3";

type RepeatSettingsTabProps = {
  onFeedback: (toast: OptionsToast | null) => void;
};

function splitDurationSeconds(durationSeconds: number): { minutes: string; seconds: string } {
  return {
    minutes: Math.floor(durationSeconds / 60).toString(),
    seconds: (durationSeconds % 60).toString(),
  };
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(parsed, 0);
}

function clampInteger(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

export function RepeatSettingsTab(props: RepeatSettingsTabProps) {
  const [presets, setPresets] = createSignal<RepeatPreset[]>([]);
  const [savedPresetsJson, setSavedPresetsJson] = createSignal("[]");
  const [completionSettings, setCompletionSettings] = createSignal<PlaybackCompletionSettings>({
    ...DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  });
  const [resumeTabMode, setResumeTabMode] = createSignal<PlaybackResumeTabMode>(
    DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  );
  const [savedCompletionSettingsJson, setSavedCompletionSettingsJson] = createSignal("{}");
  const [savedResumeTabMode, setSavedResumeTabMode] = createSignal<PlaybackResumeTabMode>(
    DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  );

  createEffect(() => {
    void getStoredPlaybackSettings().then((playbackSettings) => {
      setPresets(playbackSettings.presets);
      setSavedPresetsJson(JSON.stringify(playbackSettings.presets));
      setCompletionSettings(playbackSettings.completion);
      setSavedCompletionSettingsJson(JSON.stringify(playbackSettings.completion));
      setResumeTabMode(playbackSettings.resumeTabMode);
      setSavedResumeTabMode(playbackSettings.resumeTabMode);
    });
  });

  const hasUnsavedChanges = () =>
    JSON.stringify(presets()) !== savedPresetsJson() ||
    JSON.stringify(completionSettings()) !== savedCompletionSettingsJson() ||
    resumeTabMode() !== savedResumeTabMode();

  const completionNotificationMode = () => {
    const settings = completionSettings();

    if (settings.alertEnabled) {
      return "alert";
    }

    if (settings.playSoundEnabled) {
      return "sound";
    }

    return "none";
  };

  function handleAddCountPreset() {
    setPresets((currentPresets) => [...currentPresets, createRepeatPreset("count", 2)]);
  }

  function handleAddDurationPreset() {
    setPresets((currentPresets) => [...currentPresets, createRepeatPreset("duration", 10 * 60)]);
  }

  function handleDeletePreset(presetId: string) {
    setPresets((currentPresets) => currentPresets.filter((preset) => preset.id !== presetId));
  }

  function handleUpdateCountPreset(presetId: string, value: string) {
    const count = Math.max(parsePositiveInteger(value, 1), 1);

    setPresets((currentPresets) =>
      currentPresets.map((preset) =>
        preset.id === presetId && preset.mode === "count"
          ? createRepeatPreset("count", count, preset.id)
          : preset,
      ),
    );
  }

  function handleUpdateDurationPreset(
    presetId: string,
    field: "minutes" | "seconds",
    value: string,
  ) {
    setPresets((currentPresets) =>
      currentPresets.map((preset) => {
        if (preset.id !== presetId || preset.mode !== "duration") {
          return preset;
        }

        const { minutes, seconds } = splitDurationSeconds(preset.durationSeconds);
        const nextMinutes = field === "minutes" ? parsePositiveInteger(value, 0) : Number(minutes);
        const nextSeconds = field === "seconds" ? parsePositiveInteger(value, 0) : Number(seconds);
        const durationSeconds = nextMinutes * 60 + Math.min(nextSeconds, 59);

        return createRepeatPreset("duration", Math.max(durationSeconds, 1), preset.id);
      }),
    );
  }

  function updateCompletionSettings(partial: Partial<PlaybackCompletionSettings>) {
    setCompletionSettings((currentSettings) => ({
      ...currentSettings,
      ...partial,
    }));
  }

  function setCompletionNotificationMode(mode: "none" | "sound" | "alert") {
    updateCompletionSettings({
      playSoundEnabled: mode === "sound",
      alertEnabled: mode === "alert",
    });
  }

  async function handlePreviewCompletionSound() {
    const settings = completionSettings();

    if (!settings.playSoundEnabled) {
      props.onFeedback({
        text: "音を再生するを有効にしてください。",
        tone: "error",
      });
      return;
    }

    props.onFeedback(null);
    await playRepeatedAudio(completionSoundPath, {
      repeatCount: settings.soundRepeatCount,
      volume: settings.soundVolume / 100,
    });
  }

  async function handleSavePlaybackSettings() {
    props.onFeedback(null);

    try {
      const currentPlaybackSettings = await getStoredPlaybackSettings();
      const nextPlaybackSettings = sanitizePlaybackSettings({
        playlistRepeatEnabled: currentPlaybackSettings.playlistRepeatEnabled,
        resumeTabMode: resumeTabMode(),
        activeRepeatPresetId: currentPlaybackSettings.activeRepeatPresetId,
        presets: presets(),
        completion: completionSettings(),
      });

      await setStoredPlaybackSettings(nextPlaybackSettings);
      setPresets(nextPlaybackSettings.presets);
      setSavedPresetsJson(JSON.stringify(nextPlaybackSettings.presets));
      setCompletionSettings(nextPlaybackSettings.completion);
      setSavedCompletionSettingsJson(JSON.stringify(nextPlaybackSettings.completion));
      setResumeTabMode(nextPlaybackSettings.resumeTabMode);
      setSavedResumeTabMode(nextPlaybackSettings.resumeTabMode);
      props.onFeedback({ text: "リピート設定を更新しました。", tone: "success" });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "リピート設定の更新に失敗しました。",
        tone: "error",
      });
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">再生設定</h2>
        <p class="text-sm text-stone-400">再開方法、リピート条件、完了後の動作を編集します。</p>
      </div>

      <div class="space-y-3">
        <div class="space-y-3 rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-3">
          <div class="space-y-1">
            <p class="text-xs font-medium text-stone-100">再生タブが無い時の開き方</p>
            <p class="text-xs text-stone-500">
              再生中のタブが見つからない時に、現在のタブを使うか新しいタブを開くかを選びます。
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 text-xs text-stone-300">
              <input
                type="radio"
                name="resume-tab-mode"
                checked={resumeTabMode() === "new-tab"}
                onChange={() => setResumeTabMode("new-tab")}
              />
              <span>新しいタブで開く</span>
            </label>
            <label class="flex items-center gap-2 text-xs text-stone-300">
              <input
                type="radio"
                name="resume-tab-mode"
                checked={resumeTabMode() === "replace-current-tab"}
                onChange={() => setResumeTabMode("replace-current-tab")}
              />
              <span>現在のタブを上書きして開く</span>
            </label>
          </div>
        </div>

        <div class="space-y-3 rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-3">
          <div class="space-y-1">
            <p class="text-xs font-medium text-stone-100">各動画のリピート</p>
            <p class="text-xs text-stone-500">
              popup から選ぶ各動画リピートの候補を追加・編集します。
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="flex w-[310px] flex-col items-start rounded-2xl border border-stone-700 bg-stone-900 px-3 py-2 text-left transition hover:border-stone-500 hover:bg-stone-800"
              onClick={handleAddCountPreset}
            >
              <span class="text-xs font-medium text-stone-100">回数リピートを追加</span>
              <span class="text-xs text-stone-500">
                各動画を指定回数ぶん再生してから次へ進みます。
              </span>
            </button>
            <button
              type="button"
              class="flex w-[310px] flex-col items-start rounded-2xl border border-stone-700 bg-stone-900 px-3 py-2 text-left transition hover:border-stone-500 hover:bg-stone-800"
              onClick={handleAddDurationPreset}
            >
              <span class="text-xs font-medium text-stone-100">時間リピートを追加</span>
              <span class="text-xs text-stone-500">
                各動画を指定時間以上になるまで繰り返します。
              </span>
            </button>
          </div>

          <div class="space-y-2">
            <For each={presets()}>
              {(preset) => (
                <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-300">
                  <Show
                    when={preset.mode === "count"}
                    fallback={
                      <div class="flex flex-wrap items-center gap-2">
                        <span>時間リピート</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={
                            preset.mode === "duration"
                              ? splitDurationSeconds(preset.durationSeconds).minutes
                              : "0"
                          }
                          onInput={(event) =>
                            handleUpdateDurationPreset(
                              preset.id,
                              "minutes",
                              event.currentTarget.value,
                            )
                          }
                          class="w-14 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                        />
                        <span>分</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          inputMode="numeric"
                          value={
                            preset.mode === "duration"
                              ? splitDurationSeconds(preset.durationSeconds).seconds
                              : "0"
                          }
                          onInput={(event) =>
                            handleUpdateDurationPreset(
                              preset.id,
                              "seconds",
                              event.currentTarget.value,
                            )
                          }
                          class="w-14 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                        />
                        <span>秒</span>
                      </div>
                    }
                  >
                    <div class="flex items-center gap-2">
                      <span>回数リピート</span>
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={preset.mode === "count" ? preset.count.toString() : "1"}
                        onInput={(event) =>
                          handleUpdateCountPreset(preset.id, event.currentTarget.value)
                        }
                        class="w-14 rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                      />
                      <span>回</span>
                    </div>
                  </Show>

                  <button
                    type="button"
                    class="rounded-full border border-red-500/40 px-3 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/10"
                    onClick={() => handleDeletePreset(preset.id)}
                  >
                    削除
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="space-y-3 rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-3">
          <div class="space-y-1">
            <p class="text-xs font-medium text-stone-100">プレイリスト完了後（リピートなし時）</p>
            <p class="text-xs text-stone-500">
              プレイリスト全体のリピートが OFF で、最後の動画まで再生し終えた時に実行します。
            </p>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-stone-300">通知方法</p>
            <div class="flex flex-wrap items-center gap-4">
              <label class="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="radio"
                  name="playlist-completion-notification"
                  checked={completionNotificationMode() === "none"}
                  onChange={() => setCompletionNotificationMode("none")}
                />
                <span>何もしない</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="radio"
                  name="playlist-completion-notification"
                  checked={completionNotificationMode() === "sound"}
                  onChange={() => setCompletionNotificationMode("sound")}
                />
                <span>音を再生</span>
              </label>
              <label class="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="radio"
                  name="playlist-completion-notification"
                  checked={completionNotificationMode() === "alert"}
                  onChange={() => setCompletionNotificationMode("alert")}
                />
                <span>確認ダイアログを表示</span>
              </label>
            </div>
          </div>

          <Show when={completionNotificationMode() === "sound"}>
            <div class="flex flex-wrap items-center gap-2 text-xs text-stone-300">
              <span>音量</span>
              <input
                type="number"
                min="0"
                max="100"
                inputMode="numeric"
                value={completionSettings().soundVolume.toString()}
                onInput={(event) =>
                  updateCompletionSettings({
                    soundVolume: clampInteger(event.currentTarget.value, 0, 100, 50),
                  })
                }
                class="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100"
              />
              <span>%</span>
              <span>連続再生数</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={completionSettings().soundRepeatCount.toString()}
                onInput={(event) =>
                  updateCompletionSettings({
                    soundRepeatCount: Math.max(
                      clampInteger(event.currentTarget.value, 1, 99, 1),
                      1,
                    ),
                  })
                }
                class="w-16 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100"
              />
              <span>回</span>
              <button
                type="button"
                class="rounded-full border border-stone-600 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                onClick={() => void handlePreviewCompletionSound()}
              >
                設定通りに再生
              </button>
            </div>
          </Show>

          <label class="flex items-center gap-2 text-xs text-stone-300">
            <input
              type="checkbox"
              checked={completionSettings().focusTabEnabled}
              onChange={(event) =>
                updateCompletionSettings({
                  focusTabEnabled: event.currentTarget.checked,
                })
              }
            />
            <span>通知前に再生タブを前面に出す</span>
          </label>
        </div>

        <button
          type="button"
          class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            hasUnsavedChanges()
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
              : "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
          }`}
          onClick={() => void handleSavePlaybackSettings()}
        >
          リピート設定を保存
        </button>
      </div>
    </section>
  );
}
