const fsPromises = require("fs/promises");
const path = require("path");

const { METADATA_JSON_FILE_NAME } = require("../constants");
const { decryptFileToString, encryptStringToFile } = require("../utils/file");
const { getRandomString, encodeSlug, slug } = require("../utils/string");
const {
  createRepoFromTemplate,
  getAllRepos,
  enableGithubPage,
  getAuthenticatedUser,
} = require("../utils/github");
const { cloneRepo, commitAndPush, configureGitUser } = require("../utils/git");
const logger = require("../utils/logger");
const config = require("../config");

const TEMPLATE_OWNER = "imouto1994";
const TEMPLATE_REPO_NAME = "shirogane";

async function generateRepo(ownerDirPath, entryDirPaths) {
  const entryNames = entryDirPaths
    .map((entryDirPath) => `"${path.basename(entryDirPath)}"`)
    .join(", ");
  const owner = path.basename(ownerDirPath);
  const ownerSlug = encodeSlug(slug(owner));

  logger.info(`Generating repo for "${owner}" of entries: ${entryNames}...`);

  // Initialize metadata for owner
  const ownerMetadata = {
    name: owner,
    entries: [],
  };

  // Fetch Github user
  let authenticatedUser;
  try {
    authenticatedUser = await getAuthenticatedUser();
  } catch (err) {
    logger.error(err, `Failed to fetch Github authenticated user!`);
    throw err;
  }

  // Create repo from template
  let repos = [];
  try {
    repos = await getAllRepos();
  } catch (err) {
    logger.error(
      err,
      `Failed to fetch all repos of Github authenticated user!`
    );
    throw err;
  }

  const ownerRegex = new RegExp(`^${ownerSlug}-(\\d+)$`);
  const matchedRepos = repos.filter((repo) => ownerRegex.test(repo.name));
  let maxIndex = 0;
  for (const matchedRepo of matchedRepos) {
    const [, indexStr] = matchedRepo.name.match(ownerRegex);
    const index = parseInt(indexStr, 10);
    maxIndex = Math.max(maxIndex, index);
  }
  const repoName = `${ownerSlug}-${maxIndex + 1}`;

  logger.info(`Creating Github repo "${repoName}" from template...`);
  try {
    await createRepoFromTemplate(TEMPLATE_OWNER, TEMPLATE_REPO_NAME, repoName);
  } catch (err) {
    logger.error(err, `Failed to create repo "${repoName}" from template!`);
    throw err;
  }

  // Enable Github Pages
  logger.info(`Enabling Github Pages for repo "${repoName}"...`);
  try {
    await enableGithubPage(authenticatedUser.login, repoName);
  } catch (err) {
    logger.error(err, `Failed to enable Github Pages for repo "${repoName}"!`);
    throw err;
  }

  // Clone repo
  logger.info(`Cloning repo "${repoName}"...`);
  try {
    await cloneRepo(
      path.resolve(process.cwd(), "./projects"),
      `https://${config.githubToken}@github.com/${authenticatedUser.login}/${repoName}.git`
    );
  } catch (err) {
    logger.error(err, `Failed to clone repo "${repoName}"!`);
    throw err;
  }

  const repoDirPath = path.resolve(process.cwd(), `./projects/${repoName}`);
  const repoAssetsDirPath = path.resolve(repoDirPath, "./public");

  // Copy entries to repo
  logger.info(`Copy images of entries to repo "${repoName}"...`);
  for (const entryDirPath of entryDirPaths) {
    const entryMetadataFilePath = `${entryDirPath}/${METADATA_JSON_FILE_NAME}`;
    const entryMetadataJSON = await decryptFileToString(entryMetadataFilePath);
    const entryMetadata = JSON.parse(entryMetadataJSON);

    for (const cover of entryMetadata.covers) {
      const [coverName] = cover;
      const hash = getRandomString();
      const targetCoverDirPath = path.resolve(repoAssetsDirPath, `./${hash}`);
      const targetCoverPath = `${targetCoverDirPath}/${coverName}`;
      await fsPromises.mkdir(targetCoverDirPath);
      await fsPromises.copyFile(
        `${entryDirPath}/${coverName}`,
        targetCoverPath
      );
      cover[0] = `${hash}/${coverName}`;
    }

    for (const thumbnail of entryMetadata.thumbnails) {
      const [thumbnailName] = thumbnail;
      const hash = getRandomString();
      const targetThumbnailDirPath = path.resolve(
        repoAssetsDirPath,
        `./${hash}`
      );
      const targetThumbnailPath = `${targetThumbnailDirPath}/${thumbnailName}`;
      await fsPromises.mkdir(targetThumbnailDirPath);
      await fsPromises.copyFile(
        `${entryDirPath}/${thumbnailName}`,
        targetThumbnailPath
      );
      thumbnail[0] = `${hash}/${thumbnailName}`;
    }

    for (const page of entryMetadata.pages) {
      const [pageName] = page;
      const hash = getRandomString();
      const targetPageDirPath = path.resolve(repoAssetsDirPath, `./${hash}`);
      const targetPagePath = `${targetPageDirPath}/${pageName}`;
      await fsPromises.mkdir(targetPageDirPath);
      await fsPromises.copyFile(`${entryDirPath}/${pageName}`, targetPagePath);
      page[0] = `${hash}/${pageName}`;
    }
    ownerMetadata.entries.push(entryMetadata);
  }

  // Save metadata of all entries
  await encryptStringToFile(
    JSON.stringify(ownerMetadata),
    `${repoAssetsDirPath}/${METADATA_JSON_FILE_NAME}`
  );

  // Commit & Push
  logger.info(`Commiting and pushing entries for repo "${repoName}"...`);
  try {
    await configureGitUser(
      repoDirPath,
      authenticatedUser.name,
      authenticatedUser.email
    );
    await commitAndPush(repoDirPath, "Add WebAssembly scripts");
  } catch (err) {
    logger.error(
      err,
      `Failed to commit and push entries for repo "${repoName}"!`
    );
    throw err;
  }

  // Update `deployed` flags for the entries
  for (const entryDirPath of entryDirPaths) {
    const entryMetadataFilePath = `${entryDirPath}/${METADATA_JSON_FILE_NAME}`;
    const entryMetadataJSON = await decryptFileToString(entryMetadataFilePath);
    const entryMetadata = JSON.parse(entryMetadataJSON);

    // Update `deployed` flag
    entryMetadata.deployed = true;

    await encryptStringToFile(
      JSON.stringify(entryMetadata),
      entryMetadataFilePath
    );
  }

  logger.info(
    `Generated repo successfully for "${owner}" of entries: ${entryNames}!`
  );
}

module.exports = generateRepo;
