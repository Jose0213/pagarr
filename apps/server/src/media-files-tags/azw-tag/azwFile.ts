import { readFileSync } from "node:fs";
import { getUInt16, getUInt32, subArray } from "./util.js";
import { AzwTagException } from "./azwTagException.js";
import { sectionInfoLength, type SectionInfo } from "./sectionInfo.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/AzwFile.cs.
 *
 * `protected` constructor in C# (only `Azw3File : AzwFile` ever instantiates
 * it) -- ported the same way: a `protected` TS constructor, so only
 * subclasses (azw3File.ts) can construct one directly.
 *
 * C#'s `Math.Min(Util.GetUInt16(RawData, 76), (ushort)1)` clamps
 * SectionCount to at most 1 -- Readarr only ever reads the file's first
 * record (the MOBI header lives there), so it deliberately ignores the
 * file's real section count. Preserved verbatim, including the resulting
 * `Info` array always having length 0 or 1.
 */
export class AzwFile {
  readonly rawData: Uint8Array;
  readonly sectionCount: number;
  readonly info: SectionInfo[];
  readonly ident: string;

  protected constructor(path: string) {
    this.rawData = readFileSync(path);

    const buf = Buffer.from(this.rawData.buffer, this.rawData.byteOffset, this.rawData.byteLength);
    this.ident = buf.subarray(0x3c, 0x3c + 8).toString("ascii");
    this.sectionCount = Math.min(getUInt16(this.rawData, 76), 1);

    if (this.ident !== "BOOKMOBI" || this.sectionCount === 0) {
      throw new AzwTagException("Invalid mobi header");
    }

    this.info = new Array<SectionInfo>(this.sectionCount);
    this.info[0] = {
      startAddr: getUInt32(this.rawData, 78),
      endAddr: getUInt32(this.rawData, 78 + 8),
    };
  }

  protected getSectionData(i: number): Uint8Array {
    const section = this.info[i]!;
    return subArray(this.rawData, section.startAddr, sectionInfoLength(section));
  }
}
