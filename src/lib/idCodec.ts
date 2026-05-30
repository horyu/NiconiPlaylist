const ID_PATTERN = /^(sm|so|nm)([1-9][0-9]{0,8})$/;

const MAX_VIDEO_NUMBER = 999_999_999;
const MAX_SIGNED_INT_32 = 2_147_483_647;

const DEFAULT_PREFIXES = ["sm", "so", "nm"] as const;
const MODE_TO_EXCEPTION_PREFIXES = [
  ["so", "nm"],
  ["sm", "nm"],
  ["sm", "so"],
] as const;
const PREFIX_TO_TRIT = {
  sm: 0,
  so: 1,
  nm: 2,
} as const;
const TRIT_TO_PREFIX = ["sm", "so", "nm"] as const;

type Prefix = keyof typeof PREFIX_TO_TRIT;
type DefaultPrefixMode = 0 | 1 | 2;
type PrefixMode = DefaultPrefixMode | 3;

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

function encodeDeltaBytes(numerics: number[]): number[] {
  const bytes: number[] = [];
  let previous = 0;

  for (const numeric of numerics) {
    const delta = numeric - previous;
    assertSignedInt32(delta, "delta");
    previous = numeric;
    writeVarint(bytes, zigZagEncode(delta));
  }

  return bytes;
}

function encodeDefaultPrefixModePayload(mode: DefaultPrefixMode, prefixes: Prefix[]): number[] {
  const bytes: number[] = [];
  const defaultPrefix = DEFAULT_PREFIXES[mode];
  const [firstExceptionPrefix, secondExceptionPrefix] = MODE_TO_EXCEPTION_PREFIXES[mode];
  const runLengths: number[] = [];
  const exceptionTypes: number[] = [];
  let tailRunLength = 0;

  for (const prefix of prefixes) {
    if (prefix === defaultPrefix) {
      tailRunLength += 1;
      continue;
    }

    runLengths.push(tailRunLength);
    tailRunLength = 0;

    if (prefix === firstExceptionPrefix) {
      exceptionTypes.push(0);
    } else if (prefix === secondExceptionPrefix) {
      exceptionTypes.push(1);
    } else {
      throw new Error("Invalid prefix for selected mode.");
    }
  }

  writeVarint(bytes, prefixes.length);
  writeVarint(bytes, exceptionTypes.length);

  for (const runLength of runLengths) {
    writeVarint(bytes, runLength);
  }

  for (let index = 0; index < exceptionTypes.length; index += 8) {
    let packed = 0;

    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      packed |= (exceptionTypes[index + bitIndex] ?? 0) << bitIndex;
    }

    bytes.push(packed);
  }

  writeVarint(bytes, tailRunLength);
  return bytes;
}

function decodeDefaultPrefixModePayload(
  bytes: Uint8Array,
  startIndex: number,
  mode: DefaultPrefixMode,
): { count: number; prefixes: Prefix[]; nextIndex: number } {
  const countResult = readVarint(bytes, startIndex);
  const count = countResult.value;
  const exceptionCountResult = readVarint(bytes, countResult.nextIndex);
  const exceptionCount = exceptionCountResult.value;
  const runLengths = new Array<number>(exceptionCount);
  let cursor = exceptionCountResult.nextIndex;

  for (let index = 0; index < exceptionCount; index += 1) {
    const runLengthResult = readVarint(bytes, cursor);

    runLengths[index] = runLengthResult.value;
    cursor = runLengthResult.nextIndex;
  }

  const exceptionTypeByteLength = Math.ceil(exceptionCount / 8);
  const exceptionTypeEnd = cursor + exceptionTypeByteLength;

  if (exceptionTypeEnd > bytes.length) {
    throw new Error("Packed exception type bits are missing.");
  }

  const exceptionTypeBytes = bytes.slice(cursor, exceptionTypeEnd);
  cursor = exceptionTypeEnd;

  const tailRunLengthResult = readVarint(bytes, cursor);
  const tailRunLength = tailRunLengthResult.value;

  cursor = tailRunLengthResult.nextIndex;

  const defaultPrefix = DEFAULT_PREFIXES[mode];
  const [firstExceptionPrefix, secondExceptionPrefix] = MODE_TO_EXCEPTION_PREFIXES[mode];
  const prefixes: Prefix[] = [];

  for (let index = 0; index < exceptionCount; index += 1) {
    const runLength = runLengths[index]!;

    for (let runIndex = 0; runIndex < runLength; runIndex += 1) {
      prefixes.push(defaultPrefix);
    }

    const packed = exceptionTypeBytes[Math.floor(index / 8)]!;
    const exceptionType = (packed >> (index % 8)) & 0b1;

    prefixes.push(exceptionType === 0 ? firstExceptionPrefix : secondExceptionPrefix);
  }

  for (let runIndex = 0; runIndex < tailRunLength; runIndex += 1) {
    prefixes.push(defaultPrefix);
  }

  if (prefixes.length !== count) {
    throw new Error("Decoded prefix count does not match count.");
  }

  return {
    count,
    prefixes,
    nextIndex: cursor,
  };
}

