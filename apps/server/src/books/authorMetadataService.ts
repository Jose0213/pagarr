/**
 * Ported from NzbDrone.Core/Books/Services/AuthorMetadataService.cs.
 */

import type { AuthorMetadataRepository } from "./authorMetadataRepository.js";
import type { AuthorMetadata } from "./models.js";

export class AuthorMetadataService {
  constructor(private readonly authorMetadataRepository: AuthorMetadataRepository) {}

  /** Ported from AuthorMetadataService.Upsert(AuthorMetadata author): delegates to UpsertMany([author]). */
  upsert(author: AuthorMetadata): boolean {
    return this.authorMetadataRepository.upsertMany([author]);
  }

  /** Ported from AuthorMetadataService.UpsertMany(List<AuthorMetadata> authors). */
  upsertMany(authors: AuthorMetadata[]): boolean {
    return this.authorMetadataRepository.upsertMany(authors);
  }
}
