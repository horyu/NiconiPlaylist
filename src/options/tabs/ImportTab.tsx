import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import {
  DEFAULT_PLAYLIST_TITLE_SOURCE,
  createStoredPlaylist,
  importSharedPlaylist,
} from "@/background/services/importPlaylist";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import { parseVideoIdInputLines } from "@/lib/videoIdInput";

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
type DirectInputPreviewState =
  | {
      kind: "empty";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "ready";
      videoIds: string[];
    };

type ImportTabProps = {
  onImported: () => Promise<void> | void;
};

const DEFAULT_SHARED_URL =
  "https://horyu.github.io/NiconiPlaylist/import?videoIds=BOQS5OiOBd-4tQKovKop";

export function ImportTab(props: ImportTabProps) {
  const [sharedUrl, setSharedUrl] = createSignal(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
  const [directInput, setDirectInput] = createSignal("");
  const [sharedTitle, setSharedTitle] = createSignal("");
  const [sharedMemo, setSharedMemo] = createSignal("");
  const [directTitle, setDirectTitle] = createSignal("");
  const [directMemo, setDirectMemo] = createSignal("");
  const [sharedUrlFeedback, setSharedUrlFeedback] = createSignal<string | null>(null);
  const [directInputFeedback, setDirectInputFeedback] = createSignal<string | null>(null);
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
  const directInputPreview = createMemo<DirectInputPreviewState>(() => {
    const value = directInput().trim();

    if (!value) {
      return { kind: "empty" };
    }

    try {
      return {
        kind: "ready",
        videoIds: parseVideoIdInputLines(value),
      };
    } catch (error) {
      return {
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "watch URL または動画IDの入力を解析できませんでした。",
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
  const readyDirectInputPreview = createMemo<Extract<
    DirectInputPreviewState,
    { kind: "ready" }
  > | null>(() => {
    const current = directInputPreview();
    return current.kind === "ready" ? current : null;
  });
  const errorDirectInputPreview = createMemo<Extract<
    DirectInputPreviewState,
    { kind: "error" }
  > | null>(() => {
    const current = directInputPreview();
    return current.kind === "error" ? current : null;
  });

  createEffect(() => {
    const current = readyPreview();

    if (!current) {
      setSharedTitle("");
      setSharedMemo("");
      return;
    }

    setSharedTitle(current.title ?? "");
    setSharedMemo(current.memo ?? "");
  });

  async function handleImport(event: SubmitEvent) {
    event.preventDefault();
    setSharedUrlFeedback(null);

    try {
      await importSharedPlaylist(sharedUrl().trim(), {
        title: sharedTitle(),
        memo: sharedMemo(),
      });
      setSharedUrl(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
      setSharedTitle("");
      setSharedMemo("");
      setSharedUrlFeedback("プレイリストをインポートしました。");
      await props.onImported();
    } catch (error) {
      setSharedUrlFeedback(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  async function handleCreateFromVideoIds(event: SubmitEvent) {
    event.preventDefault();
    setDirectInputFeedback(null);

    const currentPreview = directInputPreview();

    if (currentPreview.kind !== "ready") {
      return;
    }

    try {
      await createStoredPlaylist(
        {
          videoIds: currentPreview.videoIds,
          title: directTitle(),
          memo: directMemo(),
        },
        {
          defaultTitleSource: DEFAULT_PLAYLIST_TITLE_SOURCE.videoIdInput,
        },
      );
      setDirectInput("");
      setDirectTitle("");
      setDirectMemo("");
      setDirectInputFeedback("プレイリストを作成しました。");
      await props.onImported();
    } catch (error) {
      setDirectInputFeedback(
        error instanceof Error ? error.message : "プレイリストの作成に失敗しました。",
      );
    }
  }

  return (
    <div class="space-y-6">
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
          <div class="grid gap-4 lg:grid-cols-2">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">title</span>
              <input
                type="text"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder={
                  readyPreview()?.title ??
                  `YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.sharedUrlImport}`
                }
                value={sharedTitle()}
                onInput={(event) => setSharedTitle(event.currentTarget.value)}
              />
            </label>

            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">memo</span>
              <input
                type="text"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder={readyPreview()?.memo ?? "未指定"}
                value={sharedMemo()}
                onInput={(event) => setSharedMemo(event.currentTarget.value)}
              />
            </label>
          </div>

          <section class="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
            <div class="mb-3 space-y-1">
              <h3 class="text-sm font-medium text-stone-100">インポート前プレビュー</h3>
              <p class="text-xs leading-5 text-stone-500">
                件数と先頭数件の videoId を保存前に確認します。
              </p>
            </div>

            <Switch
              fallback={
                <div class="space-y-3">
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
            <Show when={sharedUrlFeedback()}>
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

      <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
        <div class="mb-4 space-y-1">
          <h2 class="text-lg font-semibold text-stone-50">watch URL / 動画ID から作成</h2>
          <p class="text-sm leading-6 text-stone-400">
            watch URL または動画IDを複数行で入力し、そのまま新規プレイリストとして保存します。
          </p>
        </div>

        <form class="space-y-4" onSubmit={handleCreateFromVideoIds}>
          <label class="block space-y-2">
            <span class="text-sm font-medium text-stone-200">watch URL / 動画ID</span>
            <textarea
              rows="8"
              class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
              placeholder={["sm9", "https://www.nicovideo.jp/watch/so5364283", "nm2829323"].join(
                "\n",
              )}
              value={directInput()}
              onInput={(event) => setDirectInput(event.currentTarget.value)}
            />
          </label>
          <div class="grid gap-4 lg:grid-cols-2">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">title</span>
              <input
                type="text"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder={`YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.videoIdInput}`}
                value={directTitle()}
                onInput={(event) => setDirectTitle(event.currentTarget.value)}
              />
            </label>

            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">memo</span>
              <input
                type="text"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder="未指定"
                value={directMemo()}
                onInput={(event) => setDirectMemo(event.currentTarget.value)}
              />
            </label>
          </div>

          <section class="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
            <div class="mb-3 space-y-1">
              <h3 class="text-sm font-medium text-stone-100">作成前プレビュー</h3>
              <p class="text-xs leading-5 text-stone-500">
                件数と先頭数件の videoId を確認してから保存します。
              </p>
            </div>

            <Switch
              fallback={
                <div class="space-y-3">
                  <div class="space-y-1">
                    <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Videos</p>
                    <p class="text-sm text-stone-300">
                      {readyDirectInputPreview()?.videoIds.length ?? 0} 件
                    </p>
                  </div>

                  <div class="space-y-2">
                    <p class="text-xs uppercase tracking-[0.2em] text-stone-500">First videoIds</p>
                    <ul class="space-y-2">
                      <For each={readyDirectInputPreview()?.videoIds.slice(0, 5) ?? []}>
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
              <Match when={directInputPreview().kind === "empty"}>
                <p class="text-sm leading-6 text-stone-400">
                  複数行で入力すると、作成前に videoId と件数を表示します。
                </p>
              </Match>

              <Match when={directInputPreview().kind === "error"}>
                <p class="text-sm leading-6 text-red-300">
                  {errorDirectInputPreview()?.message ?? ""}
                </p>
              </Match>
            </Switch>
          </section>

          <div class="flex items-center justify-between gap-4">
            <Show when={directInputFeedback()}>
              {(message) => <p class="text-sm text-stone-400">{message()}</p>}
            </Show>
            <button
              type="submit"
              disabled={directInputPreview().kind !== "ready"}
              class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
            >
              プレイリストを作成
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
