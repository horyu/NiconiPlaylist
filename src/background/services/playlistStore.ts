import { getStorageData, setStorageData } from "@/background/services/storage";
import { formatDashedTimestampWithMinutes } from "@/lib/dateTime";
import { isPlaybackContext, isPlaybackDebugEvent, isPlaylist } from "@/lib/typeGuards";
import type {
  PlaybackContext,
  PlaybackDebugEvent,
  PlaybackDebugEventType,
  Playlist,
  PlaylistId,
  VideoId,
} from "@/lib/types";

const MAX_PLAYBACK_DEBUG_EVENTS = 50;

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

  return playlists.filter(isPlaylist);
}

export async function setStoredPlaylists(playlists: Playlist[]): Promise<void> {
  await setStorageData({ playlists });
}

export async function getStoredPlaybackContexts(): Promise<PlaybackContext[]> {
  const { playbackContexts } = await getStorageData(["playbackContexts"]);

  return playbackContexts.filter(isPlaybackContext);
}

async function getStoredPlaybackDebugEvents(): Promise<PlaybackDebugEvent[]> {
  const { playbackDebugEvents } = await getStorageData(["playbackDebugEvents"]);

  return playbackDebugEvents.filter(isPlaybackDebugEvent);
}

async function appendStoredPlaybackDebugEvent(
  event: Omit<PlaybackDebugEvent, "occurredAt">,
): Promise<void> {
  const playbackDebugEvents = await getStoredPlaybackDebugEvents();
  const nextPlaybackDebugEvents = [
    ...playbackDebugEvents,
    {
      ...event,
      occurredAt: new Date().toISOString(),
    },
  ].slice(-MAX_PLAYBACK_DEBUG_EVENTS);

  await setStorageData({ playbackDebugEvents: nextPlaybackDebugEvents });
}

async function recordPlaybackDebugEvent(
  type: PlaybackDebugEventType,
  reason: string,
  details: {
    playlistId?: PlaylistId | null;
    tabId?: number | null;
    videoId?: VideoId | null;
    currentIndex?: number | null;
    playlistVideoCount?: number | null;
    previousPlaybackContext?: PlaybackContext | null;
    href?: string | null;
    isAdvertisementVideo?: boolean | null;
    isVideoElement?: boolean | null;
    targetTagName?: string | null;
    videoCurrentSrc?: string | null;
    videoCurrentTime?: number | null;
    videoDuration?: number | null;
    videoEnded?: boolean | null;
    videoPaused?: boolean | null;
    videoTitle?: string | null;
  },
): Promise<void> {
  await appendStoredPlaybackDebugEvent({
    type,
    reason,
    playlistId: details.playlistId ?? null,
    tabId: details.tabId ?? null,
    videoId: details.videoId ?? null,
    currentIndex: details.currentIndex ?? null,
    playlistVideoCount: details.playlistVideoCount ?? null,
    previousPlaybackContext: details.previousPlaybackContext ?? null,
    href: details.href ?? null,
    isAdvertisementVideo: details.isAdvertisementVideo ?? null,
    isVideoElement: details.isVideoElement ?? null,
    targetTagName: details.targetTagName ?? null,
    videoCurrentSrc: details.videoCurrentSrc ?? null,
    videoCurrentTime: details.videoCurrentTime ?? null,
    videoDuration: details.videoDuration ?? null,
    videoEnded: details.videoEnded ?? null,
    videoPaused: details.videoPaused ?? null,
    videoTitle: details.videoTitle ?? null,
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

export async function setStoredPlaybackContexts(
  playbackContexts: PlaybackContext[],
): Promise<void> {
  await setStorageData({ playbackContexts });
}

export async function getLastActivePlaylistId(): Promise<PlaylistId | null> {
  const { lastActivePlaylistId } = await getStorageData(["lastActivePlaylistId"]);
  return lastActivePlaylistId;
}

export async function setLastActivePlaylistId(playlistId: PlaylistId | null): Promise<void> {
  await setStorageData({ lastActivePlaylistId: playlistId });
}

export async function activateStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  const playlists = await getStoredPlaylists();

  if (!playlists.some((playlist) => playlist.id === playlistId)) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  await setLastActivePlaylistId(playlistId);
}

export async function updateStoredPlaylist(
  playlistId: PlaylistId,
  updates: Partial<Pick<Playlist, "memo" | "title" | "videoIds" | "popupHidden">>,
  options?: {
    deletedVideoIndices?: number[];
  },
): Promise<Playlist> {
  const [playlists, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getStoredPlaybackContexts(),
  ]);
  const playlistIndex = playlists.findIndex((playlist) => playlist.id === playlistId);

  if (playlistIndex < 0) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  const currentPlaylist = playlists[playlistIndex]!;
  const now = new Date().toISOString();
  const nextPlaylist: Playlist = {
    ...currentPlaylist,
    ...updates,
    updatedAt: now,
  };
  const nextPlaylists = [...playlists];

  nextPlaylists[playlistIndex] = nextPlaylist;
  const deletedVideoIndices = [...(options?.deletedVideoIndices ?? [])].sort((a, b) => a - b);
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

          if (currentOccurrenceKey) {
            const movedCurrentIndex = nextVideoIndexByOccurrenceKey.get(currentOccurrenceKey);

            if (movedCurrentIndex !== undefined) {
              return [
                {
                  ...playbackContext,
                  currentIndex: movedCurrentIndex,
                },
              ];
            }
          }

          const deletedBeforeCount = countDeletedIndicesBefore(
            deletedVideoIndices,
            playbackContext.currentIndex,
          );
          const isCurrentVideoDeleted = deletedVideoIndices.includes(playbackContext.currentIndex);

          if (!isCurrentVideoDeleted) {
            return [
              {
                ...playbackContext,
                currentIndex: Math.min(
                  playbackContext.currentIndex - deletedBeforeCount,
                  nextPlaylist.videoIds.length - 1,
                ),
              },
            ];
          }

          const nextCurrentIndex = playbackContext.currentIndex - deletedBeforeCount;

          return [
            {
              ...playbackContext,
              currentIndex: Math.min(nextCurrentIndex, nextPlaylist.videoIds.length - 1),
            },
          ];
        })
      : playbackContexts;

  await Promise.all([
    setStoredPlaylists(nextPlaylists),
    setStoredPlaybackContexts(nextPlaybackContexts),
  ]);

  return nextPlaylist;
}

