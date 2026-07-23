/**
 * Builds a minimal, synthetic-but-structurally-valid MOBI/AZW3 file buffer
 * in memory, matching exactly the byte layout AzwFile.cs/MobiHeader.cs/
 * ExtMeta.cs read (see those files' offsets). No real-world MOBI/AZW3
 * sample file exists anywhere in the Readarr source tree (checked:
 * `src/NzbDrone.Core.Test/` has no `.mobi`/`.azw3` fixtures, and
 * `AzwTag`/`MobiHeader`/`ExtMeta` have no C# unit test fixture at all --
 * only `EbookTagServiceFixture.cs`'s single `GetIsbn` test exists for this
 * module). Building the header programmatically (rather than trying to
 * synthesize a byte-identical binary blob some other way) makes the exact
 * fields under test self-documenting and keeps the fixture in sync with
 * this port's own field-offset understanding.
 */

function u32be(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function u16be(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n, 0);
  return b;
}

export interface ExthRecord {
  id: number;
  value: Buffer;
}

export interface BuildAzwOptions {
  title?: string;
  version?: number;
  mobiType?: number;
  codepage?: number;
  exthRecords?: ExthRecord[];
  /** When true, omits the EXTH header entirely (exercises the "No EXTH header" error path). */
  omitExth?: boolean;
  /** When true, corrupts the top-level BOOKMOBI ident (exercises AzwFile's "Invalid mobi header" error path). */
  badIdent?: boolean;
  /** When true, corrupts the inner MOBI magic (exercises MobiHeader's "Invalid mobi header" error path). */
  badMobiMagic?: boolean;
}

/** Encodes a single EXTH record: 4-byte id, 4-byte size (header-inclusive), then the raw value bytes. */
function encodeExthRecord(record: ExthRecord): Buffer {
  const size = 8 + record.value.length;
  return Buffer.concat([u32be(record.id), u32be(size), record.value]);
}

/**
 * Builds a full MOBI/AZW3 file buffer with a single "record 0" containing a
 * PalmDOC header + MOBI header + (optionally) an EXTH metadata block.
 */
export function buildAzwFile(options: BuildAzwOptions = {}): Buffer {
  const title = options.title ?? "Test Book Title";
  const version = options.version ?? 8;
  const mobiType = options.mobiType ?? 2;
  const codepage = options.codepage ?? 65001; // UTF-8
  const exthRecords = options.exthRecords ?? [];

  // Title bytes are encoded per the file's own codepage, matching
  // MobiHeader.cs's `encoding.GetString(...)` decode (this port's
  // mobiHeader.ts maps 1252 -> "windows-1252" -- Node's Buffer has no
  // built-in windows-1252 *encoder*, but "latin1" and windows-1252 agree
  // on the Latin-1-range codepoints this fixture's test titles use).
  const titleBytes = Buffer.from(title, codepage === 65001 ? "utf8" : "latin1");

  // MOBI header: fixed-length portion runs to offset 0xC0 (192) in real
  // files; this fixture only needs the fields MobiHeader.cs actually reads
  // (offsets 16/20/24/28/36/0x54/0x58/0x80), so the fixed header is padded
  // out to a round `headerLength` bytes. MobiHeader.cs reads the EXTH block
  // at the *fixed* absolute offset `length + 16` (where `length` is the
  // header-length field read from offset 20 -- i.e. immediately after the
  // fixed header, with no gap), so the EXTH block must sit right after
  // `mobiHeader` with nothing in between; Title is read via its own
  // absolute offset/length pair (0x54/0x58) so it's free to live anywhere
  // else in record0 -- placed after the EXTH block here.
  const headerLength = 232; // arbitrary; must be < titleOffset and referenced consistently below.
  const mobiHeader = Buffer.alloc(headerLength);

  mobiHeader.write(options.badMobiMagic ? "XXXX" : "MOBI", 16, "ascii");
  u32be(headerLength).copy(mobiHeader, 20); // "length" field PackageReader/MobiHeader call `length`.
  u32be(mobiType).copy(mobiHeader, 24);
  u32be(codepage).copy(mobiHeader, 28);
  u32be(version).copy(mobiHeader, 36);
  u32be(options.omitExth ? 0 : 0x40).copy(mobiHeader, 0x80); // EXTH flag bit.

  let exthBlock = Buffer.alloc(0);
  if (!options.omitExth) {
    const recordBufs = exthRecords.map(encodeExthRecord);
    const recordsLength = recordBufs.reduce((sum, b) => sum + b.length, 0);
    const exthHeaderLength = 12 + recordsLength; // 4-byte "EXTH" ident + 4-byte length + 4-byte count + records.
    exthBlock = Buffer.concat([
      Buffer.from("EXTH", "ascii"),
      u32be(exthHeaderLength),
      u32be(exthRecords.length),
      ...recordBufs,
    ]);
  }

  // MobiHeader.cs: `Util.SubArray(header, length + 16, GetUInt32(header, length + 20))`
  // i.e. EXTH lives at absolute offset `length + 16` within `header` (the
  // record-0 buffer), and its *size* is read from the 4 bytes at
  // `length + 20`. `length` (headerLength) is the fixed header's own
  // length, so both offsets land inside a 16-byte "gap" block placed
  // immediately after `mobiHeader`: the size field is 4 bytes into that
  // gap (offset (headerLength+20) - (headerLength+16) = 4), and the EXTH
  // block itself starts right after the 16-byte gap.
  const exthGap = Buffer.alloc(16);
  u32be(exthBlock.length).copy(exthGap, 4);

  const titleOffset = headerLength + exthGap.length + exthBlock.length;
  u32be(titleOffset).copy(mobiHeader, 0x54);
  u32be(titleBytes.length).copy(mobiHeader, 0x58);

  const record0 = Buffer.concat([mobiHeader, exthGap, exthBlock, titleBytes]);

  // Top-level PDB-style header: ident at 0x3c, section count at 76,
  // section[0] start/end addr at 78/86 (AzwFile.cs).
  const pdbHeaderLength = 78 + 8; // through section[0]'s end_addr field.
  const recordStart = 512; // arbitrary offset comfortably past the PDB header.
  const top = Buffer.alloc(recordStart);
  top.write(options.badIdent ? "XXXXXXXX" : "BOOKMOBI", 0x3c, "ascii");
  u16be(1).copy(top, 76);
  u32be(recordStart).copy(top, 78);
  u32be(recordStart + record0.length).copy(top, 86);

  return Buffer.concat([top, record0]);
}

/** Builds a single EXTH string record (encoded per `encoding`, matching ExtMeta's per-record decode). */
export function exthString(
  id: number,
  value: string,
  encoding: BufferEncoding = "utf8"
): ExthRecord {
  return { id, value: Buffer.from(value, encoding) };
}
