import { describe, expect, it } from "vitest";
import { NzbValidationService } from "../nzbValidationService.js";
import { InvalidNzbException } from "../invalidNzbException.js";

/** Ported (in spirit) from NzbDrone.Core.Test/Download/NzbValidationServiceFixture.cs. */
describe("NzbValidationService", () => {
  const subject = new NzbValidationService();

  it("accepts a valid nzb with at least one file", () => {
    const xml = `<?xml version="1.0" encoding="iso-8859-1"?>
<nzb xmlns="http://www.newzbin.com/DTD/2003/nzb">
  <file poster="x" date="1" subject="Some Book">
    <groups><group>alt.binaries.books</group></groups>
    <segments><segment bytes="1" number="1">abc</segment></segments>
  </file>
</nzb>`;

    expect(() => subject.validate("test.nzb", xml)).not.toThrow();
  });

  it("rejects an nzb with no files", () => {
    const xml = `<?xml version="1.0"?><nzb xmlns="http://www.newzbin.com/DTD/2003/nzb"></nzb>`;

    expect(() => subject.validate("empty.nzb", xml)).toThrow(InvalidNzbException);
    expect(() => subject.validate("empty.nzb", xml)).toThrow(/No files/);
  });

  it("rejects a document whose root element isn't 'nzb'", () => {
    const xml = `<?xml version="1.0"?><rss><channel /></rss>`;

    expect(() => subject.validate("wrong-root.nzb", xml)).toThrow(/Unexpected root element/);
  });

  it("rejects nZEDb's malformed <error> root with a specific indexer-error message", () => {
    const xml = `<?xml version="1.0"?><error code="503" description="Service Unavailable" />`;

    expect(() => subject.validate("error.nzb", xml)).toThrow(
      /Contains indexer error: 503 - Service Unavailable/
    );
  });

  it("rejects unparseable content", () => {
    expect(() => subject.validate("garbage.nzb", "not xml at all <<<")).toThrow(
      InvalidNzbException
    );
  });
});
