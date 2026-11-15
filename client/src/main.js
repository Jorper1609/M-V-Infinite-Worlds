import { api, auth, saveApi } from './api.js';
import { MingoRace } from './game/Game.js';
import { GaragePreview } from './game/GaragePreview.js';
import { MAPS } from '../../shared/maps.js';
import './style.css';

const root = document.querySelector('#app');
const state = {
  user: null,
  revision: 0,
  save: null,
  maps: MAPS,
  stats: { races: 0, bestTime: null, recent: [] },
  route: 'home',
  game: null,
  currentMap: null,
  roomCode: null,
  quality: 'high',
  worldFilter: 'Todos',
  garagePreview: null
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const formatTime = (ms) => {
  if (!Number.isFinite(ms)) return '—';
  const total = ms / 1000;
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${(total % 60).toFixed(3).padStart(6, '0')}`;
};
const formatClock = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

async function boot() {
  try {
    const session = await auth.me();
    state.user = session.user;
    await loadAccountData();
    renderShell();
  } catch {
    renderAuth();
  }
}

async function loadAccountData() {
  const [save, stats, maps] = await Promise.all([saveApi.load(), api('/api/profile/stats'), api('/api/maps')]);
  state.revision = save.revision;
  state.save = save.progress;
  state.stats = stats;
  state.maps = [
    ...MAPS.map((local) => ({ ...local, ...(maps.maps.find((remote) => remote.id === local.id) || {}) })),
    ...maps.maps.filter((remote) => !MAPS.some((local) => local.id === remote.id))
  ];
  state.quality = state.save.settings?.quality || 'high';
}

function renderAuth(error = '') {
  root.innerHTML = `
    <main class="auth-screen">
      <div class="auth-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="planet"></div><div class="auth-wordmark">MINGO<span>VERSE</span></div><p>UN UNIVERSO. INFINITAS FORMAS DE JUGAR.</p><div class="auth-bottom">EXPLORA · COMPITE · DESCUBRE</div></div>
      <section class="auth-panel">
        <div class="mobile-brand">MINGO<span>VERSE</span></div>
        <div class="eyebrow">TU UNIVERSO TE ESPERA</div>
        <h1 id="auth-title">Vuelve a tu universo.</h1>
        <p class="muted" id="auth-subtitle">Inicia sesión para continuar exactamente donde lo dejaste.</p>
        <div class="auth-tabs"><button class="auth-tab active" data-auth-mode="login">Iniciar sesión</button><button class="auth-tab" data-auth-mode="register">Crear cuenta</button></div>
        <form id="auth-form" class="auth-form">
          <div id="username-field" class="field hidden"><label for="username">Nombre de usuario</label><input id="username" name="username" autocomplete="username" minlength="3" maxlength="20" placeholder="Tu nombre en MingoVerse" /></div>
          <div id="email-field" class="field hidden"><label for="email">Correo electrónico</label><input id="email" name="email" type="email" autocomplete="email" placeholder="tu@email.com" /></div>
          <div id="login-field" class="field"><label for="login">Usuario o correo</label><input id="login" name="login" autocomplete="username" required placeholder="Tu usuario o correo" /></div>
          <div class="field"><label for="password">Contraseña</label><input id="password" name="password" type="password" minlength="12" autocomplete="current-password" required placeholder="Mínimo 12 caracteres" /></div>
          <div id="auth-error" class="form-error" role="alert">${escapeHtml(error)}</div>
          <button class="primary-button full" id="auth-submit" type="submit">Entrar en MingoVerse <span>↗</span></button>
        </form>
        <div class="auth-security"><span class="security-dot"></span> Tu progreso se guarda en tu servidor</div>
        <div class="auth-legal">Contraseñas protegidas con scrypt · Sesiones seguras</div>
      </section>
    </main>`;

  let mode = 'login';
  const modeButtons = root.querySelectorAll('[data-auth-mode]');
  const title = root.querySelector('#auth-title');
  const subtitle = root.querySelector('#auth-subtitle');
  const usernameField = root.querySelector('#username-field');
  const emailField = root.querySelector('#email-field');
  const loginField = root.querySelector('#login-field');
  const password = root.querySelector('#password');
  const submit = root.querySelector('#auth-submit');
  const errorBox = root.querySelector('#auth-error');
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.authMode;
    modeButtons.forEach((entry) => entry.classList.toggle('active', entry === button));
    const registering = mode === 'register';
    usernameField.classList.toggle('hidden', !registering);
    emailField.classList.toggle('hidden', !registering);
    loginField.classList.toggle('hidden', registering);
    root.querySelector('#username').required = registering;
    root.querySelector('#email').required = registering;
    password.autocomplete = registering ? 'new-password' : 'current-password';
    title.textContent = registering ? 'Crea tu identidad.' : 'Vuelve a tu universo.';
    subtitle.textContent = registering ? 'Una cuenta. Todo tu progreso. Todos tus dispositivos.' : 'Inicia sesión para continuar exactamente donde lo dejaste.';
    submit.innerHTML = registering ? 'Crear mi cuenta <span>↗</span>' : 'Entrar en MingoVerse <span>↗</span>';
    errorBox.textContent = '';
  }));
  root.querySelector('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = mode === 'register' ? 'Creando cuenta…' : 'Entrando…';
    errorBox.textContent = '';
    try {
      const form = new FormData(event.currentTarget);
      const result = mode === 'register'
        ? await auth.register(form.get('username'), form.get('email'), form.get('password'))
        : await auth.login(form.get('login'), form.get('password'));
      state.user = result.user;
      await loadAccountData();
      renderShell();
    } catch (error) {
      errorBox.textContent = error.message;
      submit.disabled = false;
      submit.innerHTML = mode === 'register' ? 'Crear mi cuenta <span>↗</span>' : 'Entrar en MingoVerse <span>↗</span>';
    }
  });
}

function renderShell() {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">M</span><span>MINGO<span class="brand-light">VERSE</span><small>UNIVERSO COMPARTIDO</small></span></div>
        <div class="side-caption">UNIVERSO</div>
        <nav class="side-nav">
          <button data-route="home" class="nav-item"><span>⌂</span> Inicio</button>
          <button data-route="story" class="nav-item"><span>◈</span> Modo historia <i class="soon">EN OBRA</i></button>
          <button data-route="races" class="nav-item"><span>⌁</span> Carreras</button>
          <button data-route="worlds" class="nav-item"><span>◎</span> Mundos</button>
          <button data-route="online" class="nav-item"><span>⌘</span> Multijugador</button>
        </nav>
        <div class="side-caption side-caption-gap">MI ESPACIO</div>
        <nav class="side-nav">
          <button data-route="garage" class="nav-item"><span>▰</span> Mi garaje</button>
          <button data-route="profile" class="nav-item"><span>◉</span> Perfil y progreso</button>
          <button data-route="settings" class="nav-item"><span>⚙</span> Configuración</button>
        </nav>
        <div class="sidebar-bottom"><div class="server-status"><span class="status-led"></span><span>Servidor conectado</span></div><div class="sidebar-version">MINGOVERSE · v0.1.0</div><button id="logout" class="logout-button">↪ Cerrar sesión</button></div>
      </aside>
      <main class="main-area">
        <header class="topbar"><div class="breadcrumb"><span>UNIVERSO</span><b>/</b><strong id="current-section">INICIO</strong></div><div class="topbar-right"><span class="online-indicator"><i></i> CUENTA GUARDADA</span><div class="user-chip"><div class="avatar">${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}</div><span>${escapeHtml(state.user.username)}</span></div></div></header>
        <div id="content" class="content-area"></div>
      </main>
    </div>`;
  root.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.route)));
  root.querySelector('#logout').addEventListener('click', async () => {
    try { await auth.logout(); } finally { state.garagePreview?.destroy(); state.garagePreview = null; state.user = null; state.game?.destroy(); state.game = null; renderAuth(); }
  });
  navigate(state.route || 'home');
}

