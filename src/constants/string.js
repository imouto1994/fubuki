const EXTENSION_MAP = {
  jpeg: "j.wasm",
  jpg: "j.wasm",
  png: "p.wasm",
  webp: "w.wasm",
  json: "js.wasm",
};

const REVERSED_SLUG_PREFIX = "rev-";
const ENLARGED_FILE_PREFIX = "hentie2110";
const COMPRESSED_FILE_PREFIX = "compressed";
const WAIFU2X_FILE_SUFFIX = "waifu2x";
const METADATA_JSON_FILE_NAME = `index.${EXTENSION_MAP["json"]}`;
const FIELDS_SEPARATOR = "__";

module.exports = {
  COMPRESSED_FILE_PREFIX,
  ENLARGED_FILE_PREFIX,
  EXTENSION_MAP,
  FIELDS_SEPARATOR,
  METADATA_JSON_FILE_NAME,
  REVERSED_SLUG_PREFIX,
  WAIFU2X_FILE_SUFFIX,
};
