import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Build the HTML reader entirely from files bundled in this repository.
// This deliberately does not fetch the separate vilna-html server or GitHub at runtime/build time.
const root = process.cwd();
const templatePath = path.join(root, "src/vilna-html/template.html");
const tractatesPath = path.join(root, "src/vilna-html/tractates.json");
const vendorDir = path.join(root, "public/vilna-html/vendor");
const outputPath = path.join(root, "public/vilna-html/index.html");

const [template, tractatesText] = await Promise.all([
  readFile(templatePath, "utf8"),
  readFile(tractatesPath, "utf8"),
]);
const tractates = JSON.parse(tractatesText);
const html = template.replace("__TRACTATES__", JSON.stringify(tractates));
if (html.includes("__TRACTATES__")) throw new Error("The local Vilna HTML template has an unresolved tractate placeholder.");
await mkdir(vendorDir, { recursive: true });

function firstExisting(candidates) {
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Could not find a local PDF.js browser module. Tried: " + candidates.join(", "));
  return found;
}
const pdfjsRoot = path.join(root, "node_modules/pdfjs-dist/build");
const pdfModule = firstExisting([
  path.join(pdfjsRoot, "pdf.min.mjs"),
  path.join(pdfjsRoot, "pdf.mjs"),
]);
const pdfWorker = firstExisting([
  path.join(pdfjsRoot, "pdf.worker.min.mjs"),
  path.join(pdfjsRoot, "pdf.worker.mjs"),
]);
await Promise.all([
  copyFile(pdfModule, path.join(vendorDir, "pdf.mjs")),
  copyFile(pdfWorker, path.join(vendorDir, "pdf.worker.mjs")),
  writeFile(outputPath, html, "utf8"),
]);
console.log("[vilna-html] Built same-origin HTML reader (" + tractates.length + " tractates) with local PDF.js assets.");
