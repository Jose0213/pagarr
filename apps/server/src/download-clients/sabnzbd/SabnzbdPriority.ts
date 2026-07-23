/**
 * Ported from NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdPriority.cs.
 * Unlike `SabnzbdDownloadStatus`, this enum has an explicit
 * `[JsonConverter(typeof(SabnzbdPriorityTypeConverter))]` on the one field
 * that carries it (`SabnzbdQueueItem.Priority`) which writes/reads the C#
 * member *name* verbatim (`priorityType.ToString()`, `Enum.TryParse`), not
 * camelCase -- so these values are the literal PascalCase C# names, matching
 * `sabnzbdPriorityTypeConverter.ts`'s round-trip.
 */
export const SabnzbdPriority = {
  Default: -100,
  Paused: -2,
  Low: -1,
  Normal: 0,
  High: 1,
  Force: 2,
} as const;
export type SabnzbdPriority = (typeof SabnzbdPriority)[keyof typeof SabnzbdPriority];

const NAME_BY_VALUE: Record<number, string> = {
  [SabnzbdPriority.Default]: "Default",
  [SabnzbdPriority.Paused]: "Paused",
  [SabnzbdPriority.Low]: "Low",
  [SabnzbdPriority.Normal]: "Normal",
  [SabnzbdPriority.High]: "High",
  [SabnzbdPriority.Force]: "Force",
};

const VALUE_BY_NAME: Record<string, SabnzbdPriority> = Object.fromEntries(
  Object.entries(NAME_BY_VALUE).map(([value, name]) => [name, Number(value) as SabnzbdPriority])
);

/** Ported from `SabnzbdPriorityTypeConverter.WriteJson`: `priorityType.ToString()`. */
export function sabnzbdPriorityToWireName(priority: SabnzbdPriority): string {
  return NAME_BY_VALUE[priority] ?? String(priority);
}

/**
 * Ported from `SabnzbdPriorityTypeConverter.ReadJson`: `Enum.TryParse` --
 * unrecognized names silently fall back to the enum's default (zero) value
 * (`Enum.TryParse` on failure leaves `output` at its default, which
 * `SabnzbdPriority`'s zero member is `Normal`), matching that exact silent
 * fallback rather than throwing.
 */
export function sabnzbdPriorityFromWireName(name: string): SabnzbdPriority {
  return VALUE_BY_NAME[name] ?? SabnzbdPriority.Normal;
}
