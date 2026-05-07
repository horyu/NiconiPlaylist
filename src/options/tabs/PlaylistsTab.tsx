import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import {
  activateStoredPlaylist,
  deleteStoredPlaylist,
  updateStoredPlaylist,
} from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { buildSharedPlaylistUrl } from "@/lib/playlistUrl";
import { normalizeOptionalText } from "@/lib/text";
import type { Playlist, PlaylistId } from "@/lib/types";
import { PlaylistDetailVideoList } from "@/options/components/PlaylistDetailVideoList";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";
import type { OptionsToast } from "@/options/toast";

type ShareUrlKind = "id-only" | "with-title" | "with-title-and-memo";

type ShareInfo = {
  playlistId: PlaylistId;
  byteCount: number;
  displayUrl: string;
  formatLabel: string;
};

type DetailDraft = {
  memo: string;
  title: string;
  videoIds: string[];
};

type PlaylistsTabProps = {
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
  loading: boolean;
  error: unknown;
  onActivated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onUpdated: () => Promise<void> | void;
  onFeedback: (toast: OptionsToast | null) => void;
};

function getPlaylistLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function formatDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function createTimestampTitle(): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    formatDatePart(now.getMonth() + 1),
    formatDatePart(now.getDate()),
  ].join("/");
  const time = [
    formatDatePart(now.getHours()),
    formatDatePart(now.getMinutes()),
    formatDatePart(now.getSeconds()),
  ].join(":");

  return `${timestamp} ${time}`;
}

function getShareFormatLabel(kind: ShareUrlKind): string {
  switch (kind) {
    case "id-only":
      return "動画IDのみ";
    case "with-title":
      return "タイトル付き";
    case "with-title-and-memo":
      return "タイトル・メモ付き";
  }
}

