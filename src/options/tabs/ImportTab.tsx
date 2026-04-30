import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import { importSharedPlaylist } from "@/background/services/importPlaylist";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";

type PreviewState =
  | {
      kind: "empty";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "ready";
      title?: string;
      memo?: string;
      videoIds: string[];
    };

type ErrorPreviewState = Extract<PreviewState, { kind: "error" }>;
type ReadyPreviewState = Extract<PreviewState, { kind: "ready" }>;

type ImportTabProps = {
  onImported: () => Promise<void> | void;
};

const DEFAULT_SHARED_URL =
  "https://horyu.github.io/NiconiPlaylist/import?videoIds=BOQS5OiOBd-4tQKovKop";

export function ImportTab(props: ImportTabProps) {
  const [sharedUrl, setSharedUrl] = createSignal(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const preview = createMemo<PreviewState>(() => {
    const value = sharedUrl().trim();

    if (!value) {
      return { kind: "empty" };
    }

    try {
      return { kind: "ready", ...parseSharedPlaylistUrl(value) };
    } catch (error) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : "共有 URL を解析できませんでした。",
      };
    }
  });
  const readyPreview = createMemo<ReadyPreviewState | null>(() => {
    const current = preview();
    return current.kind === "ready" ? current : null;
  });
  const errorPreview = createMemo<ErrorPreviewState | null>(() => {
    const current = preview();
    return current.kind === "error" ? current : null;
  });

  async function handleImport(event: SubmitEvent) {
    event.preventDefault();
    setFeedback(null);

    try {
      await importSharedPlaylist(sharedUrl().trim());
      setSharedUrl(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
      setFeedback("プレイリストをインポートしました。");
      await props.onImported();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 space-y-1">
        <h2 class="text-lg font-semibold text-stone-50">共有 URL をインポート</h2>
        <p class="text-sm leading-6 text-stone-400">
          共有 URL を貼り付けて保存前に内容を確認し、プレイリストとして取り込みます。
        </p>
      </div>

      <form class="space-y-4" onSubmit={handleImport}>
        <label class="block space-y-2">
          <span class="text-sm font-medium text-stone-200">共有 URL</span>
          <input
            type="url"
            class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
            placeholder="https://horyu.github.io/NiconiPlaylist/import?videoIds=..."
            value={sharedUrl()}
            onInput={(event) => setSharedUrl(event.currentTarget.value)}
          />
        </label>

        <section class="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
          <div class="mb-3 space-y-1">
            <h3 class="text-sm font-medium text-stone-100">インポート前プレビュー</h3>
            <p class="text-xs leading-5 text-stone-500">
              title、memo、件数、先頭数件の videoId を保存前に確認します。
            </p>
          </div>

          <Switch
            fallback={
              <div class="space-y-3">
                <div class="space-y-1">
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Title</p>
                  <p class="text-sm text-stone-300">{readyPreview()?.title ?? "未指定"}</p>
                </div>

                <div class="space-y-1">
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Memo</p>
                  <p class="text-sm leading-6 text-stone-300">{readyPreview()?.memo ?? "未指定"}</p>
                </div>

                <div class="space-y-1">
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Videos</p>
                  <p class="text-sm text-stone-300">{readyPreview()?.videoIds.length ?? 0} 件</p>
                </div>

                <div class="space-y-2">
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">First videoIds</p>
                  <ul class="space-y-2">
                    <For each={readyPreview()?.videoIds.slice(0, 5) ?? []}>
                      {(videoId) => (
                        <li class="rounded-xl border border-stone-800 bg-stone-900/60 px-3 py-2 text-sm text-stone-300">
                          {videoId}
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </div>
            }
          >
            <Match when={preview().kind === "empty"}>
              <p class="text-sm leading-6 text-stone-400">
                共有 URL を入力すると、インポート前に内容を表示します。
              </p>
            </Match>

            <Match when={preview().kind === "error"}>
              <p class="text-sm leading-6 text-red-300">{errorPreview()?.message ?? ""}</p>
            </Match>
          </Switch>
        </section>

        <div class="flex items-center justify-between gap-4">
          <Show when={feedback()}>
            {(message) => <p class="text-sm text-stone-400">{message()}</p>}
          </Show>
          <button
            type="submit"
            disabled={preview().kind !== "ready"}
            class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
          >
            インポート
          </button>
        </div>
      </form>
    </section>
  );
}
