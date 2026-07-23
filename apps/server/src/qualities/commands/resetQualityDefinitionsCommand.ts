/**
 * Ported from NzbDrone.Core/Qualities/Commands/ResetQualityDefinitionsCommand.cs.
 *
 * C# `ResetQualityDefinitionsCommand : Command` -- the base `Command` class
 * (Messaging module, Phase 4, not yet ported) contributes scheduling/tracking
 * fields Readarr's command-queue infra needs. That's not relevant to this
 * command's own behavior, so only the fields `ResetQualityDefinitionsCommand`
 * itself declares are ported here; `QualityDefinitionService.execute()`
 * accepts this shape directly (see qualityDefinitionService.ts).
 */
export interface ResetQualityDefinitionsCommand {
  /** Ported from the constructor's `resetTitles = false` default. */
  resetTitles: boolean;
}

export function newResetQualityDefinitionsCommand(resetTitles = false): ResetQualityDefinitionsCommand {
  return { resetTitles };
}
