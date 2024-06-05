const path = require("path");

const {
  listDirectoryPaths,
  getDirectorySize,
  decryptFileToString,
  isFilePathAvailable,
} = require("./utils/file");
const { METADATA_JSON_FILE_NAME } = require("./constants");
const processImages = require("./pipelines/process-images");
const generateRepo = require("./pipelines/generate-repo");
const config = require("./config");
const logger = require("./utils/logger");
const { naturalCompare } = require("./utils/string");

const LIMIT_SIZE = config.limitSize || 1500 * 1000 * 1000;

(async () => {
  const ownerDirPaths = await listDirectoryPaths("content/*");

  ownerDirPaths.sort(naturalCompare);

  for (const ownerDirPath of ownerDirPaths) {
    const ownerName = path.basename(ownerDirPath);
    logger.info(`Processing owner "${ownerName}"...`);

    const ownerDirPattern = ownerDirPath;
    const entryDirPaths = await listDirectoryPaths(`${ownerDirPattern}/*`);

    entryDirPaths.sort(naturalCompare);

    let currentSize = 0;
    let currentEntryDirPaths = [];
    for (const entryDirPath of entryDirPaths) {
      const entryName = path.basename(entryDirPath);

      // Read metadata of entry
      let metadata;
      const metadataFilePath = `${entryDirPath}/${METADATA_JSON_FILE_NAME}`;
      const isMetadataFileAvailable = await isFilePathAvailable(
        metadataFilePath
      );
      if (isMetadataFileAvailable) {
        try {
          const metadataJSON = await decryptFileToString(metadataFilePath);
          metadata = JSON.parse(metadataJSON);
        } catch (err) {
          logger.error(
            err,
            `Failed to parse metadata file for entry "${entryName}"!`
          );
        }
      }

      // Process images of entry if needed
      if (metadata == null || !metadata.processed) {
        try {
          metadata = await processImages(entryDirPath);
        } catch (err) {
          logger.error(
            err,
            `Failed to process images for entry "${entryName}"!`
          );
          return;
        }
      }

      // Skip entry if the entry has already been deployed
      if (metadata.deployed) {
        continue;
      }

      const entrySize = await getDirectorySize(entryDirPath);
      if (currentSize === 0) {
        currentSize += entrySize;
        currentEntryDirPaths.push(entryDirPath);

        // Generate the repo right away
        // if the size of this single entry is already more than the limit
        if (currentSize > LIMIT_SIZE) {
          await generateRepo(ownerDirPath, currentEntryDirPaths);
          currentSize = 0;
          currentEntryDirPaths = [];
        }
      } else {
        if (currentSize + entrySize > LIMIT_SIZE) {
          // Generate repo if the size of the set of current entries
          // will exceed the limit if we add one more entry
          await generateRepo(ownerDirPath, currentEntryDirPaths);
          currentSize = entrySize;
          currentEntryDirPaths = [entryDirPath];
        } else {
          currentSize += entrySize;
          currentEntryDirPaths.push(entryDirPath);
        }
      }
    }

    // Generate repo for the set of remaining entries
    if (currentEntryDirPaths.length > 0) {
      await generateRepo(ownerDirPath, currentEntryDirPaths);
    }
  }
})();
