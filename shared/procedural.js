const THEMES = {
  sakura: {
    label: 'Anime · Romance', category: 'Anime · Romance',
    palette: { sky: '#111d35', fog: '#26344f', ground: '#243d35', road: '#30333d', accent: '#ff9fc8' },
    features: ['Cerezos', 'Calles tranquilas', 'Atajos', 'Noche'],
    description: 'Un recorrido urbano íntimo entre farolillos, parques y avenidas japonesas.'
  },
  city: {
    label: 'Ciudad nocturna', category: 'Ciudades del mundo',
    palette: { sky: '#0c1424', fog: '#2b3445', ground: '#30343e', road: '#292d36', accent: '#f2b85c' },
    features: ['Urbano', 'Edificios', 'Chicanes', 'Rectas'],
    description: 'Un trazado de alta velocidad que serpentea entre bloques urbanos y plazas.'
  },
  coast: {
    label: 'Costa mediterránea', category: 'Circuitos costeros',
    palette: { sky: '#17263d', fog: '#40536c', ground: '#3c6156', road: '#353943', accent: '#61d5c6' },
    features: ['Costa', 'Miradores', 'Curvas rápidas', 'Viento'],
    description: 'Curvas amplias, miradores y cambios de ritmo junto a un litoral ficticio.'
  },
  jurassic: {
    label: 'Jungla prehistórica', category: 'Aventura · Supervivencia',
    palette: { sky: '#162c2c', fog: '#456458', ground: '#31583b', road: '#46453c', accent: '#a8dc79' },
    features: ['Jungla', 'Todoterreno', 'Ruinas', 'Vegetación'],
    description: 'Una ruta salvaje entre vegetación densa, rocas y puestos de investigación.'
  },
  tech: {
    label: 'Mundo tecnológico', category: 'Mundos tecnológicos',
    palette: { sky: '#071729', fog: '#123b58', ground: '#10283b', road: '#182b3d', accent: '#50e3ff' },
    features: ['Centro de datos', 'Neón', 'Pasarelas', 'Túneles'],
    description: 'Un circuito digital entre estructuras de servidores y corredores luminosos.'
  },
  moon: {
    label: 'Superficie lunar', category: 'Carreras planetarias',
    palette: { sky: '#101522', fog: '#5c6070', ground: '#676b75', road: '#353943', accent: '#c7d4eb' },
    features: ['Luna', 'Baja gravedad', 'Cráteres', 'Rocas'],
    description: 'Un trazado rocoso con curvas abiertas, cráteres y baja gravedad visual.'
  }
};

function hashSeed(text) {
  // FNV-1a de 64 bits: reduce de forma importante la probabilidad de colisión
  // al crecer hacia miles de semillas persistentes.
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash;
}

function randomFrom(seed) {
  // SplitMix64 determinista; genera 53 bits para convertirlos en [0, 1).
  let value = seed;
  return () => {
    value = BigInt.asUintN(64, value + 0x9e3779b97f4a7c15n);
    let mixed = value;
    mixed = BigInt.asUintN(64, (mixed ^ (mixed >> 30n)) * 0xbf58476d1ce4e5b9n);
    mixed = BigInt.asUintN(64, (mixed ^ (mixed >> 27n)) * 0x94d049bb133111ebn);
    mixed ^= mixed >> 31n;
    return Number(mixed >> 11n) / 9007199254740992;
  };
}

export function normalizeSeed(value) {
  if (typeof value !== 'string') return null;
  const seed = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,32}$/.test(seed)) return null;
  return seed;
}

/**
 * Genera la topología de un circuito cerrado a partir de una semilla estable.
 * Los ángulos se mantienen ordenados y el radio siempre es positivo: el trazado
 * no se cruza consigo mismo por construcción. La geometría 3D se crea luego en
 * el navegador y no se almacena como una malla pesada.
 */
export function generateProceduralMap(seedInput, theme = 'city') {
  const seed = normalizeSeed(seedInput);
  if (!seed) throw new Error('La semilla debe tener entre 3 y 32 caracteres (letras, números, guion o guion bajo).');
  if (typeof theme !== 'string' || !Object.hasOwn(THEMES, theme)) throw new Error('Temática no válida.');
  const selectedTheme = theme;
  const themeData = THEMES[selectedTheme];
  const hash = hashSeed(`${seed}:${selectedTheme}`);
  const random = randomFrom(hash);
  const count = 11 + Math.floor(random() * 6);
  const rotation = random() * Math.PI * 2;
  const baseRadius = 31 + random() * 14;
  const eccentricity = 0.66 + random() * 0.3;
  const route = [];
  for (let i = 0; i < count; i++) {
    const step = (Math.PI * 2) / count;
    const angle = rotation + i * step + (random() - 0.5) * step * 0.17;
    const harmonic = Math.sin(i * 2.17 + random() * 0.8) * 0.18 + Math.cos(i * 0.83 + random()) * 0.12;
    const radius = baseRadius * (0.76 + random() * 0.48 + harmonic);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius * eccentricity;
    route.push([Number(x.toFixed(2)), 0, Number(z.toFixed(2))]);
  }
  const baseLength = route.reduce((total, point, index) => {
    const next = route[(index + 1) % route.length];
    return total + Math.hypot(point[0] - next[0], point[2] - next[2]);
  }, 0);
  const approxKm = baseLength * 12 / 1000 * 1.12;
  const difficulty = 2 + Math.floor(random() * 4);
  const laps = approxKm > 4.3 ? 2 : 3;
  const seedCode = hash.toString(36).toUpperCase().padStart(13, '0');
  return {
    id: `generated-${hash.toString(36)}`,
    slug: `generated-${hash.toString(36)}`,
    seed,
    name: `Circuito ${seed.replaceAll('-', ' ').replaceAll('_', ' ')}`,
    subtitle: `${themeData.label} · Diseño procedural`,
    theme: selectedTheme,
    category: themeData.category,
    vehicleType: 'car',
    difficulty,
    length: `${approxKm.toFixed(1).replace('.', ',')} km`,
    laps,
    description: themeData.description,
    features: themeData.features,
    route,
    palette: themeData.palette,
    procedural: true,
    seedCode
  };
}
