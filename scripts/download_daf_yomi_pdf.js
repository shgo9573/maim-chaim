import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target directory for local PDF storage
const PDF_DIR = fs.existsSync('/var/data/otzaria')
  ? '/var/data/otzaria/pdf'
  : path.join(__dirname, '../data/pdf');

if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const TOTAL_PAGES = 2711;

// Parse optional start and end page indices from command line
const args = process.argv.slice(2);
const startPage = parseInt(args[0], 10) || 1;
const endPage = parseInt(args[1], 10) || TOTAL_PAGES;

console.log(`====================================================`);
console.log(`📖 Otzaria - Daf Yomi PDF Downloader & Local Storage`);
console.log(`====================================================`);
console.log(`📁 Saving PDFs to: ${PDF_DIR}`);
console.log(`🔢 Range: Page ${startPage} to Page ${endPage} (Total: ${endPage - startPage + 1} pages)`);
console.log(`====================================================\n`);

async function downloadPage(pageIndex) {
  const filePath = path.join(PDF_DIR, `${pageIndex}.pdf`);

  // Skip if already downloaded and valid (> 10KB)
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 10000) {
      return { pageIndex, status: 'skipped', size: stats.size };
    }
  }

  const url = `https://daf-yomi.com/Data/UploadedFiles/DY_Page/${pageIndex}.pdf`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://daf-yomi.com/'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 5000) {
      throw new Error(`Downloaded buffer too small (${buffer.length} bytes)`);
    }

    fs.writeFileSync(filePath, buffer);
    return { pageIndex, status: 'downloaded', size: buffer.length };
  } catch (err) {
    return { pageIndex, status: 'error', error: err.message };
  }
}

async function main() {
  let downloadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = startPage; i <= endPage; i++) {
    const result = await downloadPage(i);

    if (result.status === 'downloaded') {
      downloadedCount++;
      const kb = (result.size / 1024).toFixed(1);
      console.log(`✅ [${i}/${endPage}] Page ${i}.pdf downloaded successfully (${kb} KB)`);
    } else if (result.status === 'skipped') {
      skippedCount++;
      // Print every 50th skip to avoid spamming terminal
      if (i % 50 === 0 || i === startPage || i === endPage) {
        console.log(`⏭️  [${i}/${endPage}] Page ${i}.pdf already exists locally, skipping.`);
      }
    } else {
      errorCount++;
      console.error(`❌ [${i}/${endPage}] Page ${i}.pdf failed: ${result.error}`);
    }

    // Small delay to be polite to the server
    if (result.status === 'downloaded') {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`\n====================================================`);
  console.log(`🎉 Download Process Completed!`);
  console.log(`📥 Downloaded: ${downloadedCount} new PDFs`);
  console.log(`⏭️  Skipped: ${skippedCount} existing PDFs`);
  console.log(`❌ Failures: ${errorCount} errors`);
  console.log(`📁 Local Storage: ${PDF_DIR}`);
  console.log(`====================================================`);
}

main();
