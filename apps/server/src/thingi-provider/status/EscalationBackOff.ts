/**
 * Ported from NzbDrone.Core/ThingiProvider/Status/EscalationBackOff.cs.
 *
 * The four sibling modules (Indexers/DownloadClients, notably) each
 * independently duplicated this exact array under their own Status file --
 * see `indexers/IndexerStatusService.ts`'s
 * `ESCALATION_BACKOFF_PERIODS_SECONDS` and `download-clients/
 * DownloadClientStatusService.ts`'s identical copy, both documented as
 * "duplicated rather than imported, since ThingiProvider hadn't landed
 * yet." This is the real, single shared source those two were narrowed
 * from. They are NOT retrofitted to import this (out of scope); this is
 * the canonical copy for Notifications (and any future provider-kind
 * module) to use going forward.
 */
export const ESCALATION_BACKOFF_PERIODS_SECONDS: readonly number[] = [
  0,
  60,
  5 * 60,
  15 * 60,
  30 * 60,
  60 * 60,
  3 * 60 * 60,
  6 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60,
];
