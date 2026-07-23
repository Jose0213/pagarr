import { describe, expect, it } from "vitest";
import { InvalidMagnetLinkError, parseMagnetLinkInfoHash } from "../magnetLink.js";

describe("parseMagnetLinkInfoHash", () => {
  it("extracts a 40-char hex info hash verbatim (upper-cased)", () => {
    const hash = parseMagnetLinkInfoHash(
      "magnet:?xt=urn:btih:cbc2f069fe8bb2f544eae707d75bcd3de9dcf951&tr=udp://tracker"
    );
    expect(hash).toBe("CBC2F069FE8BB2F544EAE707D75BCD3DE9DCF951");
  });

  it("decodes a base32 info hash to hex", () => {
    const hash = parseMagnetLinkInfoHash(
      "magnet:?xt=urn:btih:ZPBPA2P6ROZPKRHK44D5OW6NHXU5Z6KR&tr=udp"
    );
    expect(hash).toMatch(/^[0-9A-F]{40}$/);
  });

  it("throws InvalidMagnetLinkError for a non-magnet URI", () => {
    expect(() => parseMagnetLinkInfoHash("http://example.com/foo")).toThrow(InvalidMagnetLinkError);
  });

  it("throws InvalidMagnetLinkError when no xt=urn:btih param is present", () => {
    expect(() => parseMagnetLinkInfoHash("magnet:?dn=foo")).toThrow(InvalidMagnetLinkError);
  });

  it("throws InvalidMagnetLinkError for malformed URIs", () => {
    expect(() => parseMagnetLinkInfoHash("not a uri at all")).toThrow(InvalidMagnetLinkError);
  });
});
