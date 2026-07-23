import { getUInt16, getUInt32, getUInt64, getUInt8, subArray, toHexString } from "./util.js";
import { idMapHex, idMapStrings, idMapValues } from "./idMapping.js";
import { noopAzwLogger, type AzwLogger } from "./azwLogger.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/ExtMeta.cs.
 *
 * Parses the MOBI/AZW3 EXTH metadata block: a sequence of `(id, size,
 * payload)` records classified into one of three buckets by `IdMapping`
 * (string-valued, numeric-valued, or hex-valued), matching the id-driven
 * three-way branch in the C# constructor exactly, including the unknown-id
 * fall-through (silently skipped -- see the `// Unknown id` comment in the
 * original).
 *
 * C#'s `Dictionary<uint, ulong> IdValue` used `ulong` because a handful of
 * EXTH numeric fields are 8-byte (`size == 16` -> `Util.GetUInt64`); this
 * port uses `bigint` for that one 8-byte case and plain `number` for the
 * 1/2/4-byte cases, matching `getUInt64`'s return type in util.ts. Values
 * read into `IdValue` are otherwise unused by any of this module's
 * `AudioTag`/`EBookTagService`/`Azw3File` callers (only `IdString` is
 * consulted, via `StringOrNull`/`StringList`), so the exact numeric type
 * used internally has no observable effect on any ported call site.
 */
export class ExtMeta {
  readonly idValue = new Map<number, number | bigint>();
  readonly idString = new Map<number, string[]>();
  readonly idHex = new Map<number, string>();

  constructor(ext: Uint8Array, encoding: string, logger: AzwLogger = noopAzwLogger) {
    const numItems = getUInt32(ext, 8);
    let pos = 12;

    for (let i = 0; i < numItems; i++) {
      const id = getUInt32(ext, pos);
      const size = getUInt32(ext, pos + 4);

      if (idMapStrings.has(id)) {
        const a = decodeString(subArray(ext, pos + 8, size - 8), encoding);

        const existing = this.idString.get(id);
        if (existing) {
          existing.push(a);
        } else {
          this.idString.set(id, [a]);
        }
      } else if (idMapValues.has(id)) {
        let a: number | bigint = 0;
        switch (size) {
          case 9:
            a = getUInt8(ext, pos + 8);
            break;
          case 10:
            a = getUInt16(ext, pos + 8);
            break;
          case 12:
            a = getUInt32(ext, pos + 8);
            break;
          case 16:
            a = getUInt64(ext, pos + 8);
            break;
          default:
            logger.warn("unexpected size:" + String(size));
            break;
        }

        if (this.idValue.has(id)) {
          logger.debug(
            "Meta id duplicate:{0}\nPervious:{1}  \nLatter:{2}",
            idMapValues.get(id),
            this.idValue.get(id),
            a
          );
        } else {
          this.idValue.set(id, a);
        }
      } else if (idMapHex.has(id)) {
        const a = toHexString(ext, pos + 8, size - 8);

        if (this.idHex.has(id)) {
          logger.debug(
            "Meta id duplicate:{0}\nPervious:{1}  \nLatter:{2}",
            idMapHex.get(id),
            this.idHex.get(id),
            a
          );
        } else {
          this.idHex.set(id, a);
        }
      }

      // else: Unknown id -- silently skipped, matching the C# source.

      pos += size;
    }
  }

  /** Ported from `ExtMeta.StringOrNull(uint key)`. */
  stringOrNull(key: number): string | null {
    return this.idString.get(key)?.[0] ?? null;
  }

  /** Ported from `ExtMeta.StringList(uint key)`. */
  stringList(key: number): string[] {
    return this.idString.get(key) ?? [];
  }
}

/**
 * Ported from the C# constructor's `encoding.GetString(...)` calls, where
 * `encoding` is either `Encoding.UTF8` (codepage 65001) or
 * `CodePagesEncodingProvider.Instance.GetEncoding((int)codepage)` for any
 * other Windows/IANA codepage (see mobiHeader.ts). Node's built-in
 * `TextDecoder` supports the common ones this format actually uses in
 * practice (`utf-8`, `windows-1252`); anything else throws the same way an
 * unsupported .NET codepage would.
 */
function decodeString(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes);
}
