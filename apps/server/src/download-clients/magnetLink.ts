/**
 * Forward-ref/narrow-port of the slice of MonoTorrent's `MagnetLink.Parse`
 * that `TorrentClientBase.DownloadFromMagnetUrl` actually needs: extracting
 * the BitTorrent info hash (`xt=urn:btih:<hash>`) from a `magnet:` URI, as a
 * 40-char uppercase hex string (matching `InfoHash.ToHex()`'s output, which
 * `TorrentClientBase` then further processes with its own `.ToUpper()`
 * calls throughout).
 *
 * MonoTorrent is a full BitTorrent protocol library (peer wire protocol,
 * piece selection, DHT, etc.) -- porting it is entirely out of scope. This
 * module only ever needs magnet-link info-hash extraction, so that's all
 * that's ported here. A base32-encoded btih (`xt=urn:btih:<32-char-base32>`,
 * the other magnet-link hash encoding BEP 9 allows) is decoded to hex too,
 * matching MonoTorrent's InfoHash type accepting both encodings.
 */
export class InvalidMagnetLinkError extends Error {
  constructor(magnetUrl: string) {
    super(`Invalid magnet link: ${magnetUrl}`);
    this.name = "InvalidMagnetLinkError";
    Object.setPrototypeOf(this, InvalidMagnetLinkError.prototype);
  }
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ToHex(base32: string): string {
  let bits = "";
  for (const char of base32.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += index.toString(2).padStart(5, "0");
  }

  let hex = "";
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }

  return hex;
}

/**
 * Ported from `MagnetLink.Parse(magnetUrl).InfoHash.ToHex()`. Throws
 * `InvalidMagnetLinkError` for a malformed magnet URI, matching the C#
 * `FormatException` `TorrentClientBase.DownloadFromMagnetUrl` catches.
 */
export function parseMagnetLinkInfoHash(magnetUrl: string): string {
  let url: URL;
  try {
    url = new URL(magnetUrl);
  } catch {
    throw new InvalidMagnetLinkError(magnetUrl);
  }

  if (url.protocol !== "magnet:") {
    throw new InvalidMagnetLinkError(magnetUrl);
  }

  const xtValues = url.searchParams.getAll("xt");
  for (const xt of xtValues) {
    const match = /^urn:btih:([A-Za-z0-9]+)$/.exec(xt);
    if (!match) {
      continue;
    }

    const value = match[1]!;

    if (/^[0-9A-Fa-f]{40}$/.test(value)) {
      return value.toUpperCase();
    }

    if (/^[A-Za-z2-7]{32}$/.test(value)) {
      return base32ToHex(value).toUpperCase();
    }
  }

  throw new InvalidMagnetLinkError(magnetUrl);
}
