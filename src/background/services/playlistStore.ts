import { getStorageData, mutateStorage } from "@/background/services/storage";
import { formatDashedTimestampWithMinutes } from "@/lib/dateTime";
import { resolvePlaylistPlaybackSettings } from "@/lib/playlistLoop";
import { isPlaybackContext, isPlaybackDebugEvent, isPlaylist } from "@/lib/typeGuards";
import type {
  PlaybackContext,
  PlaybackDebugEvent,
  PlaybackSettings,
  Playlist,
  PlaylistId,
  VideoId,
} from "@/lib/types";

const MAX_PLAYBACK_DEBUG_EVENTS = 50;

type PlaybackContextSyncResult = {
  playbackContext: PlaybackContext | null;
  debug: {
    reason: string;
    playlistId: PlaylistId;
    playlistVideoCount: number | null;
    previousPlaybackContext: PlaybackContext;
  } | null;
};

function createPlaylistId(): PlaylistId {
  return crypto.randomUUID();
}

function createShuffledPlaylistTitle(sourceTitle: string): string {
  return `${sourceTitle} / shuffled ${formatDashedTimestampWithMinutes(new Date())}`;
}

function createCopiedPlaylistTitle(sourceTitle: string): string {
  return `${sourceTitle} / copied ${formatDashedTimestampWithMinutes(new Date())}`;
}

function createPlaylistTimestampPatch(
  now: Date,
): Pick<Playlist, "createdAt" | "updatedAt" | "lastPlayedAt" | "lastCompletedAt"> {
  const isoString = now.toISOString();

  return {
    createdAt: isoString,
    updatedAt: isoString,
    lastPlayedAt: null,
    lastCompletedAt: null,
  };
}

async function createStoredPlaylistCopyWithVideoIds(
  playlistId: PlaylistId,
  createCopyFields: (sourcePlaylist: Playlist) => Pick<Playlist, "title" | "videoIds">,
): Promise<Playlist> {
  return mutateStorage(["playlists", "lastActivePlaylistId"], ({ playlists }) => {
    const storedPlaylists = playlists.filter(isPlaylist);
    const sourcePlaylist = storedPlaylists.find((playlist) => playlist.id === playlistId);

    if (!sourcePlaylist) {
      throw new Error("指定したプレイリストは保存されていません。");
    }

    const nextPlaylist: Playlist = {
      id: createPlaylistId(),
      ...createPlaylistTimestampPatch(new Date()),
      ...createCopyFields(sourcePlaylist),
      memo: sourcePlaylist.memo,
      repeatPresetId: sourcePlaylist.repeatPresetId,
      popupHidden: false,
    };

    return {
      updates: {
        playlists: [...storedPlaylists, nextPlaylist],
        lastActivePlaylistId: nextPlaylist.id,
      },
      result: nextPlaylist,
    };
  });
}

function shuffleVideoIds(videoIds: VideoId[]): VideoId[] {
  const nextVideoIds = [...videoIds];

  for (let index = nextVideoIds.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const currentVideoId = nextVideoIds[index]!;

    nextVideoIds[index] = nextVideoIds[randomIndex]!;
    nextVideoIds[randomIndex] = currentVideoId;
  }

  return nextVideoIds;
}

function buildVideoOccurrenceKeys(videoIds: VideoId[]): string[] {
  const counts = new Map<VideoId, number>();

  return videoIds.map((videoId) => {
    const occurrence = (counts.get(videoId) ?? 0) + 1;

    counts.set(videoId, occurrence);
    return `${videoId}#${occurrence}`;
  });
}

function countDeletedIndicesBefore(
  deletedVideoIndices: readonly number[],
  currentIndex: number,
): number {
  return deletedVideoIndices.filter((deletedIndex) => deletedIndex < currentIndex).length;
}

