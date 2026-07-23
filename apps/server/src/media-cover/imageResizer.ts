import sharp from "sharp";

/**
 * Ported from NzbDrone.Core/MediaCover/ImageResizer.cs.
 *
 * NEW DEPENDENCY: `sharp` (added to apps/server/package.json). The C#
 * source uses SixLabors.ImageSharp (`Image.Load` / `image.Mutate(x => x.
 * Resize(0, height))` / `image.Save`, plus a one-time global JPEG-encoder
 * quality override). Node has no built-in raster-image decode/resize/
 * encode primitive, and no image library existed anywhere in this port
 * before this module (verified: no `sharp`/`jimp`/etc in either root or
 * server package.json). `sharp` is the standard, actively-maintained
 * choice for server-side Node image processing (libvips-backed, fast,
 * widely used) -- picked per this module's task brief ("pick a reasonable
 * widely-used one").
 *
 * DEVIATIONS from the C# source:
 *  - `_enabled` field: C# hardcodes `_enabled = true` in the constructor
 *    with no code path that ever sets it false (dead code left over from
 *    presumably an older config toggle) -- ported faithfully as an
 *    always-true guard rather than dropped, since "preserve real C# quirks
 *    faithfully" applies to harmless dead code the same as behavioral
 *    quirks; a reader diffing against the original will find the same
 *    always-true-in-practice branch in both.
 *  - The global JPEG quality-92 encoder override
 *    (`SixLabors.ImageSharp.Configuration.Default.ImageFormatsManager.
 *    SetEncoder(JpegFormat.Instance, new JpegEncoder { Quality = 92 }))`
 *    is process-global mutable state in C# (set once per `ImageResizer`
 *    construction, affecting every subsequent `Image.Save` anywhere in the
 *    process, not just this class's own resizes). `sharp` has no equivalent
 *    global default -- quality is a per-call encode option. Ported as a
 *    `JPEG_QUALITY = 92` constant applied via `.jpeg({ quality: 92 })` on
 *    every resize this class performs, which reproduces the *effective*
 *    behavior (every image this class saves is JPEG-quality-92) without
 *    the global-mutable-state side effect leaking to unrelated code paths
 *    -- nothing else in this port calls an image encoder, so there's no
 *    other call site whose behavior the C# global override was actually
 *    affecting anyway.
 *  - Output format: `image.Save(destination)` infers format from the
 *    destination file's extension (ImageSharp's convention). `sharp`
 *    likewise infers output format from the destination extension when
 *    using `.toFile()`, so this is a faithful match -- the JPEG-quality
 *    option above only takes effect when the inferred output format is
 *    actually JPEG (matching the C# original, where the quality-92
 *    override on `JpegFormat.Instance`'s encoder is likewise a no-op for
 *    non-JPEG output).
 *  - Resize semantics: C#'s `x.Resize(0, height)` -- width 0 means
 *    "auto-calculate width to preserve aspect ratio, fixed output height".
 *    `sharp(...).resize({ height })` with no `width` given does exactly
 *    this by default (aspect ratio preserved, `fit` only matters when both
 *    dimensions are given) -- no explicit `fit` option needed/used.
 */

export interface ImageResizerDiskProviderLike {
  fileExists(path: string): boolean;
  deleteFile(path: string): void;
}

const JPEG_QUALITY = 92;

export interface IImageResizer {
  resize(source: string, destination: string, height: number): Promise<void>;
}

export class ImageResizer implements IImageResizer {
  /** Ported from the C# `_enabled` field -- see class doc comment on why this is preserved as an always-true dead-code guard. */
  private readonly enabled = true;

  constructor(private readonly diskProvider: ImageResizerDiskProviderLike) {}

  async resize(source: string, destination: string, height: number): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await sharp(source).resize({ height }).jpeg({ quality: JPEG_QUALITY }).toFile(destination);
    } catch (err) {
      if (this.diskProvider.fileExists(destination)) {
        this.diskProvider.deleteFile(destination);
      }

      throw err;
    }
  }
}
