import { Codec, parseCodec } from "../../parser/qualityParser.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/MediaInfoFormatter.cs.
 *
 * `QualityParser.ParseCodec` (real, merged Phase 2 Parser module -- imported
 * directly, not forward-referenced) is used as-is. No NLog `Logger`: the one
 * log call in `FormatAudioCodec`'s "unknown format" branch is omitted, same
 * as elsewhere in this port (Instrumentation isn't ported yet).
 */

/** Minimal shape this formatter reads off a BookFile's MediaInfo (mirrors NzbDrone.Core/Parser/Model/MediaInfoModel.cs). */
export interface MediaInfoModelLike {
  audioFormat: string | null;
  audioBitrate: number;
  audioChannels: number;
  audioBits: number;
  audioSampleRate: number;
}

export function formatAudioBitrate(mediaInfo: MediaInfoModelLike): string {
  return `${mediaInfo.audioBitrate} kbps`;
}

export function formatAudioBitsPerSample(mediaInfo: MediaInfoModelLike): string {
  if (mediaInfo.audioBits === 0) {
    return "";
  }

  return `${mediaInfo.audioBits}bit`;
}

/** Ported from `FormatAudioSampleRate`: `{(double)mediaInfo.AudioSampleRate / 1000:0.#}kHz` -- up to one decimal place, trailing zero trimmed. */
export function formatAudioSampleRate(mediaInfo: MediaInfoModelLike): string {
  const value = mediaInfo.audioSampleRate / 1000;
  const rounded = Math.round(value * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${formatted}kHz`;
}

export function formatAudioChannels(mediaInfo: MediaInfoModelLike): number {
  return mediaInfo.audioChannels;
}

/** Ported from `MediaInfoFormatter.CodecNames`. */
const CODEC_NAMES: ReadonlyMap<Codec, string> = new Map([
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

export function formatAudioCodec(mediaInfo: MediaInfoModelLike): string {
  const codec = parseCodec(mediaInfo.audioFormat, "");

  return CODEC_NAMES.get(codec) ?? "Unknown";
}
