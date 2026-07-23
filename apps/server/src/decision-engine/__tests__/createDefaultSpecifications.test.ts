import { describe, expect, it, vi } from "vitest";
import {
  createDefaultSpecifications,
  type DecisionEngineDependencies,
} from "../createDefaultSpecifications.js";

/**
 * No C# equivalent exists for this factory (it stands in for the DI
 * container's reflection-based assembly scan -- see this file's own header
 * comment). This is a smoke test proving every real C# `IDecisionEngineSpecification`
 * concrete class is represented exactly once in the explicit array, matching
 * this port's "explicit over reflection" approach.
 */
describe("createDefaultSpecifications", () => {
  function makeDeps(): DecisionEngineDependencies {
    return {
      configService: {
        downloadPropersAndRepacks: "PreferAndUpgrade",
      } as DecisionEngineDependencies["configService"],
      delayProfileService: {
        bestForTags: vi.fn(),
      } as unknown as DecisionEngineDependencies["delayProfileService"],
      releaseProfileService: {
        enabledForTags: vi.fn(() => []),
      } as unknown as DecisionEngineDependencies["releaseProfileService"],
      termMatcherService: {
        isMatch: vi.fn(),
      } as unknown as DecisionEngineDependencies["termMatcherService"],
      mediaFileService: { getFilesByBook: vi.fn(() => []) },
      historyService: { mostRecentForBook: vi.fn(() => null), getByBook: vi.fn(() => []) },
      queueService: { getQueue: vi.fn(() => []) },
      blocklistService: { blocklisted: vi.fn(() => false) },
      indexerFactory: {
        get: vi.fn(() => {
          throw new Error("not found");
        }),
      },
      indexerStatusService: { getBlockedProviders: vi.fn(() => []) },
      diskProvider: { fileExists: vi.fn(() => true) },
      pendingReleaseService: { oldestPendingRelease: vi.fn(() => null) },
      formatService: {
        parseCustomFormatForRemoteBook: vi.fn(() => []),
        parseCustomFormatForFile: vi.fn(() => []),
        parseCustomFormatForHistory: vi.fn(() => []),
      },
    };
  }

  it("builds exactly 30 specification instances (every real C# IDecisionEngineSpecification concrete class: 21 root-level + 6 RssSync + 3 Search; UpgradableSpecification itself is a shared dependency, not a specification)", () => {
    const specs = createDefaultSpecifications(makeDeps());
    expect(specs).toHaveLength(30);
  });

  it("every produced spec implements the IDecisionEngineSpecification shape (priority, type, isSatisfiedBy)", () => {
    const specs = createDefaultSpecifications(makeDeps());

    for (const spec of specs) {
      expect(typeof spec.priority).toBe("number");
      expect(typeof spec.type).toBe("number");
      expect(typeof spec.isSatisfiedBy).toBe("function");
    }
  });

  it("produces distinct constructor names for every entry (no duplicated specification)", () => {
    const specs = createDefaultSpecifications(makeDeps());
    const names = specs.map((s) => s.constructor.name);

    expect(new Set(names).size).toBe(names.length);
  });
});
