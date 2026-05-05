const NVAPI_CLIENT_MARKER_PARAM_NAME = "niconiPlaylist";
const NVAPI_CLIENT_MARKER_PARAM_VALUE = "1";

export const NVAPI_VIDEOS_ENDPOINT = "https://nvapi.nicovideo.jp/v1/videos";
export const NVAPI_VIDEOS_URL_MATCH_PATTERN = `${NVAPI_VIDEOS_ENDPOINT}*`;
export const NVAPI_VIDEOS_URL_REGEX_FILTER =
  "^https://nvapi\\.nicovideo\\.jp/v1/videos\\?.*niconiPlaylist=1";

export function appendNvapiClientMarker(url: URL): void {
  url.searchParams.set(NVAPI_CLIENT_MARKER_PARAM_NAME, NVAPI_CLIENT_MARKER_PARAM_VALUE);
}

export function hasNvapiClientMarker(urlText: string): boolean {
  const url = new URL(urlText);

  return url.searchParams.get(NVAPI_CLIENT_MARKER_PARAM_NAME) === NVAPI_CLIENT_MARKER_PARAM_VALUE;
}
