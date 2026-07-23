/**
 * Ported from NzbDrone.Common/Instrumentation/CleanseLogMessage.cs.
 *
 * Scrubs secrets (API keys, passwords, usernames, tracker passkeys, webhook
 * URLs, home-directory usernames in file paths, etc.) out of a log message
 * before it's persisted, so the DB-backed "Logs" table (and any log file)
 * never stores credentials verbatim. Used by databaseTarget.ts, matching the
 * C# DatabaseTarget.Write()'s `CleanseLogMessage.Cleanse(...)` calls on both
 * the message and the exception text.
 *
 * ## Named capture group split (regex-compat requirement)
 *
 * Two of the C# rules -- the tracker "announce" rule and the Discord webhook
 * rule -- reuse the same `(?<secret>...)` group name twice within a single
 * `|`-alternation pattern (legal in .NET, since each alternative only ever
 * matches one branch at runtime; V8/Node's older regex engine rejects a
 * *statically* duplicated named group in the same pattern with
 * `SyntaxError: Duplicate capture group name`, which is exactly the bug
 * class documented in this repo's `check-regex-compat.mjs` and the fix
 * already applied once to TorrentRssParser's seeder/leecher/peer regexes --
 * see that file's `PARSE_SEEDERS_REGEXES`-style array-of-single-alternative
 * pattern). Both rules are split into an ordered array of single-alternative
 * regexes here, tried in sequence, matching the exact same set of strings
 * the original single alternation would have matched.
 *
 * ## Multiple secrets per match
 *
 * Two rules can match more than one secret span within a single overall
 * match: the iptorrents rule (`(?:[?&;](u|tp)=(?<secret>...))+`, a *repeated*
 * group that can capture both a `u=` and a `tp=` value in one pass) and the
 * Discord rule (`((?<secret>[\w-]+)/)?(?<secret>[\w-]+)`, which redacts both
 * the webhook id segment and the token segment when both are present). C#'s
 * `Match.Groups["secret"].Captures` walks *every* capture of a repeated
 * named group across the whole match; JS regex only ever exposes the *last*
 * capture of a repeated group via `match.groups`, so a rule that needs to
 * redact more than one span can't rely on a single reused group name the
 * way the C# source does.
 *
 * Rather than reimplement .NET's `CaptureCollection` semantics, each such
 * rule below is written with distinctly-named groups (`secret`, `secret2`,
 * ...) for each span that needs redacting, and `redactSecrets()` replaces
 * every named group matching `/^secret\d*$/` that's actually present in the
 * match. This produces the exact same redacted output as the C# original
 * for every span the original rule would have found, without depending on
 * JS's single-capture-per-name limitation.
 */

interface CleansingRule {
  regex: RegExp;
}

/** Every rule always gets the `d` (hasIndices) flag appended -- see redactSecrets()'s doc comment for why. */
function rule(pattern: string, flags: string): CleansingRule {
  return { regex: new RegExp(pattern, flags.includes("d") ? flags : flags + "d") };
}

