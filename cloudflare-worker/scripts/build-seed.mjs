import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.resolve(workerDir, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/const RAW_DATA = (?<json>\[[^;]+\]);/);

if (!match?.groups?.json) throw new Error('Unable to locate RAW_DATA in index.html');

const courses = JSON.parse(match.groups.json);
if (!Array.isArray(courses) || courses.length === 0) throw new Error('RAW_DATA is empty');

const encoded = JSON.stringify(courses).replaceAll("'", "''");
const updatedAt = new Date().toISOString();
const sql = `INSERT INTO schedule_state (id, revision, updated_at, courses_json)
VALUES (1, 1, '${updatedAt}', '${encoded}')
ON CONFLICT(id) DO UPDATE SET
  revision = schedule_state.revision + 1,
  updated_at = excluded.updated_at,
  courses_json = excluded.courses_json;
`;

const outputPath = path.join(os.tmpdir(), `kmust-schedule-seed-${process.pid}.sql`);
fs.writeFileSync(outputPath, sql, 'utf8');
process.stdout.write(outputPath);
