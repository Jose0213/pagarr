import { describe, expect, it } from "vitest";
import {
  isValidHost,
  hasHttpProtocol,
  isValidRootUrl,
  isValidUrlBaseField,
  isValidPort,
  containsReadarr,
  isValidUrl,
  isValidIpAddress,
  isValidGuid,
} from "../ruleHelpers.js";

/**
 * Translated from the real C# RuleBuilderExtensions/UrlValidator/
 * IpValidation/GuidValidator usage sites and their known behavior
 * (RuleBuilderExtensions.cs itself has no dedicated fixture in
 * NzbDrone.Core.Test/ValidationTests -- its rules are exercised indirectly
 * through indexer/download-client settings validators across the C# test
 * suite; GuidValidationFixture is the one direct fixture, translated
 * faithfully below).
 */

describe("isValidHost", () => {
  it("rejects null/undefined/empty/whitespace", () => {
    expect(isValidHost(null)).toBe(false);
    expect(isValidHost(undefined)).toBe(false);
    expect(isValidHost("")).toBe(false);
    expect(isValidHost("   ")).toBe(false);
  });

  it("accepts a bare hostname", () => {
    expect(isValidHost("localhost")).toBe(true);
    expect(isValidHost("my-server.example.com")).toBe(true);
    expect(isValidHost("under_score")).toBe(true);
  });

  it("rejects a host containing a scheme or path", () => {
    expect(isValidHost("http://localhost")).toBe(false);
    expect(isValidHost("localhost/path")).toBe(false);
  });

  it("accepts a valid IP address even though it wouldn't match the host regex shape oddly", () => {
    expect(isValidHost("192.168.1.1")).toBe(true);
    expect(isValidHost("::1")).toBe(true);
  });
});

describe("hasHttpProtocol", () => {
  it("accepts http:// and https:// (case-insensitive) at the start", () => {
    expect(hasHttpProtocol("http://x")).toBe(true);
    expect(hasHttpProtocol("HTTPS://x")).toBe(true);
  });

  it("rejects missing or non-leading protocol", () => {
    expect(hasHttpProtocol("ftp://x")).toBe(false);
    expect(hasHttpProtocol("x http://y")).toBe(false);
    expect(hasHttpProtocol(null)).toBe(false);
  });
});

describe("isValidRootUrl", () => {
  it("rejects empty/null", () => {
    expect(isValidRootUrl(null)).toBe(false);
    expect(isValidRootUrl("")).toBe(false);
    expect(isValidRootUrl("   ")).toBe(false);
  });

  it("accepts a well-formed absolute http(s) URL", () => {
    expect(isValidRootUrl("http://example.com")).toBe(true);
    expect(isValidRootUrl("https://example.com/api")).toBe(true);
  });

  it("rejects a malformed URL", () => {
    expect(isValidRootUrl("not a url")).toBe(false);
  });

  it("rejects a well-formed URL that doesn't start with http", () => {
    expect(isValidRootUrl("ftp://example.com")).toBe(false);
  });
});

describe("isValidUrlBaseField", () => {
  it("accepts empty string (no rejecting match)", () => {
    expect(isValidUrlBaseField("")).toBe(true);
  });

  it("accepts an ordinary path", () => {
    expect(isValidUrlBaseField("/readarr")).toBe(true);
    expect(isValidUrlBaseField("readarr")).toBe(true);
  });

  it("rejects a full http(s) URL used as a base, with or without a leading slash", () => {
    expect(isValidUrlBaseField("http://example.com")).toBe(false);
    expect(isValidUrlBaseField("/http://example.com")).toBe(false);
    expect(isValidUrlBaseField("https://example.com")).toBe(false);
  });

  it("does not reject a protocol-relative double-slash prefix (only a single optional leading slash is consumed by the ported regex)", () => {
    expect(isValidUrlBaseField("//example.com")).toBe(true);
  });

  it("rejects null/undefined (C# would NRE on ToString(), so this treats them as failing the rule)", () => {
    expect(isValidUrlBaseField(null)).toBe(false);
    expect(isValidUrlBaseField(undefined)).toBe(false);
  });
});

describe("isValidPort", () => {
  it("rejects out-of-range ports", () => {
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
    expect(isValidPort(65536)).toBe(false);
  });

  it("accepts 80 and 443 despite being <= 1024", () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(443)).toBe(true);
  });

  it("rejects other privileged ports <= 1024", () => {
    expect(isValidPort(1)).toBe(false);
    expect(isValidPort(22)).toBe(false);
    expect(isValidPort(1024)).toBe(false);
  });

  it("accepts unprivileged ports > 1024", () => {
    expect(isValidPort(1025)).toBe(true);
    expect(isValidPort(8080)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
  });
});

