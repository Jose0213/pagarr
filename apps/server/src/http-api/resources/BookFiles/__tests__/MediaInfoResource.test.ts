import { describe, expect, it } from "vitest";
import { mediaInfoToResource } from "../MediaInfoResource.js";

describe("mediaInfoToResource", () => {
  it("returns null for a null/undefined model", () => {
    expect(mediaInfoToResource(null)).toBeNull();
    expect(mediaInfoToResource(undefined)).toBeNull();
  });

  it("formats every audio field", () => {
    const resource = mediaInfoToResource({
      audioFormat: "MP3",
      audioBitrate: 320,
      audioChannels: 2,
      audioBits: 16,
      audioSampleRate: 44100,
    });

    expect(resource).not.toBeNull();
    expect(resource!.audioBitRate).toBe("320 kbps");
    expect(resource!.audioChannels).toBe(2);
    expect(resource!.audioBits).toBe("16bit");
    expect(resource!.audioSampleRate).toBe("44.1kHz");
    expect(resource!.id).toBe(0);
  });
});
