import type { MediaInfoModel } from "../../../parser/model/mediaInfoModel.js";
import {
  formatAudioBitrate,
  formatAudioBitsPerSample,
  formatAudioChannels,
  formatAudioCodec,
  formatAudioSampleRate,
} from "../../../media-files-tags/mediaInfoFormatter.js";
import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/BookFiles/MediaInfoResource.cs.
 *
 * C# `MediaInfoResource : RestResource` -- inherits `Id`/`ResourceName` from
 * the REST base for no real reason here (this port has never observed a
 * caller constructing a bare `MediaInfoResource` and reading its `.id`; it's
 * always embedded as `BookFileResource.mediaInfo`). Kept as a `RestResource`
 * anyway purely for shape fidelity with the real C# class hierarchy -- costs
 * nothing since `stripDefaultId()` only ever runs on the top-level resource
 * `restController()` serializes, not on nested fields like this one.
 */
export interface MediaInfoResource extends RestResource {
  audioChannels: number;
  audioBitRate: string;
  audioCodec: string;
  audioBits: string;
  audioSampleRate: string;
}

/** Ported from MediaInfoResourceMapper.ToResource(this MediaInfoModel model). */
export function mediaInfoToResource(
  model: MediaInfoModel | null | undefined
): MediaInfoResource | null {
  if (model === null || model === undefined) {
    return null;
  }

  return {
    id: 0,
    audioChannels: formatAudioChannels(model),
    audioCodec: formatAudioCodec(model),
    audioBitRate: formatAudioBitrate(model),
    audioBits: formatAudioBitsPerSample(model),
    audioSampleRate: formatAudioSampleRate(model),
  };
}
