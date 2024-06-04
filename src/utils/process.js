const util = require("util");
const execPromise = util.promisify(require("child_process").exec);
const logger = require("./logger");

function runCommand(command, dirPath) {
  const promise = execPromise(command, {
    ...(dirPath != null ? { cwd: dirPath } : {}),
  });

  // Listener for logging
  const child = promise.child;
  child.stdout.on("data", function (data) {
    logger.info(data);
  });
  child.stderr.on("data", function (data) {
    logger.info(data);
  });
  child.on("close", function (code) {
    logger.info(code);
  });

  return promise;
}

module.exports = {
  runCommand,
};