const CLEANSING_RULES: CleansingRule[] = [
  // Url
  rule(
    '(?<=\\?|&|: )((?:api|auth|pass)?key|(?:access[-_]?)?token|auth|user|uid|api|[a-z_]*apikey|account|passwd)=(?<secret>[^&="]+?)(?=[ "&=]|$)',
    "gi"
  ),
  rule("(?<=\\?|&)[^=]*?(username|password)=(?<secret>[^&=]+?)(?= |&|$)", "gi"),
  rule("rss(24h)?\\.torrentleech\\.org/(?!rss)(?<secret>[0-9a-z]+)", "gi"),
  rule("torrentleech\\.org/rss/download/[0-9]+/(?<secret>[0-9a-z]+)", "gi"),
  // C# original: `(?:[?&;](u|tp)=(?<secret>[^&=;]+?))+` -- a *repeated*
  // group that can capture both a `u=` and a `tp=` value in one match (e.g.
  // "...?u=mySecret;tp=mySecret;..."). Ported as two explicit optional
  // occurrences with distinct group names so both redact -- see file doc
  // comment's "Multiple secrets per match" section.
  rule(
    "iptorrents\\.com/[/a-z0-9?&;]*?(?:[?&;](?:u|tp)=(?<secret>[^&=;]+?))(?:[?&;](?:u|tp)=(?<secret2>[^&=;]+?))?(?= |;|&|$)",
    "gi"
  ),
  rule("/fetch/[a-z0-9]{32}/(?<secret>[a-z0-9]{32})", "g"),
  rule("getnzb.*?(?<=\\?|&)(r)=(?<secret>[^&=]+?)(?= |&|$)", "gi"),
  rule("\\b(\\w*)?(_?(?<!use|get_)token|username|passwo?rd)=(?<secret>[^&=]+?)(?= |&|$|;)", "gi"),
  rule("-hd.me/torrent/[a-z0-9-]\\.[0-9]+\\.(?<secret>[0-9a-z]+)", "gi"),

  // Trackers Announce Keys; Designed for Qbit Json; should work for all in
  // theory. C# original: single pattern
  //   announce(\.php)?(/|%2f|%3fpasskey%3d)(?<secret>[a-z0-9]{16,})|(?<secret>[a-z0-9]{16,})(/|%2f)announce
  // Split into its two alternatives (see file doc comment).
  rule("announce(\\.php)?(/|%2f|%3fpasskey%3d)(?<secret>[a-z0-9]{16,})", "gi"),
  rule("(?<secret>[a-z0-9]{16,})(/|%2f)announce", "gi"),

  // Path
  rule('C:\\\\Users\\\\(?<secret>[^\\"]+?)(\\\\|$)', "gi"),
  rule('/(home|Users)/(?<secret>[^/"]+?)(/|$)', "gi"),

  // NzbGet
  rule(
    '"Name"\\s*:\\s*"[^"]*(username|password)"\\s*,\\s*"Value"\\s*:\\s*"(?<secret>[^"]+?)"',
    "gi"
  ),

  // Sabnzbd
  rule('"[^"]*(username|password|api_?key|nzb_key)"\\s*:\\s*"(?<secret>[^"]+?)"', "gi"),
  rule('"email_(account|to|from|pwd)"\\s*:\\s*"(?<secret>[^"]+?)"', "gi"),

  // uTorrent
  rule('\\["[a-z._]*(username|password)",\\d,"(?<secret>[^"]+?)"', "gi"),
  rule('\\["(boss_key|boss_key_salt|proxy\\.proxy)",\\d,"(?<secret>[^"]+?)"', "gi"),

  // Deluge
  rule('auth.login\\("(?<secret>[^"]+?)"', "gi"),

  // BroadcastheNet
  rule(
    '"?method"?\\s*:\\s*"(getTorrents)",\\s*"?params"?\\s*:\\s*\\[\\s*"(?<secret>[^"]+?)"',
    "gi"
  ),
  rule('getTorrents\\("(?<secret>[^"]+?)"', "gi"),
  rule('(?<=\\?|&)(authkey|torrent_pass)=(?<secret>[^&=]+?)(?="|&|$)', "gi"),

  // Good Reads
  rule('(?<="(token|tokensecret)":\\s)"(?<secret>[^"]+?)"', "gi"),

  // Webhooks
  // Notifiarr
  rule("api/v[0-9]/notification/readarr/(?<secret>[\\w-]+)", "gi"),

  // Discord. C# original: single pattern
  //   discord.com/api/webhooks/((?<secret>[\w-]+)/)?(?<secret>[\w-]+)
  // -- redacts BOTH the webhook id and the token when the optional leading
  // segment is present. Ported as one pattern with an optional leading
  // group under a distinct name (secret2) plus the always-present trailing
  // group (secret) -- see file doc comment's "Multiple secrets per match".
  rule("discord.com/api/webhooks/(?:(?<secret2>[\\w-]+)/)?(?<secret>[\\w-]+)", "gi"),

  // Telegram
  rule("api.telegram.org/bot(?<id>[\\d]+):(?<secret>[\\w-]+)/", "gi"),
];