function resolvePlaybackIndex(
  playlist: Playlist,
  videoId: VideoId,
  previousPlaybackContext: PlaybackContext | undefined,
): number | null {
  const matchingIndices = playlist.videoIds.reduce<number[]>((indices, currentVideoId, index) => {
    if (currentVideoId === videoId) {
      indices.push(index);
    }

    return indices;
  }, []);

  if (matchingIndices.length === 0) {
    return null;
  }

  if (!previousPlaybackContext || previousPlaybackContext.playlistId !== playlist.id) {
    return matchingIndices[0]!;
  }

  if (playlist.videoIds[previousPlaybackContext.currentIndex] === videoId) {
    return previousPlaybackContext.currentIndex;
  }

  const nextIndex = previousPlaybackContext.currentIndex + 1;

  if (playlist.videoIds[nextIndex] === videoId) {
    return nextIndex;
  }

  return (
    matchingIndices.find((index) => index >= previousPlaybackContext.currentIndex) ??
    matchingIndices[0]!
  );
}

export async function getStoredPlaylists(): Promise<Playlist[]> {
  const { playlists } = await getStorageData(["playlists"]);

  return playlists;
}

export async function getStoredPlaybackContexts(): Promise<PlaybackContext[]> {
  const { playbackContexts } = await getStorageData(["playbackContexts"]);

  return playbackContexts;
}

async function appendStoredPlaybackDebugEvent(
  event: Omit<PlaybackDebugEvent, "occurredAt">,
): Promise<void> {
  const nextEvent = {
    ...event,
    occurredAt: new Date().toISOString(),
  } as PlaybackDebugEvent;

  await mutateStorage(["playbackDebugEvents"], ({ playbackDebugEvents }) => ({
    updates: {
      playbackDebugEvents: [...playbackDebugEvents.filter(isPlaybackDebugEvent), nextEvent].slice(
        -MAX_PLAYBACK_DEBUG_EVENTS,
      ),
    },
    result: undefined,
  }));
}

export async function recordPlaybackDebugEvent(
  type: string,
  reason: string,
  details: Record<string, unknown> & {
    playlistId?: PlaylistId | null;
    tabId?: number | null;
    videoId?: VideoId | null;
    currentIndex?: number | null;
    playlistVideoCount?: number | null;
    previousPlaybackContext?: PlaybackContext | null;
  },
): Promise<void> {
  await appendStoredPlaybackDebugEvent({
    ...details,
    type,
    reason,
    playlistId: details.playlistId ?? null,
    tabId: details.tabId ?? null,
    videoId: details.videoId ?? null,
    currentIndex: details.currentIndex ?? null,
    playlistVideoCount: details.playlistVideoCount ?? null,
    previousPlaybackContext: details.previousPlaybackContext ?? null,
  });
}

export async function recordContentPlaybackDebugEvent(
  tabId: number,
  event: {
    eventType: "pause" | "ended";
    href: string;
    isAdvertisementVideo: boolean;
    isVideoElement: boolean;
    targetTagName: string | null;
    videoCurrentSrc: string | null;
    videoCurrentTime: number | null;
    videoDuration: number | null;
    videoEnded: boolean | null;
    videoPaused: boolean | null;
    videoTitle: string | null;
    videoId: VideoId | null;
  },
): Promise<void> {
  const playbackContexts = await getStoredPlaybackContexts();
  const previousPlaybackContext =
    playbackContexts.find((context) => context.tabId === tabId) ?? null;
  const playlists = previousPlaybackContext !== null ? await getStoredPlaylists() : [];
  const playlist = previousPlaybackContext
    ? (playlists.find((candidate) => candidate.id === previousPlaybackContext.playlistId) ?? null)
    : null;

  await recordPlaybackDebugEvent("content-playback-event", event.eventType, {
    playlistId: previousPlaybackContext?.playlistId ?? null,
    tabId,
    videoId: event.videoId,
    currentIndex: previousPlaybackContext?.currentIndex ?? null,
    playlistVideoCount: playlist?.videoIds.length ?? null,
    previousPlaybackContext,
    href: event.href,
    isAdvertisementVideo: event.isAdvertisementVideo,
    isVideoElement: event.isVideoElement,
    targetTagName: event.targetTagName,
    videoCurrentSrc: event.videoCurrentSrc,
    videoCurrentTime: event.videoCurrentTime,
    videoDuration: event.videoDuration,
    videoEnded: event.videoEnded,
    videoPaused: event.videoPaused,
    videoTitle: event.videoTitle,
  });
}

export async function getLastActivePlaylistId(): Promise<PlaylistId | null> {
  const { lastActivePlaylistId } = await getStorageData(["lastActivePlaylistId"]);
  return lastActivePlaylistId;
}

