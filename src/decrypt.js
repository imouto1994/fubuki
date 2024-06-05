const { glob } = require("glob");
const path = require("path");

const { decryptFile } = require("./utils/file");

// Decrypt script
(async () => {
  const filePaths = await glob(`decrypt_src/*`);
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    await decryptFile(filePath, `decrypt_dst/${fileName}`);
  }
})();