const CLEANSE_REMOTE_IP_REGEX =
  /(?:Auth-\w+(?<!Failure|Unauthorized) ip|from) (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;

function isLocalAddress(ip: string): boolean {
  // Ported from NzbDrone.Common's IPAddress.IsLocalAddress() extension,
  // covering the common private/loopback ranges CleanseRemoteIP relies on
  // to skip redacting non-routable addresses.
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function cleanseRemoteIp(fullMatch: string, ip: string): string {
  if (isLocalAddress(ip)) {
    return fullMatch;
  }

  const ipIndex = fullMatch.lastIndexOf(ip);
  const prefix = fullMatch.slice(0, ipIndex);
  const postfix = fullMatch.slice(ipIndex + ip.length);
  const items = ip.split(".");

  return `${prefix}${items[0]}.*.*.${items[3]}${postfix}`;
}

const SECRET_GROUP_NAME_RE = /^secret\d*$/;

/**
 * Redacts every `secret`/`secret2`/... -named capture reported by a single
 * match, replacing each with the literal text `(removed)` (matching the C#
 * original's per-capture replacement), and leaving everything else in the
 * matched span untouched. Requires the regex to have been compiled with the
 * `d` (hasIndices) flag so each named group's span within `match[0]` is
 * known exactly -- a plain `lastIndexOf` search (this file's first attempt)
 * breaks when one secret's text is a substring of another's surrounding
 * text, or when two secret spans have identical content.
 */
function redactSecrets(match: RegExpExecArray & { indices?: RegExpIndicesArray }): string {
  const groupIndices = match.indices?.groups;
  if (!groupIndices) {
    return match[0];
  }

  const spans = Object.entries(groupIndices)
    .filter(
      (entry): entry is [string, [number, number]] =>
        SECRET_GROUP_NAME_RE.test(entry[0]) && entry[1] !== undefined
    )
    .map(([, span]) => span)
    // Reverse index order so earlier replacements don't shift later offsets,
    // matching the C# original's `Reverse()` over captures.
    .sort((a, b) => b[0] - a[0]);

  if (spans.length === 0) {
    return match[0];
  }

  const matchStart = match.index;
  let result = match[0];
  for (const [start, end] of spans) {
    const relativeStart = start - matchStart;
    const relativeEnd = end - matchStart;
    result = result.slice(0, relativeStart) + "(removed)" + result.slice(relativeEnd);
  }

  return result;
}

function applyRule(message: string, regex: RegExp): string {
  // `regex` carries the `g` (+ `d`) flags (required for hand-rolled
  // replace-via-exec()'s lastIndex advance, and for match.indices.groups
  // respectively); reset in case of reuse.
  regex.lastIndex = 0;

  let result = "";
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(message)) !== null) {
    result += message.slice(lastEnd, match.index) + redactSecrets(match);
    lastEnd = match.index + match[0].length;

    // Guard against zero-length matches looping forever.
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
  }

  result += message.slice(lastEnd);
  return result;
}

/**
 * Ported from `CleanseLogMessage.Cleanse(string message)`. Returns the
 * message unchanged (including `null`/whitespace-only input, matching
 * `message.IsNullOrWhiteSpace()`) if there's nothing to scrub.
 */
export function cleanse(message: string | null | undefined): string | null | undefined {
  if (message === null || message === undefined || message.trim() === "") {
    return message;
  }

  let result = message;
  for (const { regex } of CLEANSING_RULES) {
    result = applyRule(result, regex);
  }

  result = result.replace(CLEANSE_REMOTE_IP_REGEX, (fullMatch, ip: string) =>
    cleanseRemoteIp(fullMatch, ip)
  );

  return result;
}
