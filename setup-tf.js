// Script untuk menyalin file TensorFlow.js ke folder public
const fs = require("fs");
const path = require("path");

// Pastikan folder tujuan ada
const publicJsPath = path.join(__dirname, "public", "js", "lib");
if (!fs.existsSync(publicJsPath)) {
  fs.mkdirSync(publicJsPath, { recursive: true });
}

// Salin file TensorFlow.js dari node_modules
const tfSourcePath = path.join(
  __dirname,
  "node_modules",
  "@tensorflow",
  "tfjs",
  "dist"
);
const tfFiles = ["tf.min.js", "tf.min.js.map"];

tfFiles.forEach((file) => {
  const sourcePath = path.join(tfSourcePath, file);
  const destPath = path.join(publicJsPath, file);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`File ${file} berhasil disalin ke ${destPath}`);
  } else {
    console.error(`File ${file} tidak ditemukan di ${sourcePath}`);
  }
});

console.log("Setup TensorFlow.js selesai!");
