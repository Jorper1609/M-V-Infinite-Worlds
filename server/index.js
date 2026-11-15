import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { db, closeDatabase } from './db.js';
import { MAPS, publicMap } from './maps.js';
import { generateProceduralMap, normalizeSeed } from '../shared/procedural.js';
import {
  getUserFromRequest, registerUser, loginUser, revokeSession,
  sessionCookie, clearSessionCookie, validateSave, defaultSave, pruneSessions, readCookies
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3307);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const distPath = path.resolve(__dirname, '../dist');

if (SESSION_SECRET.length < 32 && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres en producción.');
}
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb', strict: true }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});

const loginAttempts = new Map();
function rateLimitAuth(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 15 * 60 * 1000; }
  entry.count += 1;
  loginAttempts.set(key, entry);
  if (entry.count > 20) return res.status(429).json({ error: 'Demasiados intentos. Prueba de nuevo más tarde.' });
  return next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) if (entry.resetAt < now) loginAttempts.delete(key);
  pruneSessions();
  db.prepare('DELETE FROM rooms WHERE expires_at < ?').run(now);
}, 10 * 60 * 1000).unref();

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const candidate = new URL(origin);
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const requestHost = forwardedHost || req.headers.host;
    const configuredOrigin = process.env.PUBLIC_ORIGIN;
    return candidate.host === requestHost || (configuredOrigin && candidate.origin === configuredOrigin);
  } catch { return false; }
}
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !originAllowed(req)) {
    return res.status(403).json({ error: 'Origen no permitido.' });
  }
  next();
});

function authRequired(req, res, next) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  req.user = user;
  return next();
}

function jsonError(res, error) {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[MingoVerse]', error);
  return res.status(status).json({ error: status >= 500 ? 'Error interno del servidor.' : error.message });
}

app.get('/api/health', (_req, res) => {
  const dbOk = db.prepare('SELECT 1 AS ok').get().ok === 1;
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', service: 'mingoverse', version: '0.1.0', time: new Date().toISOString() });
});

app.post('/api/auth/register', rateLimitAuth, async (req, res) => {
  try {
    const user = await registerUser(req.body || {});
    const session = await loginUser({ login: user.username, password: req.body.password });
    res.setHeader('Set-Cookie', sessionCookie(session.token));
    res.status(201).json({ user: session.user });
  } catch (error) { jsonError(res, error); }
});

app.post('/api/auth/login', rateLimitAuth, async (req, res) => {
  try {
    const session = await loginUser(req.body || {});
    res.setHeader('Set-Cookie', sessionCookie(session.token));
    res.json({ user: session.user });
  } catch (error) { jsonError(res, error); }
});

app.post('/api/auth/logout', authRequired, (req, res) => {
  revokeSession(req);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).end();
});

app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));

app.get('/api/maps', authRequired, (req, res) => {
  const custom = db.prepare('SELECT map_json FROM maps WHERE owner_id=? ORDER BY created_at DESC LIMIT 5000').all(req.user.id)
    .map((row) => { try { return JSON.parse(row.map_json); } catch { return null; } })
    .filter(Boolean);
  const staticMaps = MAPS.map(publicMap);
  res.json({ maps: [...staticMaps, ...custom], count: staticMaps.length + custom.length, target: 5000 });
});

