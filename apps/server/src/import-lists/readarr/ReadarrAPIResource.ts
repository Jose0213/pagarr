import type { MediaCoverImage } from "../../books/models.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Readarr/ReadarrAPIResource.cs. Plain
 * JSON DTOs for the remote Pagarr/Readarr instance's `Readarr.Api.V1`
 * resource responses.
 */
export interface ReadarrAuthor {
  authorName: string;
  id: number;
  foreignAuthorId: string;
  overview: string | null;
  images: MediaCoverImage[];
  monitored: boolean;
  qualityProfileId: number;
  rootFolderPath: string;
  tags: number[];
}

export interface ReadarrEdition {
  title: string;
  foreignEditionId: string;
  overview: string | null;
  images: MediaCoverImage[];
  monitored: boolean;
}

export interface ReadarrBook {
  title: string;
  foreignBookId: string;
  foreignEditionId: string;
  overview: string | null;
  images: MediaCoverImage[];
  monitored: boolean;
  author: ReadarrAuthor | null;
  authorId: number;
  editions: ReadarrEdition[];
}

export interface ReadarrProfile {
  name: string;
  id: number;
}

export interface ReadarrTag {
  label: string;
  id: number;
}

export interface ReadarrRootFolder {
  path: string;
  id: number;
}
