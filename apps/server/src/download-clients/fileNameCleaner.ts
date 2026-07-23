/**
 * Forward-ref/narrow-port of NzbDrone.Core/Organizer/FileNameBuilder.cs's
 * static `CleanFileName(string name)` (which is `CleanFileName(name,
 * NamingConfig.Default)`) -- used by 6 in-scope call sites (TorrentClientBase,
 * UsenetClientBase, TorrentBlackhole, UsenetBlackhole, ScanWatchFolder) to
 * sanitize a release title before using it as a filename.
 *
 * The full `Organizer` module (naming-token templating, `NamingConfig`
 * persistence, etc.) is a separate, much larger, not-yet-ported module --
 * out of this worktree's scope per the task brief. Only the static
 * `CleanFileName` helper is ported here, hardcoded against
 * `NamingConfig.Default`'s values (`ReplaceIllegalCharacters = true`,
 * `ColonReplacementFormat = Smart`) since nothing in this module's scope can
 * reach a user-configured `NamingConfig` instance. When Organizer is ported,
 * this function should be replaced by a call into the real
 * `FileNameBuilder.cleanFileName(name, namingConfig)`.
 */
export function cleanFileName(name: string): string {
  // ColonReplacementFormat.Smart: ": " -> " - ", then remaining ":" -> "-".
  let result = name.replaceAll(": ", " - ").replaceAll(":", "-");

  const badCharacters = ["\\", "/", "<", ">", "?", "*", "|", '"'];
  const goodCharacters = ["+", "+", "", "", "!", "-", "", ""];

  for (let i = 0; i < badCharacters.length; i++) {
    result = result.split(badCharacters[i]!).join(goodCharacters[i]);
  }

  return result.replace(/^[ .]+/, "").replace(/ +$/, "");
}