app.post('/api/maps/generate', authRequired, (req, res) => {
  const seed = normalizeSeed(req.body?.seed);
  if (!seed) return res.status(400).json({ error: 'La semilla debe tener entre 3 y 32 caracteres: letras, números, - o _.' });
  const theme = typeof req.body?.theme === 'string' ? req.body.theme : 'city';
  let map;
  try { map = generateProceduralMap(seed, theme); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const userMapCount = db.prepare('SELECT COUNT(*) AS count FROM maps WHERE owner_id=?').get(req.user.id).count;
  const ownerKey = crypto.createHash('sha256').update(req.user.id).digest('hex').slice(0, 16);
  map.id = `custom-${map.id.replace('generated-', '')}-${ownerKey}`;
  map.slug = map.id;
  const existing = db.prepare('SELECT id FROM maps WHERE owner_id=? AND id=?').get(req.user.id, map.id);
  if (!existing && userMapCount >= 5000) return res.status(409).json({ error: 'Has alcanzado el límite actual de 5.000 mapas personales.' });
  db.prepare(`INSERT INTO maps (id, name, category, vehicle_type, difficulty, published, owner_id, seed, map_json)
    VALUES (?, ?, ?, 'car', ?, 0, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, difficulty=excluded.difficulty,
    seed=excluded.seed, map_json=excluded.map_json`)
    .run(map.id, map.name, map.category, map.difficulty, req.user.id, seed, JSON.stringify(map));
  res.status(201).json({ map, saved: true, personalMapCount: existing ? userMapCount : userMapCount + 1 });
});

app.get('/api/save', authRequired, (req, res) => {
  const row = db.prepare('SELECT revision, progress_json, updated_at FROM player_saves WHERE user_id=?').get(req.user.id);
  if (!row) {
    db.prepare('INSERT INTO player_saves (user_id, progress_json) VALUES (?, ?)').run(req.user.id, JSON.stringify(defaultSave()));
    return res.json({ revision: 0, progress: defaultSave(), updatedAt: null });
  }
  try {
    return res.json({ revision: row.revision, progress: JSON.parse(row.progress_json), updatedAt: row.updated_at });
  } catch {
    return res.status(500).json({ error: 'El guardado está dañado. No se ha sobrescrito.' });
  }
});

app.put('/api/save', authRequired, (req, res) => {
  try {
    const revision = req.body?.revision;
    if (!Number.isInteger(revision) || revision < 0) return res.status(400).json({ error: 'Revisión de guardado no válida.' });
    const progress = validateSave(req.body?.progress);
    const current = db.prepare('SELECT progress_json FROM player_saves WHERE user_id=?').get(req.user.id);
    const serverProgress = current ? JSON.parse(current.progress_json) : defaultSave();
    // XP, nivel y récords solo cambian desde endpoints de resultados validados por el servidor.
    progress.xp = serverProgress.xp || 0;
    progress.level = serverProgress.level || 1;
    progress.bestTimes = serverProgress.bestTimes || {};
    const update = db.prepare(`UPDATE player_saves SET revision=revision+1, progress_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND revision=?`);
    const result = update.run(JSON.stringify(progress), req.user.id, revision);
    if (result.changes === 0) {
      const latest = db.prepare('SELECT revision, progress_json, updated_at FROM player_saves WHERE user_id=?').get(req.user.id);
      return res.status(409).json({ error: 'El progreso se ha actualizado desde otro dispositivo.', latest: latest ? { revision: latest.revision, progress: JSON.parse(latest.progress_json), updatedAt: latest.updated_at } : null });
    }
    const nextRevision = revision + 1;
    return res.json({ revision: nextRevision, progress, updatedAt: new Date().toISOString() });
  } catch (error) { return jsonError(res, error); }
});

app.post('/api/results', authRequired, (req, res) => {
  const { mapId, elapsedMs, laps, mode = 'solo' } = req.body || {};
  const knownMap = db.prepare('SELECT id FROM maps WHERE id=? AND (owner_id IS NULL OR owner_id=?)').get(mapId, req.user.id);
  if (!knownMap) return res.status(400).json({ error: 'Mapa desconocido o no autorizado.' });
  if (!Number.isInteger(elapsedMs) || elapsedMs < 5000 || elapsedMs > 4 * 60 * 60 * 1000) return res.status(400).json({ error: 'Tiempo de carrera no válido.' });
  if (!Number.isInteger(laps) || laps < 1 || laps > 20) return res.status(400).json({ error: 'Número de vueltas no válido.' });
  if (!['solo', 'online', 'practice'].includes(mode)) return res.status(400).json({ error: 'Modo no válido.' });
  if (elapsedMs < laps * 10000) return res.status(400).json({ error: 'El tiempo es demasiado corto para el número de vueltas indicado.' });
  const id = crypto.randomUUID();
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO race_results (id, user_id, map_id, mode, elapsed_ms, laps) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, mapId, mode, elapsedMs, laps);
    const row = db.prepare('SELECT revision, progress_json FROM player_saves WHERE user_id=?').get(req.user.id);
    const progress = row ? JSON.parse(row.progress_json) : defaultSave();
    let xpAward = 0;
    if (mode === 'solo') {
      const oldBest = progress.bestTimes?.[mapId];
      if (!Number.isInteger(oldBest)) xpAward = 60;
      else if (elapsedMs < oldBest) xpAward = 15;
      progress.bestTimes = { ...(progress.bestTimes || {}), [mapId]: Math.min(oldBest || Number.MAX_SAFE_INTEGER, elapsedMs) };
      progress.xp = Math.min(100000000, (progress.xp || 0) + xpAward);
      progress.level = Math.max(1, Math.floor(progress.xp / 500) + 1);
    }
    const revision = row?.revision ?? 0;
    db.prepare(`INSERT INTO player_saves (user_id, revision, progress_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision, progress_json=excluded.progress_json, updated_at=CURRENT_TIMESTAMP`)
      .run(req.user.id, revision + 1, JSON.stringify(progress));
    return { revision: revision + 1, progress, xpAward };
  });
  const saved = transaction();
  res.status(201).json({ id, accepted: true, ranked: false, ...saved, note: 'Resultado guardado como registro personal. La clasificación competitiva verificada llegará con la simulación autoritativa.' });
});

app.get('/api/profile/stats', authRequired, (req, res) => {
  const aggregate = db.prepare(`SELECT COUNT(*) AS races, MIN(elapsed_ms) AS bestTime
    FROM race_results WHERE user_id=?`).get(req.user.id);
  const recent = db.prepare(`SELECT race_results.map_id AS mapId, maps.name AS mapName, race_results.elapsed_ms AS elapsedMs,
    race_results.laps, race_results.mode, race_results.created_at AS createdAt
    FROM race_results JOIN maps ON maps.id=race_results.map_id
    WHERE race_results.user_id=? ORDER BY race_results.created_at DESC LIMIT 10`).all(req.user.id);
  res.json({ ...aggregate, recent });
});