export async function activateStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  await mutateStorage(["playlists", "lastActivePlaylistId"], ({ playlists }) => {
    if (!playlists.filter(isPlaylist).some((playlist) => playlist.id === playlistId)) {
      throw new Error("指定したプレイリストは保存されていません。");
    }

    return {
      updates: { lastActivePlaylistId: playlistId },
      result: undefined,
    };
  });
}

export async function updateStoredPlaylist(
  playlistId: PlaylistId,
  updates: Partial<
    Pick<Playlist, "memo" | "repeatPresetId" | "title" | "videoIds" | "popupHidden">
  >,
  options?: {
    deletedVideoIndices?: number[];
  },
): Promise<Playlist> {
  return mutateStorage(["playlists", "playbackContexts"], (data) => {
    const playlists = data.playlists.filter(isPlaylist);
    const playbackContexts = data.playbackContexts.filter(isPlaybackContext);
    const playlistIndex = playlists.findIndex((playlist) => playlist.id === playlistId);

    if (playlistIndex < 0) {
      throw new Error("指定したプレイリストは保存されていません。");
    }

    const currentPlaylist = playlists[playlistIndex]!;
    const nextPlaylist: Playlist = {
      ...currentPlaylist,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    const nextPlaylists = [...playlists];

    nextPlaylists[playlistIndex] = nextPlaylist;
    const deletedVideoIndices = (options?.deletedVideoIndices ?? []).toSorted((a, b) => a - b);
    const currentVideoOccurrenceKeys = buildVideoOccurrenceKeys(currentPlaylist.videoIds);
    const nextVideoOccurrenceKeys = buildVideoOccurrenceKeys(nextPlaylist.videoIds);
    const nextVideoIndexByOccurrenceKey = new Map(
      nextVideoOccurrenceKeys.map((occurrenceKey, index) => [occurrenceKey, index] as const),
    );
    const nextPlaybackContexts =
      updates.videoIds !== undefined
        ? playbackContexts.flatMap((playbackContext) => {
            if (playbackContext.playlistId !== playlistId) {
              return [playbackContext];
            }

            if (nextPlaylist.videoIds.length === 0) {
              return [];
            }

            const currentOccurrenceKey = currentVideoOccurrenceKeys[playbackContext.currentIndex];
            const movedCurrentIndex = currentOccurrenceKey
              ? nextVideoIndexByOccurrenceKey.get(currentOccurrenceKey)
              : undefined;

            if (movedCurrentIndex !== undefined) {
              return [{ ...playbackContext, currentIndex: movedCurrentIndex }];
            }

            const deletedBeforeCount = countDeletedIndicesBefore(
              deletedVideoIndices,
              playbackContext.currentIndex,
            );
            const nextCurrentIndex = playbackContext.currentIndex - deletedBeforeCount;

            return [
              {
                ...playbackContext,
                currentIndex: Math.min(nextCurrentIndex, nextPlaylist.videoIds.length - 1),
              },
            ];
          })
        : playbackContexts;

    return {
      updates: {
        playlists: nextPlaylists,
        playbackContexts: nextPlaybackContexts,
      },
      result: nextPlaylist,
    };
  });
}

export async function deleteStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  await mutateStorage(
    ["playlists", "lastActivePlaylistId", "playbackContexts"],
    ({ playlists, lastActivePlaylistId, playbackContexts }) => {
      const nextPlaylists = playlists
        .filter(isPlaylist)
        .filter((playlist) => playlist.id !== playlistId);

      return {
        updates: {
          playlists: nextPlaylists,
          playbackContexts: playbackContexts
            .filter(isPlaybackContext)
            .filter((context) => context.playlistId !== playlistId),
          lastActivePlaylistId:
            lastActivePlaylistId === playlistId
              ? (nextPlaylists[0]?.id ?? null)
              : lastActivePlaylistId,
        },
        result: undefined,
      };
    },
  );
}

export async function createShuffledStoredPlaylistCopy(playlistId: PlaylistId): Promise<Playlist> {
  return createStoredPlaylistCopyWithVideoIds(playlistId, (sourcePlaylist) => ({
    title: createShuffledPlaylistTitle(sourcePlaylist.title ?? sourcePlaylist.id),
    videoIds: shuffleVideoIds(sourcePlaylist.videoIds),
  }));
}

