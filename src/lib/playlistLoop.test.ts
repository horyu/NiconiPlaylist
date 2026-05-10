import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  DEFAULT_REPEAT_PRESETS,
  createRepeatPreset,
  resolveActiveRepeatPreset,
  sanitizePlaybackSettings,
  shouldRepeatCurrentVideo,
} from "./playlistLoop";

describe("playlistLoop", () => {
  test("count モードでは指定回数に達するまでループする", () => {
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        1,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        3,
        120,
      ),
    ).toBe(false);
  });

  test("duration モードでは合計再生時間が指定秒数に達するまでループする", () => {
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        2,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
          completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
        },
        3,
        120,
      ),
    ).toBe(false);
  });

  test("sanitize は未保存時だけ初期プリセットを補完し、無効な active id を解除する", () => {
    expect(sanitizePlaybackSettings(undefined)).toEqual({
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS,
      completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
    });
    expect(
      sanitizePlaybackSettings({
        playlistRepeatEnabled: false,
        activeRepeatPresetId: "missing",
        presets: [],
      }),
    ).toEqual({
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: [],
      completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
    });
  });

  test("active なプリセットを解決できる", () => {
    const repeatSettings = sanitizePlaybackSettings({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: "custom",
      presets: [createRepeatPreset("count", 4, "custom")],
    });

    expect(resolveActiveRepeatPreset(repeatSettings)).toEqual({
      id: "custom",
      mode: "count",
      count: 4,
    });
  });

  test("completion 設定は範囲内に正規化する", () => {
    expect(
      sanitizePlaybackSettings({
        presets: [],
        completion: {
          playSoundEnabled: true,
          soundVolume: 120,
          soundRepeatCount: 0,
          focusTabEnabled: true,
          alertEnabled: true,
        },
      }).completion,
    ).toEqual({
      playSoundEnabled: false,
      soundVolume: 100,
      soundRepeatCount: 1,
      focusTabEnabled: true,
      alertEnabled: true,
    });
  });
});
