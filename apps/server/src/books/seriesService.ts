/**
 * Ported from NzbDrone.Core/Books/Services/SeriesService.cs.
 */

import type { SeriesRepository } from "./seriesRepository.js";
import type { Series } from "./models.js";

export class SeriesService {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  findById(foreignSeriesId: string): Series | undefined;
  findById(foreignSeriesIds: string[]): Series[];
  findById(foreignSeriesId: string | string[]): Series | Series[] | undefined {
    if (Array.isArray(foreignSeriesId)) {
      return this.seriesRepository.findByIds(foreignSeriesId);
    }
    return this.seriesRepository.findById(foreignSeriesId);
  }

  getByAuthorMetadataId(authorMetadataId: number): Series[] {
    return this.seriesRepository.getByAuthorMetadataId(authorMetadataId);
  }

  getByAuthorId(authorId: number): Series[] {
    return this.seriesRepository.getByAuthorId(authorId);
  }

  delete(seriesId: number): void {
    this.seriesRepository.delete(seriesId);
  }

  insertMany(series: Series[]): void {
    this.seriesRepository.insertMany(series);
  }

  updateMany(series: Series[]): void {
    this.seriesRepository.updateMany(series);
  }
}
