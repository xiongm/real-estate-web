const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = path.join(root, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const destDir = path.join(root, '..', 'public');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

try {
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(src)) {
    console.warn('[pdfjs] worker file not found at', src);
    process.exit(0);
  }
  fs.copyFileSync(src, dest);
  console.log('[pdfjs] Copied worker to', dest);
} catch (err) {
  console.warn('[pdfjs] Failed to copy worker', err);
}
