import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MAPS } from '../../../shared/maps.js';
import { createVehicle } from './Vehicle.js';
import { buildWorld } from './World.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (from, to, amount) => from + (to - from) * amount;

export class MingoRace {
  constructor({ mount, map, mapId, onHUD = () => {}, onFinish = () => {}, onExit = () => {}, roomCode = null, quality = 'high' }) {
    this.mount = mount;
    this.map = map || MAPS.find((entry) => entry.id === mapId) || MAPS[0];
    this.onHUD = onHUD;
    this.onFinish = onFinish;
    this.onExit = onExit;
    this.roomCode = roomCode;
    this.quality = quality;
    this.running = false;
    this.finished = false;
    this.paused = false;
    this.lastFrame = 0;
    this.lastHud = 0;
    this.lastNetwork = 0;
    this.startAt = 0;
    this.expectedCheckpoint = 0;
    this.lap = 0;
    this.remotePlayers = new Map();
    this.networkStatus = roomCode ? 'connecting' : 'offline';
    this.keys = new Set();
    this.handleKeyDown = (event) => this.keys.add(event.code);
    this.handleKeyUp = (event) => this.keys.delete(event.code);
    this.handleBlur = () => this.keys.clear();
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  async start() {
    await RAPIER.init();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#18263d', 120, 400);
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'ultra' ? 2 : 1.35));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.mount.appendChild(this.renderer.domElement);

    const ambient = new THREE.HemisphereLight('#c4d9ff', '#293343', 1.55);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff2dd', 2.4);
    sun.position.set(-45, 85, 34);
    sun.castShadow = this.quality !== 'low';
    sun.shadow.mapSize.set(this.quality === 'ultra' ? 2048 : 1024, this.quality === 'ultra' ? 2048 : 1024);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    this.scene.add(sun);

    this.curve = new THREE.CatmullRomCurve3(this.map.route.map(([x, y, z]) => new THREE.Vector3(x * 12, y * 12, z * 12)), true, 'centripetal', 0.5);
    this.curve.arcLengthDivisions = 500;
    this.worldVisuals = buildWorld(this.scene, this.map, this.curve);
    this.trackSamples = Array.from({ length: 420 }, (_, index) => this.curve.getPointAt(index / 420));
    this.physicsWorld = new RAPIER.World({ x: 0, y: -9.81 * (this.map.theme === 'moon' ? 0.48 : 1), z: 0 });
    this.physicsWorld.timestep = 1 / 60;

