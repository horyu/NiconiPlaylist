import { decodeIds, encodeIds } from "@/lib/idCodec";
import type { Playlist } from "@/lib/types";

export const SHARED_PLAYLIST_URL = "https://horyu.github.io/NiconiPlaylist/";
export const SAMPLE_SHARED_PLAYLIST_URL =
  "https://horyu.github.io/NiconiPlaylist/?title=NiconiPlaylist+%E3%82%B5%E3%83%B3%E3%83%97%E3%83%AB&memo=sm+%2F+so+%2F+nm+%E3%82%92%E5%90%AB%E3%82%80%E5%85%B1%E6%9C%89URL%E4%BE%8B&videoIds=AwYBjBLk6I4F37i1AoOw2QLk6I4F37i1Ag";

export type SharedPlaylistDraft = Pick<Playlist, "title" | "memo" | "videoIds">;

export function buildSharedPlaylistUrl(playlist: SharedPlaylistDraft): string {
  const url = new URL(SHARED_PLAYLIST_URL);

  if (playlist.title) {
    url.searchParams.set("title", playlist.title);
  }

  if (playlist.memo) {
    url.searchParams.set("memo", playlist.memo);
  }

  url.searchParams.set("videoIds", encodeIds(playlist.videoIds));

  return url.toString();
}

export function parseSharedPlaylistUrl(input: string | URL): SharedPlaylistDraft {
  const url = input instanceof URL ? input : new URL(input);
  const encodedVideoIds = url.searchParams.get("videoIds");

  if (!encodedVideoIds) {
    throw new Error("Shared playlist URL does not include videoIds.");
  }

  const title = url.searchParams.get("title") ?? undefined;
  const memo = url.searchParams.get("memo") ?? undefined;
  const videoIds = decodeIds(encodedVideoIds);

  return { title, memo, videoIds };
}
