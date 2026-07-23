import { describe, expect, it } from "vitest";
import { getUInt16, getUInt32, getUInt64, getUInt8, subArray, toHexString } from "../util.js";

/**
 * Ported (as new tests -- Util.cs has no C# unit test fixture) against
 * NzbDrone.Core/MediaFiles/AzwTag/Util.cs's big-endian byte-reading
 * behavior.
 */
describe("azw util", () => {
  it("reads a big-endian uint8", () => {
    const buf = Buffer.from([0x00, 0xff, 0x12]);
    expect(getUInt8(buf, 1)).toBe(0xff);
  });

  it("reads a big-endian uint16", () => {
    const buf = Buffer.from([0x12, 0x34]);
    expect(getUInt16(buf, 0)).toBe(0x1234);
  });

  it("reads a big-endian uint32", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(getUInt32(buf, 1)).toBe(0x01020304);
  });

  it("reads a big-endian uint64 as bigint", () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00]);
    expect(getUInt64(buf, 0)).toBe(256n);
  });

  it("subArray returns the requested byte range", () => {
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    expect(Array.from(subArray(buf, 1, 3))).toEqual([2, 3, 4]);
  });

  it("toHexString matches Util.ToHexString's uppercase-hex behavior", () => {
    const buf = Buffer.from([0x00, 0xab, 0xff]);
    expect(toHexString(buf, 0, 3)).toBe("00ABFF");
  });
});
