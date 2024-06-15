const fsPromises = require("fs/promises");
const path = require("path");
const sizeOf = require("image-size");
const CWebp = require("cwebp").CWebp;
const DWebp = require("cwebp").DWebp;
const pLimit = require("p-limit");
const jimp = require("jimp");

const {
  COMPRESSED_FILE_PREFIX,
  ENLARGED_FILE_PREFIX,
  WAIFU2X_FILE_SUFFIX,
  EXTENSION_MAP,
  METADATA_JSON_FILE_NAME,
  FIELDS_SEPARATOR,
} = require("../constants");
const {
  deleteFiles,
  encryptFile,
  encryptStringToFile,
  getFileExtension,
  getFileNameWithoutExtension,
  getFileSize,
  listFilePaths,
} = require("../utils/file");
const {
  naturalCompare,
  padNumber,
  getRandomString,
} = require("../utils/string");
const { runCommand } = require("../utils/process");
const logger = require("../utils/logger");
const config = require("../config");

const ENTRY_TYPE = config.type ?? "manga";
const SKIP_UPSCALING = config.skipUpscaling ?? false;
const SKIP_AUTOCOVER = config.skipAutocover ?? false;
const ENLARGE_WORKERS_COUNTS = config.enlargeWorkersCounts || [2];
const ENLARGE_WORKERS_TOTAL = ENLARGE_WORKERS_COUNTS.reduce(
  (total, count) => total + count,
  0
);
const COMPRESS_WORKERS_COUNT = config.compressWorkersCount || 3;
const WAIFU2X_BIN_PATH = path.join(
  process.cwd(),
  "./bin/waifu2x/waifu2x-ncnn-vulkan.exe"
);
const MIN_WIDTH_SKIP_ENLARGE = 2048;
const IDEAL_PAGE_WIDTH = 2048;
const MAX_PAGE_WIDTH = 2560;
const IDEAL_COVER_WIDTH = 640;
const IDEAL_THUMBNAIL_WIDTH = 256;
const IDEAL_WEBTOON_PAGE_RATIO = config.idealWebtoonPageRatio || 1.5;

async function compressImage(
  imagePath,
  targetSuffix,
  enlargedTargetWidth,
  maximumWidth,
  quality = 100
) {
  const imageExtension = getFileExtension(imagePath);
  const imageDirPath = path.dirname(imagePath);
  const imageName = path.basename(imagePath);
  const targetFileNameWithoutExtension = `${COMPRESSED_FILE_PREFIX}_${targetSuffix}`;

  const newWebpImagePath = `${imageDirPath}/${targetFileNameWithoutExtension}.webp`;
  const { width } = sizeOf(imagePath);
  const encoder = new CWebp(imagePath);
  const isEnlargedImage = imageName.includes(WAIFU2X_FILE_SUFFIX);

  if (isEnlargedImage && width > enlargedTargetWidth) {
    // Always resize enlarged image to target ideal width
    encoder.resize(enlargedTargetWidth, 0);
  } else if (width > maximumWidth) {
    // For original image, we will only resize if it exceeds maximum width
    encoder.resize(maximumWidth, 0);
  }
  encoder.quality(quality);
  await encoder.write(newWebpImagePath);

  const webpFileSize = await getFileSize(newWebpImagePath);
  const originalFileSize = await getFileSize(imagePath);

  // Always use WebP image when the result size is smaller
  if (originalFileSize > webpFileSize) {
    return;
  }

  // Delete the WebP image & simply copy the image
  await deleteFiles([newWebpImagePath]);
  const targetImagePath = path.join(
    imageDirPath,
    `./${targetFileNameWithoutExtension}.${imageExtension}`
  );
  await fsPromises.copyFile(imagePath, targetImagePath);
}

