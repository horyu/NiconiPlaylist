import { createSignal, For, Match, Show, Switch } from "solid-js";

import { usePlaylistsState } from "@/options/hooks/usePlaylistsState";
import { ImportTab } from "@/options/tabs/ImportTab";
import { PlaylistsTab } from "@/options/tabs/PlaylistsTab";

type TabKey = "import" | "playlists";

const TAB_LABELS: { key: TabKey; label: string }[] = [
  { key: "import", label: "インポート" },
  { key: "playlists", label: "プレイリスト" },
];

export default function OptionsPage() {
  const [activeTab, setActiveTab] = createSignal<TabKey>("import");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [state, { refetch }] = usePlaylistsState();

  async function refreshState() {
    await refetch();
  }

  return (
    <main class="min-h-screen bg-stone-950 text-stone-100">
      <div class="flex min-h-screen w-full flex-col gap-6 px-6 py-6 lg:px-10">
        <header class="flex flex-col gap-4 border-b border-stone-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div class="space-y-1">
            <p class="text-xs font-medium uppercase tracking-[0.24em] text-stone-500">
              NiconiPlaylist
            </p>
            <h1 class="text-2xl font-semibold text-stone-50">Options</h1>
            <p class="text-sm text-stone-400">
              プレイリストのインポートと保存済みプレイリストの管理を行います。
            </p>
          </div>

          <nav class="flex flex-wrap items-center gap-2">
            <For each={TAB_LABELS}>
              {(tab) => (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.key);
                    setFeedback(null);
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
            <ImportTab onImported={refreshState} />
          </Match>

          <Match when={activeTab() === "playlists"}>
            <div class="space-y-4">
              <Show when={feedback()}>
                {(message) => (
                  <div class="rounded-2xl border border-stone-700 bg-stone-900/80 px-4 py-3 text-sm text-stone-300">
                    {message()}
                  </div>
                )}
              </Show>
              <PlaylistsTab
                state={state()}
                loading={state.loading}
                error={state.error}
                onActivated={refreshState}
                onDeleted={refreshState}
                onFeedback={setFeedback}
              />
            </div>
          </Match>
        </Switch>
      </div>
    </main>
  );
}
