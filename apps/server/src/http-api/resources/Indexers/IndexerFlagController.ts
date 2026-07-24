import { Router } from "express";
import { IndexerFlags } from "../../../indexers/releaseInfo.js";
import { createIndexerFlagResource } from "./IndexerFlagResource.js";

/**
 * Ported from Readarr.Api.V1/Indexers/IndexerFlagController.cs.
 *
 * ```csharp
 * [HttpGet]
 * public List<IndexerFlagResource> GetAll()
 * {
 *     return Enum.GetValues(typeof(IndexerFlags)).Cast<IndexerFlags>().Select(f => new IndexerFlagResource
 *     {
 *         Id = (int)f,
 *         Name = f.ToString()
 *     }).ToList();
 * }
 * ```
 *
 * `Enum.GetValues` enumerates in the enum's declared member order (matches
 * .NET's documented behavior for `Enum.GetValues` on a `[Flags]` enum: the
 * underlying values are returned in the order the members were declared in
 * source, NOT sorted numerically) -- ported here as a literal array in the
 * same declaration order as `indexers/releaseInfo.ts`'s `IndexerFlags` const
 * object (Freeleech, Halfleech, DoubleUpload, Internal, Scene, Freeleech75,
 * Freeleech25), which itself preserves the real C# enum's declared order.
 */
export function indexerFlagController(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const result = [
      createIndexerFlagResource(IndexerFlags.Freeleech, "Freeleech"),
      createIndexerFlagResource(IndexerFlags.Halfleech, "Halfleech"),
      createIndexerFlagResource(IndexerFlags.DoubleUpload, "DoubleUpload"),
      createIndexerFlagResource(IndexerFlags.Internal, "Internal"),
      createIndexerFlagResource(IndexerFlags.Scene, "Scene"),
      createIndexerFlagResource(IndexerFlags.Freeleech75, "Freeleech75"),
      createIndexerFlagResource(IndexerFlags.Freeleech25, "Freeleech25"),
    ];

    // Ported: `IndexerFlagResource.Id` overrides the base `[JsonIgnore(...
    // WhenWritingDefault)]` with `[JsonProperty(DefaultValueHandling =
    // DefaultValueHandling.Include)]` -- id is ALWAYS serialized, so this
    // route does NOT run results through `stripDefaultId()` (see
    // IndexerFlagResource.ts's doc comment).
    res.json(result);
  });

  return router;
}
