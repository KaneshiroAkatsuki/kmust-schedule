import fs from 'node:fs/promises';

const WEATHER_URL = 'https://kmust-schedule-sync.kaneshiroakatsuki.workers.dev/api/weather';
const OUTPUT_PATH = new URL('../data/weather.json', import.meta.url);

async function downloadWeather() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(WEATHER_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`weather response ${response.status}`);
      const payload = await response.json();
      const data = payload && payload.data;
      if (!payload?.ok || !data?.current || !Array.isArray(data.hourly) || data.hourly.length < 1 || !Array.isArray(data.daily) || data.daily.length < 1) {
        throw new Error('weather payload validation failed');
      }
      return {
        ok: true,
        snapshotGeneratedAt: new Date().toISOString(),
        data
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError || new Error('weather snapshot download failed');
}

const snapshot = await downloadWeather();
await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
await fs.writeFile(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
console.log(`Saved ${snapshot.data.hourly.length} hourly and ${snapshot.data.daily.length} daily weather entries.`);
