/**
 * Ported from NzbDrone.Core/Validation/{RuleBuilderExtensions,UrlValidator,
 * IpValidation,GuidValidator}.cs and the slice of
 * NzbDrone.Common/Extensions/{StringExtensions,UrlExtensions}.cs those rely
 * on (IsValidUrl, IsValidIpAddress).
 *
 * DEVIATION -- FluentValidation-to-plain-function: same mechanism deviation
 * documented throughout this port (see e.g.
 * indexers/newznab/newznabSettings.ts's "DEVIATION -- validation" note) --
 * `IRuleBuilder<T, TProp>` fluent-chain extension methods become plain
 * predicate/message-producing functions callers apply directly against a
 * field's value. Rule *behavior* (exact conditions, messages) is preserved.
 */
import { isIPv6 } from "node:net";

/**
 * Ported from RuleBuilderExtensions.HostRegex + ValidHost(): a bare host
 * (no scheme) is valid if it matches `^[-_a-z0-9.]+$` (case-insensitive) OR
 * is a valid IP address. Empty/null fails (C#'s `NotEmptyValidator`).
 */
const HOST_REGEX = /^[-_a-z0-9.]+$/i;

export function isValidHost(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") {
    return false;
  }

  return HOST_REGEX.test(value) || isValidIpAddress(value);
}

/** Ported from RuleBuilderExtensions.HaveHttpProtocol(): `^https?://` (case-insensitive), anchored to the start only. */
const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

export function hasHttpProtocol(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return HTTP_PROTOCOL_REGEX.test(value);
}

/**
 * Ported from RuleBuilderExtensions.ValidRootUrl(): non-empty, `IsValidUrl()`,
 * AND starts with "http" (case-insensitive) -- note this is `StartsWith("http",
 * ...)`, not the stricter `^https?://` of HaveHttpProtocol/ValidUrlBase, so
 * e.g. "httpfoo://x" would pass this specific prefix check (real C# quirk,
 * preserved as-is; IsValidUrl()'s own Uri.TryCreate parsing is what actually
 * gates malformed schemes in practice).
 */
export function isValidRootUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") {
    return false;
  }
  return isValidUrl(value) && value.toLowerCase().startsWith("http");
}

/**
 * Ported from RuleBuilderExtensions.ValidUrlBase(): the C# regex
 * `^(?!\/?https?://[-_a-z0-9.]+)` is a negative lookahead with NO anchor
 * requiring a match elsewhere in the string -- FluentValidation's
 * `RegularExpressionValidator` treats a `Regex.IsMatch()` hit anywhere as
 * pass, and a negative lookahead at position 0 against an empty pattern
 * requirement always finds *a* match (position 0 itself, ZeroWidth) unless
 * the lookahead's inner pattern matches there. In practice: this rule fails
 * (invalid) only when the value, optionally prefixed by a single "/",
 * starts with "http://" or "https://" followed by a bare host -- i.e. it
 * rejects a full URL being used where a path is expected, and passes
 * everything else (including empty string). Preserved faithfully, including
 * the fact that a leading "//" (double-slash, e.g. protocol-relative) is
 * NOT what `\/?` matches (that only consumes at most one leading slash) so
 * "//host" is NOT rejected by this rule, only "/http://host" or
 * "http://host" literally.
 */
const URL_BASE_REGEX = /^(?!\/?https?:\/\/[-_a-z0-9.]+)/i;

export function isValidUrlBaseField(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return URL_BASE_REGEX.test(value);
}

/**
 * Ported from RuleBuilderExtensions.ValidPort(): 1-65535 inclusive, AND (if
 * <= 1024) must be exactly 80 or 443 -- i.e. privileged ports below 1025 are
 * rejected except the two well-known HTTP(S) ports.
 */
export function isValidPort(value: number): boolean {
  if (value < 1 || value > 65535) {
    return false;
  }

  if (value <= 1024) {
    return value === 80 || value === 443;
  }

  return true;
}

/** Ported from RuleBuilderExtensions.ContainsReadarr(): non-empty AND contains "readarr" (case-insensitive, substring match anywhere). */
export function containsReadarr(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") {
    return false;
  }
  return /readarr/i.test(value);
}

/**
 * Ported from NzbDrone.Common/Extensions/UrlExtensions.cs IsValidUrl(): must
 * be non-empty/non-whitespace, must NOT start or end with a literal space
 * (C#'s `Uri.TryCreate` itself trims surrounding whitespace before parsing,
 * so this explicit check rejects inputs that .NET's parser would otherwise
 * silently accept after trimming), and must parse as an absolute,
 * well-formed URI (`Uri.TryCreate(path, UriKind.Absolute, ...)` +
 * `IsWellFormedOriginalString()`).
 *
 * DEVIATION: Node's `URL` constructor is more lenient than .NET's
 * `Uri.IsWellFormedOriginalString()` in some corners (e.g. it doesn't
 * reject all the same malformed-percent-encoding or backslash-as-separator
 * cases .NET flags) -- there is no direct Node/JS equivalent of
 * `IsWellFormedOriginalString`'s stricter well-formedness re-check. This
 * uses `URL` parse-success as the practical equivalent, matching this
 * port's established convention for URL validation (see
 * indexers/torznab/TorznabRssParser.ts's `isWellFormedAbsoluteUrl` and
 * indexers/newznab/newznabSettings.ts's `isValidRootUrl`, both of which
 * made the same call independently before this module existed).
 */
