import { createHash } from "node:crypto";
import bencode from "bencode";

/**
 * Ported from NzbDrone.Core/MediaFiles/TorrentInfo/TorrentFileInfoReader.cs.
 *
 * C# used the MonoTorrent library's `Torrent.Load(byte[]).InfoHash.ToHex()`
 * -- MonoTorrent is a full BitTorrent client/protocol library; Readarr uses
 * only this one static entry point (parse a `.torrent` file's bencoded
 * bytes, hash its `info` dictionary). Rather than pull in an equally heavy
 * BitTorrent-client dependency for that single call, this port uses
 * `bencode` (added as this module's only new runtime dependency -- a
 * small, focused, actively maintained bencode encoder/decoder used by the
 * WebTorrent project) plus Node's built-in `crypto` for the SHA-1 hashing
 * that IS the well-defined, standardized part of "compute a torrent's info
 * hash" (BEP 3: `sha1(bencode(info_dict))`, hex-encoded) -- a spec-level
 * detail, not a MonoTorrent implementation quirk, so hashing it directly
 * instead of vendoring MonoTorrent's `InfoHash` class preserves the same
 * observable behavior.
 *
 * Bencode is a canonical (self-describing, deterministic) encoding --
 * re-encoding the decoded `info` value byte-for-byte reproduces the exact
 * bytes that were hashed to produce the file's original info-hash (this is
 * the same "decode then re-encode the info dict" approach MonoTorrent and
 * every other torrent library use internally, since a `.torrent` file's
 * `info` dict is never hashed as a raw byte-offset slice of the original
 * file -- doing so would break for any bencode-legal-but-non-canonical
 * whitespace/key-ordering variation).
 */

export interface TorrentInfoReaderLogger {
  trace(message: string, ...args: unknown[]): void;
}

const noopLogger: TorrentInfoReaderLogger = { trace: () => {} };

/**
 * Ported from `TorrentFileInfoReader.GetHashFromTorrentFile(byte[] fileContents)`.
 * Throws on invalid/unparseable torrent bytes, matching the C# source's
 * catch-log-rethrow (the `_logger.Trace` diagnostic is preserved via the
 * injected logger; the original exception propagates unchanged).
 */
export function getHashFromTorrentFile(
  fileContents: Uint8Array,
  logger: TorrentInfoReaderLogger = noopLogger
): string {
  try {
    const decoded = bencode.decode(Buffer.from(fileContents)) as { info?: unknown };

    if (decoded.info === undefined) {
      throw new Error("Invalid torrent file: missing 'info' dictionary.");
    }

    const infoBytes = bencode.encode(decoded.info);
    return createHash("sha1").update(infoBytes).digest("hex");
  } catch (e) {
    logger.trace("Invalid torrent file contents: {0}", Buffer.from(fileContents).toString("ascii"));
    throw e;
  }
}
