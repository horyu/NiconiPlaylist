import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";

import {
  DEFAULT_PLAYLIST_TITLE_SOURCE,
  createStoredPlaylist,
} from "@/background/services/importPlaylist";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { buildSharedPlaylistUrl } from "@/lib/playlistUrl";
import { normalizeOptionalText } from "@/lib/text";
import { parseVideoIdInputLines } from "@/lib/videoIdInput";
import { PreviewPanel } from "@/options/components/PreviewPanel";
import { PreviewVideoList } from "@/options/components/PreviewVideoList";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

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

type DirectInputCreateSectionProps = {
  onImported: () => Promise<void> | void;
  videoMetadataState: VideoMetadataState | undefined;
};

type DirectShareInfo = {
  url: string;
  byteCount: number;
};

export function DirectInputCreateSection(props: DirectInputCreateSectionProps) {
  let directShareCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  onCleanup(() => {
    if (directShareCopiedTimer) {
      clearTimeout(directShareCopiedTimer);
      directShareCopiedTimer = null;
    }
  });

  const [directInput, setDirectInput] = createSignal("");
  const [directTitle, setDirectTitle] = createSignal("");
  const [directMemo, setDirectMemo] = createSignal("");
  const [directShareInfo, setDirectShareInfo] = createSignal<DirectShareInfo | null>(null);
  const [directShareCopied, setDirectShareCopied] = createSignal(false);
  const [directInputFeedback, setDirectInputFeedback] = createSignal<string | null>(null);

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
  const directPreviewVideoIds = createMemo(() => readyDirectInputPreview()?.videoIds ?? []);
  const directPreviewCountLabel = createMemo(() => {
    const total = readyDirectInputPreview()?.videoIds.length ?? 0;
    return `${total}件`;
  });

  createEffect(() => {
    const videoIds = directPreviewVideoIds();

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  function resetDirectShareState() {
    setDirectShareInfo(null);
    if (directShareCopiedTimer) {
      clearTimeout(directShareCopiedTimer);
      directShareCopiedTimer = null;
    }
    setDirectShareCopied(false);
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
      resetDirectShareState();
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

  async function handleCreateSharedUrl() {
    setDirectInputFeedback(null);
    resetDirectShareState();

    const currentPreview = directInputPreview();

    if (currentPreview.kind === "empty") {
      setDirectInputFeedback("watch URL または動画IDを入力してください。");
      return;
    }

    if (currentPreview.kind === "error") {
      setDirectInputFeedback(currentPreview.message);
      return;
    }

    const url = buildSharedPlaylistUrl({
      videoIds: currentPreview.videoIds,
      title: normalizeOptionalText(directTitle()),
      memo: normalizeOptionalText(directMemo()),
    });

    const byteCount = new TextEncoder().encode(url).length;
    setDirectShareInfo({ url, byteCount });
  }

  async function handleCopySharedUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setDirectInputFeedback(null);
      setDirectShareCopied(true);
      if (directShareCopiedTimer) {
        clearTimeout(directShareCopiedTimer);
      }
      directShareCopiedTimer = setTimeout(() => {
        setDirectShareCopied(false);
        directShareCopiedTimer = null;
      }, 1500);
    } catch (error) {
      setDirectShareCopied(false);
      setDirectInputFeedback(
        error instanceof Error ? error.message : "共有 URL のコピーに失敗しました。",
      );
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">watch URL / 動画ID から作成</h2>
        <p class="text-sm leading-6 text-stone-400">
          watch URL または動画IDを複数行で入力し、そのまま新規プレイリストとして保存します。
        </p>
      </div>

      <form onSubmit={handleCreateFromVideoIds}>
        <div class="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)] lg:items-start lg:gap-6 lg:space-y-0">
          <div class="space-y-4">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">watch URL / 動画ID</span>
              <textarea
                rows="8"
                class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder={["sm9", "https://www.nicovideo.jp/watch/so5364283", "nm2829323"].join(
                  "\n",
                )}
                value={directInput()}
                onInput={(event) => {
                  setDirectInput(event.currentTarget.value);
                  resetDirectShareState();
                }}
              />
            </label>
            <div class="grid gap-4">
              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">title</span>
                <input
                  type="text"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                  placeholder={`YYYY/MM/DD hh:mm:ss ${DEFAULT_PLAYLIST_TITLE_SOURCE.videoIdInput}`}
                  value={directTitle()}
                  onInput={(event) => {
                    setDirectTitle(event.currentTarget.value);
                    resetDirectShareState();
                  }}
                />
              </label>

              <label class="block space-y-2">
                <span class="text-sm font-medium text-stone-200">memo</span>
                <input
                  type="text"
                  class="w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                  placeholder="未指定"
                  value={directMemo()}
                  onInput={(event) => {
                    setDirectMemo(event.currentTarget.value);
                    resetDirectShareState();
                  }}
                />
              </label>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="submit"
                disabled={directInputPreview().kind !== "ready"}
                class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              >
                プレイリストを作成
              </button>
              <button
                type="button"
                disabled={directInputPreview().kind !== "ready"}
                class="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                onClick={handleCreateSharedUrl}
              >
                共有URLを作成
              </button>
            </div>

            <Show when={directInputFeedback()}>
              {(message) => <p class="text-sm text-stone-400">{message()}</p>}
            </Show>

            <Show when={directShareInfo()}>
              {(info) => (
                <p class="text-sm text-stone-400 break-all">
                  <button
                    type="button"
                    class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                    onClick={() => handleCopySharedUrl(info().url)}
                    disabled={directShareCopied()}
                  >
                    {directShareCopied() ? "コピー済み" : "コピー"}
                  </button>{" "}
                  {info().byteCount} byte:{" "}
                  <a
                    href={info().url}
                    target="_blank"
                    rel="noreferrer"
                    class="text-stone-200 underline decoration-stone-500 underline-offset-4 transition hover:text-white"
                  >
                    {info().url}
                  </a>
                </p>
              )}
            </Show>
          </div>

          <PreviewPanel
            title="作成前プレビュー"
            headerRight={
              <Show when={directInputPreview().kind === "ready"}>
                <p class="text-xs uppercase tracking-[0.2em] text-stone-500">
                  {directPreviewCountLabel()}
                </p>
              </Show>
            }
          >
            <Switch
              fallback={
                <div class="space-y-3">
                  <div class="space-y-2">
                    <PreviewVideoList
                      videoIds={directPreviewVideoIds()}
                      videoMetadataState={props.videoMetadataState}
                    />
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
          </PreviewPanel>
        </div>
      </form>
    </section>
  );
}
