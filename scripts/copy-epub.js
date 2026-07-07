const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, '..', 'media', 'lib');

const libs = [
  {
    src: path.join(__dirname, '..', 'node_modules', 'jszip', 'dist', 'jszip.min.js'),
    dest: 'jszip.min.js'
  },
  {
    src: path.join(__dirname, '..', 'node_modules', 'epubjs', 'dist', 'epub.min.js'),
    dest: 'epub.min.js'
  }
];

fs.mkdirSync(destDir, { recursive: true });

for (const lib of libs) {
  if (!fs.existsSync(lib.src)) {
    console.error(`${lib.dest} not found. Run npm install first.`);
    process.exit(1);
  }
  const dest = path.join(destDir, lib.dest);
  fs.copyFileSync(lib.src, dest);
  console.log(`Copied ${lib.dest} -> media/lib/${lib.dest}`);
}
