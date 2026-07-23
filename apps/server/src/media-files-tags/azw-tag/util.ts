/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/Util.cs.
 *
 * All of MOBI/AZW3's multi-byte integers are big-endian; the C# source reads
 * them by grabbing the raw little-endian-native bytes and reversing them
 * before handing off to `BitConverter`. Node's `Buffer` has native
 * big-endian readers (`readUInt32BE` etc.), so this port uses those directly
 * instead of replicating the "slice + reverse + BitConverter" dance -- same
 * observable result, no behavior difference, since both approaches are just
 * "interpret these N bytes as a big-endian unsigned integer."
 *
 * C#'s `ulong`/`uint`/`ushort`/`byte` types don't exist in TS; every value
 * here is a plain `number` (all MOBI/AZW3 header offsets and sizes fit
 * comfortably within `Number.MAX_SAFE_INTEGER`, so no precision loss vs. the
 * C# 32/64-bit integer types).
 */

/** Ported from `Util.SubArray(byte[] src, ulong start, ulong length)`. */
export function subArray(src: Uint8Array, start: number, length: number): Uint8Array {
  return src.subarray(start, start + length);
}

/** Ported from `Util.ToHexString(byte[] src, uint start, uint length)`. */
export function toHexString(src: Uint8Array, start: number, length: number): string {
  return Buffer.from(subArray(src, start, length))
    .toString("hex")
    .toUpperCase();
}

/** Ported from `Util.GetUInt64(byte[] src, ulong start)`: big-endian 8-byte read. */
export function getUInt64(src: Uint8Array, start: number): bigint {
  return Buffer.from(src.buffer, src.byteOffset, src.byteLength).readBigUInt64BE(start);
}

/** Ported from `Util.GetUInt32(byte[] src, ulong start)`: big-endian 4-byte read. */
export function getUInt32(src: Uint8Array, start: number): number {
  return Buffer.from(src.buffer, src.byteOffset, src.byteLength).readUInt32BE(start);
}

/** Ported from `Util.GetUInt16(byte[] src, ulong start)`: big-endian 2-byte read. */
export function getUInt16(src: Uint8Array, start: number): number {
  return Buffer.from(src.buffer, src.byteOffset, src.byteLength).readUInt16BE(start);
}

/** Ported from `Util.GetUInt8(byte[] src, ulong start)`. */
export function getUInt8(src: Uint8Array, start: number): number {
  return src[start]!;
}
