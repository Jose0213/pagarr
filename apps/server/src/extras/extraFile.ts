import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Extras/Files/ExtraFile.cs.
 *
 * C# declares `ExtraFile` as an abstract class that `MetadataFile` and
 * `OtherExtraFile` extend, adding their own fields (`Hash`/`Consumer`/`Type`
 * for MetadataFile; nothing extra for OtherExtraFile). TypeScript interfaces
 * carry no behavior, so this is ported as a plain base interface the two
 * concrete row shapes (metadata/metadataFile.ts, others/otherExtraFile.ts)
 * extend -- same "Entity<T>/ModelBase as interface, not class" convention
 * established by books/models.ts and db/model-base.ts.
 */
export interface ExtraFile extends ModelBase {
  authorId: number;
  bookFileId: number | null;
  bookId: number | null;
  relativePath: string;
  /** ISO-8601 timestamp string (C# `DateTime Added`). */
  added: string;
  /** ISO-8601 timestamp string (C# `DateTime LastUpdated`). */
  lastUpdated: string;
  extension: string;
}

/** Ported from ExtraFile.ToString() => $"[{Id}] {RelativePath}". */
export function extraFileToString(file: ExtraFile): string {
  return `[${file.id}] ${file.relativePath}`;
}
