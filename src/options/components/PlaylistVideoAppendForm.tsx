import { Show } from "solid-js";

import type { VideoInsertPosition } from "@/options/playlistDraft";

type PlaylistVideoAppendFormProps = {
  indexInput: string;
  input: string;
  position: VideoInsertPosition;
  onAdd: () => void;
  onIndexInput: (value: string) => void;
  onInput: (value: string) => void;
  onPositionChange: (position: VideoInsertPosition) => void;
};

export function PlaylistVideoAppendForm(props: PlaylistVideoAppendFormProps) {
  return (
    <div class="rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            Append Videos
          </p>
          <p class="text-sm text-stone-300">
            watch URL / 動画ID / それらを含むテキストを追加できます。
          </p>
        </div>
        <button
          type="button"
          class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
          onClick={() => props.onAdd()}
        >
          追加
        </button>
      </div>
      <div class="mt-3 grid gap-3 md:grid-cols-[180px_8rem]">
        <label>
          <select
            aria-label="動画追加位置"
            class="w-[170px] rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition focus:border-stone-500"
            value={props.position}
            onChange={(event) =>
              props.onPositionChange(event.currentTarget.value as VideoInsertPosition)
            }
          >
            <option value="append">末尾に追加</option>
            <option value="prepend">先頭に追加</option>
            <option value="before-index">指定位置の前に追加</option>
            <option value="after-index">指定位置の後に追加</option>
          </select>
        </label>
        <Show
          when={props.position === "before-index" || props.position === "after-index"}
          fallback={<div />}
        >
          <label>
            <input
              type="number"
              min="1"
              aria-label="動画追加位置の番号"
              class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition focus:border-stone-500"
              value={props.indexInput}
              onInput={(event) => props.onIndexInput(event.currentTarget.value)}
              placeholder="1"
            />
          </label>
        </Show>
      </div>
      <textarea
        rows="3"
        class="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm leading-6 text-stone-200 outline-none transition focus:border-stone-500"
        value={props.input}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        placeholder={["sm9", "https://www.nicovideo.jp/watch/so5364283", "nm2829323"].join("\n")}
      />
    </div>
  );
}