export async function createStoredPlaylistCopy(playlistId: PlaylistId): Promise<Playlist> {
  return createStoredPlaylistCopyWithVideoIds(playlistId, (sourcePlaylist) => ({
    title: createCopiedPlaylistTitle(sourcePlaylist.title ?? sourcePlaylist.id),
    videoIds: [...sourcePlaylist.videoIds],
  }));
}

export async function getStoredPlaybackContextByTabId(
  tabId: number,
): Promise<PlaybackContext | null> {
  const playbackContexts = await getStoredPlaybackContexts();
  return playbackContexts.find((context) => context.tabId === tabId) ?? null;
}

export async function clearStoredPlaybackContextByTabId(
  tabId: number,
  reason = "unspecified",
): Promise<void> {
  const previousPlaybackContext = await mutateStorage(
    ["playbackContexts"],
    ({ playbackContexts }) => {
      const storedPlaybackContexts = playbackContexts.filter(isPlaybackContext);
      const previousContext =
        storedPlaybackContexts.find((context) => context.tabId === tabId) ?? null;

      return {
        updates: {
          playbackContexts: storedPlaybackContexts.filter((context) => context.tabId !== tabId),
        },
        result: previousContext,
      };
    },
  );
  await recordPlaybackDebugEvent("clear-playback-context-by-tab", reason, {
    playlistId: previousPlaybackContext?.playlistId ?? null,
    tabId,
    currentIndex: previousPlaybackContext?.currentIndex ?? null,
    previousPlaybackContext,
  });
}

export async function clearStoredPlaybackContextsByPlaylistId(
  playlistId: PlaylistId,
  reason = "unspecified",
): Promise<void> {
  const previousPlaybackContext = await mutateStorage(
    ["playbackContexts"],
    ({ playbackContexts }) => {
      const storedPlaybackContexts = playbackContexts.filter(isPlaybackContext);

      return {
        updates: {
          playbackContexts: storedPlaybackContexts.filter(
            (context) => context.playlistId !== playlistId,
          ),
        },
        result: storedPlaybackContexts.find((context) => context.playlistId === playlistId) ?? null,
      };
    },
  );

  await recordPlaybackDebugEvent("clear-playback-contexts-by-playlist", reason, {
    playlistId,
    previousPlaybackContext,
  });
}

export async function setStoredPlaybackContextIndex(
  tabId: number,
  playlistId: PlaylistId,
  currentIndex: number,
): Promise<PlaybackContext> {
  return mutateStorage(
    ["playlists", "playbackContexts", "lastActivePlaylistId"],
    ({ playlists, playbackContexts }) => {
      const storedPlaylists = playlists.filter(isPlaylist);
      const playlist = storedPlaylists.find((currentPlaylist) => currentPlaylist.id === playlistId);

      if (!playlist) {
        throw new Error("指定したプレイリストは保存されていません。");
      }

      if (currentIndex < 0 || currentIndex >= playlist.videoIds.length) {
        throw new Error("指定した再生位置がプレイリスト範囲外です。");
      }

      const playbackContext: PlaybackContext = {
        playlistId,
        tabId,
        currentIndex,
      };
      const nextPlaybackContexts = playbackContexts
        .filter(isPlaybackContext)
        .filter((context) => context.tabId !== tabId && context.playlistId !== playlistId);

      nextPlaybackContexts.push(playbackContext);

      return {
        updates: {
          playbackContexts: nextPlaybackContexts,
          playlists: storedPlaylists.map((currentPlaylist) =>
            currentPlaylist.id === playlistId
              ? {
                  ...currentPlaylist,
                  lastPlayedAt: new Date().toISOString(),
                }
              : currentPlaylist,
          ),
          lastActivePlaylistId: playlistId,
        },
        result: playbackContext,
      };
    },
  );
}

export async function markStoredPlaylistCompleted(playlistId: PlaylistId): Promise<void> {
  await mutateStorage(["playlists"], ({ playlists }) => ({
    updates: {
      playlists: playlists.filter(isPlaylist).map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              lastCompletedAt: new Date().toISOString(),
            }
          : playlist,
      ),
    },
    result: undefined,
  }));
}

