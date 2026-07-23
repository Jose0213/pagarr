import { describe, expect, it } from "vitest";
import {
  CODEC_NAMES,
  formatAudioBitrate,
  formatAudioBitsPerSample,
  formatAudioChannels,
  formatAudioCodec,
  formatAudioSampleRate,
} from "../mediaInfoFormatter.js";
import { Codec } from "../../parser/qualityParser.js";
import type { MediaInfoModel } from "../../parser/model/mediaInfoModel.js";

/**
 * No C# unit test fixture exists for MediaInfoFormatter.cs (checked
 * `src/NzbDrone.Core.Test/` -- none), so these are new tests against the
 * ported formatting functions.
 */

function mediaInfo(overrides: Partial<MediaInfoModel> = {}): MediaInfoModel {
  return {
    audioFormat: null,
    audioBitrate: 0,
    audioChannels: 0,
    audioBits: 0,
    audioSampleRate: 0,
    ...overrides,
  };
}

describe("MediaInfoFormatter", () => {
  it("formatAudioBitrate appends ' kbps'", () => {
    expect(formatAudioBitrate(mediaInfo({ audioBitrate: 320 }))).toBe("320 kbps");
  });

  it("formatAudioBitsPerSample returns empty string for 0 bits", () => {
    expect(formatAudioBitsPerSample(mediaInfo({ audioBits: 0 }))).toBe("");
  });

  it("formatAudioBitsPerSample appends 'bit' for nonzero bits", () => {
    expect(formatAudioBitsPerSample(mediaInfo({ audioBits: 16 }))).toBe("16bit");
  });

  it("formatAudioSampleRate divides by 1000 and appends 'kHz', dropping trailing .0", () => {
    expect(formatAudioSampleRate(mediaInfo({ audioSampleRate: 44100 }))).toBe("44.1kHz");
    expect(formatAudioSampleRate(mediaInfo({ audioSampleRate: 48000 }))).toBe("48kHz");
  });

  it("formatAudioChannels returns the raw channel count", () => {
    expect(formatAudioChannels(mediaInfo({ audioChannels: 2 }))).toBe(2);
  });

  it("formatAudioCodec maps known codecs to their display names", () => {
    expect(formatAudioCodec(mediaInfo({ audioFormat: "FLAC" }))).toBe("FLAC");
    expect(formatAudioCodec(mediaInfo({ audioFormat: "MP3" }))).toBe("MP3");
    expect(formatAudioCodec(mediaInfo({ audioFormat: "WAV" }))).toBe("PCM");
  });

  it("formatAudioCodec falls back to 'Unknown' and logs for an unrecognized format", () => {
    const debugCalls: unknown[] = [];
    const result = formatAudioCodec(mediaInfo({ audioFormat: "some-made-up-format" }), {
      debug: (...args) => debugCalls.push(args),
    });

    expect(result).toBe("Unknown");
    expect(debugCalls.length).toBe(1);
  });

  it("CODEC_NAMES covers every entry from the C# source's CodecNames dictionary", () => {
    expect(CODEC_NAMES.get(Codec.MP1)).toBe("MP1");
    expect(CODEC_NAMES.get(Codec.MP2)).toBe("MP2");
    expect(CODEC_NAMES.get(Codec.AAC)).toBe("AAC");
    expect(CODEC_NAMES.get(Codec.AACVBR)).toBe("AAC");
    expect(CODEC_NAMES.get(Codec.ALAC)).toBe("ALAC");
    expect(CODEC_NAMES.get(Codec.APE)).toBe("APE");
    expect(CODEC_NAMES.get(Codec.FLAC)).toBe("FLAC");
    expect(CODEC_NAMES.get(Codec.MP3CBR)).toBe("MP3");
    expect(CODEC_NAMES.get(Codec.MP3VBR)).toBe("MP3");
    expect(CODEC_NAMES.get(Codec.OGG)).toBe("OGG");
    expect(CODEC_NAMES.get(Codec.OPUS)).toBe("OPUS");
    expect(CODEC_NAMES.get(Codec.WAV)).toBe("PCM");
    expect(CODEC_NAMES.get(Codec.WAVPACK)).toBe("WavPack");
    expect(CODEC_NAMES.get(Codec.WMA)).toBe("WMA");
  });
});