const CURRENT_COUNTS = ENLARGE_WORKERS_COUNTS.map(() => 0);
async function enlargeImage(imagePath, targetSuffix) {
  const imageExtension = getFileExtension(imagePath);
  const imageDirPath = path.dirname(imagePath);
  const imageName = path.basename(imagePath);
  const { width } = sizeOf(imagePath);
  const targetFileName = `${ENLARGED_FILE_PREFIX}_${targetSuffix}`;

  if (width < MIN_WIDTH_SKIP_ENLARGE && !SKIP_UPSCALING) {
    // Need to enlarge the image
    const absoluteTargetImagePath = path.resolve(
      process.cwd(),
      imageDirPath,
      `${targetFileName}_${WAIFU2X_FILE_SUFFIX}.png`
    );
    const absoluteImagePath = path.resolve(process.cwd(), imagePath);
    const scale = width < MIN_WIDTH_SKIP_ENLARGE / 2 ? 4 : 2;

    let index = ENLARGE_WORKERS_COUNTS.length - 1;
    while (index >= 0) {
      if (CURRENT_COUNTS[index] < ENLARGE_WORKERS_COUNTS[index]) {
        CURRENT_COUNTS[index]++;
        break;
      } else {
        index--;
      }
    }

    if (index < 0) {
      throw new Error(
        `Failed to select a GPU for enlarging image ${imageName}!`
      );
    }

    try {
      logger.info(`Using GPU ${index} for image ${imageName}...`);
      await runCommand(
        `${WAIFU2X_BIN_PATH} -i "${absoluteImagePath}" -o "${absoluteTargetImagePath}" -n 0 -s ${scale} -g ${index} -t 200 -m models-cunet -f png`
      );
      CURRENT_COUNTS[index]--;
      await fsPromises.access(absoluteTargetImagePath);
    } catch (err) {
      logger.error(
        err,
        `Failed to enlarge image ${imageName} with Waifu2x at scale x${scale}!`
      );
      throw err;
    }
  } else {
    // Simply copy the image
    const targetImagePath = path.join(
      imageDirPath,
      `./${targetFileName}.${imageExtension}`
    );
    await fsPromises.copyFile(imagePath, targetImagePath);
  }
}

async function cropImage(imagePath) {
  const imageExtension = getFileExtension(imagePath);
  const imageDirPath = path.dirname(imagePath);
  const imageNameWithoutExtension = getFileNameWithoutExtension(imagePath);
  const { width, height } = sizeOf(imagePath);

  if (ENTRY_TYPE !== "webtoon") {
    return;
  }

  if (height / width < IDEAL_WEBTOON_PAGE_RATIO) {
    return;
  }

  let srcImagePath = imagePath;

  // Convert to PNG since JIMP can't handle WebP
  if (imageExtension === "webp") {
    srcImagePath = path.resolve(
      imageDirPath,
      `./${imageNameWithoutExtension}.png`
    );
    const decoder = new DWebp(imagePath);
    await decoder.write(srcImagePath);
  }

  const idealPageHeight = Math.floor(width * IDEAL_WEBTOON_PAGE_RATIO);
  const numCrops = Math.ceil(height / idealPageHeight);
  for (let i = 0; i < numCrops; i++) {
    const image = await jimp.read(srcImagePath);
    const cropHeight =
      i !== numCrops - 1 ? idealPageHeight : height - i * idealPageHeight;
    image.crop(0, i * idealPageHeight, width, cropHeight);
    await image.write(
      `${imageDirPath}/${imageNameWithoutExtension}_cropped_${padNumber(
        i + 1
      )}.png`
    );
  }
  await deleteFiles([
    imagePath,
    ...(srcImagePath !== imagePath ? [srcImagePath] : []),
  ]);
}

