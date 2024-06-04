const fs = require("fs");
const path = require("path");

const logger = require("./utils/logger");

let configJSON;
try {
  configJSON = fs.readFileSync(path.join(process.cwd(), "./config.json"));
} catch (err) {
  logger.warn(err, "Config JSON file not found");
}
const config = configJSON != null ? JSON.parse(configJSON) : {};

module.exports = config;