function navigate(route) {
  state.garagePreview?.destroy();
  state.garagePreview = null;
  state.route = route;
  root.querySelectorAll('[data-route]').forEach((button) => button.classList.toggle('active', button.dataset.route === route));
  const names = { home: 'INICIO', story: 'MODO HISTORIA', races: 'CARRERAS', worlds: 'MUNDOS', online: 'MULTIJUGADOR', garage: 'MI GARAJE', profile: 'PERFIL Y PROGRESO', settings: 'CONFIGURACIÓN' };
  const section = root.querySelector('#current-section');
  if (section) section.textContent = names[route] || 'INICIO';
  const content = root.querySelector('#content');
  if (!content) return;
  const renderers = { home: renderHome, races: renderRaces, worlds: renderWorlds, online: renderOnline, garage: renderGarage, profile: renderProfile, settings: renderSettings, story: renderStory };
  content.innerHTML = (renderers[route] || renderHome)();
  bindContent(route);
  if (route === 'garage') {
    try {
      state.garagePreview = new GaragePreview(root.querySelector('#garage-viewer'));
      state.garagePreview.start();
    } catch (error) {
      state.garagePreview?.destroy();
      state.garagePreview = null;
      root.querySelector('#garage-viewer').textContent = `No se pudo cargar el visor 3D: ${error.message}`;
    }
  }
}

