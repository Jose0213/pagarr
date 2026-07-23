/**
 * Ported from NzbDrone.Core/Parser/IsoCountry.cs.
 *
 * Plain data shape -- C# constructor is ported as a factory function for
 * consistency with this codebase's other value-object modules.
 */
export interface IsoCountry {
  twoLetterCode: string;
  name: string;
}

export function newIsoCountry(twoLetterCode: string, name: string): IsoCountry {
  return { twoLetterCode, name };
}
