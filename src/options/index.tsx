import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";

import { usePlaylistsState } from "@/options/hooks/usePlaylistsState";
import { useVideoMetadataState } from "@/options/hooks/useVideoMetadataState";
import { DataTab } from "@/options/tabs/DataTab";
import { DirectInputCreateSection } from "@/options/tabs/DirectInputCreateSection";
import { ImportSection } from "@/options/tabs/ImportSection";
import { PlaylistsTab } from "@/options/tabs/PlaylistsTab";
import { RepeatSettingsTab } from "@/options/tabs/RepeatSettingsTab";
import type { OptionsToast } from "@/options/toast";

type TabKey = "import" | "create" | "playlists" | "repeat" | "data";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "playlists", label: "プレイリスト" },
  { key: "import", label: "インポート" },
  { key: "create", label: "作成" },
  { key: "repeat", label: "再生" },
  { key: "data", label: "データ" },
];

export default function OptionsPage() {
  const [activeTab, setActiveTab] = createSignal<TabKey>("playlists");
  const [toast, setToast] = createSignal<OptionsToast | null>(null);
  const [state, { refetch }] = usePlaylistsState();
  const [videoMetadataState, { refetch: refetchVideoMetadataState }] = useVideoMetadataState();

  async function refreshState() {
    await Promise.all([refetch(), refetchVideoMetadataState()]);
  }

  createEffect(() => {
    const currentToast = toast();

    if (!currentToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timer);
    };
  });

  return (
    <main class="min-h-screen bg-stone-950 text-stone-100">
      <Show when={toast()}>
        {(currentToast) => (
          <div class="fixed right-10 top-[5.5rem] z-50">
            <div
              class={[
                "flex items-center gap-3 rounded-md px-4 py-2 text-sm shadow-lg shadow-black/25",
                currentToast().tone === "success"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-rose-100 text-rose-900",
              ].join(" ")}
            >
              <span>{currentToast().text}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                aria-label="トーストを閉じる"
                class="text-base leading-none opacity-70 transition hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </Show>

      <div class="flex min-h-screen w-full flex-col gap-6 px-6 py-6 lg:px-10">
        <header class="flex flex-col gap-4 border-b border-stone-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-[0.24em] text-stone-500">
              NiconiPlaylist
            </p>
            <h1 class="text-2xl font-semibold text-stone-50">Options</h1>
            <p class="text-sm text-stone-400">
              プレイリストの取り込み、作成、保存済みプレイリストの管理を行います。
            </p>
          </div>

          <nav class="flex flex-wrap items-center gap-2">
            <For each={TAB_LABELS}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setToast(null);
                  }}
                  class={[
                    "rounded-md border px-4 py-2 text-sm font-medium transition",
                    activeTab() === tab.key
                      ? "border-stone-100 bg-stone-100 text-stone-950"
                      : "border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              )}
            </For>
          </nav>
        </header>

        <Switch>
          <Match when={activeTab() === "import"}>
            <ImportSection onImported={refreshState} videoMetadataState={videoMetadataState()} />
          </Match>

          <Match when={activeTab() === "create"}>
            <DirectInputCreateSection
              onImported={refreshState}
              videoMetadataState={videoMetadataState()}
            />
          </Match>

          <Match when={activeTab() === "playlists"}>
            <PlaylistsTab
              state={state()}
              videoMetadataState={videoMetadataState()}
              loading={state.loading}
              error={state.error}
              onActivated={refreshState}
              onDeleted={refreshState}
              onUpdated={refreshState}
              onFeedback={setToast}
            />
          </Match>

          <Match when={activeTab() === "repeat"}>
            <RepeatSettingsTab onFeedback={setToast} />
          </Match>

          <Match when={activeTab() === "data"}>
            <DataTab onFeedback={setToast} onUpdated={refreshState} />
          </Match>
        </Switch>
      </div>
    </main>
  );
}