describe("containsReadarr", () => {
  it("rejects empty/null", () => {
    expect(containsReadarr(null)).toBe(false);
    expect(containsReadarr("")).toBe(false);
  });

  it("accepts any string containing readarr case-insensitively", () => {
    expect(containsReadarr("readarr")).toBe(true);
    expect(containsReadarr("My Readarr Instance")).toBe(true);
    expect(containsReadarr("READARR")).toBe(true);
  });

  it("rejects a string without readarr", () => {
    expect(containsReadarr("sonarr")).toBe(false);
  });
});

describe("isValidUrl", () => {
  it("rejects null/empty/whitespace-only", () => {
    expect(isValidUrl(null)).toBe(false);
    expect(isValidUrl("")).toBe(false);
    expect(isValidUrl("   ")).toBe(false);
  });

  it("rejects leading or trailing space even with an otherwise valid URL", () => {
    expect(isValidUrl(" http://example.com")).toBe(false);
    expect(isValidUrl("http://example.com ")).toBe(false);
  });

  it("accepts a well-formed absolute URL", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
    expect(isValidUrl("https://example.com/path?query=1")).toBe(true);
  });

  it("rejects a relative or malformed URL", () => {
    expect(isValidUrl("/just/a/path")).toBe(false);
    expect(isValidUrl("not a url")).toBe(false);
  });
});

describe("isValidIpAddress", () => {
  it("rejects null/undefined/garbage", () => {
    expect(isValidIpAddress(null)).toBe(false);
    expect(isValidIpAddress(undefined)).toBe(false);
    expect(isValidIpAddress("not an ip")).toBe(false);
  });

  it("accepts ordinary IPv4 addresses", () => {
    expect(isValidIpAddress("192.168.1.1")).toBe(true);
    expect(isValidIpAddress("0.0.0.0")).toBe(true);
    expect(isValidIpAddress("127.0.0.1")).toBe(true);
  });

  it("rejects the IPv4 broadcast address specifically", () => {
    expect(isValidIpAddress("255.255.255.255")).toBe(false);
  });

  it("rejects out-of-range IPv4 octets", () => {
    expect(isValidIpAddress("256.1.1.1")).toBe(false);
    expect(isValidIpAddress("1.2.3")).toBe(false);
    expect(isValidIpAddress("1.2.3.4.5")).toBe(false);
  });

  it("accepts ordinary IPv6 addresses", () => {
    expect(isValidIpAddress("::1")).toBe(true);
    expect(isValidIpAddress("2001:db8::1")).toBe(true);
    expect(isValidIpAddress("fe80::1")).toBe(true);
  });

  it("rejects IPv6 multicast addresses (ff00::/8)", () => {
    expect(isValidIpAddress("ff02::1")).toBe(false);
    expect(isValidIpAddress("ff00::")).toBe(false);
    expect(isValidIpAddress("FF05::2")).toBe(false);
  });

  it("accepts non-multicast IPv6 addresses that merely start with an 'f' hextet", () => {
    // fe80::/10 (link-local) is NOT multicast -- first byte is 0xfe, not 0xff.
    expect(isValidIpAddress("fe80::abcd")).toBe(true);
  });
});

describe("isValidGuid", () => {
  // Translated from NzbDrone.Core.Test/ValidationTests/GuidValidationFixture.cs.
  it("should_not_be_valid_if_invalid_guid", () => {
    expect(isValidGuid("e1f1e33e-2e4c-4d43-b91b-7064068d328")).toBe(false);
  });

  it("should_be_valid_if_valid_guid", () => {
    expect(isValidGuid("e1f1e33e-2e4c-4d43-b91b-7064068d3283")).toBe(true);
  });

  it("rejects null/undefined", () => {
    expect(isValidGuid(null)).toBe(false);
    expect(isValidGuid(undefined)).toBe(false);
  });

  it("accepts a bare 32-hex-digit guid (no hyphens)", () => {
    expect(isValidGuid("e1f1e33e2e4c4d43b91b7064068d3283")).toBe(true);
  });

  it("accepts a braced guid", () => {
    expect(isValidGuid("{e1f1e33e-2e4c-4d43-b91b-7064068d3283}")).toBe(true);
  });

  it("rejects non-hex characters", () => {
    expect(isValidGuid("zzzzzzzz-2e4c-4d43-b91b-7064068d3283")).toBe(false);
  });
});
