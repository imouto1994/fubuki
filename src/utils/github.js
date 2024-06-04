const fetch = require("node-fetch");
const config = require("../config");
const logger = require("./logger");

const GITHUB_API_URL = "https://api.github.com";
const MAX_RETRIES = 5;
const REQUEST_TIMEOUT_MS = 5000;

function delay(duration = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function fetchGithub(relativePath, options = {}) {
  const headers = options.headers || {};
  const method = options.method ?? "GET";
  const body = options.body;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(`${GITHUB_API_URL}${relativePath}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.githubToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...headers,
        },
        ...(body != null ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        throw new Error(
          `Network response was not OK - Status Code: ${response.status}`
        );
      }
      const result = await response.json();
      await delay((i + 1) * REQUEST_TIMEOUT_MS);
      return result;
    } catch (err) {
      if (i !== MAX_RETRIES - 1) {
        logger.warn(
          err,
          `Failed to request to Github at path ${relativePath}. Attempting to retry...`
        );
      } else {
        throw err;
      }
    }
  }
}

async function getAuthenticatedUser() {
  const data = await fetchGithub("/user");
  return data;
}

const PER_PAGE_COUNT = 100;
async function getAllRepos() {
  const allRepos = [];
  let currentPage = 1;
  while (true) {
    const params = new URLSearchParams({
      affiliation: "owner",
      per_page: PER_PAGE_COUNT,
      page: currentPage,
    });
    const repos = await fetchGithub(`/user/repos?${params.toString()}`);
    allRepos.push(...repos);
    if (repos.length < PER_PAGE_COUNT) {
      break;
    }
    currentPage++;
  }

  return allRepos;
}

async function createRepoFromTemplate(
  templateOwner,
  templateRepoName,
  repoName
) {
  const repo = await fetchGithub(
    `/repos/${templateOwner}/${templateRepoName}/generate`,
    {
      method: "POST",
      body: {
        name: repoName,
      },
    }
  );
  return repo;
}

async function enableGithubPage(owner, repoName) {
  await fetchGithub(`/repos/${owner}/${repoName}/pages`, {
    method: "POST",
    body: {
      build_type: "workflow",
    },
  });
}

module.exports = {
  createRepoFromTemplate,
  enableGithubPage,
  getAuthenticatedUser,
  getAllRepos,
};