    const groundBody = this.physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.55, 0));
    this.physicsWorld.createCollider(RAPIER.ColliderDesc.cuboid(1200, 0.5, 1200).setFriction(0.95), groundBody);

    const tangent = this.worldVisuals.tangent;
    const spawn = this.worldVisuals.start.clone().addScaledVector(tangent, -7);
    this.yaw = Math.atan2(tangent.x, tangent.z);
    const rotation = { x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) };
    this.carBody = this.physicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, 0.65, spawn.z)
        .setRotation(rotation)
        .setLinearDamping(0.15)
        .setAngularDamping(4)
        .setCanSleep(false)
    );
    this.carCollider = this.physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(0.88, 0.42, 1.55).setFriction(0.72).setRestitution(0.04).setDensity(1.2),
      this.carBody
    );
    this.carBody.setEnabledRotations(false, true, false, true);
    this.carVisual = createVehicle('#e84d67');
    this.scene.add(this.carVisual);

    this.ai = [
      { t: 0.13, lap: 0, speed: 28.5, mesh: createVehicle('#45a6db') },
      { t: 0.42, lap: 0, speed: 31.0, mesh: createVehicle('#e8b64d') },
      { t: 0.72, lap: 0, speed: 26.8, mesh: createVehicle('#a28be5') }
    ];
    this.ai.forEach((opponent) => this.scene.add(opponent.mesh));

    this.checkpointMeshes = this.buildCheckpoints();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.resizeObserver.observe(this.mount);
    this.resize();
    this.startAt = performance.now() + 3000;
    this.running = true;
    this.lastFrame = performance.now();
    if (this.roomCode) this.connectRoom();
    this.animate = this.animate.bind(this);
    this.animationId = requestAnimationFrame(this.animate);
  }

  buildCheckpoints() {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(4.7, 0.13, 5, 22);
    const material = new THREE.MeshBasicMaterial({ color: '#f7d78a', transparent: true, opacity: 0.3 });
    for (let i = 0; i < this.worldVisuals.checkpoints.length - 1; i++) {
      const point = this.worldVisuals.checkpoints[i];
      const ring = new THREE.Mesh(geometry, material);
      ring.position.copy(point);
      ring.position.y = 1.6;
      const tangent = this.curve.getTangentAt((i + 1) / 10);
      ring.rotation.y = Math.atan2(tangent.x, tangent.z);
      group.add(ring);
    }
    this.scene.add(group);
    return group;
  }

  connectRoom() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws?room=${encodeURIComponent(this.roomCode)}`);
    this.socket.addEventListener('open', () => { this.networkStatus = 'online'; });
    this.socket.addEventListener('error', () => { this.networkStatus = 'error'; });
    this.socket.addEventListener('close', () => { this.networkStatus = 'offline'; });
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'welcome') {
        this.networkStatus = 'online';
        for (const player of message.players || []) if (player.id !== message.self?.id) this.ensureRemote(player.id, player.username);
      }
      if (message.type === 'player-joined') this.ensureRemote(message.player.id, message.player.username);
      if (message.type === 'player-left') this.removeRemote(message.player.id);
      if (message.type === 'player-state') {
        const remote = this.ensureRemote(message.player.id, message.player.username);
        remote.targetPosition.set(message.state.position.x, message.state.position.y, message.state.position.z);
        remote.targetYaw = message.state.yaw;
        remote.lap = message.state.lap;
        remote.lastUpdate = performance.now();
      }
    });
  }

  ensureRemote(id, username) {
    let remote = this.remotePlayers.get(id);
    if (remote) return remote;
    const mesh = createVehicle('#63d9b0');
    this.scene.add(mesh);
    remote = { id, username, mesh, targetPosition: new THREE.Vector3(), targetYaw: 0, lap: 0, lastUpdate: performance.now() };
    this.remotePlayers.set(id, remote);
    return remote;
  }

  removeRemote(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    this.scene.remove(remote.mesh);
    this.remotePlayers.delete(id);
  }

  input() {
    let throttle = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    let brake = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    let steer = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let handbrake = this.keys.has('Space');
    const gamepads = navigator.getGamepads?.() || [];
    const pad = [...gamepads].find(Boolean);
    if (pad) {
      const axis = Math.abs(pad.axes?.[0] || 0) > 0.12 ? pad.axes[0] : 0;
      steer = axis;
      throttle = Math.max(throttle, pad.buttons?.[7]?.value || 0, pad.buttons?.[0]?.pressed ? 1 : 0);
      brake = Math.max(brake, pad.buttons?.[6]?.value || 0, pad.buttons?.[1]?.pressed ? 1 : 0);
      handbrake = handbrake || Boolean(pad.buttons?.[2]?.pressed);
    }
    return { throttle: clamp(throttle, 0, 1), brake: clamp(brake, 0, 1), steer: clamp(steer, -1, 1), handbrake };
  }

  updatePhysics(dt) {
    const now = performance.now();
    const active = now >= this.startAt && !this.finished;
    const input = active ? this.input() : { throttle: 0, brake: 0, steer: 0, handbrake: false };
    const velocity = this.carBody.linvel();
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const velocityVector = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    const forwardSpeed = velocityVector.dot(forward);
    const mass = this.carBody.mass();

    const currentPosition = this.carBody.translation();
    let nearestDistanceSq = Infinity;
    for (const sample of this.trackSamples) {
      const dx = currentPosition.x - sample.x;
      const dz = currentPosition.z - sample.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < nearestDistanceSq) nearestDistanceSq = distanceSq;
    }
    const offRoad = nearestDistanceSq > 8.2 * 8.2;
    this.lastOffRoad = offRoad;
    if (input.throttle > 0) {
      const acceleration = forwardSpeed < -1 ? 18 : 28;
      const gripLimit = offRoad ? 0.58 : 1;
      this.carBody.applyImpulse({ x: forward.x * acceleration * mass * input.throttle * gripLimit * dt, y: 0, z: forward.z * acceleration * mass * input.throttle * gripLimit * dt }, true);
    }
    const rollingDrag = forwardSpeed * Math.abs(forwardSpeed) * 0.008;
    this.carBody.applyImpulse({ x: -forward.x * rollingDrag * mass * dt, y: 0, z: -forward.z * rollingDrag * mass * dt }, true);
    if (offRoad) {
      const offRoadDrag = Math.max(0.84, 1 - dt * 2.8);
      this.carBody.setLinvel({ x: velocity.x * offRoadDrag, y: velocity.y, z: velocity.z * offRoadDrag }, true);
    }
    if (input.brake > 0) {
      const reduction = Math.max(0.84, 1 - input.brake * dt * 3.7);
      this.carBody.setLinvel({ x: velocity.x * reduction, y: velocity.y, z: velocity.z * reduction }, true);
      if (forwardSpeed < 1.2 && input.brake > 0.2) {
        this.carBody.applyImpulse({ x: -forward.x * 12 * mass * input.brake * dt, y: 0, z: -forward.z * 12 * mass * input.brake * dt }, true);
      }
    }

    const lateralSpeed = velocityVector.dot(right);
    const grip = input.handbrake ? 1.6 : (this.map.theme === 'moon' ? 2.4 : 5.5);
    this.carBody.applyImpulse({ x: -right.x * lateralSpeed * mass * grip * dt, y: 0, z: -right.z * lateralSpeed * mass * grip * dt }, true);
    const steeringAuthority = clamp(Math.abs(forwardSpeed) / 5, 0.16, 1.15);
    const direction = Math.sign(forwardSpeed || (input.throttle ? 1 : 0));
    this.yaw += input.steer * steeringAuthority * direction * (input.handbrake ? 1.45 : 1.05) * dt;
    this.carBody.setRotation({ x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) }, true);

    this.physicsWorld.step();
    const position = this.carBody.translation();
    if (position.y < -8 || Math.abs(position.x) > 750 || Math.abs(position.z) > 750) this.respawn();
    this.carVisual.position.set(position.x, position.y - 0.12, position.z);
    this.carVisual.rotation.y = this.yaw;
    const speed = this.carBody.linvel();
    const speedMagnitude = Math.hypot(speed.x, speed.z);
    for (const wheel of this.carVisual.userData.wheels) wheel.rotation.x -= forwardSpeed * dt * 1.9;
    this.updateCamera(position, forward, dt);
    this.updateAi(dt);
    this.updateRemote(dt);
    if (active) this.updateCheckpoints(new THREE.Vector3(position.x, position.y, position.z));
    return { speed: speedMagnitude * 3.6, forwardSpeed, position, input, elapsedMs: Math.max(0, (this.paused ? this.pauseStartedAt : now) - this.startAt) };
  }

  updateCamera(position, forward, dt) {
    const desired = new THREE.Vector3(position.x, position.y + 6.6, position.z).addScaledVector(forward, -13.5);
    desired.y += 2.2;
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.7));
    const lookAt = new THREE.Vector3(position.x, position.y + 1.1, position.z).addScaledVector(forward, 5.0);
    this.camera.lookAt(lookAt);
  }

  updateAi(dt) {
    for (const opponent of this.ai) {
      const advance = opponent.speed * dt / this.curve.getLength();
      opponent.t += advance;
      if (opponent.t >= 1) { opponent.t -= 1; opponent.lap += 1; }
      const point = this.curve.getPointAt(opponent.t);
      const tangent = this.curve.getTangentAt(opponent.t).normalize();
      opponent.mesh.position.set(point.x, 0.12, point.z);
      opponent.mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
  }

  updateRemote(dt) {
    for (const remote of this.remotePlayers.values()) {
      remote.mesh.position.lerp(remote.targetPosition, 1 - Math.exp(-dt * 12));
      const delta = Math.atan2(Math.sin(remote.targetYaw - remote.mesh.rotation.y), Math.cos(remote.targetYaw - remote.mesh.rotation.y));
      remote.mesh.rotation.y += delta * (1 - Math.exp(-dt * 10));
    }
  }

  updateCheckpoints(position) {
    const checkpoint = this.worldVisuals.checkpoints[this.expectedCheckpoint];
    if (position.distanceTo(checkpoint) < 9.5) {
      if (this.expectedCheckpoint === this.worldVisuals.checkpoints.length - 1) {
        this.lap += 1;
        this.expectedCheckpoint = 0;
        if (this.lap >= this.map.laps) this.finish();
      } else this.expectedCheckpoint += 1;
    }
  }

  respawn() {
    const point = this.curve.getPointAt(Math.max(0.01, this.expectedCheckpoint / 10));
    const tangent = this.curve.getTangentAt(Math.max(0.01, this.expectedCheckpoint / 10)).normalize();
    this.yaw = Math.atan2(tangent.x, tangent.z);
    this.carBody.setTranslation({ x: point.x, y: 0.7, z: point.z }, true);
    this.carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.carBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.carBody.setRotation({ x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) }, true);
  }

  setPaused(paused) {
    const next = Boolean(paused);
    if (next === this.paused) return;
    if (next) this.pauseStartedAt = performance.now();
    else if (this.pauseStartedAt) {
      this.startAt += performance.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.paused = next;
    this.keys.clear();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const elapsedMs = Math.max(5000, Math.round(performance.now() - this.startAt));
    this.carBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.onFinish({ mapId: this.map.id, elapsedMs, laps: this.map.laps, roomCode: this.roomCode });
  }

  animate(now) {
    if (!this.running) return;
    const dt = clamp((now - this.lastFrame) / 1000, 0.001, 0.04);
    this.lastFrame = now;
    const clockNow = this.paused ? this.pauseStartedAt : now;
    const state = this.paused ? { speed: 0, position: this.carBody.translation(), elapsedMs: Math.max(0, clockNow - this.startAt) } : this.updatePhysics(dt);
    const secondsToStart = (this.startAt - clockNow) / 1000;
    const countdown = secondsToStart > 0 ? Math.ceil(secondsToStart) : 0;

    if (this.roomCode && this.socket?.readyState === WebSocket.OPEN && now - this.lastNetwork > 100) {
      this.lastNetwork = now;
      this.socket.send(JSON.stringify({
        type: 'state',
        position: { x: state.position.x, y: state.position.y, z: state.position.z },
        yaw: this.yaw,
        speed: Math.min(100, Math.hypot(this.carBody.linvel().x, this.carBody.linvel().z)),
        lap: this.lap
      }));
    }

    if (now - this.lastHud > 80) {
      this.lastHud = now;
      this.onHUD({
        speed: Math.round(state.speed), offRoad: this.lastOffRoad, lap: Math.min(this.lap + 1, this.map.laps), totalLaps: this.map.laps,
        elapsedMs: state.elapsedMs, countdown, checkpoint: this.expectedCheckpoint + 1, paused: this.paused,
        totalCheckpoints: this.worldVisuals.checkpoints.length, roomCode: this.roomCode,
        networkStatus: this.networkStatus, finished: this.finished
      });
    }
    this.renderer.render(this.scene, this.camera);
    this.animationId = requestAnimationFrame(this.animate);
  }

  resize() {
    if (!this.renderer || !this.mount) return;
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.resizeObserver.disconnect();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close(1000, 'Leaving race');
    for (const remote of this.remotePlayers.values()) this.scene.remove(remote.mesh);
    this.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer?.dispose();
    this.mount?.replaceChildren();
    this.physicsWorld?.free();
  }
}
