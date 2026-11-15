# MingoVerse

**Versión:** 0.1.0 · **Estado:** primera entrega técnica jugable (vertical slice), no juego completo.

MingoVerse es un videojuego 3D de navegador con cliente renderizado localmente. Esta entrega prioriza una base real y persistente antes de ampliar el universo.

## Qué funciona en esta entrega

- Registro e inicio de sesión con contraseña derivada mediante `scrypt` y sesiones opacas almacenadas como hashes.
- Cookie `HttpOnly`, `SameSite=Lax`, validación de origen en operaciones de escritura y limitación básica de intentos de autenticación.
- Base SQLite persistente en `data/mingoverse.sqlite`, claves foráneas, WAL y control optimista de revisiones de guardado.
- Seis circuitos base de coche diseñados con rutas y ambientaciones originales: Hanami Evening, Madrid Midnight, Monaco Crest, Jurassic Canopy, Server Core y Lunar Drift.
- Generador procedural determinista con semilla de 64 bits: cada combinación de semilla y temática crea un trazado persistente, con ruta/checkpoints y geometría construida en el cliente. Cada cuenta puede guardar hasta 5.000 mapas personales; el catálogo inicial no se anuncia como si ya incluyera miles de mapas.
- Renderizado Three.js en el navegador, geometría procedural, vehículo 3D original, física local Rapier, conducción arcade, checkpoints, vueltas, tres vehículos visuales que circulan por el circuito (sin IA competitiva ni colisiones entre coches) y recuperación del vehículo.
- Compatibilidad inicial con teclado y mandos mediante Gamepad API.
- Salas privadas de hasta ocho conexiones, códigos de seis caracteres y sincronización WebSocket de estados de vehículos.
- Historial personal de resultados, estadísticas y XP guardados en la cuenta.
- Docker Compose, healthcheck y volumen persistente.

## Qué NO está terminado

No se presenta como completo lo que todavía no lo está. En esta versión aún no hay: campaña narrativa jugable, combate a pie, sables de luz, físicas de barcos, naves espaciales, pantalla dividida, exploración a pie, base personal, nave explorable, editor de mapas, temporadas, chat/amigos, replay, clasificación competitiva verificada ni 500–5.000 mapas. El garaje tiene un visor Three.js del único vehículo disponible; todavía no incorpora personalización real.

El multijugador actual autentica salas de hasta ocho conexiones y transmite posiciones. Las salas online usan los seis circuitos base: los mapas procedurales personales todavía no se pueden compartir entre cuentas. El servidor no ejecuta una simulación autoritativa completa. Los resultados se guardan como registros personales (`ranked: false`), no como resultados competitivos verificados.

## Arquitectura

```text
Navegador
  ├── Three.js: escena, cámara, geometría y renderizado
  ├── Rapier: física local de conducción
  ├── Gamepad API / teclado
  └── HTTPS + WebSocket
          │
          ▼
Node.js / Express
  ├── Autenticación y sesiones
  ├── API de progreso, estadísticas y resultados
  ├── Catálogo de mapas y salas
  └── WebSocket: presencia y estados de jugadores
          │
          ▼
SQLite (volumen /app/data)
```

El servidor no renderiza gráficos. La física de la carrera solitaria ocurre en el navegador. Los datos de las salas se mantienen ligeros; la sincronización actual es un relay de estados y no un servidor de física competitiva.

## Requisitos

- Docker Engine + Docker Compose.
- Acceso a Internet durante la primera construcción para descargar dependencias npm e imagen base. El juego no depende de APIs externas en tiempo de ejecución.
- Navegador moderno con WebGL 2 y JavaScript habilitado.
- Para el Synology DS224+: se recomienda comenzar con calidad gráfica media/alta según el ordenador cliente. El servidor solo gestiona HTTP, WebSocket y SQLite.

## Instalación en Synology DSM

1. Crea `/volume2/docker/mingoverse` y copia allí el contenido de este proyecto.
2. Comprueba que `data` pertenece al usuario/UID que utilizará el contenedor. En tu Synology, con UID `1026` y GID `100`, el valor predeterminado de Compose ya está ajustado; corrige permisos si fuera necesario con `sudo chown -R 1026:100 data`.
3. Entra en esa carpeta por SSH.
4. Genera el fichero de configuración:

