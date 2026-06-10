import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Playlist } from "@/lib/types";

const storedValues: Record<string, unknown> = {};
const storageSetMock = mock(async (updates: Record<string, unknown>) => {
  await Bun.sleep(5);
  Object.assign(storedValues, structuredClone(updates));
});

mock.module("wxt/browser", () => ({
  browser: {
    storage: {
      local: {
        get: mock(async (keys: string[]) => {
          await Bun.sleep(5);
          return Object.fromEntries(
            keys.flatMap((key) =>
              key in storedValues ? [[key, structuredClone(storedValues[key])]] : [],
            ),
          );
        }),
        set: storageSetMock,
      },
    },
  },
}));

function createPlaylist(id: string): Playlist {
  return {
    id,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    lastPlayedAt: null,
    lastCompletedAt: null,
    popupHidden: false,
    title: id,
    videoIds: ["sm9"],
  };
}

describe("mutateStorage", () => {
  beforeEach(() => {
    for (const key of Object.keys(storedValues)) {
      delete storedValues[key];
    }
    storageSetMock.mockClear();
  });

  test("並行した read-modify-write でも更新結果を失わない", async () => {
    const { getStorageData, mutateStorage } = await import("./storage");
    const appendPlaylist = (playlist: Playlist) =>
      mutateStorage(["playlists"], ({ playlists }) => ({
        updates: {
          playlists: [...playlists, playlist],
        },
        result: undefined,
      }));

    await Promise.all([
      appendPlaylist(createPlaylist("first")),
      appendPlaylist(createPlaylist("second")),
    ]);

    const { playlists } = await getStorageData(["playlists"]);

    expect(playlists.map((playlist) => playlist.id)).toEqual(["first", "second"]);
  });

  test("関連する複数キーを一回の storage.set で保存する", async () => {
    const { mutateStorage } = await import("./storage");

    await mutateStorage(["playlists", "lastActivePlaylistId"], () => ({
      updates: {
        playlists: [createPlaylist("active")],
        lastActivePlaylistId: "active",
      },
      result: undefined,
    }));

    expect(storageSetMock).toHaveBeenCalledTimes(1);
    expect(storageSetMock.mock.calls[0]?.[0]).toMatchObject({
      np_last_active_playlist_id: "active",
      np_playlists: [expect.objectContaining({ id: "active" })],
    });
  });

  test("直接書き込みも mutation と同じ順序で直列化する", async () => {
    const { getStorageData, mutateStorage, setStorageData } = await import("./storage");
    const mutation = mutateStorage(["playlists"], ({ playlists }) => ({
      updates: {
        playlists: [...playlists, createPlaylist("mutation")],
      },
      result: undefined,
    }));
    const replacement = setStorageData({
      playlists: [createPlaylist("replacement")],
    });

    await Promise.all([mutation, replacement]);

    const { playlists } = await getStorageData(["playlists"]);

    expect(playlists.map((playlist) => playlist.id)).toEqual(["replacement"]);
  });
});
