import type { IConfigService } from "../config/configService.js";
import type { DelayProfileService } from "../profiles/delay/delayProfileService.js";
import { DownloadDecisionComparer } from "./downloadDecisionComparer.js";
import type { DownloadDecision } from "./downloadDecision.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/DownloadDecisionPriorizationService.cs
 * (C# source file/class name keeps the "Priorization" typo -- preserved
 * here in the file name for grep-ability against the original, while the
 * exported class name below uses the same typo too since nothing about the
 * typo is behavior, just naming, and matching it makes cross-referencing
 * the C# source trivial).
 */
export interface IPrioritizeDownloadDecision {
  prioritizeDecisions(decisions: DownloadDecision[]): DownloadDecision[];
}

export class DownloadDecisionPriorizationService implements IPrioritizeDownloadDecision {
  constructor(
    private readonly configService: IConfigService,
    private readonly delayProfileService: DelayProfileService
  ) {}

  /**
   * Ported from `PrioritizeDecisions`: groups DownloadAllowed decisions by
   * author id, sorts each group descending by DownloadDecisionComparer, then
   * appends (via C#'s `.Union`, which also de-dupes -- see note below) every
   * decision where DownloadAllowed is false, unsorted.
   *
   * NOTE on `.Union`: LINQ's `Enumerable.Union` de-duplicates by default
   * reference/structural equality as it concatenates. `DownloadDecision` has
   * no `Equals` override in the C# source, so `Union` here only dedupes
   * *reference*-identical instances -- which can't happen between the
   * "grouped/sorted allowed" sequence and the "not allowed" sequence, since
   * they're partitioned by `DownloadAllowed` and therefore disjoint by
   * construction. So `.Union` is behaviorally just concatenation here; ported
   * as a plain array spread/concat.
   */
  prioritizeDecisions(decisions: DownloadDecision[]): DownloadDecision[] {
    const comparer = new DownloadDecisionComparer(this.configService, this.delayProfileService);

    const allowed = decisions.filter((c) => c.remoteBook.downloadAllowed);
    const notAllowed = decisions.filter((c) => !c.remoteBook.downloadAllowed);

    const byAuthor = new Map<number, DownloadDecision[]>();
    for (const decision of allowed) {
      const authorId = decision.remoteBook.author.id;
      const group = byAuthor.get(authorId);
      if (group) {
        group.push(decision);
      } else {
        byAuthor.set(authorId, [decision]);
      }
    }

    const sortedGroups: DownloadDecision[] = [];
    for (const group of byAuthor.values()) {
      // OrderByDescending: highest-preference decision first.
      const sorted = [...group].sort((a, b) => comparer.compare(b, a));
      sortedGroups.push(...sorted);
    }

    return [...sortedGroups, ...notAllowed];
  }
}
