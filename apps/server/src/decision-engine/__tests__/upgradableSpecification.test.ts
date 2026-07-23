import { describe, expect, it, vi } from "vitest";
import { UpgradableSpecification } from "../specifications/upgradableSpecification.js";
import { Quality } from "../../qualities/quality.js";
import { newQualityModel } from "../../qualities/qualityModel.js";
import { Revision } from "../../qualities/revision.js";
import type { IConfigService } from "../../config/configService.js";
import { getDefaultQualities, makeQualityProfile } from "./testFixtures.js";

function makeConfigService(
  downloadPropersAndRepacks: IConfigService["downloadPropersAndRepacks"] = "PreferAndUpgrade"
): IConfigService {
  return { downloadPropersAndRepacks } as IConfigService;
}

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/CutoffSpecificationFixture.cs (which -- despite the file name -- tests UpgradableSpecification.CutoffNotMet). */
describe("UpgradableSpecification.cutoffNotMet", () => {
  it("should_return_true_if_current_book_is_less_than_cutoff", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.Unknown, new Revision({ version: 2 }))],
      []
    );

    expect(result).toBe(true);
  });

  it("should_return_false_if_current_book_is_equal_to_cutoff", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.MP3, new Revision({ version: 2 }))],
      []
    );

    expect(result).toBe(false);
  });

  it("should_return_false_if_current_book_is_greater_than_cutoff", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.AZW3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.MP3, new Revision({ version: 2 }))],
      []
    );

    expect(result).toBe(false);
  });

  it("should_return_true_when_new_book_is_proper_but_existing_is_not", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.MP3, new Revision({ version: 1 }))],
      [],
      newQualityModel(Quality.MP3, new Revision({ version: 2 }))
    );

    expect(result).toBe(true);
  });

  it("should_return_false_if_cutoff_is_met_and_quality_is_higher", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.MP3, new Revision({ version: 2 }))],
      [],
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );

    expect(result).toBe(false);
  });

  it("should_return_true_if_cutoffs_are_met_but_is_a_revision_upgrade", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.MP3.id,
      items: getDefaultQualities(),
      upgradeAllowed: true,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.FLAC, new Revision({ version: 1 }))],
      [],
      newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
    );

    expect(result).toBe(true);
  });

  it("should_return_false_if_quality_profile_does_not_allow_upgrades_but_cutoff_is_set_to_highest_quality", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    const profile = makeQualityProfile({
      cutoff: Quality.FLAC.id,
      items: getDefaultQualities(),
      upgradeAllowed: false,
    });

    const result = subject.cutoffNotMet(
      profile,
      [newQualityModel(Quality.Unknown, new Revision({ version: 1 }))],
      [],
      newQualityModel(Quality.MP3, new Revision({ version: 2 }))
    );

    expect(result).toBe(false);
  });
});

/** Ported from NzbDrone.Core.Test/DecisionEngineTests/UpgradeSpecificationFixture.cs. */
describe("UpgradableSpecification.isUpgradable", () => {
  const isUpgradeTestCases: Array<
    [typeof Quality.AZW3, number, typeof Quality.AZW3, number, boolean]
  > = [
    [Quality.AZW3, 1, Quality.AZW3, 2, true],
    [Quality.MP3, 1, Quality.MP3, 2, true],
    [Quality.MP3, 1, Quality.MP3, 1, false],
    [Quality.MP3, 1, Quality.AZW3, 2, false],
    [Quality.MP3, 1, Quality.AZW3, 2, false],
    [Quality.MP3, 1, Quality.MP3, 1, false],
  ];

  it.each(isUpgradeTestCases)(
    "IsUpgradeTest: %s v%s -> %s v%s = %s",
    (current, currentVersion, newQuality, newVersion, expected) => {
      const subject = new UpgradableSpecification(makeConfigService("PreferAndUpgrade"));
      const profile = makeQualityProfile({ upgradeAllowed: true, items: getDefaultQualities() });

      const result = subject.isUpgradable(
        profile,
        newQualityModel(current, new Revision({ version: currentVersion })),
        [],
        newQualityModel(newQuality, new Revision({ version: newVersion })),
        []
      );

      expect(result).toBe(expected);
    }
  );

  it("should_return_true_if_proper_and_download_propers_is_do_not_download", () => {
    const subject = new UpgradableSpecification(makeConfigService("DoNotUpgrade"));
    const profile = makeQualityProfile({ items: getDefaultQualities() });

    const result = subject.isUpgradable(
      profile,
      newQualityModel(Quality.MP3, new Revision({ version: 1 })),
      [],
      newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      []
    );

    expect(result).toBe(true);
  });

  it("should_return_false_if_proper_and_autoDownloadPropers_is_do_not_prefer", () => {
    const subject = new UpgradableSpecification(makeConfigService("DoNotPrefer"));
    const profile = makeQualityProfile({ items: getDefaultQualities() });

    const result = subject.isUpgradable(
      profile,
      newQualityModel(Quality.MP3, new Revision({ version: 1 })),
      [],
      newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      []
    );

    expect(result).toBe(false);
  });
});

