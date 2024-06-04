const simpleGit = require("simple-git");

function initializeGitInstance(dirPath) {
  const git = simpleGit({
    baseDir: dirPath,
  }).outputHandler((_command, stdout, stderr) => {
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
  });

  return git;
}

async function configureGitUser(repoDirPath, name, email) {
  const git = initializeGitInstance(repoDirPath);
  await git.addConfig("user.name", name);
  await git.addConfig("user.email", email);
}

async function cloneRepo(repoParentDirPath, repoURL) {
  const git = initializeGitInstance(repoParentDirPath);
  await git.clone(repoURL);
}

async function commitAndPush(repoDirPath, commitMessage) {
  const git = initializeGitInstance(repoDirPath);
  await git.add(".");
  await git.commit(commitMessage);
  await git.push("origin", "main");
}

module.exports = {
  cloneRepo,
  commitAndPush,
  configureGitUser,
};
