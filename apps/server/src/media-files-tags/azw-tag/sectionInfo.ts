/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/SectionInfo.cs.
 *
 * C# `struct SectionInfo` with a computed `Length` property -- ported as a
 * plain interface plus a `sectionInfoLength()` free function (this module's
 * convention for C# computed properties, see qualityModel.ts).
 */
export interface SectionInfo {
  startAddr: number;
  endAddr: number;
}

/** Ported from `SectionInfo.Length => End_addr - Start_addr`. */
export function sectionInfoLength(info: SectionInfo): number {
  return info.endAddr - info.startAddr;
}