export async function deleteStoredPlaylist(playlistId: PlaylistId): Promise<void> {
  const [playlists, lastActivePlaylistId, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
    getStoredPlaybackContexts(),
  ]);
  const nextPlaylists = playlists.filter((playlist) => playlist.id !== playlistId);
  const nextPlaybackContexts = playbackContexts.filter(
    (context) => context.playlistId !== playlistId,
  );

  await Promise.all([
    setStoredPlaylists(nextPlaylists),
    setStoredPlaybackContexts(nextPlaybackContexts),
  ]);

  if (lastActivePlaylistId === playlistId) {
    await setLastActivePlaylistId(nextPlaylists[0]?.id ?? null);
  }
}

export async function createShuffledStoredPlaylistCopy(playlistId: PlaylistId): Promise<Playlist> {
  const playlists = await getStoredPlaylists();
  const sourcePlaylist = playlists.find((playlist) => playlist.id === playlistId);

  if (!sourcePlaylist) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  const now = new Date();
  const nextPlaylist: Playlist = {
    id: createPlaylistId(),
    ...createPlaylistTimestampPatch(now),
    title: createShuffledPlaylistTitle(sourcePlaylist.title ?? sourcePlaylist.id),
    memo: sourcePlaylist.memo,
    popupHidden: false,
    videoIds: shuffleVideoIds(sourcePlaylist.videoIds),
  };

  await Promise.all([
    setStoredPlaylists([...playlists, nextPlaylist]),
    setLastActivePlaylistId(nextPlaylist.id),
  ]);

  return nextPlaylist;
}

export async function createStoredPlaylistCopy(playlistId: PlaylistId): Promise<Playlist> {
  const playlists = await getStoredPlaylists();
  const sourcePlaylist = playlists.find((playlist) => playlist.id === playlistId);

  if (!sourcePlaylist) {
    throw new Error("指定したプレイリストは保存されていません。");
  }

  const now = new Date();
  const nextPlaylist: Playlist = {
    id: createPlaylistId(),
    ...createPlaylistTimestampPatch(now),
    title: createCopiedPlaylistTitle(sourcePlaylist.title ?? sourcePlaylist.id),
    memo: sourcePlaylist.memo,
    popupHidden: false,
    videoIds: [...sourcePlaylist.videoIds],
  };

  await Promise.all([
    setStoredPlaylists([...playlists, nextPlaylist]),
    setLastActivePlaylistId(nextPlaylist.id),
  ]);

  return nextPlaylist;
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
  const playbackContexts = await getStoredPlaybackContexts();
  const previousPlaybackContext =
    playbackContexts.find((context) => context.tabId === tabId) ?? null;
  const nextPlaybackContexts = playbackContexts.filter((context) => context.tabId !== tabId);

  await recordPlaybackDebugEvent("clear-playback-context-by-tab", reason, {
    playlistId: previousPlaybackContext?.playlistId ?? null,
    tabId,
    currentIndex: previousPlaybackContext?.currentIndex ?? null,
    previousPlaybackContext,
  });
  await setStoredPlaybackContexts(nextPlaybackContexts);
}

export async function clearStoredPlaybackContextsByPlaylistId(
  playlistId: PlaylistId,
  reason = "unspecified",
): Promise<void> {
  const playbackContexts = await getStoredPlaybackContexts();
  const nextPlaybackContexts = playbackContexts.filter(
    (context) => context.playlistId !== playlistId,
  );

  await recordPlaybackDebugEvent("clear-playback-contexts-by-playlist", reason, {
    playlistId,
    previousPlaybackContext:
      playbackContexts.find((context) => context.playlistId === playlistId) ?? null,
  });
  await setStoredPlaybackContexts(nextPlaybackContexts);
}

