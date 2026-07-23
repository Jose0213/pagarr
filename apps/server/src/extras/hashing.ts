import { createHash } from "node:crypto";

/**
 * Ported from NzbDrone.Core/Hashing.cs's `SHA256Hash(this string input)`
 * extension: UTF-8 encodes the input, SHA-256 hashes it, and renders the
 * digest as lowercase hex (`b.ToString("x2")` per byte) -- exactly what
 * Node's `createHash("sha256").update(input, "utf8").digest("hex")`
 * produces, since Node's `hex` digest encoding is already lowercase
 * two-per-byte. Used by `MetadataService` to compute `MetadataFile.Hash`
 * from freshly-generated metadata file contents, to detect when a
 * consumer's rendered contents have actually changed before rewriting the
 * file to disk.
 */
export function sha256Hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
