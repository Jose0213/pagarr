/**
 * New file, no direct 1:1 C# source -- a minimal `multipart/form-data`
 * single-file-field parser for BackupResource.ts's `POST
 * system/backup/restore/upload` route.
 *
 * ASP.NET's `Request.Form.Files` (bound by MVC's built-in model binder) has
 * no Express equivalent without a multipart-parsing dependency; this repo's
 * `@pagarr/server` package.json has none installed (`formidable` appears
 * ONLY as a transitive dependency of an unrelated package in the workspace
 * lockfile, not resolvable from `@pagarr/server`'s own `node_modules` --
 * verified directly, not assumed) and per this task's brief ("Port
 * FAITHFULLY... Write vitest tests" -- no license to add a new runtime
 * dependency for one endpoint when the multipart wire format itself is
 * simple and fully specified), this implements the minimal subset the real
 * route actually needs: extract the first file part's filename + raw bytes
 * from a `multipart/form-data` body already buffered into memory by
 * `express.raw()` (see SystemController mounting notes in
 * BackupResource.ts -- this route does NOT use the app-wide `express.json()`
 * body parser, since that only handles JSON).
 *
 * Deliberately narrow: handles exactly one file part (the real route reads
 * `Request.Form.Files.First()`), does not attempt to parse non-file form
 * fields, and does not stream (buffers the whole body, matching this port's
 * `IDiskProvider.SaveStream`-into-a-temp-file real call site's own
 * "buffer, don't stream" style -- see backup/backupDiskProvider.ts).
 */

export interface ParsedMultipartFile {
  fileName: string;
  data: Buffer;
}

/** Extracts the `boundary=` parameter from a `Content-Type: multipart/form-data; boundary=...` header value. Returns null if not multipart or no boundary present. */
export function parseMultipartBoundary(contentType: string | undefined): string | null {
  if (!contentType) {
    return null;
  }

  const match = /multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) {
    return null;
  }

  return (match[1] ?? match[2] ?? "").trim();
}

/**
 * Parses a buffered `multipart/form-data` body and returns the first part
 * carrying a `filename` in its `Content-Disposition` header, or `null` if
 * no such part exists (matches the real route's `files.Empty()` check --
 * see BackupResource.ts's `uploadAndRestoreHandler`).
 */
export function parseFirstMultipartFile(
  body: Buffer,
  boundary: string
): ParsedMultipartFile | null {
  const delimiter = Buffer.from(`--${boundary}`, "utf8");
  const parts = splitBuffer(body, delimiter);

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      continue;
    }

    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    if (!filenameMatch || !filenameMatch[1]) {
      continue;
    }

    // Body runs from just after the header blank line to the trailing
    // "\r\n" that precedes the next boundary delimiter (splitBuffer already
    // stripped the delimiter itself).
    const dataStart = headerEnd + 4;
    let dataEnd = part.length;
    if (part.subarray(dataEnd - 2, dataEnd).toString("latin1") === "\r\n") {
      dataEnd -= 2;
    }

    return {
      fileName: filenameMatch[1],
      data: part.subarray(dataStart, dataEnd),
    };
  }

  return null;
}

/** Splits a buffer on every occurrence of `delimiter`, discarding empty leading/trailing segments (mirrors how a multipart body's parts sit between `--boundary` markers). */
function splitBuffer(body: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;

  while (start <= body.length) {
    const index = body.indexOf(delimiter, start);
    if (index === -1) {
      break;
    }

    if (index > start) {
      parts.push(body.subarray(start, index));
    }

    start = index + delimiter.length;
  }

  return parts;
}