export async function setStoredPlaybackContextIndex(
  tabId: number,
  playlistId: PlaylistId,
  currentIndex: number,
): Promise<PlaybackContext> {
  const [playlists, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getStoredPlaybackContexts(),
  ]);
  const playlist = playlists.find((currentPlaylist) => currentPlaylist.id === playlistId);

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
  const nextPlaybackContexts = playbackContexts.filter(
    (context) => context.tabId !== tabId && context.playlistId !== playlistId,
  );
  const playedAt = new Date().toISOString();
  const nextPlaylists = playlists.map((currentPlaylist) =>
    currentPlaylist.id === playlistId
      ? {
          ...currentPlaylist,
          lastPlayedAt: playedAt,
        }
      : currentPlaylist,
  );

  nextPlaybackContexts.push(playbackContext);

  await Promise.all([
    setStoredPlaybackContexts(nextPlaybackContexts),
    setStoredPlaylists(nextPlaylists),
    setLastActivePlaylistId(playlistId),
  ]);

  return playbackContext;
}

export async function markStoredPlaylistCompleted(playlistId: PlaylistId): Promise<void> {
  const playlists = await getStoredPlaylists();
  const completedAt = new Date().toISOString();
  const nextPlaylists = playlists.map((playlist) =>
    playlist.id === playlistId
      ? {
          ...playlist,
          lastCompletedAt: completedAt,
        }
      : playlist,
  );

  await setStoredPlaylists(nextPlaylists);
}

export async function markStoredPlaylistCompletedByTabId(tabId: number): Promise<void> {
  const playbackContext = await getStoredPlaybackContextByTabId(tabId);

  if (!playbackContext) {
    return;
  }

  await markStoredPlaylistCompleted(playbackContext.playlistId);
}

export async function syncPlaybackContextForVideo(
  tabId: number,
  videoId: VideoId,
): Promise<PlaybackContext | null> {
  const [playlists, playbackContexts] = await Promise.all([
    getStoredPlaylists(),
    getStoredPlaybackContexts(),
  ]);
  const previousPlaybackContext = playbackContexts.find((context) => context.tabId === tabId);
  const activePlaylist = previousPlaybackContext
    ? playlists.find((playlist) => playlist.id === previousPlaybackContext.playlistId)
    : null;
  const currentIndex: number | null = activePlaylist
    ? resolvePlaybackIndex(activePlaylist, videoId, previousPlaybackContext)
    : null;

  if (!activePlaylist || currentIndex === null || currentIndex < 0) {
    if (!previousPlaybackContext) {
      return null;
    }

    const reason = !activePlaylist
      ? "playlist-not-found"
      : currentIndex === null
        ? "video-not-in-playlist"
        : "invalid-current-index";
    await recordPlaybackDebugEvent("sync-playback-context-null", reason, {
      playlistId: previousPlaybackContext?.playlistId ?? null,
      tabId,
      videoId,
      playlistVideoCount: activePlaylist?.videoIds.length ?? null,
      previousPlaybackContext: previousPlaybackContext ?? null,
    });
    return null;
  }

  const latestPlaybackContexts = await getStoredPlaybackContexts();
  const latestPlaybackContext = latestPlaybackContexts.find((context) => context.tabId === tabId);

  if (
    !latestPlaybackContext ||
    latestPlaybackContext.playlistId !== previousPlaybackContext?.playlistId
  ) {
    await recordPlaybackDebugEvent("sync-playback-context-null", "latest-context-mismatch", {
      playlistId: previousPlaybackContext?.playlistId ?? null,
      tabId,
      videoId,
      currentIndex,
      playlistVideoCount: activePlaylist.videoIds.length,
      previousPlaybackContext: previousPlaybackContext ?? null,
    });
    return null;
  }

  const playbackContext: PlaybackContext = {
    playlistId: activePlaylist.id,
    tabId,
    currentIndex,
  };
  const nextPlaybackContexts = latestPlaybackContexts.filter(
    (context) => context.tabId !== tabId && context.playlistId !== activePlaylist.id,
  );

  nextPlaybackContexts.push(playbackContext);
  await setStoredPlaybackContexts(nextPlaybackContexts);

  return playbackContext;
}

export async function resolveNextVideoForPlaybackContext(
  tabId: number,
  videoId: VideoId,
): Promise<{
  firstVideoId: VideoId | null;
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
}> {
  const playbackContext = await syncPlaybackContextForVideo(tabId, videoId);

  if (!playbackContext) {
    return {
      firstVideoId: null,
      playbackContext: null,
      nextVideoId: null,
    };
  }

  const playlists = await getStoredPlaylists();
  const playlist = playlists.find(
    (currentPlaylist) => currentPlaylist.id === playbackContext.playlistId,
  );

  return {
    firstVideoId: playlist?.videoIds[0] ?? null,
    playbackContext,
    nextVideoId: playlist?.videoIds[playbackContext.currentIndex + 1] ?? null,
  };
}
