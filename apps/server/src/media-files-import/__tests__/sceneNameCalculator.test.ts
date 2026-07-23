import { describe, expect, it } from "vitest";
import { newLocalBook, type LocalBook } from "../../parser/model/localBook.js";
import { newParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import { getSceneName } from "../bookImport/sceneNameCalculator.js";

/**
 * Translated from
 * NzbDrone.Core.Test/MediaFiles/BookImport/GetSceneNameFixture.cs.
 */
describe("getSceneName", () => {
  const episodeName = "artist.title-album.title.FLAC-ingot";
  const seasonName = "artist.title-album.title.FLAC-ingot";

  function baseLocalBook(): LocalBook {
    const localBook = newLocalBook();
    localBook.path = "C:/Test/Music/Artist Title/01 Some Body Loves.mkv";
    return localBook;
  }

  it("should_use_download_client_item_title_as_scene_name", () => {
    const localBook = baseLocalBook();
    localBook.downloadClientBookInfo = { ...newParsedBookInfo(), releaseTitle: episodeName };

    expect(getSceneName(localBook)).toBe(episodeName);
  });

  it("should_not_use_download_client_item_title_as_scene_name_if_full_season", () => {
    const localBook = baseLocalBook();
    localBook.downloadClientBookInfo = {
      ...newParsedBookInfo(),
      releaseTitle: seasonName,
      discography: true,
    };
    localBook.path = `C:/Test/Unsorted TV/${seasonName}/${episodeName}`;

    expect(getSceneName(localBook)).toBeNull();
  });

  it("should_not_use_file_name_as_scenename_if_it_doesnt_look_like_scenename", () => {
    const localBook = baseLocalBook();
    localBook.path = `C:/Test/Unsorted TV/${episodeName}/aaaaa.mkv`;

    expect(getSceneName(localBook)).toBeNull();
  });

  it("should_not_use_folder_name_as_scenename_if_it_doesnt_look_like_scenename", () => {
    const localBook = baseLocalBook();
    localBook.path = `C:/Test/Unsorted TV/${episodeName}/aaaaa.mkv`;
    localBook.folderTrackInfo = { ...newParsedBookInfo(), releaseTitle: "aaaaa" };

    expect(getSceneName(localBook)).toBeNull();
  });

  it("should_not_use_folder_name_as_scenename_if_it_is_for_a_full_season", () => {
    const localBook = baseLocalBook();
    localBook.path = `C:/Test/Unsorted TV/${episodeName}/aaaaa.mkv`;
    localBook.folderTrackInfo = {
      ...newParsedBookInfo(),
      releaseTitle: seasonName,
      discography: true,
    };

    expect(getSceneName(localBook)).toBeNull();
  });

  it("should_not_use_folder_name_as_scenename_if_there_are_other_video_files", () => {
    const localBook = baseLocalBook();
    localBook.path = `C:/Test/Unsorted TV/${episodeName}/aaaaa.mkv`;
    localBook.folderTrackInfo = {
      ...newParsedBookInfo(),
      releaseTitle: seasonName,
      discography: false,
    };

    expect(getSceneName(localBook)).toBeNull();
  });

  it.each([".flac", ".par2", ".nzb"])(
    "should_remove_extension_from_nzb_title_for_scene_name (%s)",
    (extension) => {
      const localBook = baseLocalBook();
      localBook.downloadClientBookInfo = {
        ...newParsedBookInfo(),
        releaseTitle: episodeName + extension,
      };

      expect(getSceneName(localBook)).toBe(episodeName);
    }
  );
});
