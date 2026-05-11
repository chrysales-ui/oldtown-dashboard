// Runs before vite build — fetches live API data and saves as static snapshots
// so the dashboard loads instantly on first visit.
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://guestgetter-dashboard.vercel.app';
const SLUGS = ['carbon-bar', 'lucie'];
const TIMEOUT_MS = 60000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

async function run() {
  for (const slug of SLUGS) {
    const dir = join(__dirname, '..', 'public', 'data', slug);
    mkdirSync(dir, { recursive: true });
    try {
      console.log(`Fetching ${slug}...`);
      const data = await fetchWithTimeout(`${BASE_URL}/api/${slug}`);
      // Save as a single snapshot file
      writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(data));
      console.log(`  ✓ saved public/data/${slug}/snapshot.json`);
    } catch (err) {
      console.warn(`  ✗ ${slug} prefetch failed: ${err.message} (using existing snapshot if any)`);
    }
  }
}

run();