```bash
cp .env.example .env
```

5. Genera un secreto robusto:

```bash
openssl rand -hex 48
```

6. Edita `.env` y pega el resultado en `SESSION_SECRET`. Configura también:
   - `COOKIE_SECURE=true` cuando el acceso público sea HTTPS.
   - `PUBLIC_ORIGIN=https://tu-dominio.example` con el origen real del dominio.
   - `TRUST_PROXY=1` si Nginx Proxy Manager/NPMPlus es el único proxy situado delante del contenedor.
   - `PUID=1026` y `PGID=100` para que el proceso pueda escribir en el volumen con los permisos habituales de tu Synology (puedes cambiarlos si tu carpeta usa otros IDs).
7. Construye e inicia:

```bash
docker compose up -d --build
```

8. Comprueba el estado:

```bash
curl http://127.0.0.1:3307/api/health
```

Abre `http://IP-DE-TU-SYNOLOGY:3307` desde la red local y crea la primera cuenta. No hay credenciales predeterminadas.

## Reverse proxy (NPMPlus / Nginx Proxy Manager)

Crea un Proxy Host apuntando al host del Synology y al puerto `3307`, con esquema `http`. Activa **WebSocket Support**. Habilita HTTPS y fuerza HTTPS desde el proxy. Configura en `.env` el mismo dominio público y `COOKIE_SECURE=true`; reinicia el contenedor después de cambiarlo.

Si el proxy está en otro equipo o contenedor con IP propia, usa la IP LAN real donde se publica el puerto del Synology. No expongas SQLite ni la carpeta `data` directamente.

## Persistencia y copias de seguridad

Todo el estado está en `./data` del host. Para crear una copia online consistente mediante la API de backup de SQLite, ejecuta `./backup.sh`; los archivos aparecerán en `data/backups/`. No borres esa carpeta al actualizar la imagen. El fichero SQLite usa WAL; para una copia manual simple, detén temporalmente el servicio y copia la carpeta completa:

```bash
docker compose down
cp -a data "data-backup-$(date +%Y%m%d-%H%M%S)"
docker compose up -d
```

No copies solamente `mingoverse.sqlite` mientras el servicio está escribiendo: también pueden existir `-wal` y `-shm`.

## Actualización

Haz primero una copia de seguridad y después reconstruye:

```bash
docker compose down
docker compose build --pull
docker compose up -d
```

La persistencia vive en `./data`, por lo que reconstruir o sustituir el contenedor no elimina el progreso.

## Desarrollo local

Con Node.js 22.12+ (la imagen Docker usa Node 26 LTS):

```bash
npm install
npm run server
```

En otra terminal:

```bash
npm run dev
```

Vite sirve el cliente en `http://localhost:5173` y envía `/api` y `/ws` al servidor local `3307`.

Para validar sintaxis y catálogo:

```bash
npm test
find server client/src shared tests -name '*.js' -print0 | xargs -0 -n1 node --check
```

## Rendimiento y límites conocidos

- El servidor no simula la física de la carrera en solitario.
- La escena usa geometría y vegetación instanciadas; carga únicamente el circuito seleccionado.
- Esta versión no carga modelos externos pesados.
- La física de conducción es arcade y está en iteración; no es una simulación homologada de F1.
- No hay sistema antitrampas infalible. El relay WebSocket limita tamaño y frecuencia de mensajes y comprueba rangos básicos, pero un cliente modificado aún puede enviar estados falsos.
- La sala tiene capacidad máxima de ocho sockets conectados. La presencia no es persistente si el proceso se reinicia; cuentas y progreso sí.

## Siguiente orden de desarrollo

1. Pruebas funcionales automatizadas y estabilidad de la conducción.
2. Validación de checkpoints/tiempos y simulación competitiva autoritativa ligera.
3. Segundo modo de vehículo con físicas marítimas para Ibiza.
4. Exploración a pie y primer capítulo narrativo.
5. Combate y sistema de equipamiento.
6. Garaje persistente y nave/base.
7. Editor procedural y expansión real del catálogo.

La cantidad objetivo de mapas se alcanzará solo cuando cada mapa tenga trazado, checkpoints, límites y diferencias jugables comprobables.
