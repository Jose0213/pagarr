import { Router, type Request, type Response } from "express";
import { parseBookTitle } from "../../../parser/parser.js";
import type { ParsingService } from "../../../parser/parsingService.js";
import { authorToResource, booksToResource, type ParseResource } from "./ParseResource.js";

/**
 * Ported from Readarr.Api.V1/Parse/ParseController.cs.
 *
 * ```csharp
 * [HttpGet]
 * public ParseResource Parse(string title)
 * {
 *     if (title.IsNullOrWhiteSpace())
 *     {
 *         return null;
 *     }
 *
 *     var parsedBookInfo = Parser.ParseBookTitle(title);
 *
 *     if (parsedBookInfo == null)
 *     {
 *         return new ParseResource { Title = title };
 *     }
 *
 *     var remoteBook = _parsingService.Map(parsedBookInfo);
 *
 *     if (remoteBook != null)
 *     {
 *         return new ParseResource
 *         {
 *             Title = title,
 *             ParsedBookInfo = remoteBook.ParsedBookInfo,
 *             Author = remoteBook.Author.ToResource(),
 *             Books = remoteBook.Books.ToResource()
 *         };
 *     }
 *     else
 *     {
 *         return new ParseResource { Title = title, ParsedBookInfo = parsedBookInfo };
 *     }
 * }
 * ```
 *
 * `Parser.ParseBookTitle` -- the REAL, already-ported static parsing entry
 * point (`parser/parser.ts`'s `parseBookTitle`), not a forward reference.
 * `IParsingService.Map` -- the REAL, already-ported `parser/parsingService.ts`
 * `ParsingService.map`.
 *
 * ## `remoteBook != null` is unreachable in the real source, preserved as-is
 *
 * `ParsingService.Map` never returns `null` in the real C# source (its own
 * first statement is `var remoteBook = new RemoteBook { ParsedBookInfo =
 * parsedBookInfo };`, always a fresh instance) -- the `if (remoteBook !=
 * null)` branch's `else` (returning a bare `ParsedBookInfo`-only resource)
 * is therefore dead code in the original. This port's `ParsingService.map`
 * (parsingService.ts) matches that: it always returns a `RemoteBook`, never
 * `null` or `undefined`. Ported faithfully -- the null-check and its dead
 * `else` branch are kept verbatim below rather than simplified away, per
 * this port's "preserve documented, not fixed" mandate for known-dead
 * branches (distinguished here from an actual bug: this isn't wrong
 * behavior, just an unreachable branch, so nothing user-visible changes
 * either way -- kept for line-for-line fidelity with the real controller).
 *
 * ## `title.IsNullOrWhiteSpace() -> return null` -> HTTP response
 *
 * A C# controller action returning a bare `null` from an `[HttpGet]` method
 * serializes as a JSON `null` body with a 200 status (ASP.NET's default
 * `ObjectResult` handling for a null return value) -- ported here as
 * `res.json(null)`, not a 4xx, matching that exact behavior.
 */
export interface ParseControllerOptions {
  parsingService: ParsingService;
}

/**
 * Builds the `ParseController` Express router (`GET /` -- takes a raw
 * release title string via `?title=`, returns the parsed result).
 */
export function parseController(options: ParseControllerOptions): Router {
  const { parsingService } = options;

  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const title = typeof req.query["title"] === "string" ? req.query["title"] : "";

    if (title.trim() === "") {
      res.json(null);
      return;
    }

    const parsedBookInfo = parseBookTitle(title);

    if (parsedBookInfo === null) {
      const resource: ParseResource = { id: 0, title, parsedBookInfo: null };
      res.json(resource);
      return;
    }

    const remoteBook = parsingService.map(parsedBookInfo);

    // See this module's doc comment: `remoteBook` is never null/undefined
    // in this port either -- the `else` branch below is unreachable,
    // preserved for line-for-line fidelity with the real controller.
    if (remoteBook) {
      const resource: ParseResource = {
        id: 0,
        title,
        parsedBookInfo: remoteBook.parsedBookInfo,
        author: remoteBook.author ? authorToResource(remoteBook.author) : undefined,
        books: booksToResource(remoteBook.books),
      };
      res.json(resource);
      return;
    }

    const resource: ParseResource = { id: 0, title, parsedBookInfo };
    res.json(resource);
  });

  return router;
}
