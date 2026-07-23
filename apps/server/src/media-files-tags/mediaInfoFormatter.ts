import { Codec, parseCodec } from "../parser/qualityParser.js";
import type { MediaInfoModel } from "../parser/model/mediaInfoModel.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaInfoFormatter.cs.
 *
 * Uses the real ported `MediaInfoModel` (parser/model/mediaInfoModel.ts,
 * Phase 2) and the real ported `Codec`/`parseCodec` (parser/qualityParser.ts,
 * Phase 2) directly -- both already exist in this codebase, so this is a
 * straight, dependency-free 1:1 port with no forward-references needed.
 *
 * `Logger.ForDebugEvent()...WriteSentryWarn(...)` (NLog + a Sentry-forwarding
 * extension method, Phase 4 Instrumentation module) becomes a plain optional
 * logger callback injected by the caller, matching this module's other
 * ported-in-isolation logging seams (see azwLogger.ts / indexerBase.ts's
 * IndexerLogger).
 */

export interface MediaInfoFormatterLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: MediaInfoFormatterLogger = { debug: () => {} };

/** Ported from `MediaInfoFormatter.FormatAudioBitrate(MediaInfoModel)`. */
export function formatAudioBitrate(mediaInfo: MediaInfoModel): string {
  return `${mediaInfo.audioBitrate} kbps`;
}

/** Ported from `MediaInfoFormatter.FormatAudioBitsPerSample(MediaInfoModel)`. */
export function formatAudioBitsPerSample(mediaInfo: MediaInfoModel): string {
  if (mediaInfo.audioBits === 0) {
    return "";
  }

  return `${mediaInfo.audioBits}bit`;
}

/**
 * Ported from `MediaInfoFormatter.FormatAudioSampleRate(MediaInfoModel)`:
 * `{(double)mediaInfo.AudioSampleRate / 1000:0.#}kHz` -- "0.#" formats with
 * at most one decimal place, dropping a trailing ".0".
 */
export function formatAudioSampleRate(mediaInfo: MediaInfoModel): string {
  const kHz = mediaInfo.audioSampleRate / 1000;
  const rounded = Math.round(kHz * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${formatted}kHz`;
}

/** Ported from `MediaInfoFormatter.FormatAudioChannels(MediaInfoModel)`. */
export function formatAudioChannels(mediaInfo: MediaInfoModel): number {
  return mediaInfo.audioChannels;
}

/** Ported from `MediaInfoFormatter.CodecNames` (static readonly Dictionary&lt;Codec, string&gt;). */
export const CODEC_NAMES: ReadonlyMap<Codec, string> = new Map([
  [Codec.MP1, "MP1"],
  [Codec.MP2, "MP2"],
  [Codec.AAC, "AAC"],
  [Codec.AACVBR, "AAC"],
  [Codec.ALAC, "ALAC"],
  [Codec.APE, "APE"],
  [Codec.FLAC, "FLAC"],
  [Codec.MP3CBR, "MP3"],
  [Codec.MP3VBR, "MP3"],
  [Codec.OGG, "OGG"],
  [Codec.OPUS, "OPUS"],
  [Codec.WAV, "PCM"],
  [Codec.WAVPACK, "WavPack"],
  [Codec.WMA, "WMA"],
]);

/** Ported from `MediaInfoFormatter.FormatAudioCodec(MediaInfoModel)`. */
export function formatAudioCodec(
  mediaInfo: MediaInfoModel,
  logger: MediaInfoFormatterLogger = noopLogger
): string {
  const codec = parseCodec(mediaInfo.audioFormat, "");

  const name = CODEC_NAMES.get(codec);
  if (name !== undefined) {
    return name;
  }

  logger.debug("Unknown audio format: '%s'.", mediaInfo.audioFormat ?? "");
  return "Unknown";
}
