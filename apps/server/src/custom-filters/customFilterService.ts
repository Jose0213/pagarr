import type { CustomFilter } from "./customFilter.js";
import type { CustomFilterRepository } from "./customFilterRepository.js";

/**
 * Ported from NzbDrone.Core/CustomFilters/CustomFilterService.cs.
 *
 * The real C# service is a thin pass-through over `ICustomFilterRepository`
 * (`Get`, `Add` (`Insert`), `Update`, `Delete`, `All`) -- no extra business
 * logic, matching the small scope this task's brief describes ("a small
 * settings-table CRUD"). Kept as a distinct class from the repository
 * anyway (rather than having the API controller depend on the repository
 * directly) purely for parity with the real C# module boundary and with
 * every other ported `*Service` in this codebase sitting between its
 * controller and its repository.
 */
export interface ICustomFilterService {
  get(id: number): CustomFilter;
  all(): CustomFilter[];
  add(customFilter: CustomFilter): CustomFilter;
  update(customFilter: CustomFilter): CustomFilter;
  delete(id: number): void;
}

export class CustomFilterService implements ICustomFilterService {
  constructor(private readonly repo: CustomFilterRepository) {}

  get(id: number): CustomFilter {
    return this.repo.get(id);
  }

  all(): CustomFilter[] {
    return this.repo.all();
  }

  add(customFilter: CustomFilter): CustomFilter {
    return this.repo.insert(customFilter);
  }

  update(customFilter: CustomFilter): CustomFilter {
    return this.repo.update(customFilter);
  }

  delete(id: number): void {
    this.repo.delete(id);
  }
}
