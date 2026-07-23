/**
 * Ported from NzbDrone.Core/Parser/Model/AuthorTitleInfo.cs.
 *
 * Plain data shape -- no behavior on the C# class beyond auto-properties.
 */
export interface AuthorTitleInfo {
  title: string;
  titleWithoutYear: string;
  year: number;
}
