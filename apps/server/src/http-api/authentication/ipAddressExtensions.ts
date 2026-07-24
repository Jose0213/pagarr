/**
 * Ported from NzbDrone.Common/Extensions/IPAddressExtensions.cs.
 *
 * C# operates on parsed `System.Net.IPAddress` objects with real
 * address-family/byte-array accessors. This port works directly on the
 * dotted-quad/colon-hex string Express's `req.ip`/`req.socket.remoteAddress`
 * already hands back (Node has no built-in IPAddress parser type), doing
 * the equivalent classification via string/regex parsing instead of a typed
 * address object -- the same "adapt to what the host platform actually
 * gives you" substitution this port makes elsewhere for platform-specific
 * APIs with no direct Node equivalent.
 */

/** Ported from IsLoopback + the IPv4-mapped-to-IPv6 unwrap IsLocalAddress does first. Handles "::ffff:127.0.0.1" the same way C#'s MapToIPv4() does. */
function unwrapIPv4MappedToIPv6(address: string): string {
  const match = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
  return match ? match[1]! : address;
}

function parseIPv4(address: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) {
    return null;
  }
  const bytes = [match[1], match[2], match[3], match[4]].map((s) => Number.parseInt(s!, 10));
  if (bytes.some((b) => b < 0 || b > 255)) {
    return null;
  }
  return bytes;
}

/** Ported from IPAddressExtensions.IsLocalIPv4 (private helper). */
function isLocalIPv4(bytes: number[]): boolean {
  const [a, b] = bytes as [number, number, number, number];

  const isLinkLocal = a === 169 && b === 254;
  const isClassA = a === 10;
  const isClassB = a === 172 && b >= 16 && b <= 31;
  const isClassC = a === 192 && b === 168;

  return isLinkLocal || isClassA || isClassB || isClassC;
}

/**
 * Ported from IPAddressExtensions.IsLocalAddress(this IPAddress). Accepts
 * the raw address string as Express/Node surfaces it (may be IPv4, IPv6, or
 * an IPv4-mapped-IPv6 literal). Unparseable input returns false, matching
 * the real extension method's behavior for any address family other than
 * InterNetwork/InterNetworkV6 (falls through to `return false`).
 */
export function isLocalAddress(rawAddress: string | undefined | null): boolean {
  if (!rawAddress) {
    return false;
  }

  const address = unwrapIPv4MappedToIPv6(rawAddress.trim());

  if (address === "127.0.0.1" || address === "::1" || address.startsWith("127.")) {
    return true;
  }

  const ipv4 = parseIPv4(address);
  if (ipv4) {
    return isLocalIPv4(ipv4);
  }

  // IPv6 link-local (fe80::/10), unique-local (fc00::/7), and site-local
  // (deprecated fec0::/10, still checked by the real C# IsIPv6SiteLocal).
  const lower = address.toLowerCase();
  if (lower.includes(":")) {
    if (
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    ) {
      return true; // fe80::/10
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) {
      return true; // fc00::/7
    }
    if (
      lower.startsWith("fec") ||
      lower.startsWith("fed") ||
      lower.startsWith("fee") ||
      lower.startsWith("fef")
    ) {
      return true; // fec0::/10 (deprecated site-local)
    }
  }

  return false;
}

/** Ported from IPAddressExtensions.IsCgnatIpAddress: 100.64.0.0/10 (RFC 6598 carrier-grade NAT range). */
export function isCgnatIpAddress(rawAddress: string | undefined | null): boolean {
  if (!rawAddress) {
    return false;
  }

  const address = unwrapIPv4MappedToIPv6(rawAddress.trim());
  const ipv4 = parseIPv4(address);
  if (!ipv4) {
    return false;
  }

  const [a, b] = ipv4 as [number, number, number, number];
  return a === 100 && b >= 64 && b <= 127;
}
