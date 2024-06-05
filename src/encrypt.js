const { glob } = require("glob");
const path = require("path");
const { encryptFile } = require("./utils/file");

// Encrypt script
(async () => {
  const filePaths = await glob(`encrypt_src/*`);
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    await encryptFile(filePath, `encrypt_dst/${fileName}`);
  }
})();
