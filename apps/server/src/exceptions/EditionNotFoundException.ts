/**
 * Ported from NzbDrone.Core/Exceptions/EditionNotFoundException.cs.
 *
 * NOT the same class as `metadata-source/errors.ts`'s
 * `EditionNotFoundException` -- see AuthorNotFoundException.ts's doc comment
 * for why both exist. This is the real `NzbDrone.Core.Exceptions` class,
 * "metadata server" wording preserved verbatim from the C# source.
 */
export class EditionNotFoundException extends Error {
  readonly foreignEditionId: string;

  constructor(foreignEditionId: string, message?: string, options?: { cause?: unknown }) {
    super(
      message ??
        `Edition with id ${foreignEditionId} was not found, it may have been removed from metadata server.`,
      options
    );
    this.name = "EditionNotFoundException";
    this.foreignEditionId = foreignEditionId;
    Object.setPrototypeOf(this, EditionNotFoundException.prototype);
  }
}
