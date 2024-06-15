const util = require("util");
const execPromise = util.promisify(require("child_process").exec);
const logger = require("./logger");

function runCommand(command, dirPath, logEnabled = false) {
  const promise = execPromise(command, {
    ...(dirPath != null ? { cwd: dirPath } : {}),
  });

  // Listener for logging
  const child = promise.child;
  child.stdout.on("data", function (data) {
    if (logEnabled) {
      logger.info(data);
    }
  });
  child.stderr.on("data", function (data) {
    if (logEnabled) {
      logger.info(data);
    }
  });
  child.on("close", function (code) {
    if (logEnabled) {
      logger.info(code);
    }
  });

  return promise;
}

module.exports = {
  runCommand,
};
