import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const COOKIE_NAME = 'mv_session';

export function randomId(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET || 'mingoverse-development-secret-change-this').update(token).digest('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [algorithm, n, r, p, saltHex, hashHex] = stored.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function readCookies(header = '') {
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { /* ignore malformed cookie */ }
  }
  return result;
}

export function sessionCookie(token, maxAgeSeconds = SESSION_MS / 1000) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function getUserFromRequest(req) {
  const token = readCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token || token.length > 256) return null;
  const now = Date.now();
  const row = db.prepare(`SELECT users.id, users.username, users.email, sessions.token_hash
    FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(hashToken(token), now);
  if (!row) return null;
  db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now, row.token_hash);
  return { id: row.id, username: row.username, email: row.email };
}

export async function registerUser({ username, email, password }) {
  if (typeof username !== 'string' || typeof email !== 'string') {
    throw Object.assign(new Error('Completa el nombre de usuario y el correo electrónico.'), { status: 400 });
  }
  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(cleanUsername)) {
    throw Object.assign(new Error('El usuario debe tener entre 3 y 20 caracteres: letras, números, _ o -.'), { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    throw Object.assign(new Error('Introduce un correo electrónico válido.'), { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw Object.assign(new Error('La contraseña debe tener entre 12 y 128 caracteres.'), { status: 400 });
  }
  const passwordHash = await hashPassword(password);
  const id = randomId();
  try {
    db.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, cleanUsername, cleanEmail, passwordHash);
    db.prepare('INSERT INTO player_saves (user_id, progress_json) VALUES (?, ?)').run(id, JSON.stringify(defaultSave()));
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      throw Object.assign(new Error('Ese nombre de usuario o correo ya está registrado.'), { status: 409 });
    }
    throw error;
  }
  return db.prepare('SELECT id, username, email FROM users WHERE id=?').get(id);
}

export async function loginUser({ login, password }) {
  if (typeof login !== 'string' || typeof password !== 'string') {
    throw Object.assign(new Error('Credenciales no válidas.'), { status: 400 });
  }
  const user = db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE')
    .get(login.trim(), login.trim());
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!valid) throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
  const token = randomId(32);
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), user.id, now, now + SESSION_MS, now);
  db.prepare('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(user.id);
  return { token, user: { id: user.id, username: user.username, email: user.email } };
}

export function revokeSession(req) {
  const token = readCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
}

export function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
}

export function defaultSave() {
  return {
    chapter: 1,
    mission: 'primer-arranque',
    xp: 0,
    level: 1,
    selectedVehicle: 'mv-gt01',
    unlockedVehicles: ['mv-gt01'],
    completedMissions: [],
    settings: { quality: 'high', camera: 'chase', input: 'keyboard' },
    bestTimes: {}
  };
}

export function validateSave(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Formato de guardado no válido.'), { status: 400 });
  const defaults = defaultSave();
  const safe = {
    chapter: clampInt(input.chapter, 1, 99, defaults.chapter),
    mission: typeof input.mission === 'string' ? input.mission.slice(0, 80) : defaults.mission,
    xp: clampInt(input.xp, 0, 100000000, 0),
    level: clampInt(input.level, 1, 999, 1),
    selectedVehicle: typeof input.selectedVehicle === 'string' ? input.selectedVehicle.slice(0, 48) : defaults.selectedVehicle,
    unlockedVehicles: stringArray(input.unlockedVehicles, 300),
    completedMissions: stringArray(input.completedMissions, 2000),
    settings: {
      quality: ['low', 'medium', 'high', 'ultra'].includes(input.settings?.quality) ? input.settings.quality : 'high',
      camera: ['chase', 'hood'].includes(input.settings?.camera) ? input.settings.camera : 'chase',
      input: ['keyboard', 'gamepad'].includes(input.settings?.input) ? input.settings.input : 'keyboard'
    },
    bestTimes: cleanBestTimes(input.bestTimes)
  };
  if (!safe.unlockedVehicles.includes('mv-gt01')) safe.unlockedVehicles.unshift('mv-gt01');
  if (!safe.unlockedVehicles.includes(safe.selectedVehicle)) safe.selectedVehicle = 'mv-gt01';
  return safe;
}

function clampInt(value, min, max, fallback) {
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function stringArray(value, maxItems) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.slice(0, 80)))].slice(0, maxItems);
}
function cleanBestTimes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, time] of Object.entries(value).slice(0, 100)) {
    if (/^[a-z0-9-]{2,48}$/.test(key) && Number.isInteger(time) && time >= 1000 && time < 24 * 60 * 60 * 1000) result[key] = time;
  }
  return result;
}
