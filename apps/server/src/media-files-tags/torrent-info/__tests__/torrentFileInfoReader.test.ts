import { createHash } from "node:crypto";
import bencode from "bencode";
import { describe, expect, it } from "vitest";
import { getHashFromTorrentFile } from "../torrentFileInfoReader.js";

/**
 * No C# unit test fixture exists for TorrentFileInfoReader.cs (checked
 * `src/NzbDrone.Core.Test/` -- none), so these are new tests against
 * synthetic bencoded `.torrent` bytes built with this module's own `bencode`
 * dependency, verifying the info-hash algorithm (BEP 3: `sha1(bencode(info))`,
 * hex-encoded) this port implements as a faithful, spec-level substitute for
 * MonoTorrent's `Torrent.Load(bytes).InfoHash.ToHex()`.
 */

function buildTorrent(info: Record<string, unknown>, extra: Record<string, unknown> = {}): Buffer {
  return Buffer.from(
    bencode.encode({ announce: Buffer.from("http://tracker.example.com/announce"), info, ...extra })
  );
}

describe("getHashFromTorrentFile", () => {
  it("computes the SHA-1 hash of the bencoded info dictionary", () => {
    const info = {
      name: Buffer.from("test.txt"),
      length: 12345,
      "piece length": 16384,
      pieces: Buffer.alloc(20, 1),
    };

    const torrentBytes = buildTorrent(info);
    const expectedHash = createHash("sha1")
      .update(Buffer.from(bencode.encode(info)))
      .digest("hex");

    expect(getHashFromTorrentFile(torrentBytes)).toBe(expectedHash);
  });

  it("produces the same hash regardless of unrelated top-level fields", () => {
    const info = {
      name: Buffer.from("movie.mkv"),
      length: 999,
      "piece length": 32768,
      pieces: Buffer.alloc(40, 2),
    };

    const a = buildTorrent(info, { comment: Buffer.from("first") });
    const b = buildTorrent(info, {
      comment: Buffer.from("a totally different comment"),
      "created by": Buffer.from("x"),
    });

    expect(getHashFromTorrentFile(a)).toBe(getHashFromTorrentFile(b));
  });

  it("produces a different hash when the info dictionary changes", () => {
    const infoA = {
      name: Buffer.from("a.txt"),
      length: 1,
      "piece length": 16384,
      pieces: Buffer.alloc(20),
    };
    const infoB = {
      name: Buffer.from("b.txt"),
      length: 1,
      "piece length": 16384,
      pieces: Buffer.alloc(20),
    };

    expect(getHashFromTorrentFile(buildTorrent(infoA))).not.toBe(
      getHashFromTorrentFile(buildTorrent(infoB))
    );
  });

  it("returns a 40-character lowercase hex string", () => {
    const info = {
      name: Buffer.from("x"),
      length: 1,
      "piece length": 16384,
      pieces: Buffer.alloc(20),
    };
    const hash = getHashFromTorrentFile(buildTorrent(info));

    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws (and traces) on invalid torrent file contents", () => {
    const traced: unknown[] = [];
    const badBytes = Buffer.from("not a valid bencoded torrent file", "ascii");

    expect(() =>
      getHashFromTorrentFile(badBytes, { trace: (...args) => traced.push(args) })
    ).toThrow();
    expect(traced.length).toBe(1);
  });

  it("throws when the bencoded file has no 'info' dictionary", () => {
    const bytes = Buffer.from(bencode.encode({ announce: Buffer.from("x") }));
    expect(() => getHashFromTorrentFile(bytes)).toThrow(/info/);
  });
});
