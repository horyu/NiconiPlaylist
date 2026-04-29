import { createResource, For, Match, onCleanup, onMount, Switch } from "solid-js";
import { browser } from "wxt/browser";

import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { Playlist } from "@/lib/types";

type PopupState = {
  playlists: Playlist[];
  lastActivePlaylistId: string | null;
};

type StorageChanges = Record<
  string,
  {
    oldValue?: unknown;
    newValue?: unknown;
  }
>;

async function fetchPopupState(): Promise<PopupState> {
  const [playlists, lastActivePlaylistId] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
  ]);

  return {
    playlists,
    lastActivePlaylistId,
  };
}

function Popup() {
  const [popupState, { refetch }] = createResource(fetchPopupState);

  const activePlaylist = () =>
    popupState()?.playlists.find(
      (playlist) => playlist.id === popupState()?.lastActivePlaylistId,
    ) ?? null;

  onMount(() => {
    const handleStorageChanged = (changes: StorageChanges) => {
      if (changes[STORAGE_KEYS.playlists] || changes[STORAGE_KEYS.lastActivePlaylistId]) {
        void refetch();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChanged);
    void refetch();

    onCleanup(() => {
      browser.storage.onChanged.removeListener(handleStorageChanged);
    });
  });

  return (
    <main class="min-h-screen min-w-80 bg-stone-950 px-4 py-5 text-stone-100">
      <div class="mx-auto flex w-full max-w-sm flex-col gap-4">
        <header class="space-y-1">
          <p class="text-[11px] font-medium uppercase tracking-[0.24em] text-stone-500">
            NiconiPlaylist
          </p>
          <h1 class="text-lg font-semibold text-stone-50">Playlists</h1>
          <p class="text-sm leading-5 text-stone-400">
            Saved playlists and the most recent active playlist will appear here.
          </p>
        </header>

        <section class="rounded-2xl border border-stone-800 bg-stone-900/80 p-4 shadow-lg shadow-black/20">
          <Switch
            fallback={
              <div class="space-y-2">
                <p class="text-sm font-medium text-stone-200">No saved playlists yet.</p>
                <p class="text-sm leading-5 text-stone-400">
                  Import a shared playlist URL or create one from the options page.
                </p>
              </div>
            }
          >
            <Match when={popupState.loading}>
              <p class="text-sm text-stone-400">Loading playlists...</p>
            </Match>

            <Match when={popupState.error}>
              <p class="text-sm text-red-300">Failed to load playlists.</p>
            </Match>

            <Match when={popupState()?.playlists.length}>
              <div class="space-y-4">
                <div class="rounded-xl border border-stone-800 bg-stone-950/60 p-3">
                  <p class="text-xs uppercase tracking-[0.18em] text-stone-500">Last active</p>
                  <p class="mt-1 text-sm font-medium text-stone-100">
                    {activePlaylist()?.title ?? activePlaylist()?.id ?? "None"}
                  </p>
                </div>

                <ul class="space-y-2">
                  <For each={popupState()?.playlists}>
                    {(playlist) => (
                      <li class="rounded-xl border border-stone-800 bg-stone-950/40 p-3">
                        <p class="text-sm font-medium text-stone-100">
                          {playlist.title ?? playlist.id}
                        </p>
                        <p class="mt-1 text-xs text-stone-400">{playlist.videoIds.length} videos</p>
                        <Switch>
                          <Match when={playlist.memo}>
                            <p class="mt-2 text-xs leading-5 text-stone-500">{playlist.memo}</p>
                          </Match>
                        </Switch>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Match>
          </Switch>
        </section>
      </div>
    </main>
  );
}

export default Popup;
