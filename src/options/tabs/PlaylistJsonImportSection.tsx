import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js";

import { DEFAULT_PLAYLIST_TITLE_SOURCE } from "@/background/services/importPlaylist";
import {
  importPlaylistJson,
  parsePlaylistJsonPayload,
  type PlaylistJsonPayload,
} from "@/background/services/playlistJson";
import { PreviewPanel } from "@/options/components/PreviewPanel";
import { PreviewVideoList } from "@/options/components/PreviewVideoList";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type PreviewState =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; fileName: string; payload: PlaylistJsonPayload };

type PlaylistJsonImportSectionProps = {
  onImported: () => Promise<void> | void;
  videoMetadataState: VideoMetadataState | undefined;
};

export function PlaylistJsonImportSection(props: PlaylistJsonImportSectionProps) {
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [importing, setImporting] = createSignal(false);
  const [preview, setPreview] = createSignal<PreviewState>({ kind: "empty" });
  const [showAllPreview, setShowAllPreview] = createSignal(false);
  const [playlistTitle, setPlaylistTitle] = createSignal("");
  const [playlistMemo, setPlaylistMemo] = createSignal("");
  const readyPreview = createMemo(() => {
    const currentPreview = preview();
    return currentPreview.kind === "ready" ? currentPreview : null;
  });
  const errorPreview = createMemo(() => {
    const currentPreview = preview();
    return currentPreview.kind === "error" ? currentPreview : null;
  });
  const previewVideoIds = createMemo(() => {
    const videoIds = readyPreview()?.payload.playlist.videoIds ?? [];
    return showAllPreview() ? videoIds : videoIds.slice(0, 5);
  });
  const previewCountLabel = createMemo(() => {
    const visible = previewVideoIds().length;
    const total = readyPreview()?.payload.playlist.videoIds.length ?? 0;
    return `${visible}/${total}件表示中`;
  });
  const previewVideoMetadataState = createMemo<VideoMetadataState | undefined>(() => {
    const payload = readyPreview()?.payload;

    if (!payload) {
      return props.videoMetadataState;
    }

    return {
      ownersMap: {
        ...(props.videoMetadataState?.ownersMap ?? {}),
        ...payload.owners,
      },
      videoMetadataMap: {
        ...(props.videoMetadataState?.videoMetadataMap ?? {}),
        ...payload.videoMetadata,
      },
    };
  });
  let importFileInput: HTMLInputElement | undefined;

  createEffect(() => {
    const currentReadyPreview = readyPreview();

    if (!currentReadyPreview) {
      setPlaylistTitle("");
      setPlaylistMemo("");
      return;
    }

    setPlaylistTitle(currentReadyPreview.payload.playlist.title ?? "");
    setPlaylistMemo(currentReadyPreview.payload.playlist.memo ?? "");
  });

  async function handleSelectFile(file: File | null | undefined) {
    if (!file) {
      setPreview({ kind: "empty" });
      return;
    }

    setFeedback(null);
    setShowAllPreview(false);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const payload = parsePlaylistJsonPayload(parsed);

      setPreview({
        kind: "ready",
        fileName: file.name,
        payload,
      });
    } catch (error) {
      setPreview({
        kind: "error",
        message:
          error instanceof Error ? error.message : "プレイリスト JSON の解析に失敗しました。",
      });
    }
  }

  async function handleImport() {
    const payload = readyPreview()?.payload;

    if (!payload) {
      return;
    }

    setFeedback(null);
    setImporting(true);

    try {
      await importPlaylistJson({
        ...payload,
        playlist: {
          ...payload.playlist,
          title: playlistTitle(),
          memo: playlistMemo(),
        },
      });
      if (importFileInput) {
        importFileInput.value = "";
      }
      setPreview({ kind: "empty" });
      setShowAllPreview(false);
      setFeedback("プレイリスト JSON をインポートしました。");
      await props.onImported();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "プレイリスト JSON のインポートに失敗しました。",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">プレイリスト JSON をインポート</h2>
        <p class="text-sm leading-6 text-stone-400">
          playlist、動画メタデータ、投稿者データをまとめてプレイリストとして取り込みます。
        </p>
      </div>

      <div class="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] lg:items-start lg:gap-6 lg:space-y-0">
        <div class="space-y-4">
          <div class="space-y-2">
            <input
              ref={(element) => {
                importFileInput = element;
              }}
              type="file"
              accept="application/json"
              class="hidden"
              onChange={(event) => void handleSelectFile(event.currentTarget.files?.[0])}
            />
            <button
              type="button"
              onClick={() => importFileInput?.click()}
              disabled={importing()}
              class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
            >
              JSON ファイルを選択
            </button>
          </div>

          <Show when={readyPreview()}>
            <div class="grid gap-4">
              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">title</span>
                <input
                  type="text"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                  value={playlistTitle()}
                  onInput={(event) => setPlaylistTitle(event.currentTarget.value)}
                  placeholder={`YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.playlistJsonImport}`}
                />
              </label>

              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">memo</span>
                <textarea
                  rows="4"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none transition focus:border-stone-500"
                  value={playlistMemo()}
                  onInput={(event) => setPlaylistMemo(event.currentTarget.value)}
                  placeholder="未指定"
                />
              </label>
            </div>
          </Show>

          <div class="flex items-center justify-between gap-4">
            <Show when={feedback()}>
              {(message) => <p class="text-sm text-stone-400">{message()}</p>}
            </Show>
            <button
              type="button"
              disabled={preview().kind !== "ready" || importing()}
              onClick={() => void handleImport()}
              class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
            >
              インポート
            </button>
          </div>
        </div>

        <PreviewPanel
          title="インポート前プレビュー"
          headerRight={
            <Show when={readyPreview()}>
              <div class="flex items-center gap-3">
                <p class="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {previewCountLabel()}
                </p>
                <Show when={(readyPreview()?.payload.playlist.videoIds.length ?? 0) > 5}>
                  <button
                    type="button"
                    class="text-xs text-stone-400 transition hover:text-stone-200 disabled:cursor-default disabled:text-stone-600"
                    disabled={showAllPreview()}
                    onClick={() => setShowAllPreview(true)}
                  >
                    {showAllPreview() ? "全件表示中" : "全件読み込む"}
                  </button>
                </Show>
              </div>
            </Show>
          }
        >
          <Switch
            fallback={
              <div class="space-y-3">
                <Show when={readyPreview()}>
                  {(currentReadyPreview) => (
                    <div class="space-y-1 text-sm text-stone-400">
                      <p>ファイル: {currentReadyPreview().fileName}</p>
                      <p>動画数: {currentReadyPreview().payload.playlist.videoIds.length} 件</p>
                    </div>
                  )}
                </Show>
                <PreviewVideoList
                  videoIds={previewVideoIds()}
                  videoMetadataState={previewVideoMetadataState()}
                />
              </div>
            }
          >
            <Match when={preview().kind === "empty"}>
              <p class="text-sm leading-6 text-stone-400">
                プレイリスト JSON を選択すると、インポート前に内容を表示します。
              </p>
            </Match>

            <Match when={preview().kind === "error"}>
              <p class="text-sm leading-6 text-red-300">{errorPreview()?.message ?? ""}</p>
            </Match>
          </Switch>
        </PreviewPanel>
      </div>
    </section>
  );
}