describe("UpgradableSpecification.isRevisionUpgrade", () => {
  it("returns true only when quality matches and revision compares greater", () => {
    const subject = new UpgradableSpecification(makeConfigService());

    expect(
      subject.isRevisionUpgrade(
        newQualityModel(Quality.MP3, new Revision({ version: 1 })),
        newQualityModel(Quality.MP3, new Revision({ version: 2 }))
      )
    ).toBe(true);

    // Different quality: never a "revision" upgrade even if the revision number is higher.
    expect(
      subject.isRevisionUpgrade(
        newQualityModel(Quality.MP3, new Revision({ version: 1 })),
        newQualityModel(Quality.FLAC, new Revision({ version: 2 }))
      )
    ).toBe(false);
  });
});

describe("UpgradableSpecification.isUpgradeAllowed", () => {
  it("allows upgrade when profile allows upgrades and quality is an upgrade", () => {
    const subject = new UpgradableSpecification(makeConfigService("PreferAndUpgrade"));
    const profile = makeQualityProfile({ upgradeAllowed: true, items: getDefaultQualities() });

    const result = subject.isUpgradeAllowed(
      profile,
      newQualityModel(Quality.MP3),
      [],
      newQualityModel(Quality.FLAC),
      []
    );

    expect(result).toBe(true);
  });

  it("blocks upgrade when profile does not allow upgrades", () => {
    const subject = new UpgradableSpecification(makeConfigService("PreferAndUpgrade"));
    const profile = makeQualityProfile({ upgradeAllowed: false, items: getDefaultQualities() });

    const result = subject.isUpgradeAllowed(
      profile,
      newQualityModel(Quality.MP3),
      [],
      newQualityModel(Quality.FLAC),
      []
    );

    expect(result).toBe(false);
  });

  it("stays true when neither quality nor custom format changed (no upgrade attempted)", () => {
    const subject = new UpgradableSpecification(makeConfigService("PreferAndUpgrade"));
    const profile = makeQualityProfile({ upgradeAllowed: false, items: getDefaultQualities() });

    const result = subject.isUpgradeAllowed(
      profile,
      newQualityModel(Quality.MP3),
      [],
      newQualityModel(Quality.MP3),
      []
    );

    expect(result).toBe(true);
  });
});

describe("UpgradableSpecification.qualityCutoffNotMet", () => {
  it("uses FirstAllowedQuality as the effective cutoff when upgrades are disabled", () => {
    const subject = new UpgradableSpecification(makeConfigService());
    // Unknown is not allowed, MOBI is the first allowed quality.
    const profile = makeQualityProfile({
      upgradeAllowed: false,
      cutoff: Quality.FLAC.id,
      items: getDefaultQualities(
        Quality.MOBI,
        Quality.EPUB,
        Quality.AZW3,
        Quality.MP3,
        Quality.FLAC
      ),
    });

    // Current quality (MOBI) is at the first-allowed quality already -- cutoff (effectively MOBI, not FLAC) is met.
    const result = subject.qualityCutoffNotMet(profile, newQualityModel(Quality.MOBI));
    expect(result).toBe(false);
  });
});

describe("UpgradableSpecification config dependency", () => {
  it("reads downloadPropersAndRepacks from the injected config service", () => {
    const getter = vi.fn(() => "DoNotPrefer" as const);
    const configService = {
      get downloadPropersAndRepacks() {
        return getter();
      },
    } as unknown as IConfigService;
    const subject = new UpgradableSpecification(configService);
    const profile = makeQualityProfile({ items: getDefaultQualities() });

    subject.isUpgradable(
      profile,
      newQualityModel(Quality.MP3, new Revision({ version: 1 })),
      [],
      newQualityModel(Quality.MP3, new Revision({ version: 2 })),
      []
    );

    expect(getter).toHaveBeenCalled();
  });
});