function mapCard(map, index = 0, compact = false) {
  const theme = map.theme || 'sakura';
  return `<article class="map-card theme-${theme} ${compact ? 'compact-card' : ''}" style="--card-index:${index}">
    <div class="map-art"><div class="art-orb"></div><div class="art-grid"></div><div class="art-label">${escapeHtml(map.category)}</div><div class="art-number">${String(index + 1).padStart(2, '0')}</div><div class="art-title">${escapeHtml(map.name)}</div><div class="art-subtitle">${escapeHtml(map.subtitle)}</div></div>
    <div class="map-card-body"><div class="map-meta"><span>◉ ${escapeHtml(map.length)}</span><span>◆ DIFICULTAD ${map.difficulty}/5</span><span>↻ ${map.laps} vueltas</span></div><p>${escapeHtml(map.description)}</p><div class="map-tags">${map.features.slice(0, 3).map((feature) => `<span>${escapeHtml(feature)}</span>`).join('')}</div><button class="card-action" data-start-map="${escapeHtml(map.id)}">${compact ? 'Seleccionar' : 'Correr en este mapa'} <span>↗</span></button></div>
  </article>`;
}

function renderHome() {
  const dateLabel = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase('es-ES');
  const currentMap = MAPS.find((map) => map.id === 'hanami-evening');
  const progress = state.save?.xp || 0;
  const level = state.save?.level || 1;
  return `<section class="welcome-row"><div><div class="eyebrow">${dateLabel} · TU UNIVERSO</div><h1>Bienvenido de vuelta,<br><em>${escapeHtml(state.user.username)}.</em></h1><p class="muted">Tu próxima historia empieza donde tú decidas.</p></div><div class="level-card"><div class="level-ring"><span>${level}</span></div><div><small>NIVEL DE EXPLORADOR</small><strong>${progress.toLocaleString('es-ES')} XP</strong><div class="progress-track"><i style="width:${Math.min(95, (progress % 500) / 5)}%"></i></div></div></div></section>
    <section class="hero-banner"><div class="hero-copy"><div class="hero-kicker"><span class="live-dot"></span> CIRCUITO DESTACADO</div><h2>Una noche bajo<br>los <em>cerezos.</em></h2><p>Luces cálidas, calles japonesas y una ruta que serpentea junto al río. Enciende el motor.</p><button class="primary-button" data-start-map="${currentMap.id}">Entrar en Hanami Evening <span>↗</span></button></div><div class="hero-scene"><div class="hero-moon"></div><div class="hero-sakura sakura-a"></div><div class="hero-sakura sakura-b"></div><div class="hero-road"></div><div class="hero-car"></div><div class="hero-city"></div><div class="hero-caption">JAPAN · 23:40 · CLEAR SKY</div></div></section>
    <section class="section-head"><div><div class="eyebrow">ELIGE TU PRÓXIMO DESTINO</div><h2>Mundos destacados</h2></div><button class="text-link" data-route="worlds">Ver todos los mundos <span>↗</span></button></section>
    <section class="map-grid home-map-grid">${MAPS.slice(0, 3).map((map, index) => mapCard(map, index, true)).join('')}</section>
    <section class="dashboard-grid"><div class="dashboard-panel"><div class="panel-kicker">TU ACTIVIDAD</div><h3>Tu progreso continúa.</h3><p>Las carreras que completes quedan vinculadas a tu cuenta y se sincronizan con tu servidor.</p><div class="stat-strip"><div><strong>${state.stats.races || 0}</strong><span>CARRERAS</span></div><div><strong>${state.save?.completedMissions?.length || 0}</strong><span>MISIONES</span></div><div><strong>${Object.keys(state.save?.bestTimes || {}).length}</strong><span>RÉCORDS</span></div></div><button class="subtle-button" data-route="profile">Ver perfil completo ↗</button></div><div class="dashboard-panel feature-panel"><div class="panel-kicker">PRÓXIMAMENTE</div><h3>El universo se expande.</h3><p>La campaña narrativa, la base personal, la nave y nuevas disciplinas se incorporarán como módulos reales, sin botones ficticios.</p><div class="feature-chips"><span>HISTORIA</span><span>EXPLORACIÓN</span><span>COMBATE</span><span>NUEVOS MUNDOS</span></div></div></section>`;
}

