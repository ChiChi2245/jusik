#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const XML_PATH = path.resolve(process.cwd(), "corpCode.xml");
if (!fs.existsSync(XML_PATH)) {
  console.error(`corpCode.xml not found at ${XML_PATH}`);
  process.exit(1);
}

const xml = fs.readFileSync(XML_PATH, "utf-8");

const listMatches = xml.match(/<list>[\s\S]*?<\/list>/g) || [];
const rows = [];

for (const block of listMatches) {
  const corp_code = extractTag(block, "corp_code");
  const corp_name = extractTag(block, "corp_name");
  const stock_code = extractTag(block, "stock_code");
  if (!corp_code || !corp_name) continue;
  if (!stock_code) continue;
  rows.push({ corp_code, stock_code, name: corp_name });
}

if (rows.length === 0) {
  console.log("No rows found.");
  process.exit(0);
}

const batchSize = 1000;
let total = 0;

async function upsertBatch(batch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kr_companies`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upsert failed: ${res.status} ${text}`);
  }
}

async function run() {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await upsertBatch(batch);
    total += batch.length;
    console.log(`Upserted ${total}/${rows.length}`);
  }
  console.log(`Done. Upserted ${total} rows to kr_companies.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "i");
  const match = block.match(re);
  return match ? match[1].trim() : "";
}
