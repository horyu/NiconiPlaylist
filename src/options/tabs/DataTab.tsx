import { createSignal, onCleanup, onMount } from "solid-js";

import {
  cleanupStalePlaybackContexts,
  cleanupOrphanedStoredData,
  clearAllStoredData,
  exportStorageData,
  getStorageUsageBytes,
  importStorageData,
  previewStalePlaybackCleanup,
} from "@/background/services/dataManagement";
import { formatCompactTimestamp } from "@/lib/dateTime";
import type { OptionsToast } from "@/options/toast";

type DataTabProps = {
  onFeedback: (toast: OptionsToast | null) => void;
  onUpdated: () => Promise<void> | void;
};

function formatStorageUsageLabel(bytes: number | null): string {
  if (bytes === null) {
    return "取得中...";
  }

  return `${(bytes / 1024).toFixed(2)} KB`;
}

export function DataTab(props: DataTabProps) {
  const [bytesInUse, setBytesInUse] = createSignal<number | null>(null);
  const [deletingAll, setDeletingAll] = createSignal(false);
  const [exporting, setExporting] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [cleaningUp, setCleaningUp] = createSignal(false);
  const [cleaningUpPlayback, setCleaningUpPlayback] = createSignal(false);
  const [stalePlaybackDays, setStalePlaybackDays] = createSignal("30");
  let importFileInput: HTMLInputElement | undefined;

  function parseStalePlaybackDays(): number {
    const parsed = Number.parseInt(stalePlaybackDays().trim(), 10);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error("プレイリスト再生状態データの削除日数は 1 以上の整数で指定してください。");
    }

    return parsed;
  }

  async function refreshStorageUsage() {
    try {
      setBytesInUse(await getStorageUsageBytes());
    } catch {
      setBytesInUse(null);
    }
  }

  onMount(() => {
    void refreshStorageUsage();
  });

  async function handleExport() {
    props.onFeedback(null);
    setExporting(true);

    try {
      const exportedData = await exportStorageData();
      const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `NiconiPlaylistData-${formatCompactTimestamp(new Date())}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "JSON バックアップの作成に失敗しました。",
        tone: "error",
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File | null | undefined) {
    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "現在の保存データを上書きして JSON バックアップを復元します。よろしいですか？",
    );

    if (!confirmed) {
      if (importFileInput) {
        importFileInput.value = "";
      }
      return;
    }

    props.onFeedback(null);
    setImporting(true);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      await importStorageData(parsed);
      await props.onUpdated();
      await refreshStorageUsage();
      props.onFeedback({
        text: "JSON バックアップを復元しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "JSON バックアップの復元に失敗しました。",
        tone: "error",
      });
    } finally {
      if (importFileInput) {
        importFileInput.value = "";
      }
      setImporting(false);
    }
  }

  async function handleCleanup() {
    props.onFeedback(null);
    setCleaningUp(true);

    try {
      const result = await cleanupOrphanedStoredData();

      await props.onUpdated();
      await refreshStorageUsage();
      props.onFeedback({
        text: `孤立データを削除しました。動画 ${result.removedVideoMetadataCount} 件 / 投稿者 ${result.removedOwnerCount} 件`,
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "孤立データの削除に失敗しました。",
        tone: "error",
      });
    } finally {
      setCleaningUp(false);
    }
  }

  async function handleDeleteAll() {
    const confirmed = window.confirm(
      "保存済みプレイリスト、再生設定、再生コンテキスト、動画メタデータ、投稿者データをすべて削除します。続行しますか？",
    );

    if (!confirmed) {
      return;
    }

    props.onFeedback(null);
    setDeletingAll(true);

    try {
      await clearAllStoredData();
      await props.onUpdated();
      await refreshStorageUsage();
      props.onFeedback({
        text: "全データを削除しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "全データの削除に失敗しました。",
        tone: "error",
      });
    } finally {
      setDeletingAll(false);
    }
  }

  async function handleCleanupStalePlayback() {
    props.onFeedback(null);
    setCleaningUpPlayback(true);

    try {
      const olderThanDays = parseStalePlaybackDays();
      const { candidates } = await previewStalePlaybackCleanup(olderThanDays);

      if (candidates.length === 0) {
        props.onFeedback({
          text: `${olderThanDays} 日より前の古いプレイリスト再生状態データは見つかりませんでした。`,
          tone: "success",
        });
        return;
      }

      const confirmed = window.confirm(
        [
          `${olderThanDays} 日より前に再生され、現在タブが残っていないプレイリスト再生状態データを削除します。`,
          "",
          "対象プレイリスト:",
          ...candidates.map((candidate) => `- ${candidate.playlistTitle}`),
        ].join("\n"),
      );

      if (!confirmed) {
        return;
      }

      const result = await cleanupStalePlaybackContexts(olderThanDays);
      await props.onUpdated();
      await refreshStorageUsage();
      props.onFeedback({
        text: `古いプレイリスト再生状態データを ${result.removedPlaylistCount} 件削除しました。`,
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text:
          error instanceof Error
            ? error.message
            : "古いプレイリスト再生状態データの削除に失敗しました。",
        tone: "error",
      });
    } finally {
      setCleaningUpPlayback(false);
    }
  }

  onCleanup(() => {
    if (importFileInput) {
      importFileInput.value = "";
    }
  });

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">データ操作</h2>
        <p class="text-sm text-stone-400">
          拡張機能全体のバックアップ、復元、不要データ削除を行います。
        </p>
      </div>

      <div class="space-y-6">
        <div class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-stone-200">バックアップ・復元</h3>
            <p class="text-sm text-stone-400">
              ストレージ使用量: {formatStorageUsageLabel(bytesInUse())}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting()}
              class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
            >
              JSON バックアップ
            </button>

            <input
              ref={(element) => {
                importFileInput = element;
              }}
              type="file"
              accept="application/json"
              class="hidden"
              onChange={(event) => void handleImport(event.currentTarget.files?.[0])}
            />
            <button
              type="button"
              onClick={() => importFileInput?.click()}
              disabled={importing()}
              class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
            >
              JSON 復元
            </button>
          </div>
        </div>

        <div class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-stone-200">クリーンアップ</h3>
          </div>

          <div class="space-y-2 rounded-xl border border-stone-800 bg-stone-900/40 p-3">
            <div class="space-y-1">
              <h4 class="text-sm font-medium text-stone-200">再生状態データ削除</h4>
              <p class="text-sm text-stone-400">
                最終再生が指定日数より前のプレイリスト再生状態データを削除します。
                再生タブが残っているものは対象外です。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-sm text-stone-300" for="stale-playback-days">
                最終再生が
              </label>
              <input
                id="stale-playback-days"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                value={stalePlaybackDays()}
                onInput={(event) => setStalePlaybackDays(event.currentTarget.value)}
                class="w-20 rounded-full border border-stone-700 bg-stone-950 px-3 py-1 text-sm text-stone-100 outline-none transition focus:border-stone-500"
              />
              <span class="text-sm text-stone-400">日より前</span>
              <span aria-hidden="true" class="text-sm text-stone-600">
                ・
              </span>
              <button
                type="button"
                onClick={() => void handleCleanupStalePlayback()}
                disabled={cleaningUpPlayback()}
                class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
              >
                再生状態データ削除
              </button>
            </div>
          </div>

          <div class="space-y-2 rounded-xl border border-stone-800 bg-stone-900/40 p-3">
            <div class="space-y-1">
              <h4 class="text-sm font-medium text-stone-200">孤立データ削除</h4>
              <p class="text-sm text-stone-400">
                どのプレイリストからも参照されていない動画メタデータと投稿者データを削除します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCleanup()}
              disabled={cleaningUp()}
              class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
            >
              孤立データ削除
            </button>
          </div>
        </div>

        <div class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-red-200">全データ削除</h3>
            <p class="text-sm text-stone-400">
              保存済みプレイリスト、再生設定、プレイリストの再生状態データ、動画メタデータ、投稿者データをすべて削除します。
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              disabled={deletingAll()}
              class="rounded-full border border-red-500/40 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-red-900/40 disabled:text-red-900/60"
            >
              全データ削除
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