export function isValidUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value.trim() === "") {
    return false;
  }

  if (value.startsWith(" ") || value.endsWith(" ")) {
    return false;
  }

  try {
    // Parse-for-validity only, matching Uri.TryCreate's use as a well-formedness probe.
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ported from NzbDrone.Common/Extensions/StringExtensions.cs
 * IsValidIpAddress(): must parse as an IPv4 or IPv6 address, must NOT be
 * the IPv4 broadcast address 255.255.255.255, and must NOT be an IPv6
 * multicast address (first byte 0xFF, i.e. `ff00::/8`).
 *
 * DEVIATION: no dependency on Node's `net.isIP` alone, since that doesn't
 * distinguish broadcast/multicast -- this parses octets/segments directly
 * to reproduce .NET's `IPAddress.Parse` + `IsIPv6Multicast` semantics.
 */
export function isValidIpAddress(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  const ipv4 = parseIpv4(value);
  if (ipv4 !== null) {
    // 255.255.255.255 is explicitly rejected.
    return !(ipv4[0] === 255 && ipv4[1] === 255 && ipv4[2] === 255 && ipv4[3] === 255);
  }

  const ipv6FirstByte = parseIpv6FirstByte(value);
  if (ipv6FirstByte !== null) {
    // IsIPv6Multicast: first byte is 0xFF (ff00::/8).
    return ipv6FirstByte !== 0xff;
  }

  return false;
}

/** Strict dotted-quad IPv4 parse (no leading zeros ambiguity beyond what Number() accepts, each octet 0-255, exactly 4 parts). */
function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part) || part.length > 3) {
      return null;
    }
    const n = Number(part);
    if (n < 0 || n > 255) {
      return null;
    }
    octets.push(n);
  }

  return octets as [number, number, number, number];
}

/**
 * Minimal IPv6 validity check (delegated to Node's `net.isIPv6` for the
 * actual grammar, which is a faithful implementation of the same RFC 4291
 * text-representation rules .NET's `IPAddress.Parse` follows) that also
 * extracts the address's first byte, needed for the multicast check.
 */
function parseIpv6FirstByte(value: string): number | null {
  // Strip an optional zone id (e.g. "fe80::1%eth0") -- .NET's IPAddress.Parse
  // accepts scope ids too.
  const withoutZone = value.split("%")[0] ?? value;

  if (!isIPv6(withoutZone)) {
    return null;
  }

  const groups = expandIpv6Groups(withoutZone);
  if (groups === null) {
    return null;
  }

  // First byte is the top 8 bits of the first 16-bit group.
  return (groups[0]! >> 8) & 0xff;
}

function expandIpv6Groups(address: string): number[] | null {
  const doubleColonIndex = address.indexOf("::");

  let head: string[];
  let tail: string[];

  if (doubleColonIndex !== -1) {
    const left = address.slice(0, doubleColonIndex);
    const right = address.slice(doubleColonIndex + 2);
    head = left.length > 0 ? left.split(":") : [];
    tail = right.length > 0 ? right.split(":") : [];
  } else {
    head = address.split(":");
    tail = [];
  }

  // Handle a trailing embedded IPv4 literal (e.g. "::ffff:1.2.3.4") by
  // converting it to two hextets.
  const expand = (segs: string[]): string[] => {
    if (segs.length === 0) {
      return segs;
    }
    const last = segs[segs.length - 1]!;
    if (last.includes(".")) {
      const ipv4 = parseIpv4(last);
      if (ipv4 === null) {
        return segs;
      }
      const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16);
      const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16);
      return [...segs.slice(0, -1), hi, lo];
    }
    return segs;
  };

  head = expand(head);
  tail = expand(tail);

  const missing = 8 - (head.length + tail.length);
  if (missing < 0) {
    return null;
  }

  const fullGroups = [
    ...head,
    ...Array<string>(doubleColonIndex !== -1 ? missing : 0).fill("0"),
    ...tail,
  ];

  if (fullGroups.length !== 8) {
    return null;
  }

  return fullGroups.map((g) => parseInt(g === "" ? "0" : g, 16));
}

/**
 * Ported from NzbDrone.Core/Validation/GuidValidator.cs: `Guid.TryParse`.
 * .NET's `Guid.TryParse` accepts several formats (with/without braces,
 * with/without hyphens, "N"/"D"/"B"/"P" formats) -- this matches the
 * canonical hyphenated 8-4-4-4-12 form (with or without surrounding
 * `{}`/`()`) and the bare 32-hex-digit form, covering the formats
 * `Guid.TryParse` accepts without a explicit format specifier.
 */
const GUID_REGEX =
  /^[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[)}]?$|^[0-9a-f]{32}$/i;

export function isValidGuid(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  return GUID_REGEX.test(value);
}
