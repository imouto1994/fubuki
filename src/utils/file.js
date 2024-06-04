const { glob } = require("glob");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const { pipeline } = require("stream/promises");
const crypto = require("crypto");
const pLimit = require("p-limit");

const { KEY_HEX, IV_HEX } = require("../constants");

function delay(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

// List file paths with given pattern
async function listFilePaths(pattern) {
  return await glob(pattern);
}

// List directory paths with given pattern
async function listDirectoryPaths(pattern) {
  const paths = await glob(pattern, { withFileTypes: true });
  return paths.filter((p) => p.isDirectory()).map((p) => p.fullpath());
}

async function isFilePathAvailable(filePath) {
  try {
    await fsPromises.access(
      filePath,
      fsPromises.constants.R_OK | fsPromises.constants.W_OK
    );
    return true;
  } catch {
    return false;
  }
}

// Delete files given list of file paths
const DELETE_WORKERS_COUNT = 10;
async function deleteFiles(filePaths) {
  const deletePoolLimit = pLimit(DELETE_WORKERS_COUNT);
  const deleteTasks = filePaths.map((filePath) =>
    deletePoolLimit(() => fsPromises.unlink(filePath))
  );
  await Promise.all(deleteTasks);
}

// Get size of a file given its file path
async function getFileSize(filePath) {
  const stats = await fsPromises.stat(filePath);
  return stats.size;
}

// Get size of a directory given the directory path
async function getDirectorySize(dirPath) {
  const dirPattern = dirPath;
  const paths = await glob(`${dirPattern}/*`, {
    withFileTypes: true,
  });
  const filePathsUnderDirectory = paths
    .filter((p) => !p.isDirectory())
    .map((p) => p.fullpath());
  let totalSize = 0;
  for (const filePathUnderDirectory of filePathsUnderDirectory) {
    const size = await getFileSize(filePathUnderDirectory);
    totalSize += size;
  }

  return totalSize;
}

// Get extension of a file given its file path
function getFileExtension(filePath) {
  return path.extname(filePath).substring(1);
}

// Get file name without extension of a file given its file path
function getFileNameWithoutExtension(filePath) {
  const fileExtension = getFileExtension(filePath);
  const fileName = path.basename(filePath);
  return fileName.replace(`.${fileExtension}`, "");
}

// Encrypt a file
const KEY = Buffer.from(KEY_HEX, "hex");
const IV = Buffer.from(IV_HEX, "hex");
async function encryptFile(srcFilePath, dstFilePath) {
  const cipher = crypto.createCipheriv("aes-256-cbc", KEY, IV);
  const input = fs.createReadStream(srcFilePath);
  const output = fs.createWriteStream(dstFilePath);
  await pipeline(input, cipher, output);
}

// Encrypt a string to a file
async function encryptStringToFile(string, dstFilePath) {
  const tempFilePath = `${path.dirname(
    dstFilePath
  )}/__temp__.${getFileExtension(dstFilePath)}`;
  fsPromises.writeFile(tempFilePath, string);

  // Delay 1 second for temporary file to be available
  await delay(1000);

  await encryptFile(tempFilePath, dstFilePath);
  await deleteFiles([tempFilePath]);
}

// Decrypt a file
async function decryptFile(srcFilePath, dstFilePath) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, IV);
  const input = fs.createReadStream(srcFilePath);
  const output = fs.createWriteStream(dstFilePath);
  await pipeline(input, decipher, output);
}

// Decrypt a file to a string
async function decryptFileToString(srcFilePath) {
  const tempFilePath = `${path.dirname(
    srcFilePath
  )}/__temp__.${getFileExtension(srcFilePath)}`;
  await decryptFile(srcFilePath, tempFilePath);

  // Delay 1 second for temporary file to be available
  await delay(1000);

  const fileContent = await fsPromises.readFile(tempFilePath);
  await deleteFiles([tempFilePath]);

  return fileContent;
}

module.exports = {
  decryptFile,
  decryptFileToString,
  deleteFiles,
  encryptFile,
  encryptStringToFile,
  getFileExtension,
  getFileNameWithoutExtension,
  getFileSize,
  getDirectorySize,
  isFilePathAvailable,
  listDirectoryPaths,
  listFilePaths,
};
