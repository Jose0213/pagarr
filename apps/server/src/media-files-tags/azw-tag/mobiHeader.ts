import { getUInt32, subArray } from "./util.js";
import { ExtMeta } from "./extMeta.js";
import { AzwTagException } from "./azwTagException.js";
import { noopAzwLogger, type AzwLogger } from "./azwLogger.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/MobiHeader.cs.
 *
 * Parses the PalmDOC/MOBI header embedded in a MOBI/AZW3 file's first
 * record: validates the `MOBI` magic at offset 16, reads Version/MobiType/
 * codepage/Title, then (when the EXTH flag bit is set) hands the EXTH block
 * to `ExtMeta`. Throws (matching the C# source) when the `MOBI` magic is
 * missing or when the EXTH flag bit is absent -- Readarr only supports
 * MOBI/AZW3 files that carry EXTH metadata.
 *
 * `CodePagesEncodingProvider.Instance.GetEncoding((int)codepage)` (.NET's
 * general Windows-codepage table) has no built-in Node equivalent; this
 * port maps the handful of codepages MOBI/AZW3 files actually use in
 * practice to Node's built-in `TextDecoder` labels (see `codepageToEncoding`
 * below) rather than pulling in a dedicated codepage-conversion dependency
 * for a format-metadata reader. Unmapped codepages throw, matching the
 * behavior of an unsupported `CodePagesEncodingProvider` codepage in C#
 * (which throws `NotSupportedException`).
 */
export class MobiHeader {
  readonly title: string;
  readonly version: number;
  readonly mobiType: number;
  readonly extMeta: ExtMeta;

  constructor(header: Uint8Array, logger: AzwLogger = noopAzwLogger) {
    const mobi = Buffer.from(header.buffer, header.byteOffset, header.byteLength)
      .subarray(16, 20)
      .toString("ascii");

    if (mobi !== "MOBI") {
      throw new AzwTagException("Invalid mobi header");
    }

    this.version = getUInt32(header, 36);
    this.mobiType = getUInt32(header, 24);

    const codepage = getUInt32(header, 28);
    const encoding = codepageToEncoding(codepage);

    const titleOffset = getUInt32(header, 0x54);
    const titleLength = getUInt32(header, 0x58);
    this.title = new TextDecoder(encoding).decode(subArray(header, titleOffset, titleLength));

    const exthFlag = getUInt32(header, 0x80);
    const length = getUInt32(header, 20);

    if ((exthFlag & 0x40) > 0) {
      const exth = subArray(header, length + 16, getUInt32(header, length + 20));
      this.extMeta = new ExtMeta(exth, encoding, logger);
    } else {
      throw new AzwTagException("No EXTH header. Readarr cannot process this file.");
    }
  }
}

/**
 * Ported from `codepage == 65001 ? Encoding.UTF8 :
 * CodePagesEncodingProvider.Instance.GetEncoding((int)codepage)`. 65001 is
 * UTF-8; 1252 (Windows-1252/Latin-1, the overwhelmingly common case for
 * English-language MOBI files) and a handful of other common Windows
 * codepages are mapped to their `TextDecoder`-recognized labels.
 */
function codepageToEncoding(codepage: number): string {
  switch (codepage) {
    case 65001:
      return "utf-8";
    case 1252:
      return "windows-1252";
    case 1250:
      return "windows-1250";
    case 1251:
      return "windows-1251";
    case 1253:
      return "windows-1253";
    case 1254:
      return "windows-1254";
    case 1255:
      return "windows-1255";
    case 1256:
      return "windows-1256";
    case 1257:
      return "windows-1257";
    case 1258:
      return "windows-1258";
    default:
      throw new AzwTagException(`Unsupported MOBI codepage: ${codepage}`);
  }
}
