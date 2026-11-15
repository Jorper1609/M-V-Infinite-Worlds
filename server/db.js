import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from './maps.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.resolve(here, '../data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'mingoverse.sqlite'), { timeout: 5000 });
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS player_saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  seed TEXT,
  map_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS race_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_id TEXT NOT NULL REFERENCES maps(id),
  mode TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  laps INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_race_results_map ON race_results(map_id, elapsed_ms ASC);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  map_id TEXT NOT NULL REFERENCES maps(id),
  is_private INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`);

// Migración incremental para instalaciones previas de la primera versión.
const mapColumns = new Set(db.pragma('table_info(maps)').map((column) => column.name));
if (!mapColumns.has('owner_id')) db.exec('ALTER TABLE maps ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE CASCADE');
if (!mapColumns.has('seed')) db.exec('ALTER TABLE maps ADD COLUMN seed TEXT');
if (!mapColumns.has('map_json')) db.exec('ALTER TABLE maps ADD COLUMN map_json TEXT');
if (!mapColumns.has('created_at')) {
  // SQLite no permite CURRENT_TIMESTAMP como DEFAULT no constante en ADD COLUMN.
  db.exec("ALTER TABLE maps ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'");
  db.exec("UPDATE maps SET created_at=CURRENT_TIMESTAMP WHERE created_at='1970-01-01 00:00:00'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_maps_owner ON maps(owner_id, created_at DESC)');

const insertMap = db.prepare(`INSERT INTO maps (id, name, category, vehicle_type, difficulty, published)
VALUES (@id, @name, @category, @vehicle_type, @difficulty, 1)
ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category,
vehicle_type=excluded.vehicle_type, difficulty=excluded.difficulty`);
const seedMaps = db.transaction(() => {
  for (const map of MAPS) insertMap.run({
    id: map.id, name: map.name, category: map.category,
    vehicle_type: map.vehicleType, difficulty: map.difficulty
  });
});
seedMaps();

db.prepare('INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)').run();

export function closeDatabase() {
  if (db.open) db.close();
}
