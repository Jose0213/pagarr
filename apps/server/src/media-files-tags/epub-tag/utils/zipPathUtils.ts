/** Ported from VersOne.Epub.Internal/ZipPathUtils.cs. */

/** Ported from `ZipPathUtils.GetDirectoryPath(string filePath)`. */
export function getDirectoryPath(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return "";
  }

  return filePath.substring(0, lastSlashIndex);
}

/** Ported from `ZipPathUtils.Combine(string directory, string fileName)`. */
export function combine(directory: string, fileName: string): string {
  if (!directory) {
    return fileName;
  }

  let dir = directory;
  let file = fileName;

  while (file.startsWith("../")) {
    const idx = dir.lastIndexOf("/");
    dir = idx > 0 ? dir.substring(0, idx) : "";
    file = file.substring(3);
  }

  return dir === "" ? file : `${dir}/${file}`;
}
