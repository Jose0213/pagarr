import type { EpubSchema } from "../entities/epubSchema.js";

/**
 * Ported from VersOne.Epub/EpubBookRef.cs.
 *
 * C# `EpubBookRef : IDisposable` holds a live `ZipArchive` handle
 * (`EpubArchive`) plus a finalizer as a safety-net for the handle if
 * `Dispose()` is never called. Readarr's only consumer (EbookTagService.cs's
 * `ReadEpub`) opens the book in a `using` block purely to read
 * `Schema.Package.Metadata`/`Title`/`AuthorList` and never touches the
 * zip handle itself once `EpubReader.OpenBook` returns -- see
 * epubReader.ts's header comment for why this port reads the whole zip
 * eagerly instead of keeping a lazy/streaming handle open. Node has no
 * finalizer/GC-hook equivalent to `~EpubBookRef()` and no `IDisposable`
 * convention this codebase uses elsewhere for file handles (compare
 * EpubBookRef.cs's `ZipArchive` to `adm-zip`'s synchronous, already-fully-
 * read-into-memory API used in epubReader.ts, which never keeps a live
 * handle open on this object in the first place) -- so `dispose()` is a
 * no-op method kept only so call sites that faithfully mirror the C#
 * `using (var bookRef = ...) { }` shape still compile/read the same way.
 */
export class EpubBookRef {
  filePath: string | null = null;
  title = "";
  author = "";
  authorList: string[] = [];
  schema: EpubSchema | null = null;

  /** No-op: see class doc comment for why there's no live handle to release. */
  dispose(): void {
    // Intentional no-op.
  }
}