export async function markStoredPlaylistCompletedByTabId(tabId: number): Promise<void> {
  await mutateStorage(["playlists", "playbackContexts"], ({ playlists, playbackContexts }) => {
    const playbackContext = playbackContexts
      .filter(isPlaybackContext)
      .find((context) => context.tabId === tabId);

    if (!playbackContext) {
      return {
        updates: {},
        result: undefined,
      };
    }

    return {
      updates: {
        playlists: playlists.filter(isPlaylist).map((playlist) =>
          playlist.id === playbackContext.playlistId
            ? {
                ...playlist,
                lastCompletedAt: new Date().toISOString(),
              }
            : playlist,
        ),
      },
      result: undefined,
    };
  });
}

export async function syncPlaybackContextForVideo(
  tabId: number,
  videoId: VideoId,
): Promise<PlaybackContext | null> {
  const syncResult = await mutateStorage<
    "playlists" | "playbackContexts",
    PlaybackContextSyncResult
  >(["playlists", "playbackContexts"], ({ playlists, playbackContexts }) => {
    const storedPlaylists = playlists.filter(isPlaylist);
    const storedPlaybackContexts = playbackContexts.filter(isPlaybackContext);
    const previousPlaybackContext = storedPlaybackContexts.find(
      (context) => context.tabId === tabId,
    );
    const activePlaylist = previousPlaybackContext
      ? storedPlaylists.find((playlist) => playlist.id === previousPlaybackContext.playlistId)
      : null;
    const currentIndex = activePlaylist
      ? resolvePlaybackIndex(activePlaylist, videoId, previousPlaybackContext)
      : null;

    if (!activePlaylist || currentIndex === null || currentIndex < 0) {
      return {
        updates: {},
        result: {
          playbackContext: null,
          debug:
            previousPlaybackContext === undefined
              ? null
              : {
                  reason: !activePlaylist
                    ? "playlist-not-found"
                    : currentIndex === null
                      ? "video-not-in-playlist"
                      : "invalid-current-index",
                  playlistId: previousPlaybackContext.playlistId,
                  playlistVideoCount: activePlaylist?.videoIds.length ?? null,
                  previousPlaybackContext,
                },
        },
      };
    }

    const playbackContext: PlaybackContext = {
      playlistId: activePlaylist.id,
      tabId,
      currentIndex,
    };
    const nextPlaybackContexts = storedPlaybackContexts.filter(
      (context) => context.tabId !== tabId && context.playlistId !== activePlaylist.id,
    );

    nextPlaybackContexts.push(playbackContext);

    return {
      updates: { playbackContexts: nextPlaybackContexts },
      result: {
        playbackContext,
        debug: null,
      },
    };
  });

  if (syncResult.debug) {
    await recordPlaybackDebugEvent("sync-playback-context-null", syncResult.debug.reason, {
      playlistId: syncResult.debug.playlistId,
      tabId,
      videoId,
      playlistVideoCount: syncResult.debug.playlistVideoCount,
      previousPlaybackContext: syncResult.debug.previousPlaybackContext,
    });
  }

  return syncResult.playbackContext;
}

export async function resolveNextVideoForPlaybackContext(
  tabId: number,
  videoId: VideoId,
): Promise<{
  firstVideoId: VideoId | null;
  playbackContext: PlaybackContext | null;
  playlistPlaybackSettings: PlaybackSettings | null;
  nextVideoId: VideoId | null;
}> {
  const playbackContext = await syncPlaybackContextForVideo(tabId, videoId);

  if (!playbackContext) {
    return {
      firstVideoId: null,
      playbackContext: null,
      playlistPlaybackSettings: null,
      nextVideoId: null,
    };
  }

  const [{ playbackSettings }, playlists] = await Promise.all([
    getStorageData(["playbackSettings"]),
    getStoredPlaylists(),
  ]);
  const playlist = playlists.find(
    (currentPlaylist) => currentPlaylist.id === playbackContext.playlistId,
  );

  return {
    firstVideoId: playlist?.videoIds[0] ?? null,
    playbackContext,
    playlistPlaybackSettings: playlist
      ? resolvePlaylistPlaybackSettings(playbackSettings, playlist)
      : playbackSettings,
    nextVideoId: playlist?.videoIds[playbackContext.currentIndex + 1] ?? null,
  };
}
