import { createSignal, onCleanup, onMount, Show } from "solid-js";

import {
  cleanupOrphanedStoredData,
  clearAllStoredData,
  exportStorageData,
  getStorageUsageBytes,
  importStorageData,
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
  let importFileInput: HTMLInputElement | undefined;

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

      <div class="grid gap-6 xl:grid-cols-2">
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
            <h3 class="text-sm font-semibold text-stone-200">クリーンアップ・削除</h3>
            <p class="text-sm text-stone-400">
              孤立した動画 / 投稿者データの削除と、全データ削除を行います。
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCleanup()}
              disabled={cleaningUp()}
              class="rounded-full border border-stone-600 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
            >
              孤立データ削除
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              disabled={deletingAll()}
              class="rounded-full border border-red-500/40 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-red-900/40 disabled:text-red-900/60"
            >
              全データ削除
            </button>
          </div>

          <Show when={deletingAll() || cleaningUp() || exporting() || importing()}>
            <p class="text-sm text-stone-500">処理中...</p>
          </Show>
        </div>
      </div>
    </section>
  );
}
