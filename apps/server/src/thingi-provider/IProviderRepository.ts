import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/IProviderRepository.cs.
 * The commented-out `DeleteImplementations(string implementation)` member in
 * the C# source (never implemented, dead code in the original) is omitted
 * here rather than translated as a no-op stub.
 */
export interface IProviderRepository<TModel extends ModelBase> {
  all(): TModel[];
  find(id: number): TModel | undefined;
  get(id: number): TModel;
  getMany(ids: number[]): TModel[];
  insert(model: TModel): TModel;
  update(model: TModel): TModel;
  updateMany(models: TModel[]): void;
  upsert(model: TModel): TModel;
  delete(id: number): void;
  deleteMany(ids: number[]): void;
  count(): number;
}