async function processImages(entryDirPath) {
  const entryDirPattern = entryDirPath;
  const entryName = path.basename(entryDirPath);
  logger.info(`Processing entry "${entryName}"...`);

  let imagePaths = await listFilePaths(
    `${entryDirPattern}/*.{png,jpg,jpeg,gif,webp}`
  );

  // Sort image paths in natural order
  imagePaths.sort((pathA, pathB) =>
    naturalCompare(
      getFileNameWithoutExtension(pathA),
      getFileNameWithoutExtension(pathB)
    )
  );

  // Separate image paths to 2 sections: Pages, Covers
  let coverPaths = imagePaths.filter((imagePath) =>
    path.basename(imagePath).startsWith("cover")
  );
  imagePaths = imagePaths.filter(
    (imagePath) => !coverPaths.includes(imagePath)
  );

  // Crop images (if needed)
  logger.info(`Cropping images (if needed) under entry "${entryName}"...`);
  for (const imagePath of imagePaths) {
    await cropImage(imagePath);
  }

  // Get list of images again after cropping
  imagePaths = await listFilePaths(
    `${entryDirPattern}/*.{png,jpg,jpeg,gif,webp}`
  );

  // Sort image paths in natural order
  imagePaths.sort((pathA, pathB) =>
    naturalCompare(
      getFileNameWithoutExtension(pathA),
      getFileNameWithoutExtension(pathB)
    )
  );

  // Separate image paths to 2 sections: Pages, Covers
  coverPaths = imagePaths.filter((imagePath) =>
    path.basename(imagePath).startsWith("cover")
  );
  imagePaths = imagePaths.filter(
    (imagePath) => !coverPaths.includes(imagePath)
  );

  // No images found
  if (imagePaths.length === 0) {
    logger.warn(`No images found under entry "${entryName}"!`);
    return;
  }

  // Automatically create cover (if needed) by using the first image
  let autoCoverPath;
  if (coverPaths.length === 0 && !SKIP_AUTOCOVER) {
    const firstImagePath = imagePaths[0];
    const firstFileExtension = getFileExtension(firstImagePath);
    autoCoverPath = path.join(entryDirPath, `./cover.${firstFileExtension}`);
    await fsPromises.copyFile(firstImagePath, autoCoverPath);
    coverPaths.push(autoCoverPath);
  }

  // Enlarge images (if needed)
  logger.info(`Enlarging images (if needed) under entry "${entryName}"...`);
  let enlargeError;
  const enlargePoolLimit = pLimit(ENLARGE_WORKERS_TOTAL);
  const enlargeTasks = [
    ...imagePaths.map((imagePath, index) =>
      enlargePoolLimit(() => enlargeImage(imagePath, padNumber(index + 1)))
    ),
    ...coverPaths.map((coverPath, index) =>
      enlargePoolLimit(() =>
        enlargeImage(coverPath, `cover_${padNumber(index + 1)}`)
      )
    ),
  ];
  try {
    await Promise.all(enlargeTasks);
  } catch (err) {
    enlargeError = err;
  }

  let enlargedImagePaths = await listFilePaths(
    `${entryDirPattern}/${ENLARGED_FILE_PREFIX}_*.{png,jpg,jpeg,gif,webp}`
  );

  if (enlargeError != null) {
    logger.error(
      enlargeError,
      `Failed to enlarge all images under entry "${entryName}"!`
    );
    await deleteFiles([
      ...enlargedImagePaths,
      ...(autoCoverPath != null ? [autoCoverPath] : []),
    ]);
    throw enlargeError;
  }

  // Sort enlarged image paths in natural order
  enlargedImagePaths.sort((pathA, pathB) =>
    naturalCompare(
      getFileNameWithoutExtension(pathA),
      getFileNameWithoutExtension(pathB)
    )
  );

  // Separate enlarged image paths to 2 sections: Pages, Covers
  const enlargedCoverPaths = enlargedImagePaths.filter((imagePath) =>
    path.basename(imagePath).startsWith(`${ENLARGED_FILE_PREFIX}_cover`)
  );
  enlargedImagePaths = enlargedImagePaths.filter(
    (imagePath) => !enlargedCoverPaths.includes(imagePath)
  );

  // Compress enlarged images & covers to WebP format and resize to ideal size
  logger.info(
    `Compressing & resizing enlarged images under entry "${entryName}"...`
  );
  let compressError;
  const compressPoolLimit = pLimit(COMPRESS_WORKERS_COUNT);
  const compressPageTasks = enlargedImagePaths.map((imagePath) =>
    compressPoolLimit(() =>
      compressImage(
        imagePath,
        getFileNameWithoutExtension(imagePath),
        IDEAL_PAGE_WIDTH,
        MAX_PAGE_WIDTH,
        100 // Page quality is always 100
      )
    )
  );
  const compressCoverTasks = enlargedCoverPaths.map((coverPath) =>
    compressPoolLimit(() =>
      compressImage(
        coverPath,
        getFileNameWithoutExtension(coverPath),
        IDEAL_COVER_WIDTH,
        IDEAL_COVER_WIDTH,
        config.coverQuality ?? 90 // Cover quality is defaulted to 90
      )
    )
  );
  const compressThumbnailTasks = enlargedImagePaths.map((imagePath) =>
    compressPoolLimit(() =>
      compressImage(
        imagePath,
        `thumbnail_${getFileNameWithoutExtension(imagePath)}`,
        IDEAL_THUMBNAIL_WIDTH,
        IDEAL_THUMBNAIL_WIDTH,
        config.thumbnailQuality ?? 75 // Thumbnail quality is defaulted to 75
      )
    )
  );

  try {
    await Promise.all([
      ...compressPageTasks,
      ...compressThumbnailTasks,
      ...compressCoverTasks,
    ]);
  } catch (err) {
    compressError = err;
  }

  let compressedImagePaths = await listFilePaths(
    `${entryDirPattern}/${COMPRESSED_FILE_PREFIX}_*`
  );

  if (compressError != null) {
    logger.error(
      compressError,
      `Failed to compress & resize all enlarged images under entry "${entryName}"!`
    );
    await deleteFiles([
      ...enlargedImagePaths,
      ...compressedImagePaths,
      ...(autoCoverPath != null ? [autoCoverPath] : []),
    ]);
    throw compressError;
  }

  // Delete original & enlarged images
  logger.info(
    `Cleaning up original images and enlarged images under entry "${entryName}"...`
  );
  await deleteFiles([
    ...imagePaths,
    ...enlargedImagePaths,
    ...enlargedCoverPaths,
    ...coverPaths,
  ]);

  // Sort compressed image paths in natural order
  compressedImagePaths.sort((pathA, pathB) =>
    naturalCompare(
      getFileNameWithoutExtension(pathA),
      getFileNameWithoutExtension(pathB)
    )
  );

  // Separate compressed image paths to 3 sections: Pages, Thumbnails, Covers
  const compressedCoverPaths = compressedImagePaths.filter((imagePath) =>
    path
      .basename(imagePath)
      .startsWith(`${COMPRESSED_FILE_PREFIX}_${ENLARGED_FILE_PREFIX}_cover`)
  );
  const compressedThumbnailPaths = compressedImagePaths.filter((imagePath) =>
    path.basename(imagePath).startsWith(`${COMPRESSED_FILE_PREFIX}_thumbnail`)
  );
  compressedImagePaths = compressedImagePaths.filter(
    (imagePath) =>
      !compressedCoverPaths.includes(imagePath) &&
      !compressedThumbnailPaths.includes(imagePath)
  );

  // Initialize metadata
  const [name, language, date] = entryName.split(FIELDS_SEPARATOR);
  const metadata = {
    id: getRandomString(),
    processed: true,
    deployed: false,
    name,
    language: language?.toUpperCase() ?? "EN",
    date: date ?? null,
    covers: [],
    thumbnails: [],
    pages: [],
  };

  logger.info(`Encrypting images under entry "${entryName}"...`);
  // Encrypt covers
  for (let i = 0; i < compressedCoverPaths.length; i++) {
    const coverPath = compressedCoverPaths[i];
    const { width, height } = sizeOf(coverPath);
    const coverExtension = getFileExtension(coverPath);
    const targetFileName = `c_${padNumber(i + 1)}.${
      EXTENSION_MAP[coverExtension]
    }`;
    await encryptFile(coverPath, `${entryDirPath}/${targetFileName}`);
    metadata.covers.push([targetFileName, width, height]);
  }

  // Encrypt thumbnails
  for (let i = 0; i < compressedThumbnailPaths.length; i++) {
    const thumbnailPath = compressedThumbnailPaths[i];
    const { width, height } = sizeOf(thumbnailPath);
    const thumbnailExtension = getFileExtension(thumbnailPath);
    const targetFileName = `t_${padNumber(i + 1)}.${
      EXTENSION_MAP[thumbnailExtension]
    }`;
    await encryptFile(thumbnailPath, `${entryDirPath}/${targetFileName}`);
    metadata.thumbnails.push([targetFileName, width, height]);
  }

  // Encrypt pages
  for (let i = 0; i < compressedImagePaths.length; i++) {
    const imagePath = compressedImagePaths[i];
    const { width, height } = sizeOf(imagePath);
    const imageExtension = getFileExtension(imagePath);
    const targetFileName = `p_${padNumber(i + 1)}.${
      EXTENSION_MAP[imageExtension]
    }`;
    await encryptFile(imagePath, `${entryDirPath}/${targetFileName}`);
    metadata.pages.push([targetFileName, width, height]);
  }

  // Save metadata to JSON
  await encryptStringToFile(
    JSON.stringify(metadata),
    `${entryDirPath}/${METADATA_JSON_FILE_NAME}`
  );

  // Delete compressed images
  logger.info(`Cleaning up compressed images under entry '${entryName}'...`);
  await deleteFiles([
    ...compressedImagePaths,
    ...compressedThumbnailPaths,
    ...compressedCoverPaths,
  ]);

  logger.info(`Processed images under entry '${entryName}' successfully!`);

  return metadata;
}

module.exports = processImages;
