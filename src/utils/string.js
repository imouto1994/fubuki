const slugify = require("slugify");
const { REVERSED_SLUG_PREFIX } = require("../constants");

// Naturally compare 2 strings
function naturalCompare(s1, s2) {
  return s1.localeCompare(s2, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// Reverse a string
function reverse(str) {
  return str.split("").reverse().join("");
}

// Pad number with '0'
function padNumber(n, padCount = 3) {
  return String(n).padStart(padCount, "0");
}

// Decode a reversed slug
function encodeSlug(str) {
  return `${REVERSED_SLUG_PREFIX}${reverse(str)}`;
}

// Decode a reversed slug
function decodeSlug(str) {
  if (str.startsWith(REVERSED_SLUG_PREFIX)) {
    return reverse(str.substring(REVERSED_SLUG_PREFIX.length));
  }

  return str;
}

// Get a random string with given number of characters
const RANDOM_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";
function getRandomString(numChars = 32, charSet = RANDOM_CHAR_SET) {
  let randomString = "";
  for (let i = 0; i < numChars; i++) {
    const randomIndex = Math.floor(Math.random() * charSet.length);
    const randomChar = RANDOM_CHAR_SET.charAt(randomIndex);
    randomString += randomChar;
  }

  return randomString;
}

// Slugify a string
function slug(str) {
  return slugify(str, { lower: true, strict: true });
}

module.exports = {
  encodeSlug,
  decodeSlug,
  getRandomString,
  naturalCompare,
  padNumber,
  reverse,
  slug,
};
