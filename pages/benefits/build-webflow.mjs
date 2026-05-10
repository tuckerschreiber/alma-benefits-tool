#!/usr/bin/env node
// build-webflow.mjs
//
// Splits preview.html into Webflow-ready snippets:
//   - webflow-head.html  → paste into Webflow Page Settings → Custom Code → Inside <head>
//   - webflow-body.html  → paste into a single Webflow Embed element on the page
//
// preview.html is the source of truth during development. Run this script
// after any change to preview.html to regenerate the split files:
//   node build-webflow.mjs
//
// The script extracts:
//   - The html2pdf CDN <script> tag from preview's <head>
//   - The full <style>…</style> block from preview's <head>
//   - A static JSON-LD <script type="application/ld+json"> block (WebApplication)
//   - Everything between <body>…</body> (the <main> markup + inline <script>)
//
// It NEVER emits <html>, <head>, or <body> tags — both outputs are pure
// fragments meant to be embedded inside an existing Webflow page.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const previewPath = join(__dirname, 'preview.html');
const headOutPath = join(__dirname, 'webflow-head.html');
const bodyOutPath = join(__dirname, 'webflow-body.html');
const testOutPath = join(__dirname, 'webflow-test.html');

const html = readFileSync(previewPath, 'utf8');

// --- Extract <style>…</style> -----------------------------------------------
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (!styleMatch) {
  console.error('build-webflow: could not find <style>…</style> in preview.html');
  process.exit(1);
}
const styleBlock = `<style>${styleMatch[1]}</style>`;

// --- Extract html2pdf CDN <script> tag --------------------------------------
const html2pdfMatch = html.match(/<script src="[^"]*html2pdf[^"]*"><\/script>/);
if (!html2pdfMatch) {
  console.error('build-webflow: could not find html2pdf <script> tag in preview.html');
  process.exit(1);
}
const html2pdfTag = html2pdfMatch[0];

// --- Extract <body>…</body> -------------------------------------------------
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
if (!bodyMatch) {
  console.error('build-webflow: could not find <body>…</body> in preview.html');
  process.exit(1);
}
// Trim leading/trailing newlines but preserve internal indentation.
const bodyContent = bodyMatch[1].replace(/^\n+|\n+$/g, '\n').trim() + '\n';

// --- Static JSON-LD block ---------------------------------------------------
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Alma Care Benefits Eligibility Tool',
  description:
    'Find out what your extended health benefits cover for postpartum care, get a personalized care plan, and a free PDF estimate for your insurance.',
  url: 'https://almacare.ca/benefits',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'CAD',
  },
  provider: {
    '@type': 'Organization',
    name: 'Alma Care',
    url: 'https://almacare.ca',
  },
};
const jsonLdBlock = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;

// --- Compose outputs --------------------------------------------------------
const headOut = `${html2pdfTag}\n\n${styleBlock}\n\n${jsonLdBlock}\n`;
const bodyOut = bodyContent;

writeFileSync(headOutPath, headOut, 'utf8');
writeFileSync(bodyOutPath, bodyOut, 'utf8');

// --- Compose a prod-faithful test page --------------------------------------
// Mirrors how Webflow assembles the page: head custom code lives inside <head>,
// the Embed element sits between a placeholder nav and footer in <body>.
const testOut = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Free postpartum benefits eligibility tool — Alma Care</title>
<meta name="description" content="Find out what your extended health benefits cover for postpartum care, get a personalized care plan, and a free PDF estimate for your insurance pre-approval.">
<style>
  /* Minimal Webflow-like nav + footer styling so the embed sits in realistic page chrome */
  body { margin: 0; font-family: 'Futura', 'Futura PT', 'Trebuchet MS', sans-serif; background: #FFFAF4; color: #032215; }
  .test-nav { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; border-bottom: 1px solid rgb(235, 225, 213); }
  .test-nav__brand { font-weight: 500; font-size: 18px; }
  .test-nav__links { display: flex; gap: 24px; font-size: 14px; }
  .test-nav__links a { color: #032215; text-decoration: none; }
  .test-footer { padding: 32px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid rgb(235, 225, 213); margin-top: 64px; }
  .test-banner { background: #F4E9DD; color: #032215; padding: 8px 16px; text-align: center; font-size: 12px; }
</style>
${headOut}</head>
<body>
<div class="test-banner">LOCAL TEST PAGE — mirrors prod Webflow output. Nav + footer here are placeholders only.</div>
<nav class="test-nav">
  <div class="test-nav__brand">Alma Care</div>
  <div class="test-nav__links"><a href="#">Services</a><a href="#">About</a><a href="#">Book</a></div>
</nav>
${bodyOut}<footer class="test-footer">© Alma Care — placeholder footer for local test only.</footer>
</body>
</html>
`;
writeFileSync(testOutPath, testOut, 'utf8');

console.log('build-webflow: wrote');
console.log(`  ${headOutPath}  (${headOut.length} bytes)`);
console.log(`  ${bodyOutPath}  (${bodyOut.length} bytes)`);
console.log(`  ${testOutPath}  (${testOut.length} bytes — local test page)`);
