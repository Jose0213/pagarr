/**
 * Builds a minimal, real, valid WAV file buffer that `node-taglib-sharp`
 * (and any real audio tool) can open, tag, and read back. No sample audio
 * file exists in this worktree to translate a fixture from -- the real C#
 * `AudioTagServiceFixture.cs` uses checked-in binary files
 * (`Files/Media/nin.{mp2,mp3,flac,m4a,wma,ape,opus}` in
 * NzbDrone.Core.Test) that aren't available here and wouldn't be
 * appropriate to fabricate byte-for-byte. WAV is used instead of MP3
 * because it has a trivially-constructible, fully-specified binary layout
 * (RIFF/fmt/data chunks) that doesn't require synthesizing valid MPEG
 * frame headers or Xiph/Vorbis bitstreams -- and `node-taglib-sharp`'s
 * generic `Tag`/`Properties` surface (which is what AudioTag.ts's common
 * fields, and the ID3v2-specific branch, actually exercise) behaves
 * identically on a WAV file as on any other tagged format.
 */
export function buildSilentWav(
  options: { sampleRate?: number; durationSeconds?: number } = {}
): Buffer {
  const sampleRate = options.sampleRate ?? 8000;
  const durationSeconds = options.durationSeconds ?? 1;
  const bitsPerSample = 16;
  const channels = 1;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const numSamples = Math.round(sampleRate * durationSeconds);
  const dataSize = numSamples * blockAlign;

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  // Sample data left zero-filled (silence).

  return buf;
}
