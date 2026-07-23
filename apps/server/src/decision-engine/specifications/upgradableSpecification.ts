import type { IConfigService } from "../../config/configService.js";
import {
  asQualityProfileLike,
  calculateCustomFormatScore,
  firstAllowedQuality,
  type QualityProfile,
} from "../../profiles/qualities/qualityProfile.js";
import type { CustomFormat } from "../../profiles/customFormat.js";
import { QualityModelComparer } from "../../qualities/qualityModelComparer.js";
import { qualityFromId } from "../../qualities/quality.js";
import type { QualityModel } from "../../qualities/qualityModel.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/Specifications/UpgradableSpecification.cs.
 *
 * `new QualityModelComparer(profile)` in the C# source takes the real
 * `QualityProfile` directly (that class both stores profile data AND
 * implements `GetIndex`). This port's `QualityProfile` is a plain data
 * interface (see profiles/qualities/qualityProfile.ts's header comment on
 * why), so `asQualityProfileLike` — the same adapter Profiles' own module
 * defines for this exact purpose — is used to satisfy `QualityModelComparer`'s
 * `QualityProfileLike` structural interface.
 */

enum ProfileComparisonResult {
  Downgrade = -1,
  Equal = 0,
  Upgrade = 1,
}

export interface IUpgradableSpecification {
  isUpgradable(
    profile: QualityProfile,
    currentQuality: QualityModel,
    currentCustomFormats: CustomFormat[],
    newQuality: QualityModel,
    newCustomFormats: CustomFormat[]
  ): boolean;
  qualityCutoffNotMet(
    profile: QualityProfile,
    currentQuality: QualityModel,
    newQuality?: QualityModel | null
  ): boolean;
  cutoffNotMet(
    profile: QualityProfile,
    currentQualities: QualityModel[],
    currentFormats: CustomFormat[],
    newQuality?: QualityModel | null
  ): boolean;
  isRevisionUpgrade(currentQuality: QualityModel, newQuality: QualityModel): boolean;
  isUpgradeAllowed(
    qualityProfile: QualityProfile,
    currentQuality: QualityModel,
    currentCustomFormats: CustomFormat[],
    newQuality: QualityModel,
    newCustomFormats: CustomFormat[]
  ): boolean;
}

export class UpgradableSpecification implements IUpgradableSpecification {
  constructor(private readonly configService: IConfigService) {}

  private isQualityUpgradable(
    profile: QualityProfile,
    currentQuality: QualityModel,
    newQuality?: QualityModel | null
  ): ProfileComparisonResult {
    if (newQuality != null) {
      const comparer = new QualityModelComparer(asQualityProfileLike(profile));
      const compare = comparer.compare(newQuality, currentQuality);

      if (compare < 0) {
        // Not upgradable if new quality is a downgrade for any current quality
        return ProfileComparisonResult.Downgrade;
      }

      // Not upgradable if new quality is equal to all current qualities
      if (compare === 0) {
        return ProfileComparisonResult.Equal;
      }

      // Accept unless the user doesn't want to prefer propers, optionally they can
      // use preferred words to prefer propers/repacks over non-propers/repacks.
      if (
        this.configService.downloadPropersAndRepacks === "DoNotPrefer" &&
        newQuality.revision.compareTo(currentQuality.revision) > 0
      ) {
        return ProfileComparisonResult.Equal;
      }
    }

    return ProfileComparisonResult.Upgrade;
  }

  isUpgradable(
    qualityProfile: QualityProfile,
    currentQualities: QualityModel,
    currentCustomFormats: CustomFormat[],
    newQuality: QualityModel,
    newCustomFormats: CustomFormat[]
  ): boolean {
    const qualityUpgrade = this.isQualityUpgradable(qualityProfile, currentQualities, newQuality);

    if (qualityUpgrade === ProfileComparisonResult.Upgrade) {
      return true;
    }

    if (qualityUpgrade === ProfileComparisonResult.Downgrade) {
      return false;
    }

    const currentFormatScore = calculateCustomFormatScore(qualityProfile, currentCustomFormats);
    const newFormatScore = calculateCustomFormatScore(qualityProfile, newCustomFormats);

    if (newFormatScore <= currentFormatScore) {
      return false;
    }

    return true;
  }

  qualityCutoffNotMet(
    profile: QualityProfile,
    currentQuality: QualityModel,
    newQuality?: QualityModel | null
  ): boolean {
    const cutoff = profile.upgradeAllowed ? profile.cutoff : firstAllowedQuality(profile).id;
    const comparer = new QualityModelComparer(asQualityProfileLike(profile));
    const cutoffCompare = comparer.compareQuality(currentQuality.quality, qualityFromId(cutoff));

    if (cutoffCompare < 0) {
      return true;
    }

    if (newQuality != null && this.isRevisionUpgrade(currentQuality, newQuality)) {
      return true;
    }

    return false;
  }

  private customFormatCutoffNotMet(
    profile: QualityProfile,
    currentFormats: CustomFormat[]
  ): boolean {
    const score = calculateCustomFormatScore(profile, currentFormats);
    return score < profile.cutoffFormatScore;
  }

  cutoffNotMet(
    profile: QualityProfile,
    currentQualities: QualityModel[],
    currentFormats: CustomFormat[],
    newQuality?: QualityModel | null
  ): boolean {
    for (const quality of currentQualities) {
      if (this.qualityCutoffNotMet(profile, quality, newQuality)) {
        return true;
      }
    }

    if (this.customFormatCutoffNotMet(profile, currentFormats)) {
      return true;
    }

    return false;
  }

  /** Ported from `UpgradableSpecification.IsRevisionUpgrade`: compares Quality directly (not via profile order) so proper/repack revisions never "upgrade" across a webrip<->webdl-style quality boundary. */
  isRevisionUpgrade(currentQuality: QualityModel, newQuality: QualityModel): boolean {
    const compare = newQuality.revision.compareTo(currentQuality.revision);

    if (currentQuality.quality.id === newQuality.quality.id && compare > 0) {
      return true;
    }

    return false;
  }

  isUpgradeAllowed(
    qualityProfile: QualityProfile,
    currentQuality: QualityModel,
    currentCustomFormats: CustomFormat[],
    newQuality: QualityModel,
    newCustomFormats: CustomFormat[]
  ): boolean {
    const isQualityUpgrade = this.isQualityUpgradable(qualityProfile, currentQuality, newQuality);
    const isCustomFormatUpgrade =
      calculateCustomFormatScore(qualityProfile, newCustomFormats) >
      calculateCustomFormatScore(qualityProfile, currentCustomFormats);

    return this.checkUpgradeAllowed(qualityProfile, isQualityUpgrade, isCustomFormatUpgrade);
  }

  private checkUpgradeAllowed(
    qualityProfile: QualityProfile,
    isQualityUpgrade: ProfileComparisonResult,
    isCustomFormatUpgrade: boolean
  ): boolean {
    const isEitherUpgrade =
      isQualityUpgrade === ProfileComparisonResult.Upgrade || isCustomFormatUpgrade;

    if (isEitherUpgrade && qualityProfile.upgradeAllowed) {
      return true;
    }

    if (isEitherUpgrade && !qualityProfile.upgradeAllowed) {
      return false;
    }

    return true;
  }
}
