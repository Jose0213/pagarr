import { AzwFile } from "./azwFile.js";
import { MobiHeader } from "./mobiHeader.js";
import { noopAzwLogger, type AzwLogger } from "./azwLogger.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AzwTag/Azw3File.cs.
 *
 * C# properties that are computed getters delegating to
 * `MobiHeader.ExtMeta` (`Authors`, `Author`, `Isbn`, `Asin`, ...) are ported
 * as TS getters on the class, matching the C# `=>` expression-bodied
 * property shape 1:1 -- no separate free-function port needed here (unlike
 * this module's `IEmbeddedDocument`-style value objects) since `Azw3File`
 * is a real class with real per-instance state (`MobiHeader`) in both
 * languages.
 */
export class Azw3File extends AzwFile {
  private readonly mobiHeader: MobiHeader;

  constructor(path: string, logger: AzwLogger = noopAzwLogger) {
    super(path);
    this.mobiHeader = new MobiHeader(this.getSectionData(0), logger);
  }

  get title(): string {
    return this.mobiHeader.title;
  }

  get authors(): string[] {
    return this.mobiHeader.extMeta.stringList(100);
  }

  get author(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(100);
  }

  get isbn(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(104);
  }

  get asin(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(113);
  }

  get publishDate(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(106);
  }

  get publisher(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(101);
  }

  get imprint(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(102);
  }

  get description(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(103);
  }

  get source(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(112);
  }

  get language(): string | null {
    return this.mobiHeader.extMeta.stringOrNull(524);
  }

  get version(): number {
    return this.mobiHeader.version;
  }

  get mobiType(): number {
    return this.mobiHeader.mobiType;
  }
}
