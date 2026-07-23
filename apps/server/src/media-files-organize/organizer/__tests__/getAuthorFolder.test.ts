import { describe, expect, it } from "vitest";
import { FileNameBuilder } from "../fileNameBuilder.js";
import {
  makeAuthor,
  makeCustomFormatCalculationService,
  makeNamingConfig,
  makeNamingConfigService,
  makeQualityDefinitionService,
} from "./testHelpers.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/GetAuthorFolderFixture.cs. */
describe("FileNameBuilder.getAuthorFolder (GetAuthorFolderFixture)", () => {
  it.each([
    ["Avenged Sevenfold", "{Author Name}", "Avenged Sevenfold"],
    ["Avenged Sevenfold", "{Author.Name}", "Avenged.Sevenfold"],
    ["AC/DC", "{Author Name}", "AC+DC"],
    ["In the Woods...", "{Author.Name}", "In.the.Woods"],
    ["3OH!3", "{Author.Name}", "3OH!3"],
    ["Avenged Sevenfold", ".{Author.Name}.", "Avenged.Sevenfold"],
  ])(
    "should_use_authorFolderFormat_to_build_folder_name (%s / %s)",
    (authorName, format, expected) => {
      const namingConfig = makeNamingConfig({ authorFolderFormat: format });
      const subject = new FileNameBuilder(
        makeNamingConfigService(namingConfig),
        makeQualityDefinitionService(),
        makeCustomFormatCalculationService([])
      );

      const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name: authorName } });

      expect(subject.getAuthorFolder(author)).toBe(expected);
    }
  );
});
