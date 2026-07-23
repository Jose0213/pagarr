import type { Author } from "../../books/index.js";
import { newLocalBook, type LocalBook } from "../../parser/model/localBook.js";
import type { LocalEdition } from "../../parser/model/localEdition.js";
import type { ParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import type { FileInfoLike } from "../mediaFileDiskProvider.js";
import { FilterFilesType } from "../filterFilesType.js";
import { ImportDecision, Rejection } from "./importDecision.js";
import type { ImportDecisionMakerConfig } from "./importDecisionMakerConfig.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "./importDecisionEngineSpecification.js";
import { AugmentingFailedException } from "./aggregation/aggregationFailedException.js";
import type { IAugmentingService } from "./aggregation/aggregationService.js";
import type { IIdentificationService } from "./identification/identificationService.js";
import type { IdentificationOverrides } from "./identification/candidateService.js";
import { removeFileExtension, parseBookTitle } from "../../parser/parser.js";

export type { IdentificationOverrides };

/** Ported from NzbDrone.Core/MediaFiles/BookImport/ImportDecisionMaker.cs's `ImportDecisionMakerInfo`. */
export interface ImportDecisionMakerInfo {
  downloadClientItem?: DownloadClientItemLike | null;
  parsedBookInfo?: ParsedBookInfo | null;
}

/**
 * Forward-reference for the exact slice of `IMetadataTagService.ReadTags`
 * `GetLocalTracks` calls (see identificationService.ts's
 * `MetadataTagReaderLike` for the same forward-reference, shared shape --
 * `media-files-tags` sibling worktree, not merged yet).
 */
export interface MetadataTagReaderLike {
  readTags(file: FileInfoLike): import("../../parser/model/parsedTrackInfo.js").ParsedTrackInfo;
}

/** Forward-ref for the slice of `IMediaFileService.FilterUnchangedFiles` this class calls -- the real, ported `MediaFileService` (mediaFileService.ts, same module) satisfies this directly. */
export interface FileFilterLike {
  filterUnchangedFiles(files: FileInfoLike[], filter: FilterFilesType): FileInfoLike[];
}

/** Ported from `IRootFolderService`'s slice `EnsureData` reads -- the real, ported `root-folders/root-folder-service.ts` satisfies this directly. */
export interface RootFolderLookup {
  getBestRootFolder(path: string): { defaultQualityProfileId: number } | undefined;
}

/**
 * Ported from `IQualityProfileService`'s slice `EnsureData` reads -- the
 * real, ported `profiles/qualities/qualityProfileService.ts` satisfies
 * this directly. C#'s `Author.QualityProfile` (a `LazyLoaded<QualityProfile>`
 * resolved-object field) has no equivalent on this port's `Author`
 * (books/models.ts) -- same gap `decision-engine/remoteBook.ts`'s
 * `AuthorWithQualityProfile` documents and augments locally; this module
 * augments the same way (see `AuthorWithQualityProfile` below) rather than
 * widening `books/models.ts` itself (out of this worktree's scope).
 */
export interface QualityProfileLookup {
  get(id: number): { id: number };
}

/**
 * Local augmentation of the real `Author` (books/models.ts) with the
 * resolved `qualityProfile` object -- same pattern and same reasoning as
 * `decision-engine/remoteBook.ts`'s `AuthorWithQualityProfile` (that
 * module's forward-reference predates this one; duplicated here rather
 * than imported since decision-engine's version couples to
 * `profiles/qualities/qualityProfile.ts`'s real `QualityProfile` type,
 * which this module also imports directly -- no forward-reference needed
 * on the Profiles side, only on the Books side).
 */
export interface AuthorWithQualityProfile extends Author {
  qualityProfile?: { id: number };
}

export interface IMakeImportDecision {
  getImportDecisions(
    musicFiles: FileInfoLike[],
    idOverrides: IdentificationOverrides | null,
    itemInfo: ImportDecisionMakerInfo | null,
    config: ImportDecisionMakerConfig
  ): Promise<ImportDecision<LocalBook>[]>;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/ImportDecisionMaker.cs.
 *
 * `GetLocalTracks`/`GetImportDecisions` are `async` because
 * `IdentificationService.identify` (this module's own, already-ported
 * `identificationService.ts`) is Promise-based -- see that file's doc
 * comment for why (its `ICandidateService.GetRemoteCandidates` dependency
 * calls the real, Promise-based metadata-source module).
 *
 * NLog `_logger` calls (ProgressInfo/Debug/Error, stopwatch timing) are
 * omitted -- see parsingService.ts's doc comment for why this codebase
 * omits NLog throughout the port.
 */
export class ImportDecisionMaker implements IMakeImportDecision {
  constructor(
    private readonly trackSpecifications: readonly IImportDecisionEngineSpecification<LocalBook>[],
    private readonly bookSpecifications: readonly IImportDecisionEngineSpecification<LocalEdition>[],
    private readonly fileFilter: FileFilterLike,
    private readonly metadataTagService: MetadataTagReaderLike,
    private readonly augmentingService: IAugmentingService,
    private readonly identificationService: IIdentificationService,
    private readonly rootFolderService: RootFolderLookup,
    private readonly qualityProfileService: QualityProfileLookup
  ) {}

  getLocalTracks(
    musicFiles: FileInfoLike[],
    downloadClientItem: DownloadClientItemLike | null,
    folderInfo: ParsedBookInfo | null,
    filter: FilterFilesType
  ): [LocalBook[], ImportDecision<LocalBook>[]] {
    const files = this.fileFilter.filterUnchangedFiles(musicFiles, filter);

    const localTracks: LocalBook[] = [];
    const decisions: ImportDecision<LocalBook>[] = [];

    if (files.length === 0) {
      return [localTracks, decisions];
    }

    let downloadClientItemInfo: ParsedBookInfo | null = null;

    if (downloadClientItem !== null) {
      downloadClientItemInfo = parseBookTitle(downloadClientItem.title);
    }

    for (const file of files) {
      const fileTrackInfo = this.metadataTagService.readTags(file);

      const localTrack = newLocalBook();
      localTrack.downloadClientBookInfo = downloadClientItemInfo;
      localTrack.folderTrackInfo = folderInfo;
      localTrack.path = file.fullName;
      localTrack.part = fileTrackInfo.trackNumbers.length > 0 ? fileTrackInfo.trackNumbers[0]! : 1;
      localTrack.size = file.length;
      localTrack.modified = file.lastWriteTimeUtc;
      localTrack.fileTrackInfo = fileTrackInfo;
      localTrack.additionalFile = false;

      try {
        // TODO fix otherfiles?
        this.augmentingService.augment(localTrack, true);
        localTracks.push(localTrack);
      } catch (e) {
        if (e instanceof AugmentingFailedException) {
          decisions.push(new ImportDecision(localTrack, new Rejection("Unable to parse file")));
        } else {
          decisions.push(
            new ImportDecision(localTrack, new Rejection("Unexpected error processing file"))
          );
        }
      }
    }

    return [localTracks, decisions];
  }

  async getImportDecisions(
    musicFiles: FileInfoLike[],
    idOverridesIn: IdentificationOverrides | null,
    itemInfoIn: ImportDecisionMakerInfo | null,
    config: ImportDecisionMakerConfig
  ): Promise<ImportDecision<LocalBook>[]> {
    const idOverrides: IdentificationOverrides = idOverridesIn ?? {};
    const itemInfo: ImportDecisionMakerInfo = itemInfoIn ?? {};

    const [localTracks, decisions] = this.getLocalTracks(
      musicFiles,
      itemInfo.downloadClientItem ?? null,
      itemInfo.parsedBookInfo ?? null,
      config.filter
    );

    for (const x of localTracks) {
      x.existingFile = !config.newDownload;
    }

    const releases = await this.identificationService.identify(localTracks, idOverrides, config);

    for (const release of releases) {
      // make sure the appropriate quality profile is set for the release author
      // in case it's a new author
      this.ensureData(release);
      release.newDownload = config.newDownload;

      const releaseDecision = this.getEditionDecision(release, itemInfo.downloadClientItem ?? null);

      for (const localTrack of release.localBooks) {
        if (releaseDecision.approved) {
          const decision = this.getBookDecision(localTrack, itemInfo.downloadClientItem ?? null);
          if (decision !== null) {
            decisions.push(decision);
          }
        } else {
          decisions.push(new ImportDecision(localTrack, ...releaseDecision.rejections));
        }
      }
    }

    return decisions;
  }

  private ensureData(edition: LocalEdition): void {
    const author: AuthorWithQualityProfile | undefined = edition.edition?.book?.author;
    if (edition.edition !== null && author !== undefined && author.qualityProfileId === 0) {
      const rootFolder = this.rootFolderService.getBestRootFolder(edition.localBooks[0]!.path);
      if (rootFolder === undefined) {
        return;
      }
      const qualityProfile = this.qualityProfileService.get(rootFolder.defaultQualityProfileId);

      author.qualityProfileId = qualityProfile.id;
      author.qualityProfile = qualityProfile;
    }
  }

  private getEditionDecision(
    localEdition: LocalEdition,
    downloadClientItem: DownloadClientItemLike | null
  ): ImportDecision<LocalEdition> {
    let decision: ImportDecision<LocalEdition>;

    if (localEdition.edition === null) {
      decision = new ImportDecision(
        localEdition,
        new Rejection(`Couldn't find similar book for ${editionLocalString(localEdition)}`)
      );
    } else {
      const reasons = this.bookSpecifications
        .map((c) => evaluateSpec(c, localEdition, downloadClientItem))
        .filter((r): r is Rejection => r !== null);

      decision = new ImportDecision(localEdition, ...reasons);
    }

    return decision;
  }

  private getBookDecision(
    localBook: LocalBook,
    downloadClientItem: DownloadClientItemLike | null
  ): ImportDecision<LocalBook> | null {
    let decision: ImportDecision<LocalBook>;

    if (localBook.book === null) {
      decision = new ImportDecision(
        localBook,
        new Rejection(
          `Couldn't parse book from: ${localBook.fileTrackInfo?.title ?? localBook.path}`
        )
      );
    } else {
      const reasons = this.trackSpecifications
        .map((c) => evaluateSpec(c, localBook, downloadClientItem))
        .filter((r): r is Rejection => r !== null);

      decision = new ImportDecision(localBook, ...reasons);
    }

    return decision;
  }
}

function evaluateSpec<T>(
  spec: IImportDecisionEngineSpecification<T>,
  item: T,
  downloadClientItem: DownloadClientItemLike | null
): Rejection | null {
  try {
    const result = spec.isSatisfiedBy(item, downloadClientItem);

    if (!result.accepted) {
      return new Rejection(result.reason ?? "");
    }
  } catch (e) {
    return new Rejection(`${spec.constructor.name}: ${e instanceof Error ? e.message : String(e)}`);
  }

  return null;
}

function editionLocalString(localEdition: LocalEdition): string {
  const dirNames = localEdition.localBooks.map((x) => dirname(x.path));
  return `[${[...new Set(dirNames)].join(", ")}]`;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.substring(0, idx);
}

// Re-exported so callers that only need removeFileExtension via this file
// (matching Parser.Parser's static-class-namespace feel) don't need a
// second import -- harmless convenience re-export, not load-bearing.
export { removeFileExtension };
