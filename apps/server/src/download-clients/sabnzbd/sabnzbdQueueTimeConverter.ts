/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/JsonConverters/
 * SabnzbdQueueTimeConverter.cs's `ReadJson` (the write direction isn't
 * needed -- this module only ever reads `SabnzbdQueueItem.Timeleft` off the
 * wire, never serializes one back out).
 *
 * Accepts either `"d:h:m:s"` (4 segments) or `"h:m:s"` (3 segments),
 * matching the C# switch on `split.Count()`. Throws for any other segment
 * count, matching the C# `ArgumentException`. Returns milliseconds (this
 * port's `TimeSpan` stand-in, see DownloadClientItem.ts's `remainingTime`
 * doc comment) rather than a `TimeSpan`.
 */
export function parseSabnzbdQueueTime(raw: string): number {
  const split = raw.split(":").map((s) => Number.parseInt(s, 10));

  if (split.some((n) => Number.isNaN(n))) {
    throw new Error(`Expected either 0:0:0:0 or 0:0:0 format, but received: ${raw}`);
  }

  if (split.length === 4) {
    const [days, hours, minutes, seconds] = split as [number, number, number, number];
    const totalHours = days * 24 + hours;
    return ((totalHours * 60 + minutes) * 60 + seconds) * 1000;
  }

  if (split.length === 3) {
    const [hours, minutes, seconds] = split as [number, number, number];
    return ((hours * 60 + minutes) * 60 + seconds) * 1000;
  }

  throw new Error(`Expected either 0:0:0:0 or 0:0:0 format, but received: ${raw}`);
}
