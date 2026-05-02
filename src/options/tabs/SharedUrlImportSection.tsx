import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js";

import {
  DEFAULT_PLAYLIST_TITLE_SOURCE,
  importSharedPlaylist,
} from "@/background/services/importPlaylist";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import { PreviewPanel } from "@/options/components/PreviewPanel";
import { PreviewVideoList } from "@/options/components/PreviewVideoList";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

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

type SharedUrlImportSectionProps = {
  onImported: () => Promise<void> | void;
  videoMetadataState: VideoMetadataState | undefined;
};

const DEFAULT_SHARED_URL =
  "https://horyu.github.io/NiconiPlaylist/import?videoIds=BOQS5OiOBd-4tQKovKop";

export function SharedUrlImportSection(props: SharedUrlImportSectionProps) {
  const [sharedUrl, setSharedUrl] = createSignal(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
  const [showAllSharedPreview, setShowAllSharedPreview] = createSignal(false);
  const [sharedTitle, setSharedTitle] = createSignal("");
  const [sharedMemo, setSharedMemo] = createSignal("");
  const [sharedUrlFeedback, setSharedUrlFeedback] = createSignal<string | null>(null);
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
  const sharedPreviewVideoIds = createMemo(() => {
    const videoIds = readyPreview()?.videoIds ?? [];
    return showAllSharedPreview() ? videoIds : videoIds.slice(0, 5);
  });
  const sharedPreviewCountLabel = createMemo(() => {
    const visible = sharedPreviewVideoIds().length;
    const total = readyPreview()?.videoIds.length ?? 0;
    return `${visible}/${total}件表示中`;
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

  createEffect(() => {
    const videoIds = sharedPreviewVideoIds();

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
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
      setShowAllSharedPreview(false);
      setSharedTitle("");
      setSharedMemo("");
      setSharedUrlFeedback("プレイリストをインポートしました。");
      await props.onImported();
    } catch (error) {
      setSharedUrlFeedback(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">共有 URL をインポート</h2>
        <p class="text-sm leading-6 text-stone-400">
          共有 URL を貼り付けて保存前に内容を確認し、プレイリストとして取り込みます。
        </p>
      </div>

      <form onSubmit={handleImport}>
        <div class="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] lg:items-start lg:gap-6 lg:space-y-0">
          <div class="space-y-4">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">共有 URL</span>
              <input
                type="url"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder="https://horyu.github.io/NiconiPlaylist/import?videoIds=..."
                value={sharedUrl()}
                onInput={(event) => {
                  setSharedUrl(event.currentTarget.value);
                  setShowAllSharedPreview(false);
                }}
              />
            </label>
            <div class="grid gap-4">
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
          </div>

          <PreviewPanel
            title="インポート前プレビュー"
            headerRight={
              <Show when={preview().kind === "ready"}>
                <>
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">
                    {sharedPreviewCountLabel()}
                  </p>
                  <Show when={(readyPreview()?.videoIds.length ?? 0) > 5}>
                    <button
                      type="button"
                      class="text-xs text-stone-400 transition hover:text-stone-200 disabled:cursor-default disabled:text-stone-600"
                      disabled={showAllSharedPreview()}
                      onClick={() => setShowAllSharedPreview(true)}
                    >
                      {showAllSharedPreview() ? "全件表示中" : "全件読み込む"}
                    </button>
                  </Show>
                </>
              </Show>
            }
          >
            <Switch
              fallback={
                <div class="space-y-3">
                  <div class="space-y-2">
                    <PreviewVideoList
                      videoIds={sharedPreviewVideoIds()}
                      videoMetadataState={props.videoMetadataState}
                    />
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
          </PreviewPanel>
        </div>
      </form>
    </section>
  );
}
