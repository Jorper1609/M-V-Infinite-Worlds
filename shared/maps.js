/**
 * Catálogo de circuitos iniciales. Los puntos son datos de diseño, no mallas
 * duplicadas: la geometría se construye bajo demanda en el cliente.
 */
export const MAPS = [
  {
    id: 'hanami-evening', slug: 'hanami-evening', name: 'Hanami Evening',
    subtitle: 'La ciudad de los cerezos', theme: 'sakura', category: 'Anime · Romance',
    vehicleType: 'car', difficulty: 2, length: '3,8 km', laps: 3,
    description: 'Un recorrido nocturno junto al río, bajo cerezos en flor y farolillos cálidos.',
    features: ['Ciudad japonesa', 'Cerezos', 'Noche', 'Atajos'],
    route: [[0,0,0],[24,0,-10],[52,0,-4],[66,0,20],[56,0,48],[28,0,58],[-2,0,52],[-24,0,32],[-26,0,8]],
    palette: { sky: '#111d35', fog: '#26344f', ground: '#243d35', road: '#30333d', accent: '#ff9fc8' }
  },
  {
    id: 'madrid-midnight', slug: 'madrid-midnight', name: 'Madrid Midnight',
    subtitle: 'Asfalto, luz y velocidad', theme: 'city', category: 'Ciudades del mundo',
    vehicleType: 'car', difficulty: 3, length: '4,6 km', laps: 3,
    description: 'Un circuito urbano original inspirado en las grandes avenidas y plazas de Madrid.',
    features: ['Urbano', 'Rectas largas', 'Chicanes', 'Noche'],
    route: [[0,0,0],[35,0,0],[65,0,18],[72,0,48],[42,0,68],[8,0,60],[-18,0,40],[-34,0,8],[-20,0,-22]],
    palette: { sky: '#0c1424', fog: '#2b3445', ground: '#30343e', road: '#292d36', accent: '#f2b85c' }
  },
  {
    id: 'monaco-crest', slug: 'monaco-crest', name: 'Monaco Crest',
    subtitle: 'Precisión entre murallas', theme: 'coast', category: 'Automovilismo',
    vehicleType: 'car', difficulty: 5, length: '3,3 km', laps: 3,
    description: 'Un trazado técnico junto al puerto, con horquillas cerradas y cambios de elevación visuales.',
    features: ['Técnico', 'Puerto', 'Horquillas', 'Vallas'],
    route: [[0,0,0],[18,0,-8],[40,0,-4],[48,0,14],[30,0,28],[12,0,22],[6,0,42],[-12,0,52],[-34,0,36],[-30,0,10]],
    palette: { sky: '#17263d', fog: '#40536c', ground: '#3c6156', road: '#353943', accent: '#61d5c6' }
  },
  {
    id: 'jurassic-canopy', slug: 'jurassic-canopy', name: 'Jurassic Canopy',
    subtitle: 'La jungla despierta', theme: 'jurassic', category: 'Aventura · Supervivencia',
    vehicleType: 'car', difficulty: 3, length: '5,2 km', laps: 2,
    description: 'Una ruta todoterreno entre vegetación densa, ruinas de investigación y grandes claros.',
    features: ['Jungla', 'Todoterreno', 'Ruinas', 'Desniveles'],
    route: [[0,0,0],[18,0,-18],[48,0,-24],[72,0,-4],[58,0,26],[34,0,44],[4,0,38],[-24,0,54],[-46,0,30],[-34,0,2]],
    palette: { sky: '#162c2c', fog: '#456458', ground: '#31583b', road: '#46453c', accent: '#a8dc79' }
  },
  {
    id: 'server-core', slug: 'server-core', name: 'Server Core',
    subtitle: 'Corre por el corazón digital', theme: 'tech', category: 'Mundos tecnológicos',
    vehicleType: 'car', difficulty: 4, length: '4,1 km', laps: 3,
    description: 'Pasillos de racks, puentes de fibra óptica y un núcleo de datos a escala monumental.',
    features: ['Centro de datos', 'Neón', 'Túneles', 'Saltos'],
    route: [[0,0,0],[26,0,-12],[54,0,-8],[62,0,16],[38,0,36],[12,0,28],[-12,0,48],[-40,0,42],[-52,0,12],[-26,0,-10]],
    palette: { sky: '#071729', fog: '#123b58', ground: '#10283b', road: '#182b3d', accent: '#50e3ff' }
  },
  {
    id: 'lunar-drift', slug: 'lunar-drift', name: 'Lunar Drift',
    subtitle: 'Gravedad baja, riesgo alto', theme: 'moon', category: 'Carreras planetarias',
    vehicleType: 'car', difficulty: 4, length: '6,0 km', laps: 2,
    description: 'Un circuito rocoso de baja gravedad con saltos largos y curvas sobre cráteres.',
    features: ['Luna', 'Baja gravedad', 'Rocas', 'Saltos'],
    route: [[0,0,0],[30,0,-16],[60,0,-6],[78,0,24],[46,0,54],[12,0,48],[-18,0,30],[-44,0,6],[-30,0,-24]],
    palette: { sky: '#101522', fog: '#5c6070', ground: '#676b75', road: '#353943', accent: '#c7d4eb' }
  }
];

export function publicMap(map) {
  const { route, palette, ...safe } = map;
  return safe;
}

export function getMap(id) {
  return MAPS.find((map) => map.id === id) ?? null;
}
