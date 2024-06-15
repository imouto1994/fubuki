const fsPromises = require("fs/promises");
const path = require("path");

const {
  listDirectoryPaths,
  decryptFile,
  listFilePaths,
  getFileExtension,
  getFileNameWithoutExtension,
} = require("./utils/file");

const EXT_MAP = {
  gnp: "png",
  gpj: "jpg",
  gepj: "jpeg",
  fig: "gif",
  pbew: "webp",
};

// Decrypt legacy images
(async () => {
  const entryDirPaths = await listDirectoryPaths("decrypt_src/*");
  for (const entryDirPath of entryDirPaths) {
    const dirName = path.basename(entryDirPath);
    const distDirPath = `decrypt_dst/Chapter ${dirName}`;
    await fsPromises.mkdir(distDirPath);
    const imagePaths = await listFilePaths(
      `${entryDirPath}/*.{gnp,gpj,gepj,fig,pbew}`
    );
    for (const imagePath of imagePaths) {
      const ext = getFileExtension(imagePath);
      const name = getFileNameWithoutExtension(imagePath);
      if (name.startsWith("thumbnail")) {
        await decryptFile(imagePath, `${distDirPath}/cover.${EXT_MAP[ext]}`);
      } else {
        await decryptFile(imagePath, `${distDirPath}/${name}.${EXT_MAP[ext]}`);
      }
    }
  }
})();
