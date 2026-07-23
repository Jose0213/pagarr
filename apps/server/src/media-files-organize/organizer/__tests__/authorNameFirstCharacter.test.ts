import { describe, expect, it } from "vitest";
import { FileNameBuilder } from "../fileNameBuilder.js";
import {
  makeAuthor,
  makeCustomFormatCalculationService,
  makeNamingConfig,
  makeNamingConfigService,
  makeQualityDefinitionService,
} from "./testHelpers.js";

/** Ported from NzbDrone.Core.Test/OrganizerTests/FileNameBuilderTests/AuthorNameFirstCharacterFixture.cs. */
describe("FileNameBuilder {Author NameFirstCharacter} (AuthorNameFirstCharacterFixture)", () => {
  function makeSubject(namingConfig: ReturnType<typeof makeNamingConfig>): FileNameBuilder {
    return new FileNameBuilder(
      makeNamingConfigService(namingConfig),
      makeQualityDefinitionService(),
      makeCustomFormatCalculationService([])
    );
  }

  it.each([
    ["The Mist", "M", "The Mist"],
    ["A", "A", "A"],
    ["30 Rock", "3", "30 Rock"],
  ])("should_get_expected_folder_name_back (%s)", (title, parent, child) => {
    const namingConfig = makeNamingConfig({
      renameBooks: true,
      authorFolderFormat: "{Author NameFirstCharacter}\\{Author Name}",
    });
    const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name: title } });

    expect(makeSubject(namingConfig).getAuthorFolder(author)).toBe(`${parent}/${child}`);
  });

  it("should_be_able_to_use_lower_case_first_character", () => {
    const namingConfig = makeNamingConfig({
      renameBooks: true,
      authorFolderFormat: "{author namefirstcharacter}\\{author name}",
    });
    const author = makeAuthor({ metadata: { ...makeAuthor().metadata!, name: "Westworld" } });

    expect(makeSubject(namingConfig).getAuthorFolder(author)).toBe("w/westworld");
  });
});