export function PlaylistsTab(props: PlaylistsTabProps) {
  const [playlistQuery, setPlaylistQuery] = createSignal("");
  const [selectedPlaylistId, setSelectedPlaylistId] = createSignal<PlaylistId | null>(null);
  const [isEditingDetail, setIsEditingDetail] = createSignal(false);
  const [detailDraft, setDetailDraft] = createSignal<DetailDraft>({
    memo: "",
    title: "",
    videoIds: [],
  });
  const [deletedDraftVideoCount, setDeletedDraftVideoCount] = createSignal(0);
  const [detailDraftResetKey, setDetailDraftResetKey] = createSignal(0);
  const [detailDraftPlaylistId, setDetailDraftPlaylistId] = createSignal<PlaylistId | null>(null);
  const [openShareMenuPlaylistId, setOpenShareMenuPlaylistId] = createSignal<PlaylistId | null>(
    null,
  );
  const [shareInfo, setShareInfo] = createSignal<ShareInfo | null>(null);
  const [shareCopied, setShareCopied] = createSignal(false);
  let shareCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  let currentSharedUrl = "";
  let currentSharedUrlPlaylistId: PlaylistId | null = null;
  let deletedDraftVideoIndices = new Set<number>();

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const videoIds = playlists.flatMap((playlist) => playlist.videoIds);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const currentSelectedPlaylistId = selectedPlaylistId();

    if (playlists.length === 0) {
      if (currentSelectedPlaylistId !== null) {
        setSelectedPlaylistId(null);
      }
      return;
    }

    if (
      currentSelectedPlaylistId &&
      playlists.some((playlist) => playlist.id === currentSelectedPlaylistId)
    ) {
      return;
    }

    setSelectedPlaylistId(props.state?.lastActivePlaylistId ?? playlists[0]!.id);
  });

  const filteredPlaylists = createMemo(() => {
    const playlists = props.state?.playlists ?? [];
    const query = playlistQuery().trim().toLowerCase();

    if (!query) {
      return playlists;
    }

    return playlists.filter((playlist) => {
      const label = getPlaylistLabel(playlist).toLowerCase();
      const memo = playlist.memo?.toLowerCase() ?? "";

      return (
        label.includes(query) || memo.includes(query) || playlist.id.toLowerCase().includes(query)
      );
    });
  });

  const selectedPlaylist = createMemo(
    () => props.state?.playlists.find((playlist) => playlist.id === selectedPlaylistId()) ?? null,
  );

  createEffect(() => {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    if (detailDraftPlaylistId() === playlist.id) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoIds: [...playlist.videoIds],
    });
    deletedDraftVideoIndices = new Set<number>();
    setDeletedDraftVideoCount(0);
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setDetailDraftPlaylistId(playlist.id);
    setIsEditingDetail(false);
  });

  const hasDetailUnsavedChanges = createMemo(() => {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return false;
    }

    const draft = detailDraft();

    return (
      draft.title !== (playlist.title ?? "") ||
      draft.memo !== (playlist.memo ?? "") ||
      deletedDraftVideoCount() > 0
    );
  });

  onCleanup(() => {
    if (shareCopiedTimer) {
      clearTimeout(shareCopiedTimer);
    }
  });

  async function handleActivate(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      await activateStoredPlaylist(playlistId);
      props.onFeedback({
        text: "アクティブなプレイリストを更新しました。",
        tone: "success",
      });
      await props.onActivated();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの選択に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleDelete(playlistId: PlaylistId, title: string) {
    if (!window.confirm(`「${title}」を削除しますか？`)) {
      return;
    }
    props.onFeedback(null);

    try {
      await deleteStoredPlaylist(playlistId);
      props.onFeedback({ text: "プレイリストを削除しました。", tone: "success" });
      setOpenShareMenuPlaylistId((currentId) => (currentId === playlistId ? null : currentId));
      setShareInfo((currentInfo) => (currentInfo?.playlistId === playlistId ? null : currentInfo));
      if (currentSharedUrlPlaylistId === playlistId) {
        currentSharedUrl = "";
        currentSharedUrlPlaylistId = null;
      }
      await props.onDeleted();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの削除に失敗しました。",
        tone: "error",
      });
    }
  }

  function handleCreateSharedUrl(
    playlistId: PlaylistId,
    videoIds: string[],
    title: string | undefined,
    memo: string | undefined,
    kind: ShareUrlKind,
  ) {
    const url = buildSharedPlaylistUrl({
      videoIds,
      title: kind === "id-only" ? undefined : normalizeOptionalText(title),
      memo: kind === "with-title-and-memo" ? normalizeOptionalText(memo) : undefined,
    });

    setOpenShareMenuPlaylistId(null);
    setShareCopied(false);
    currentSharedUrl = url;
    currentSharedUrlPlaylistId = playlistId;
    setShareInfo({
      playlistId,
      byteCount: url.length,
      displayUrl: url,
      formatLabel: getShareFormatLabel(kind),
    });
  }

  async function handleCopySharedUrl() {
    try {
      await navigator.clipboard.writeText(currentSharedUrl);
      props.onFeedback(null);
      setShareCopied(true);

      if (shareCopiedTimer) {
        clearTimeout(shareCopiedTimer);
      }

      shareCopiedTimer = setTimeout(() => {
        setShareCopied(false);
        shareCopiedTimer = null;
      }, 1500);
    } catch (error) {
      setShareCopied(false);
      props.onFeedback({
        text: error instanceof Error ? error.message : "共有 URL のコピーに失敗しました。",
        tone: "error",
      });
    }
  }

  function handleCloseSharedUrl() {
    currentSharedUrl = "";
    currentSharedUrlPlaylistId = null;
    setShareCopied(false);
    setShareInfo(null);
  }

  function handleStartEditingDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoIds: [...playlist.videoIds],
    });
    deletedDraftVideoIndices = new Set<number>();
    setDeletedDraftVideoCount(0);
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setDetailDraftPlaylistId(playlist.id);
    setIsEditingDetail(true);
    props.onFeedback(null);
  }

  function handleCancelEditingDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoIds: [...playlist.videoIds],
    });
    deletedDraftVideoIndices = new Set<number>();
    setDeletedDraftVideoCount(0);
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setIsEditingDetail(false);
    props.onFeedback(null);
  }

  async function handleSaveDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    props.onFeedback(null);

    try {
      const draft = detailDraft();

      await updateStoredPlaylist(playlist.id, {
        memo: normalizeOptionalText(draft.memo),
        title: normalizeOptionalText(draft.title) ?? createTimestampTitle(),
        videoIds: draft.videoIds.filter((_, index) => !deletedDraftVideoIndices.has(index)),
      });
      deletedDraftVideoIndices = new Set<number>();
      setDeletedDraftVideoCount(0);
      setDetailDraftResetKey((currentKey) => currentKey + 1);
      setIsEditingDetail(false);
      props.onFeedback({ text: "プレイリストを更新しました。", tone: "success" });
      await props.onUpdated();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの更新に失敗しました。",
        tone: "error",
      });
    }
  }

  function handleSetDraftVideoDeleted(index: number, isDeleted: boolean) {
    const hasIndex = deletedDraftVideoIndices.has(index);

    if (isDeleted && !hasIndex) {
      deletedDraftVideoIndices.add(index);
      setDeletedDraftVideoCount((currentCount) => currentCount + 1);
      return;
    }

    if (!isDeleted && hasIndex) {
      deletedDraftVideoIndices.delete(index);
      setDeletedDraftVideoCount((currentCount) => currentCount - 1);
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">保存済みプレイリスト</h2>
        <p class="text-sm text-stone-400">一覧から選択したプレイリストだけを詳しく表示します。</p>
      </div>

      <Switch
        fallback={
          <p class="text-sm leading-6 text-stone-400">
            保存済みプレイリストはまだありません。共有 URL をインポートしてください。
          </p>
        }
      >
        <Match when={props.loading}>
          <p class="text-sm text-stone-400">読み込み中...</p>
        </Match>

        <Match when={props.error}>
          <p class="text-sm text-red-300">保存済みプレイリストを取得できませんでした。</p>
        </Match>

        <Match when={props.state?.playlists.length}>
          <div class="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <section class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
              <div class="space-y-2">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Playlist List
                </p>
                <label class="block">
                  <input
                    type="text"
                    class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                    placeholder="プレイリストを検索"
                    value={playlistQuery()}
                    onInput={(event) => setPlaylistQuery(event.currentTarget.value)}
                  />
                </label>
              </div>

              <div class="max-h-[44rem] space-y-2 overflow-y-auto pr-1">
                <For each={filteredPlaylists()}>
                  {(playlist) => {
                    const isSelected = () => playlist.id === selectedPlaylistId();
                    const isActive = () => playlist.id === props.state?.lastActivePlaylistId;

                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedPlaylistId(playlist.id)}
                        class={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected()
                            ? "border-stone-400 bg-stone-900 text-stone-50"
                            : "border-stone-800 bg-stone-950/50 text-stone-200 hover:border-stone-700 hover:bg-stone-900/70"
                        }`}
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0 space-y-1">
                            <p class="truncate text-sm font-medium">{getPlaylistLabel(playlist)}</p>
                            <p class="text-xs text-stone-400">{playlist.videoIds.length} videos</p>
                          </div>
                          <Show when={isActive()}>
                            <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                              Active
                            </span>
                          </Show>
                        </div>

                        <Show when={playlist.memo}>
                          <p class="mt-2 overflow-hidden text-xs leading-5 text-stone-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {playlist.memo}
                          </p>
                        </Show>
                      </button>
                    );
                  }}
                </For>

                <Show when={!filteredPlaylists().length}>
                  <p class="rounded-2xl border border-dashed border-stone-800 px-4 py-6 text-sm text-stone-500">
                    条件に一致するプレイリストはありません。
                  </p>
                </Show>
              </div>
            </section>

            <section class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
              <Show
                when={selectedPlaylist()}
                keyed
                fallback={
                  <div class="rounded-2xl border border-dashed border-stone-800 px-4 py-8 text-sm text-stone-500">
                    左の一覧からプレイリストを選択してください。
                  </div>
                }
              >
                {(detailPlaylist) => {
                  const playlistShareInfo = () =>
                    shareInfo()?.playlistId === detailPlaylist.id ? shareInfo() : null;
                  const hasCurrentSharedUrl = () =>
                    currentSharedUrlPlaylistId === detailPlaylist.id;

                  return (
                    <div class="space-y-4">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 flex-1 space-y-1">
                          <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Playlist Detail
                          </p>
                          <Show
                            when={isEditingDetail()}
                            fallback={
                              <h3 class="break-words text-xl font-semibold text-stone-50">
                                {getPlaylistLabel(detailPlaylist)}
                              </h3>
                            }
                          >
                            <input
                              type="text"
                              class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-xl font-semibold text-stone-50 outline-none transition focus:border-stone-500"
                              value={detailDraft().title}
                              onInput={(event) =>
                                setDetailDraft((currentDraft) => ({
                                  ...currentDraft,
                                  title: event.currentTarget.value,
                                }))
                              }
                              placeholder="プレイリスト名"
                            />
                          </Show>
                          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                            <span>{detailPlaylist.videoIds.length} videos</span>
                            <span class="text-stone-600">•</span>
                            <span>{detailPlaylist.id}</span>
                            <Show when={detailPlaylist.id === props.state?.lastActivePlaylistId}>
                              <>
                                <span class="text-stone-600">•</span>
                                <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                                  Active
                                </span>
                              </>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Show
                          when={isEditingDetail()}
                          fallback={
                            <>
                              <button
                                type="button"
                                class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={handleStartEditingDetail}
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={() => void handleActivate(detailPlaylist.id)}
                              >
                                選択
                              </button>
                              <div class="relative">
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                  onClick={() =>
                                    setOpenShareMenuPlaylistId((currentId) =>
                                      currentId === detailPlaylist.id ? null : detailPlaylist.id,
                                    )
                                  }
                                >
                                  共有
                                </button>
                                <Show when={openShareMenuPlaylistId() === detailPlaylist.id}>
                                  <div class="absolute left-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 shadow-lg shadow-black/30">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCreateSharedUrl(
                                          detailPlaylist.id,
                                          detailPlaylist.videoIds,
                                          detailPlaylist.title,
                                          detailPlaylist.memo,
                                          "id-only",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      動画IDのみ
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCreateSharedUrl(
                                          detailPlaylist.id,
                                          detailPlaylist.videoIds,
                                          detailPlaylist.title,
                                          detailPlaylist.memo,
                                          "with-title",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      タイトル付き
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCreateSharedUrl(
                                          detailPlaylist.id,
                                          detailPlaylist.videoIds,
                                          detailPlaylist.title,
                                          detailPlaylist.memo,
                                          "with-title-and-memo",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      タイトル・メモ付き
                                    </button>
                                  </div>
                                </Show>
                              </div>
                              <button
                                type="button"
                                class="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10"
                                onClick={() =>
                                  void handleDelete(
                                    detailPlaylist.id,
                                    getPlaylistLabel(detailPlaylist),
                                  )
                                }
                              >
                                削除
                              </button>
                            </>
                          }
                        >
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              hasDetailUnsavedChanges()
                                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                                : "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                            }`}
                            onClick={() => void handleSaveDetail()}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                            onClick={handleCancelEditingDetail}
                          >
                            キャンセル
                          </button>
                        </Show>
                      </div>

                      <div class="rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3">
                        <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                          Memo
                        </p>
                        <Show
                          when={isEditingDetail()}
                          fallback={
                            <Show when={detailPlaylist.memo}>
                              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                                {detailPlaylist.memo}
                              </p>
                            </Show>
                          }
                        >
                          <textarea
                            rows="5"
                            class="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm leading-6 text-stone-200 outline-none transition focus:border-stone-500"
                            value={detailDraft().memo}
                            onInput={(event) =>
                              setDetailDraft((currentDraft) => ({
                                ...currentDraft,
                                memo: event.currentTarget.value,
                              }))
                            }
                            placeholder="メモ"
                          />
                        </Show>
                      </div>

                      <Show when={playlistShareInfo()}>
                        {(info) => (
                          <div class="space-y-2 rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3 text-sm text-stone-400">
                            <div class="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50"
                                onClick={handleCloseSharedUrl}
                              >
                                閉じる
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                                onClick={() => void handleCopySharedUrl()}
                                disabled={shareCopied() || !hasCurrentSharedUrl()}
                              >
                                {shareCopied() ? "コピー済み" : "コピー"}
                              </button>
                              <span>{info().formatLabel}</span>
                              <span>{info().byteCount} byte</span>
                            </div>
                            <a
                              href={hasCurrentSharedUrl() ? currentSharedUrl : undefined}
                              target="_blank"
                              rel="noreferrer"
                              class="break-all text-stone-200 underline decoration-stone-500 underline-offset-4 transition hover:text-white"
                            >
                              {info().displayUrl}
                            </a>
                          </div>
                        )}
                      </Show>

                      <PlaylistDetailVideoList
                        videoIds={
                          isEditingDetail() ? detailDraft().videoIds : detailPlaylist.videoIds
                        }
                        videoMetadataState={props.videoMetadataState}
                        isEditing={isEditingDetail()}
                        resetKey={detailDraftResetKey()}
                        onSetVideoDeleted={handleSetDraftVideoDeleted}
                      />
                    </div>
                  );
                }}
              </Show>
            </section>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
