import { describe, expect, test } from "bun:test";

import {
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
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
        },
        1,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          activeRepeatPresetId: "count-3",
          presets: [
            {
              id: "count-3",
              mode: "count",
              count: 3,
            },
          ],
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
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
        },
        2,
        120,
      ),
    ).toBe(true);
    expect(
      shouldRepeatCurrentVideo(
        {
          playlistRepeatEnabled: false,
          activeRepeatPresetId: "duration-300",
          presets: [
            {
              id: "duration-300",
              mode: "duration",
              durationSeconds: 300,
            },
          ],
        },
        3,
        120,
      ),
    ).toBe(false);
  });

  test("sanitize は未保存時だけ初期プリセットを補完し、無効な active id を解除する", () => {
    expect(sanitizePlaybackSettings(undefined)).toEqual({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS,
    });
    expect(
      sanitizePlaybackSettings({
        playlistRepeatEnabled: false,
        activeRepeatPresetId: "missing",
        presets: [],
      }),
    ).toEqual({
      playlistRepeatEnabled: false,
      activeRepeatPresetId: null,
      presets: [],
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
});
