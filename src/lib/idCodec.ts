const ID_PATTERN = /^(sm|so|nm|ss)([1-9][0-9]{0,8})$/;

const PREFIX_TO_CODE = {
  sm: 0,
  so: 1,
  nm: 2,
  ss: 3,
} as const;

const CODE_TO_PREFIX = ["sm", "so", "nm", "ss"] as const;

const MAX_VIDEO_NUMBER = 999_999_999;
const MAX_SIGNED_INT_32 = 2_147_483_647;

type Prefix = keyof typeof PREFIX_TO_CODE;

function assertIdString(value: unknown): asserts value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error("Invalid video ID.");
  }
}

function parseVideoId(videoId: string): { prefix: Prefix; numeric: number } {
  const match = ID_PATTERN.exec(videoId);

  if (!match) {
    throw new Error("Invalid video ID.");
  }

  const prefix = match[1] as Prefix;
  const numeric = Number.parseInt(match[2], 10);

  if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > MAX_VIDEO_NUMBER) {
    throw new Error("Invalid video ID numeric part.");
  }

  return { prefix, numeric };
}

function assertSignedInt32(value: number, label: string) {
  if (!Number.isInteger(value) || value < -MAX_SIGNED_INT_32 || value > MAX_SIGNED_INT_32) {
    throw new Error(`Invalid ${label}.`);
  }
}

function zigZagEncode(value: number): number {
  assertSignedInt32(value, "delta");
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function zigZagDecode(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SIGNED_INT_32) {
    throw new Error("Invalid ZigZag value.");
  }

  return value % 2 === 0 ? value / 2 : -((value + 1) / 2);
}

function writeVarint(bytes: number[], value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Invalid varint value.");
  }

  let current = value;

  while (current >= 0x80) {
    bytes.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 0x80);
  }

  bytes.push(current);
}

function readVarint(bytes: Uint8Array, startIndex: number): { value: number; nextIndex: number } {
  let value = 0;
  let shift = 0;
  let index = startIndex;

  while (index < bytes.length) {
    const current = bytes[index]!;
    value += (current & 0x7f) * 2 ** shift;
    index += 1;

    if ((current & 0x80) === 0) {
      return { value, nextIndex: index };
    }

    shift += 7;

    if (shift > 28) {
      throw new Error("Invalid varint value.");
    }
  }

  throw new Error("Incomplete varint.");
}

function bytesToBase64Url(bytes: number[]): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]*$/u.test(encoded)) {
    throw new Error("Invalid base64url.");
  }

  if (encoded.length % 4 === 1) {
    throw new Error("Invalid base64url.");
  }

  const paddingLength = (4 - (encoded.length % 4)) % 4;
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(paddingLength);

  let binary = "";

  try {
    binary = atob(base64);
  } catch {
    throw new Error("Invalid base64url.");
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function encodeIds(ids: string[]): string {
  if (!Array.isArray(ids)) {
    throw new Error("IDs must be an array.");
  }

  const prefixes = new Array<number>(ids.length);
  const numerics = new Array<number>(ids.length);

  for (let index = 0; index < ids.length; index += 1) {
    const value = ids[index];

    assertIdString(value);

    const parsed = parseVideoId(value);
    prefixes[index] = PREFIX_TO_CODE[parsed.prefix];
    numerics[index] = parsed.numeric;
  }

  const bytes: number[] = [];
  writeVarint(bytes, ids.length);

  for (let index = 0; index < prefixes.length; index += 4) {
    const packed =
      (prefixes[index] ?? 0) |
      ((prefixes[index + 1] ?? 0) << 2) |
      ((prefixes[index + 2] ?? 0) << 4) |
      ((prefixes[index + 3] ?? 0) << 6);

    bytes.push(packed);
  }

  let previous = 0;

  for (const numeric of numerics) {
    const delta = numeric - previous;
    assertSignedInt32(delta, "delta");
    previous = numeric;
    writeVarint(bytes, zigZagEncode(delta));
  }

  return bytesToBase64Url(bytes);
}

export function decodeIds(encoded: string): string[] {
  const bytes = base64UrlToBytes(encoded);
  const countResult = readVarint(bytes, 0);
  const count = countResult.value;
  const prefixByteLength = Math.ceil(count / 4);
  const prefixStart = countResult.nextIndex;
  const prefixEnd = prefixStart + prefixByteLength;

  if (prefixEnd > bytes.length) {
    throw new Error("Packed prefix bytes are missing.");
  }

  const prefixes = bytes.slice(prefixStart, prefixEnd);
  const ids: string[] = [];
  let previous = 0;
  let cursor = prefixEnd;

  for (let index = 0; index < count; index += 1) {
    const packed = prefixes[Math.floor(index / 4)]!;
    const prefixCode = (packed >> ((index % 4) * 2)) & 0b11;
    const prefix = CODE_TO_PREFIX[prefixCode];

    if (!prefix) {
      throw new Error("Invalid prefix code.");
    }

    const varintResult = readVarint(bytes, cursor);
    cursor = varintResult.nextIndex;

    const delta = zigZagDecode(varintResult.value);
    assertSignedInt32(delta, "delta");

    const numeric = previous + delta;

    if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > MAX_VIDEO_NUMBER) {
      throw new Error("Decoded numeric part is out of range.");
    }

    previous = numeric;
    ids.push(`${prefix}${numeric}`);
  }

  if (cursor !== bytes.length) {
    throw new Error("Unexpected trailing bytes.");
  }

  return ids;
}
