/**
 * Ported from NzbDrone.Core/Parser/Model/MediaInfoModel.cs.
 *
 * C#'s `IEmbeddedDocument` marker just means this round-trips as embedded
 * JSON on a parent row (see Datastore's EmbeddedDocumentConverter, Phase 0) --
 * no behavior of its own. Plain data shape here.
 */
export interface MediaInfoModel {
  audioFormat: string | null;
  audioBitrate: number;
  audioChannels: number;
  audioBits: number;
  audioSampleRate: number;
}
