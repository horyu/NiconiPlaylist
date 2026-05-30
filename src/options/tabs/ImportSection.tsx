import { createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";

import {
  DEFAULT_PLAYLIST_TITLE_SOURCE,
  importSharedPlaylist,
} from "@/background/services/importPlaylist";
import {
  importPlaylistJson,
  parsePlaylistJsonPayload,
  type PlaylistJsonPayload,
} from "@/background/services/playlistJson";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import { PreviewPanel } from "@/options/components/PreviewPanel";
import { PreviewVideoList } from "@/options/components/PreviewVideoList";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type ImportSource = "shared-url" | "playlist-json";

type SharedUrlPreviewState =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; title?: string; memo?: string; videoIds: string[] };

type PlaylistJsonPreviewState =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ready"; fileName: string; payload: PlaylistJsonPayload };

type ImportSectionProps = {
  onImported: () => Promise<void> | void;
  videoMetadataState: VideoMetadataState | undefined;
};

const DEFAULT_SHARED_URL =
  "https://horyu.github.io/NiconiPlaylist/?videoIds=AwYBjBLk6I4F37i1AoOw2QLk6I4F37i1Ag";

function getSourceLabel(source: ImportSource): string {
  switch (source) {
    case "shared-url":
      return "共有URL";
    case "playlist-json":
      return "プレイリストJSON";
  }
}

function getDefaultTitlePlaceholder(source: ImportSource): string {
  switch (source) {
    case "shared-url":
      return `YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.sharedUrlImport}`;
    case "playlist-json":
      return `YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.playlistJsonImport}`;
  }
}