function bigIntToBytes(value: bigint): number[] {
  if (value === 0n) {
    return [];
  }

  const bytes: number[] = [];
  let current = value;

  while (current > 0n) {
    bytes.unshift(Number(current & 0xffn));
    current >>= 8n;
  }

  return bytes;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  return value;
}

function encodeBase3PrefixPayload(prefixes: Prefix[]): number[] {
  const prefixPayloadBytes = bigIntToBytes(
    prefixes.reduce((value, prefix) => value * 3n + BigInt(PREFIX_TO_TRIT[prefix]), 0n),
  );
  const bytes: number[] = [];

  writeVarint(bytes, prefixes.length);
  writeVarint(bytes, prefixPayloadBytes.length);
  bytes.push(...prefixPayloadBytes);
  return bytes;
}

function decodeBase3PrefixPayload(
  bytes: Uint8Array,
  startIndex: number,
): { count: number; prefixes: Prefix[]; nextIndex: number } {
  const countResult = readVarint(bytes, startIndex);
  const count = countResult.value;
  const payloadLengthResult = readVarint(bytes, countResult.nextIndex);
  const payloadByteLength = payloadLengthResult.value;
  const payloadStart = payloadLengthResult.nextIndex;
  const payloadEnd = payloadStart + payloadByteLength;

  if (payloadEnd > bytes.length) {
    throw new Error("Packed base-3 prefix bytes are missing.");
  }

  let value = bytesToBigInt(bytes.slice(payloadStart, payloadEnd));
  const prefixes = new Array<Prefix>(count);

  for (let index = count - 1; index >= 0; index -= 1) {
    const trit = Number(value % 3n);
    const prefix = TRIT_TO_PREFIX[trit];

    if (!prefix) {
      throw new Error("Decoded base-3 prefix is invalid.");
    }

    prefixes[index] = prefix;
    value /= 3n;
  }

  if (value !== 0n) {
    throw new Error("Decoded prefix count does not match count.");
  }

  return {
    count,
    prefixes,
    nextIndex: payloadEnd,
  };
}

function buildEncodedBytes(mode: PrefixMode, prefixes: Prefix[], deltaBytes: number[]): number[] {
  const bytes: number[] = [mode];
  const prefixPayload =
    mode === 3
      ? encodeBase3PrefixPayload(prefixes)
      : encodeDefaultPrefixModePayload(mode, prefixes);

  bytes.push(...prefixPayload, ...deltaBytes);
  return bytes;
}

export function encodeIds(ids: string[]): string {
  if (!Array.isArray(ids)) {
    throw new Error("IDs must be an array.");
  }

  const prefixes = new Array<Prefix>(ids.length);
  const numerics = new Array<number>(ids.length);

  for (let index = 0; index < ids.length; index += 1) {
    const value = ids[index];

    assertIdString(value);

    const parsed = parseVideoId(value);
    prefixes[index] = parsed.prefix;
    numerics[index] = parsed.numeric;
  }

  const deltaBytes = encodeDeltaBytes(numerics);
  const candidates: Array<{ mode: PrefixMode; bytes: number[] }> = [
    { mode: 0 as PrefixMode, bytes: buildEncodedBytes(0, prefixes, deltaBytes) },
    { mode: 1 as PrefixMode, bytes: buildEncodedBytes(1, prefixes, deltaBytes) },
    { mode: 2 as PrefixMode, bytes: buildEncodedBytes(2, prefixes, deltaBytes) },
    { mode: 3 as PrefixMode, bytes: buildEncodedBytes(3, prefixes, deltaBytes) },
  ];
  const bestCandidate = candidates.reduce((best, current) =>
    current.bytes.length < best.bytes.length ? current : best,
  );

  return bytesToBase64Url(bestCandidate.bytes);
}

export function decodeIds(encoded: string): string[] {
  const bytes = base64UrlToBytes(encoded);
  const header = bytes[0];

  if (header === undefined || header > 3) {
    throw new Error("Invalid mode.");
  }

  const mode = header as PrefixMode;
  const prefixPayload =
    mode === 3
      ? decodeBase3PrefixPayload(bytes, 1)
      : decodeDefaultPrefixModePayload(bytes, 1, mode);
  const ids: string[] = [];
  let previous = 0;
  let cursor = prefixPayload.nextIndex;

  for (const prefix of prefixPayload.prefixes) {
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

  if (ids.length !== prefixPayload.count) {
    throw new Error("Decoded prefix count does not match count.");
  }

  if (cursor !== bytes.length) {
    throw new Error("Unexpected trailing bytes.");
  }

  return ids;
}
