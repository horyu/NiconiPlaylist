import { For, Show } from "solid-js";

import type { Playlist, PlaylistId } from "@/lib/types";

type PlaylistListPaneProps = {
  activePlaylistId: PlaylistId | null | undefined;
  playlists: Playlist[];
  query: string;
  selectedPlaylistId: PlaylistId | null;
  onQueryInput: (query: string) => void;
  onSelect: (playlistId: PlaylistId) => void;
};

function getPlaylistLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

export function PlaylistListPane(props: PlaylistListPaneProps) {
  return (
    <section class="min-w-0 space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4 xl:flex xl:h-full xl:flex-col">
      <div class="space-y-2">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">Playlist List</p>
        <label class="block">
          <input
            type="text"
            class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
            placeholder="プレイリストを検索"
            value={props.query}
            onInput={(event) => props.onQueryInput(event.currentTarget.value)}
          />
        </label>
      </div>

      <div class="max-h-[44rem] space-y-2 overflow-y-auto pr-1 xl:max-h-none xl:min-h-0 xl:flex-1">
        <For each={props.playlists}>
          {(playlist) => {
            const isSelected = () => playlist.id === props.selectedPlaylistId;
            const isActive = () => playlist.id === props.activePlaylistId;

            return (
              <button
                type="button"
                onClick={() => props.onSelect(playlist.id)}
                class={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isSelected()
                    ? "border-stone-400 bg-stone-900 text-stone-50"
                    : "border-stone-800 bg-stone-950/50 text-stone-200 hover:border-stone-700 hover:bg-stone-900/70"
                }`}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 space-y-1">
                    <p class="truncate text-sm font-medium">{getPlaylistLabel(playlist)}</p>
                    <div class="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                      <span>{playlist.videoIds.length} videos</span>
                      <Show when={playlist.popupHidden}>
                        <span class="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5 text-[11px] font-medium text-stone-400">
                          popup非表示
                        </span>
                      </Show>
                    </div>
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

        <Show when={!props.playlists.length}>
          <p class="rounded-2xl border border-dashed border-stone-800 px-4 py-6 text-sm text-stone-500">
            条件に一致するプレイリストはありません。
          </p>
        </Show>
      </div>
    </section>
  );
}
