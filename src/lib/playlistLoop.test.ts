import { describe, expect, test } from "bun:test";

import {
  DEFAULT_REPEAT_PRESETS,
  createRepeatPreset,
  resolveActiveRepeatPreset,
  sanitizeRepeatSettings,
  shouldRepeatCurrentVideo,
} from "./playlistLoop";

describe("playlistLoop", () => {
  test("count モードでは指定回数に達するまでループする", () => {
    expect(
      shouldRepeatCurrentVideo(
        {
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
    expect(sanitizeRepeatSettings(undefined)).toEqual({
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS,
    });
    expect(
      sanitizeRepeatSettings({
        activeRepeatPresetId: "missing",
        presets: [],
      }),
    ).toEqual({
      activeRepeatPresetId: null,
      presets: [],
    });
  });

  test("active なプリセットを解決できる", () => {
    const repeatSettings = sanitizeRepeatSettings({
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