app.post('/api/rooms', authRequired, (req, res) => {
  const mapId = typeof req.body?.mapId === 'string' ? req.body.mapId : 'hanami-evening';
  // Las salas públicas usan por ahora circuitos base disponibles para todas las cuentas.
  // Los mapas personales procedurales aún no se publican/comparten entre propietarios.
  if (!MAPS.some((map) => map.id === mapId)) return res.status(400).json({ error: 'Por ahora las salas online admiten los seis circuitos base.' });
  db.prepare('DELETE FROM rooms WHERE expires_at < ?').run(Date.now());
  let code;
  do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); }
  while (db.prepare('SELECT 1 FROM rooms WHERE code=?').get(code));
  const now = Date.now();
  db.prepare('INSERT INTO rooms (code, owner_id, map_id, is_private, created_at, expires_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(code, req.user.id, mapId, now, now + 4 * 60 * 60 * 1000);
  res.status(201).json({ code, mapId, capacity: 8, expiresAt: now + 4 * 60 * 60 * 1000 });
});

app.post('/api/rooms/:code/join', authRequired, (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Código de sala no válido.' });
  const room = db.prepare('SELECT code, map_id AS mapId, expires_at AS expiresAt FROM rooms WHERE code=?').get(code);
  if (!room || room.expiresAt < Date.now()) return res.status(404).json({ error: 'La sala no existe o ha caducado.' });
  res.json({ code: room.code, mapId: room.mapId, capacity: 8 });
});

app.get('/api/rooms/:code', authRequired, (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = db.prepare('SELECT code, map_id AS mapId, expires_at AS expiresAt FROM rooms WHERE code=?').get(code);
  if (!room || room.expiresAt < Date.now()) return res.status(404).json({ error: 'Sala no encontrada.' });
  res.json({ ...room, players: roomMembers.get(code)?.size || 0, capacity: 8 });
});

app.use(express.static(distPath, { etag: true, maxAge: '1h', index: false }));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Endpoint no encontrado.' });
  const indexFile = path.join(distPath, 'index.html');
  if (!fs.existsSync(indexFile)) return res.status(503).send('Frontend sin compilar. Ejecuta npm run build.');
  return res.sendFile(indexFile, (error) => error && next(error));
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
const roomMembers = new Map();
const socketMeta = new WeakMap();

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function broadcast(code, payload, except = null) {
  const members = roomMembers.get(code);
  if (!members) return;
  for (const socket of members) if (socket !== except) send(socket, payload);
}
function numeric(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
  if (pathname !== '/ws' || !originAllowed(req)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
  const user = getUserFromRequest(req);
  const code = new URL(req.url, 'http://localhost').searchParams.get('room')?.toUpperCase();
  const room = code && db.prepare('SELECT code, map_id FROM rooms WHERE code=? AND expires_at>?').get(code, Date.now());
  if (!user || !room) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const members = roomMembers.get(code) || new Set();
  if (members.size >= 8) { socket.write('HTTP/1.1 409 Room Full\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => {
    roomMembers.set(code, members);
    members.add(ws);
    socketMeta.set(ws, { code, userId: user.id, username: user.username, lastMessageAt: 0, messageCount: 0 });
    send(ws, { type: 'welcome', code, mapId: room.map_id, self: { id: user.id, username: user.username }, players: [...members].map((member) => socketMeta.get(member)).filter(Boolean).map((meta) => ({ id: meta.userId, username: meta.username })) });
    broadcast(code, { type: 'player-joined', player: { id: user.id, username: user.username } }, ws);
    ws.on('message', (raw) => {
      const meta = socketMeta.get(ws);
      if (!meta) return;
      const now = Date.now();
      if (now - meta.lastMessageAt < 40) return;
      meta.lastMessageAt = now;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message?.type === 'ping') return send(ws, { type: 'pong', at: now });
      if (message?.type !== 'state') return;
      const p = message.position;
      if (!p || !numeric(p.x, -2000, 2000) || !numeric(p.y, -100, 300) || !numeric(p.z, -2000, 2000) ||
          !numeric(message.yaw, -Math.PI * 20, Math.PI * 20) || !numeric(message.speed, -10, 100) ||
          !Number.isInteger(message.lap) || message.lap < 0 || message.lap > 20) return;
      broadcast(meta.code, {
        type: 'player-state',
        player: { id: meta.userId, username: meta.username },
        state: { position: p, yaw: message.yaw, speed: message.speed, lap: message.lap, at: now }
      }, ws);
    });
    ws.on('close', () => {
      const meta = socketMeta.get(ws);
      if (!meta) return;
      const set = roomMembers.get(meta.code);
      if (set) {
        set.delete(ws);
        if (set.size === 0) roomMembers.delete(meta.code);
      }
      broadcast(meta.code, { type: 'player-left', player: { id: meta.userId, username: meta.username } });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`MingoVerse escuchando en http://${HOST}:${PORT}`);
});

function shutdown() {
  console.log('Cerrando MingoVerse...');
  for (const socket of wss.clients) socket.close(1001, 'Server shutdown');
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