function renderRaces() {
  return `<div class="page-heading"><div><div class="eyebrow">COMPITE · MEJORA · REPITE</div><h1>Elige tu <em>circuito.</em></h1><p class="muted">Circuitos originales y recorridos procedurales guardados en tu cuenta.</p></div><div class="heading-chip">${state.maps.length} CIRCUITOS DISPONIBLES</div></div><div class="map-grid race-map-grid">${state.maps.map(mapCard).join('')}</div>`;
}

function renderWorlds() {
  const categories = [...new Set(state.maps.map((map) => map.category))];
  const visibleMaps = state.worldFilter === 'Todos' ? state.maps : state.maps.filter((map) => map.category === state.worldFilter);
  const filters = ['Todos', ...categories].map((name) => `<button type="button" class="filter-pill ${state.worldFilter === name ? 'selected' : ''}" data-world-filter="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  return `<div class="page-heading"><div><div class="eyebrow">CATÁLOGO DE MUNDOS</div><h1>Descubre nuevos <em>lugares.</em></h1><p class="muted">Los mundos se descargan bajo demanda; cada semilla produce un trazado propio.</p></div><div class="heading-chip">${state.maps.length} MAPAS EN TU CATÁLOGO</div></div><section class="generator-panel"><div><div class="eyebrow">GENERADOR PROCEDURAL</div><h2>Crea un circuito con tu propia semilla.</h2><p>La semilla fija la topología del trazado. Puedes regenerarlo usando la misma semilla para obtener exactamente el mismo recorrido.</p></div><div class="generator-controls"><input id="map-seed" maxlength="32" placeholder="Ej.: tokyo-2026" value="tokyo-2026" /><select id="map-theme"><option value="sakura">Anime romántico</option><option value="city">Ciudad nocturna</option><option value="coast">Costa mediterránea</option><option value="jurassic">Jungla prehistórica</option><option value="tech">Mundo tecnológico</option><option value="moon">Superficie lunar</option></select><button id="generate-map" class="primary-button">Generar circuito ↗</button></div><div id="generator-message" class="form-error" role="status"></div></section><div class="world-filter-row">${filters}</div><div class="map-grid race-map-grid">${visibleMaps.length ? visibleMaps.map(mapCard).join('') : '<div class="empty-state">No hay mapas en esta categoría.</div>'}</div><div class="catalog-note"><span>i</span><div><strong>Transparencia del catálogo</strong><p>El catálogo empieza con seis circuitos diseñados a mano. Puedes generar y guardar trazados procedurales distintos por semilla y temática; la meta de 500–5.000 mapas se alcanzará tras ampliar y validar más plantillas y mecánicas.</p></div></div>`;
}

function renderOnline() {
  return `<div class="page-heading"><div><div class="eyebrow">COMPITE CON OTRAS PERSONAS</div><h1>Juega <em>en compañía.</em></h1><p class="muted">Crea una sala privada de hasta 8 jugadores o entra con un código.</p></div><div class="heading-chip online-chip"><i></i> WEBSOCKETS ACTIVOS</div></div>
    <div class="online-layout"><section class="online-panel"><div class="online-icon">⌘</div><div class="eyebrow">ANFITRIÓN</div><h2>Crea tu sala.</h2><p>Elige uno de los circuitos disponibles. Recibirás un código privado para compartir con tus amigos.</p><label for="room-map">Circuito</label><select id="room-map">${MAPS.map((map) => `<option value="${map.id}">${escapeHtml(map.name)}</option>`).join('')}</select><button class="primary-button full" id="create-room">Crear sala privada <span>↗</span></button><div id="room-created" class="room-created hidden"></div></section>
    <section class="online-panel join-panel"><div class="online-icon">↗</div><div class="eyebrow">INVITADO</div><h2>Únete a una sala.</h2><p>Introduce el código de seis caracteres que te ha compartido el anfitrión.</p><label for="join-code">Código de invitación</label><input id="join-code" class="room-code-input" maxlength="6" placeholder="ABC123" autocomplete="off" /><button class="secondary-button full" id="join-room">Entrar en la sala <span>↗</span></button><div id="join-error" class="form-error" role="alert"></div></section></div>
    <div class="catalog-note"><span>i</span><div><strong>Estado del multijugador</strong><p>Las salas, la autenticación WebSocket y la sincronización de posiciones están implementadas. La física autoritativa y las clasificaciones antitrampas todavía no están terminadas; los resultados online no se consideran competitivos verificados.</p></div></div>`;
}

function renderGarage() {
  return `<div class="page-heading"><div><div class="eyebrow">TU COLECCIÓN</div><h1>Mi <em>garaje.</em></h1><p class="muted">Los vehículos se comparten entre disciplinas compatibles.</p></div><div class="heading-chip">1 VEHÍCULO DESBLOQUEADO</div></div><div class="garage-layout"><div id="garage-viewer" class="garage-vehicle-preview" role="img" aria-label="Visor 3D del vehículo MV GT-01"><div class="garage-model-label">MV / GT-01 · ARRASTRA PARA GIRAR</div></div><div class="garage-details"><div class="eyebrow">VEHÍCULO INICIAL · CLASE GT</div><h2>MV GT-01 <span class="rarity">COMÚN</span></h2><p class="muted">Un gran turismo equilibrado, diseñado para aprender las bases de la conducción en MingoVerse.</p><div class="vehicle-stats"><div><span>VELOCIDAD</span><b>78</b><i><u style="width:78%"></u></i></div><div><span>ACELERACIÓN</span><b>82</b><i><u style="width:82%"></u></i></div><div><span>AGARRE</span><b>74</b><i><u style="width:74%"></u></i></div><div><span>FRENADA</span><b>76</b><i><u style="width:76%"></u></i></div></div><div class="catalog-note"><span>i</span><div><strong>Personalización pendiente</strong><p>El visor 3D permite inspeccionar el modelo. Pintura, llantas, mejoras y colección ampliada forman parte del siguiente módulo del garaje.</p></div></div></div></div>`;
}

function renderProfile() {
  const recent = state.stats.recent || [];
  return `<div class="page-heading"><div><div class="eyebrow">IDENTIDAD DEL JUGADOR</div><h1>Tu <em>progreso.</em></h1><p class="muted">Un único perfil sincronizado con tu cuenta.</p></div><div class="heading-chip">ID ${escapeHtml(state.user.id.slice(0, 8).toUpperCase())}</div></div><section class="profile-banner"><div class="profile-avatar">${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}</div><div><div class="eyebrow">EXPLORADOR DE MINGOVERSE</div><h2>${escapeHtml(state.user.username)}</h2><p>${escapeHtml(state.user.email)}</p></div><div class="profile-level"><span>NIVEL</span><strong>${state.save.level}</strong></div></section><div class="profile-stats-grid"><div><span>EXPERIENCIA</span><strong>${state.save.xp.toLocaleString('es-ES')} <small>XP</small></strong></div><div><span>CARRERAS COMPLETADAS</span><strong>${state.stats.races || 0}</strong></div><div><span>MEJOR TIEMPO PERSONAL</span><strong>${formatTime(state.stats.bestTime)}</strong></div><div><span>MISIONES COMPLETADAS</span><strong>${state.save.completedMissions.length}</strong></div></div><section class="table-panel"><div class="section-head"><div><div class="eyebrow">HISTORIAL</div><h2>Actividad reciente</h2></div></div>${recent.length ? `<div class="history-table"><div class="history-head"><span>CIRCUITO</span><span>MODO</span><span>VUELTAS</span><span>TIEMPO</span></div>${recent.map((race) => `<div class="history-row"><strong>${escapeHtml(race.mapName)}</strong><span>${escapeHtml(race.mode)}</span><span>${race.laps}</span><b>${formatTime(race.elapsedMs)}</b></div>`).join('')}</div>` : '<div class="empty-state">Todavía no has completado ninguna carrera. Tu primera marca te espera.</div>'}</section>`;
}

function renderSettings() {
  return `<div class="page-heading"><div><div class="eyebrow">PREFERENCIAS</div><h1>Configuración.</h1><p class="muted">Ajustes guardados en tu perfil y sincronizados entre dispositivos.</p></div></div><section class="settings-panel"><div class="settings-row"><div><strong>Calidad gráfica</strong><p>Controla antialiasing, resolución y sombras en el cliente 3D.</p></div><select id="quality-setting"><option value="low" ${state.quality === 'low' ? 'selected' : ''}>Baja</option><option value="medium" ${state.quality === 'medium' ? 'selected' : ''}>Media</option><option value="high" ${state.quality === 'high' ? 'selected' : ''}>Alta</option><option value="ultra" ${state.quality === 'ultra' ? 'selected' : ''}>Ultra</option></select></div><div class="settings-row"><div><strong>Controles</strong><p>Teclado o mando compatible con la Gamepad API.</p></div><span class="setting-value">TECLADO + GAMEPAD</span></div><div class="settings-row"><div><strong>Guardado</strong><p>Última revisión persistida: ${state.revision}</p></div><span class="setting-value setting-green">SINCRONIZADO</span></div><div id="settings-message" class="form-success"></div></section>`;
}

function renderStory() {
  return `<div class="page-heading"><div><div class="eyebrow">CAMPAÑA NARRATIVA</div><h1>Una historia por <em>escribir.</em></h1><p class="muted">La campaña persistente está contemplada en la arquitectura de guardado, pero todavía no hay capítulos narrativos jugables.</p></div><div class="heading-chip">MÓDULO EN DESARROLLO</div></div><section class="story-teaser"><div class="story-symbol">◈</div><div class="eyebrow">PRÓXIMO ARCO · EL ECO DE LAS ESTRELLAS</div><h2>El universo no siempre<br>ha estado en silencio.</h2><p>Una señal imposible conecta mundos que nunca deberían haberse encontrado. Cuando la historia esté implementada, tus decisiones, misiones y descubrimientos se conservarán en tu cuenta.</p><div class="feature-chips"><span>CAPÍTULOS PERSISTENTES</span><span>DECISIONES</span><span>PERSONAJES</span><span>RECOMPENSAS</span></div></section>`;
}

function bindContent(route) {
  root.querySelectorAll('[data-start-map]').forEach((button) => button.addEventListener('click', () => startRace(button.dataset.startMap)));
  root.querySelector('#content')?.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.route)));
  if (route === 'worlds') {
    root.querySelector('#generate-map')?.addEventListener('click', generateMap);
    root.querySelectorAll('[data-world-filter]').forEach((button) => button.addEventListener('click', () => {
      state.worldFilter = button.dataset.worldFilter;
      navigate('worlds');
    }));
  }
  if (route === 'online') {
    root.querySelector('#create-room')?.addEventListener('click', createRoom);
    root.querySelector('#join-room')?.addEventListener('click', joinRoom);
    root.querySelector('#join-code')?.addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6); });
  }
  if (route === 'settings') {
    root.querySelector('#quality-setting')?.addEventListener('change', async (event) => {
      state.quality = event.target.value;
      state.save.settings.quality = state.quality;
      const message = root.querySelector('#settings-message');
      try { await persistSave(); message.textContent = 'Preferencias guardadas en tu cuenta.'; }
      catch (error) { message.textContent = error.message; }
    });
  }
}

async function generateMap() {
  const button = root.querySelector('#generate-map');
  const message = root.querySelector('#generator-message');
  const seed = root.querySelector('#map-seed').value.trim();
  const theme = root.querySelector('#map-theme').value;
  button.disabled = true;
  button.textContent = 'Generando…';
  message.textContent = '';
  try {
    const result = await api('/api/maps/generate', { method: 'POST', body: JSON.stringify({ seed, theme }) });
    await loadAccountData();
    state.worldFilter = 'Todos';
    navigate('worlds');
    const notice = document.createElement('div');
    notice.className = 'generator-success';
    notice.textContent = `Circuito «${result.map.name}» creado y guardado en tu cuenta. Ya puedes jugarlo.`;
    root.querySelector('#content')?.prepend(notice);
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
    button.textContent = 'Generar circuito ↗';
  }
}

async function createRoom() {
  const button = root.querySelector('#create-room');
  const panel = root.querySelector('#room-created');
  button.disabled = true;
  button.textContent = 'Creando sala…';
  try {
    const room = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ mapId: root.querySelector('#room-map').value }) });
    panel.classList.remove('hidden');
    panel.innerHTML = `<span>CÓDIGO DE INVITACIÓN</span><strong>${room.code}</strong><button id="copy-room-code" class="text-link">Copiar código ↗</button><p>Sala privada · Máximo 8 jugadores</p><button id="launch-room" class="primary-button full">Entrar en la sala ↗</button>`;
    root.querySelector('#copy-room-code').addEventListener('click', async () => {
      await navigator.clipboard.writeText(room.code);
      root.querySelector('#copy-room-code').textContent = 'Copiado ✓';
    });
    root.querySelector('#launch-room').addEventListener('click', () => startRace(room.mapId, room.code));
    button.textContent = 'Sala creada';
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Crear sala privada ↗';
    root.querySelector('#join-error').textContent = error.message;
  }
}

async function joinRoom() {
  const button = root.querySelector('#join-room');
  const errorBox = root.querySelector('#join-error');
  const code = root.querySelector('#join-code').value.trim();
  if (code.length !== 6) { errorBox.textContent = 'El código debe tener seis caracteres.'; return; }
  button.disabled = true;
  errorBox.textContent = '';
  try {
    const room = await api(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({}) });
    startRace(room.mapId, room.code);
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
  }
}

async function persistSave() {
  try {
    const result = await saveApi.write(state.revision, state.save);
    state.revision = result.revision;
    state.save = result.progress;
    return result;
  } catch (error) {
    if (error.status === 409 && error.latest) {
      const latest = error.latest.progress;
      const merged = {
        ...latest,
        xp: Math.max(latest.xp || 0, state.save.xp || 0),
        level: Math.max(latest.level || 1, state.save.level || 1),
        completedMissions: [...new Set([...(latest.completedMissions || []), ...(state.save.completedMissions || [])])],
        unlockedVehicles: [...new Set([...(latest.unlockedVehicles || []), ...(state.save.unlockedVehicles || [])])],
        bestTimes: { ...(latest.bestTimes || {}) }
      };
      for (const [id, time] of Object.entries(state.save.bestTimes || {})) merged.bestTimes[id] = Math.min(merged.bestTimes[id] || Number.MAX_SAFE_INTEGER, time);
      state.revision = error.latest.revision;
      const retried = await saveApi.write(state.revision, merged);
      state.revision = retried.revision;
      state.save = retried.progress;
      return retried;
    }
    throw error;
  }
}

async function startRace(mapId, roomCode = null) {
  const map = state.maps.find((entry) => entry.id === mapId);
  if (!map) return;
  state.currentMap = map;
  state.roomCode = roomCode;
  root.innerHTML = `<main class="race-screen"><div id="race-canvas" class="race-canvas"></div><div class="race-top-left"><div class="race-brand">MINGO<span>VERSE</span></div><div class="race-map-name">${escapeHtml(map.name)} <small>${escapeHtml(map.category)}</small></div></div><div class="race-hud"><div class="hud-speed"><strong id="hud-speed">000</strong><span>KM/H</span></div><div class="hud-lap"><small>VUELTA</small><strong id="hud-lap">1 <i>/ ${map.laps}</i></strong></div><div class="hud-time"><small>TIEMPO</small><strong id="hud-time">00:00</strong></div><div class="hud-checkpoint"><small>CHECKPOINT</small><strong id="hud-checkpoint">1/10</strong></div></div><div class="race-bottom-left"><div class="race-hint">WASD / FLECHAS <span>ACELERAR · GIRAR · FRENAR</span></div><div class="race-hint">ESPACIO <span>FRENO DE MANO</span></div><div class="race-hint">MANDO <span>STICK + GATILLOS</span></div></div><div class="race-bottom-right"><span id="network-state" class="network-state">${roomCode ? `SALA ${roomCode}` : 'MODO SOLITARIO'}</span><button id="pause-race" class="race-icon-button">Ⅱ</button><button id="exit-race" class="race-exit">SALIR ×</button></div><div id="race-countdown" class="race-countdown"></div><div id="pause-overlay" class="race-overlay hidden"><div class="race-dialog"><div class="eyebrow">PAUSA</div><h2>Respira. La pista espera.</h2><button id="resume-race" class="primary-button full">Continuar <span>↗</span></button><button id="quit-race" class="secondary-button full">Salir de la carrera</button></div></div><div id="result-overlay" class="race-overlay hidden"><div class="race-dialog result-dialog"><div class="eyebrow">BANDERA A CUADROS</div><h2>¡Carrera completada!</h2><div class="result-time" id="result-time">00:00.000</div><p id="result-note">Tu resultado se está guardando.</p><button id="back-to-world" class="primary-button full">Volver al universo <span>↗</span></button></div></div><div class="race-vignette"></div></main>`;
  const mount = root.querySelector('#race-canvas');
  const pauseOverlay = root.querySelector('#pause-overlay');
  const pauseButton = root.querySelector('#pause-race');
  let isPaused = false;
  state.game = new MingoRace({
    mount, map, mapId, roomCode, quality: state.quality,
    onHUD: (hud) => {
      root.querySelector('#hud-speed').textContent = String(hud.speed).padStart(3, '0');
      root.querySelector('#hud-lap').innerHTML = `${hud.lap} <i>/ ${hud.totalLaps}</i>`;
      root.querySelector('#hud-time').textContent = formatClock(hud.elapsedMs);
      root.querySelector('#hud-checkpoint').textContent = `${hud.checkpoint}/${hud.totalCheckpoints}`;
      root.querySelector('#network-state').textContent = roomCode ? `${hud.networkStatus === 'online' ? '● CONECTADO' : '○ ' + hud.networkStatus.toUpperCase()} · ${roomCode}` : 'MODO SOLITARIO';
      const countdown = root.querySelector('#race-countdown');
      countdown.textContent = hud.countdown ? hud.countdown : '';
      countdown.classList.toggle('countdown-live', hud.countdown === 0);
      let offRoadLabel = root.querySelector('#offroad-warning');
      if (!offRoadLabel && hud.offRoad) {
        offRoadLabel = document.createElement('div');
        offRoadLabel.id = 'offroad-warning';
        offRoadLabel.className = 'offroad-warning';
        offRoadLabel.textContent = 'FUERA DE PISTA';
        root.querySelector('.race-screen').appendChild(offRoadLabel);
      }
      if (offRoadLabel) offRoadLabel.classList.toggle('visible', Boolean(hud.offRoad));
      if (hud.paused) pauseOverlay.classList.remove('hidden'); else pauseOverlay.classList.add('hidden');
    },
    onFinish: async (result) => {
      root.querySelector('#result-overlay').classList.remove('hidden');
      root.querySelector('#result-time').textContent = formatTime(result.elapsedMs);
      root.querySelector('#result-note').textContent = 'Guardando tu resultado y actualizando el progreso…';
      try {
        const saved = await api('/api/results', { method: 'POST', body: JSON.stringify({ mapId: result.mapId, elapsedMs: result.elapsedMs, laps: result.laps, mode: roomCode ? 'online' : 'solo' }) });
        state.revision = saved.revision;
        state.save = saved.progress;
        const stats = await api('/api/profile/stats');
        state.stats = stats;
        root.querySelector('#result-note').textContent = saved.xpAward ? `Resultado guardado en tu cuenta · +${saved.xpAward} XP` : 'Resultado guardado en tu cuenta · sin recompensa adicional';
      } catch (error) {
        root.querySelector('#result-note').textContent = `No se pudo sincronizar el resultado: ${error.message}`;
      }
    },
    onExit: () => returnToShell()
  });
  pauseButton.addEventListener('click', () => {
    isPaused = !isPaused;
    state.game.setPaused(isPaused);
    pauseOverlay.classList.toggle('hidden', !isPaused);
  });
  root.querySelector('#resume-race').addEventListener('click', () => { isPaused = false; state.game.setPaused(false); pauseOverlay.classList.add('hidden'); });
  root.querySelector('#exit-race').addEventListener('click', () => returnToShell());
  root.querySelector('#quit-race').addEventListener('click', () => returnToShell());
  root.querySelector('#back-to-world').addEventListener('click', () => returnToShell());
  try {
    await state.game.start();
  } catch (error) {
    state.game?.destroy();
    state.game = null;
    renderShell();
    navigate('races');
    const notice = document.createElement('div');
    notice.className = 'startup-error';
    notice.textContent = `No se pudo iniciar el motor 3D: ${error.message}. Comprueba que el navegador admite WebGL 2 y WebAssembly.`;
    root.querySelector('#content')?.prepend(notice);
  }
}

function returnToShell() {
  state.game?.destroy();
  state.game = null;
  state.roomCode = null;
  state.currentMap = null;
  renderShell();
  navigate('home');
}

boot();
