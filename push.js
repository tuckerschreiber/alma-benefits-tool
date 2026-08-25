#!/usr/bin/env node

/**
 * Push page SEO metadata to Webflow and publish.
 *
 * Setup (one-time):
 *   1. Get your Webflow API token: Site Settings > Apps & Integrations > API Access
 *   2. Create .env with:
 *        WEBFLOW_API_TOKEN=your_token_here
 *        WEBFLOW_SITE_ID=your_site_id_here
 *
 * Usage:
 *   node push.js <page-directory>
 *
 * Example:
 *   node push.js pages/postpartum-care-comparison
 *
 * What it does:
 *   - Reads page.json from the directory for SEO config
 *   - Updates the page's SEO title, description, and OG tags via Webflow API
 *   - Publishes the site
 *
 * What YOU do manually (~60 seconds):
 *   1. Create a blank page in Webflow, set the slug
 *   2. Page Settings > Custom Code > "Inside <head>" → paste webflow-head.html
 *   3. Page Settings > Custom Code > "Before </body>" → paste webflow-body.html
 *   4. Run this script to set SEO fields and publish
 */

const fs = require("fs");
const path = require("path");

// Load .env manually (no dependencies needed)
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("Missing .env file. Create one with WEBFLOW_API_TOKEN and WEBFLOW_SITE_ID.");
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
}

async function main() {
  loadEnv();

  const token = process.env.WEBFLOW_API_TOKEN;
  const siteId = process.env.WEBFLOW_SITE_ID;

  if (!token || !siteId) {
    console.error("Set WEBFLOW_API_TOKEN and WEBFLOW_SITE_ID in .env");
    process.exit(1);
  }

  const pageDir = process.argv[2];
  if (!pageDir) {
    console.error("Usage: node push.js <page-directory>");
    console.error("Example: node push.js pages/postpartum-care-comparison");
    process.exit(1);
  }

  const configPath = path.join(__dirname, pageDir, "page.json");
  if (!fs.existsSync(configPath)) {
    console.error(`Missing ${configPath}. Each page directory needs a page.json.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const { pageId, slug, title, seo, openGraph } = config;

  if (!pageId) {
    // List pages so the user can find their page ID
    console.log("\nNo pageId in page.json. Fetching your site's pages so you can find it...\n");

    const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/pages`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!res.ok) {
      console.error(`Failed to list pages: ${res.status} ${await res.text()}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log("Pages on your site:");
    console.log("─".repeat(60));
    for (const page of data.pages || []) {
      console.log(`  ${page.title || "(untitled)"}`);
      console.log(`    slug: /${page.slug}`);
      console.log(`    id:   ${page.id}`);
      console.log();
    }
    console.log(`Add the page ID to ${configPath} as "pageId" and run again.`);
    process.exit(0);
  }

  // Update page metadata
  console.log(`Updating SEO metadata for page ${pageId}...`);

  const updateBody = {};
  if (title) updateBody.title = title;
  if (slug) updateBody.slug = slug;
  if (seo) updateBody.seo = seo;
  if (openGraph) updateBody.openGraph = openGraph;

  const updateRes = await fetch(`https://api.webflow.com/v2/pages/${pageId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateBody),
  });

  if (!updateRes.ok) {
    console.error(`Failed to update page: ${updateRes.status}`);
    console.error(await updateRes.text());
    process.exit(1);
  }

  console.log("SEO metadata updated.");

  // Publish
  console.log("Publishing site...");

  const publishRes = await fetch(`https://api.webflow.com/v2/sites/${siteId}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ publishToWebflowSubdomain: false }),
  });

  if (!publishRes.ok) {
    console.error(`Failed to publish: ${publishRes.status}`);
    console.error(await publishRes.text());
    process.exit(1);
  }

  console.log("Site published.");
  console.log(`\nDone! Page should be live at https://almacare.ca/${slug || ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
