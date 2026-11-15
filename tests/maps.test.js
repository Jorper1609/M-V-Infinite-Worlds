import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, getMap, publicMap } from '../shared/maps.js';

test('el catálogo tiene identificadores únicos y rutas utilizables', () => {
  assert.equal(MAPS.length, 6);
  assert.equal(new Set(MAPS.map((map) => map.id)).size, MAPS.length);
  for (const map of MAPS) {
    assert.match(map.id, /^[a-z0-9-]+$/);
    assert.ok(map.route.length >= 8, `${map.id}: faltan puntos de ruta`);
    assert.ok(map.route.every((point) => point.length === 3 && point.every(Number.isFinite)));
    assert.ok(map.laps >= 2 && map.laps <= 5);
    assert.equal(map.vehicleType, 'car');
  }
});

test('la API de mapas no expone la geometría procedural completa', () => {
  const safe = publicMap(MAPS[0]);
  assert.equal(safe.id, MAPS[0].id);
  assert.equal('route' in safe, false);
  assert.equal('palette' in safe, false);
});

test('getMap devuelve null en identificadores inexistentes', () => {
  assert.equal(getMap('no-existe'), null);
});

import { generateProceduralMap, normalizeSeed } from '../shared/procedural.js';

test('las semillas procedurales son deterministas y generan rutas cerradas utilizables', () => {
  const first = generateProceduralMap('tokyo-2026', 'sakura');
  const repeated = generateProceduralMap('tokyo-2026', 'sakura');
  const different = generateProceduralMap('tokyo-2027', 'sakura');
  assert.deepEqual(first.route, repeated.route);
  assert.notDeepEqual(first.route, different.route);
  assert.ok(first.route.length >= 11 && first.route.length <= 16);
  assert.ok(first.route.every((point) => point.length === 3 && point.every(Number.isFinite)));
  assert.equal(first.procedural, true);
  assert.equal(first.theme, 'sakura');
});

test('la normalización de semillas limita y sanea la entrada', () => {
  assert.equal(normalizeSeed('  Tokyo_2026 '), 'tokyo_2026');
  assert.equal(normalizeSeed('a'), null);
  assert.equal(normalizeSeed('tokyo 2026'), null);
  assert.equal(normalizeSeed('../etc/passwd'), null);
  assert.equal(normalizeSeed(123), null);
});


test('el generador conserva identificadores distintos a escala de catálogo', () => {
  const ids = new Set();
  for (let index = 0; index < 2500; index++) {
    ids.add(generateProceduralMap(`mapa-${index}`, 'city').id);
  }
  assert.equal(ids.size, 2500);
  assert.throws(() => generateProceduralMap('tokyo-2026', 'tema-inventado'), /Temática no válida/);
});
