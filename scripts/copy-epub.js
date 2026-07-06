const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'epubjs', 'dist', 'epub.min.js');
const destDir = path.join(__dirname, '..', 'media', 'lib');
const dest = path.join(destDir, 'epub.min.js');

if (!fs.existsSync(src)) {
  console.error('epub.min.js not found. Run npm install first.');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied epub.min.js -> media/lib/epub.min.js');
