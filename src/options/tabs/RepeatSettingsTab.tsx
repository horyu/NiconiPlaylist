import { createEffect, createSignal, For, Show } from "solid-js";

import {
  getStoredRepeatSettings,
  setStoredRepeatSettings,
} from "@/background/services/repeatSettings";
import { createRepeatPreset, sanitizeRepeatSettings } from "@/lib/playlistLoop";
import type { RepeatPreset } from "@/lib/types";

type RepeatSettingsTabProps = {
  onFeedback: (message: string | null) => void;
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

export function RepeatSettingsTab(props: RepeatSettingsTabProps) {
  const [presets, setPresets] = createSignal<RepeatPreset[]>([]);
  const [savedPresetsJson, setSavedPresetsJson] = createSignal("[]");

  createEffect(() => {
    void getStoredRepeatSettings().then((repeatSettings) => {
      setPresets(repeatSettings.presets);
      setSavedPresetsJson(JSON.stringify(repeatSettings.presets));
    });
  });

  const hasUnsavedChanges = () => JSON.stringify(presets()) !== savedPresetsJson();

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

  async function handleSaveRepeatSettings() {
    props.onFeedback(null);

    try {
      const currentRepeatSettings = await getStoredRepeatSettings();
      const nextRepeatSettings = sanitizeRepeatSettings({
        activeRepeatPresetId: currentRepeatSettings.activeRepeatPresetId,
        presets: presets(),
      });

      await setStoredRepeatSettings(nextRepeatSettings);
      setPresets(nextRepeatSettings.presets);
      setSavedPresetsJson(JSON.stringify(nextRepeatSettings.presets));
      props.onFeedback("リピート設定を更新しました。");
    } catch (error) {
      props.onFeedback(
        error instanceof Error ? error.message : "リピート設定の更新に失敗しました。",
      );
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">再生設定</h2>
        <p class="text-sm text-stone-400">popup から選ぶリピート条件を編集します。</p>
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="flex w-[310px] flex-col items-start rounded-2xl border border-stone-700 bg-stone-950/70 px-3 py-2 text-left transition hover:border-stone-500 hover:bg-stone-900"
            onClick={handleAddCountPreset}
          >
            <span class="text-xs font-medium text-stone-100">回数リピートを追加</span>
            <span class="text-xs text-stone-500">
              各動画を指定回数ぶん再生してから次へ進みます。
            </span>
          </button>
          <button
            type="button"
            class="flex w-[310px] flex-col items-start rounded-2xl border border-stone-700 bg-stone-950/70 px-3 py-2 text-left transition hover:border-stone-500 hover:bg-stone-900"
            onClick={handleAddDurationPreset}
          >
            <span class="text-xs font-medium text-stone-100">時間リピートを追加</span>
            <span class="text-xs text-stone-500">各動画を指定時間以上になるまで繰り返します。</span>
          </button>
        </div>

        <div class="space-y-2">
          <For each={presets()}>
            {(preset) => (
              <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-800 bg-stone-950/70 px-3 py-2 text-xs text-stone-300">
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
                        class="w-14 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100"
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
                        class="w-14 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100"
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
                      class="w-14 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-100"
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

        <button
          type="button"
          class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            hasUnsavedChanges()
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
              : "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
          }`}
          onClick={() => void handleSaveRepeatSettings()}
        >
          リピート設定を保存
        </button>
      </div>
    </section>
  );
}