export function ImportSection(props: ImportSectionProps) {
  const [source, setSource] = createSignal<ImportSource>("shared-url");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [importing, setImporting] = createSignal(false);
  const [showAllPreview, setShowAllPreview] = createSignal(false);
  const [playlistTitle, setPlaylistTitle] = createSignal("");
  const [playlistMemo, setPlaylistMemo] = createSignal("");
  const [sharedUrl, setSharedUrl] = createSignal(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
  const [playlistJsonPreview, setPlaylistJsonPreview] = createSignal<PlaylistJsonPreviewState>({
    kind: "empty",
  });
  let playlistJsonFileInput: HTMLInputElement | undefined;

  const sharedUrlPreview = createMemo<SharedUrlPreviewState>(() => {
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
  const readyPlaylistJsonPreview = createMemo(() => {
    const preview = playlistJsonPreview();
    return preview.kind === "ready" ? preview : null;
  });
  const currentReadyPreview = createMemo(() => {
    if (source() === "shared-url") {
      const preview = sharedUrlPreview();

      return preview.kind === "ready"
        ? {
            kind: "ready" as const,
            fileName: null,
            memo: preview.memo,
            owners: null,
            title: preview.title,
            videoIds: preview.videoIds,
            videoMetadata: null,
          }
        : null;
    }

    const preview = playlistJsonPreview();

    return preview.kind === "ready"
      ? {
          kind: "ready" as const,
          fileName: preview.fileName,
          memo: preview.payload.playlist.memo,
          owners: preview.payload.owners,
          title: preview.payload.playlist.title,
          videoIds: preview.payload.playlist.videoIds,
          videoMetadata: preview.payload.videoMetadata,
        }
      : null;
  });
  const currentErrorPreview = createMemo(() => {
    if (source() === "shared-url") {
      const preview = sharedUrlPreview();
      return preview.kind === "error" ? preview : null;
    }

    const preview = playlistJsonPreview();
    return preview.kind === "error" ? preview : null;
  });
  const previewVideoIds = createMemo(() => {
    const videoIds = currentReadyPreview()?.videoIds ?? [];
    return showAllPreview() ? videoIds : videoIds.slice(0, 5);
  });
  const previewCountLabel = createMemo(() => {
    const visible = previewVideoIds().length;
    const total = currentReadyPreview()?.videoIds.length ?? 0;
    return `${visible}/${total}件表示中`;
  });
  const previewVideoMetadataState = createMemo<VideoMetadataState | undefined>(() => {
    const preview = currentReadyPreview();

    if (!preview || !preview.videoMetadata || !preview.owners) {
      return props.videoMetadataState;
    }

    return {
      ownersMap: {
        ...(props.videoMetadataState?.ownersMap ?? {}),
        ...preview.owners,
      },
      videoMetadataMap: {
        ...(props.videoMetadataState?.videoMetadataMap ?? {}),
        ...preview.videoMetadata,
      },
    };
  });

  createEffect(() => {
    const preview = currentReadyPreview();

    if (!preview) {
      setPlaylistTitle("");
      setPlaylistMemo("");
      return;
    }

    setPlaylistTitle(preview.title ?? "");
    setPlaylistMemo(preview.memo ?? "");
  });

  createEffect(() => {
    const videoIds = previewVideoIds();

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  async function handleSelectPlaylistJsonFile(file: File | null | undefined) {
    if (!file) {
      setPlaylistJsonPreview({ kind: "empty" });
      return;
    }

    setFeedback(null);
    setShowAllPreview(false);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const payload = parsePlaylistJsonPayload(parsed);

      setPlaylistJsonPreview({
        kind: "ready",
        fileName: file.name,
        payload,
      });
    } catch (error) {
      setPlaylistJsonPreview({
        kind: "error",
        message:
          error instanceof Error ? error.message : "プレイリスト JSON の解析に失敗しました。",
      });
    }
  }

  async function handleImport(event: SubmitEvent) {
    event.preventDefault();
    setFeedback(null);

    if (!currentReadyPreview()) {
      return;
    }

    setImporting(true);

    try {
      if (source() === "shared-url") {
        await importSharedPlaylist(sharedUrl().trim(), {
          title: playlistTitle(),
          memo: playlistMemo(),
        });
        setSharedUrl(import.meta.env.DEV ? DEFAULT_SHARED_URL : "");
      } else {
        const preview = playlistJsonPreview();

        if (preview.kind !== "ready") {
          return;
        }

        await importPlaylistJson({
          ...preview.payload,
          playlist: {
            ...preview.payload.playlist,
            title: playlistTitle(),
            memo: playlistMemo(),
          },
        });
        setPlaylistJsonPreview({ kind: "empty" });
        if (playlistJsonFileInput) {
          playlistJsonFileInput.value = "";
        }
      }

      setShowAllPreview(false);
      setPlaylistTitle("");
      setPlaylistMemo("");
      setFeedback("プレイリストをインポートしました。");
      await props.onImported();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "インポートに失敗しました。");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">プレイリストをインポート</h2>
        <p class="text-sm leading-6 text-stone-400">
          共有URLやプレイリストJSONを、内容を確認しながら取り込みます。
        </p>
      </div>

      <form onSubmit={handleImport}>
        <div class="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] lg:items-start lg:gap-6 lg:space-y-0">
          <div class="space-y-4">
            <div class="space-y-2">
              <span class="text-sm font-medium text-stone-200">インポート元</span>
              <div class="inline-flex rounded-2xl border border-stone-700 bg-stone-950 p-1">
                <For each={["shared-url", "playlist-json"] as const}>
                  {(sourceKey) => (
                    <button
                      type="button"
                      onClick={() => {
                        setSource(sourceKey);
                        setFeedback(null);
                        setShowAllPreview(false);
                      }}
                      class={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                        source() === sourceKey
                          ? "bg-stone-100 text-stone-950"
                          : "text-stone-300 hover:bg-stone-900 hover:text-stone-100"
                      }`}
                    >
                      {getSourceLabel(sourceKey)}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Switch>
              <Match when={source() === "shared-url"}>
                <label class="block space-y-2">
                  <span class="text-sm font-medium text-stone-200">共有 URL</span>
                  <input
                    type="url"
                    class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                    placeholder="https://horyu.github.io/NiconiPlaylist/?videoIds=..."
                    value={sharedUrl()}
                    onInput={(event) => {
                      setSharedUrl(event.currentTarget.value);
                      setShowAllPreview(false);
                    }}
                  />
                </label>
              </Match>

              <Match when={source() === "playlist-json"}>
                <div class="space-y-2">
                  <input
                    ref={(element) => {
                      playlistJsonFileInput = element;
                    }}
                    type="file"
                    accept="application/json"
                    class="hidden"
                    onChange={(event) =>
                      void handleSelectPlaylistJsonFile(event.currentTarget.files?.[0])
                    }
                  />
                  <button
                    type="button"
                    onClick={() => playlistJsonFileInput?.click()}
                    disabled={importing()}
                    class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                  >
                    JSON ファイルを選択
                  </button>
                  <Show when={readyPlaylistJsonPreview()}>
                    {(preview) => <p class="text-sm text-stone-400">{preview().fileName}</p>}
                  </Show>
                </div>
              </Match>
            </Switch>

            <div class="grid gap-4">
              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">タイトル</span>
                <input
                  type="text"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                  placeholder={currentReadyPreview()?.title ?? getDefaultTitlePlaceholder(source())}
                  value={playlistTitle()}
                  onInput={(event) => setPlaylistTitle(event.currentTarget.value)}
                />
              </label>

              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">メモ</span>
                <textarea
                  rows="4"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-100 outline-none transition focus:border-stone-500"
                  placeholder={currentReadyPreview()?.memo ?? "未指定"}
                  value={playlistMemo()}
                  onInput={(event) => setPlaylistMemo(event.currentTarget.value)}
                />
              </label>
            </div>

            <div class="flex items-center justify-between gap-4">
              <Show when={feedback()}>
                {(message) => <p class="text-sm text-stone-400">{message()}</p>}
              </Show>
              <button
                type="submit"
                disabled={!currentReadyPreview() || importing()}
                class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              >
                インポート
              </button>
            </div>
          </div>

          <PreviewPanel
            title="インポート前プレビュー"
            headerRight={
              <Show when={currentReadyPreview()}>
                <div class="flex items-center gap-3">
                  <p class="text-xs uppercase tracking-[0.2em] text-stone-500">
                    {previewCountLabel()}
                  </p>
                  <Show when={(currentReadyPreview()?.videoIds.length ?? 0) > 5}>
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
                  <Show when={source() === "playlist-json" && currentReadyPreview()?.fileName}>
                    {(fileName) => <p class="text-sm text-stone-400">ファイル: {fileName()}</p>}
                  </Show>
                  <PreviewVideoList
                    videoIds={previewVideoIds()}
                    videoMetadataState={previewVideoMetadataState()}
                  />
                </div>
              }
            >
              <Match when={!currentReadyPreview() && !currentErrorPreview()}>
                <p class="text-sm leading-6 text-stone-400">
                  {source() === "shared-url"
                    ? "共有 URL を入力すると、インポート前に内容を表示します。"
                    : "プレイリスト JSON を選択すると、インポート前に内容を表示します。"}
                </p>
              </Match>

              <Match when={currentErrorPreview()}>
                <p class="text-sm leading-6 text-red-300">{currentErrorPreview()?.message ?? ""}</p>
              </Match>
            </Switch>
          </PreviewPanel>
        </div>
      </form>
    </section>
  );
}
