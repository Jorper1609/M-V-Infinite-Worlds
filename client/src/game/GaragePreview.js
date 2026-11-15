import * as THREE from 'three';
import { createVehicle } from './Vehicle.js';

export class GaragePreview {
  constructor(mount) {
    this.mount = mount;
    this.dragging = false;
    this.pointerX = 0;
    this.angularVelocity = 0;
    this.handlePointerDown = (event) => {
      this.dragging = true;
      this.pointerX = event.clientX;
      this.mount.setPointerCapture?.(event.pointerId);
    };
    this.handlePointerMove = (event) => {
      if (!this.dragging) return;
      const delta = event.clientX - this.pointerX;
      this.pointerX = event.clientX;
      this.vehicle.rotation.y += delta * 0.012;
      this.angularVelocity = delta * 0.0008;
    };
    this.handlePointerUp = () => { this.dragging = false; };
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  start() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#101a2a');
    this.scene.fog = new THREE.Fog('#101a2a', 15, 34);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(5.3, 3.1, 6.4);
    this.camera.lookAt(0, 0.55, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Modelo 3D del vehículo MV GT-01. Arrastra para girarlo.');
    this.mount.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight('#d6e7ff', '#263246', 2.0));
    const key = new THREE.DirectionalLight('#fff0dd', 3.1);
    key.position.set(-4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    this.scene.add(key);
    const rim = new THREE.PointLight('#e982a4', 19, 16);
    rim.position.set(4, 3, -4);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: '#111c2c', roughness: 0.88, metalness: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.0, 4.0, 0.12, 80),
      new THREE.MeshStandardMaterial({ color: '#25374b', roughness: 0.56, metalness: 0.5 })
    );
    platform.position.y = 0.02;
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);

    const rimGeometry = new THREE.TorusGeometry(3.92, 0.035, 8, 96);
    const rimMaterial = new THREE.MeshBasicMaterial({ color: '#e8a5b3' });
    const platformRim = new THREE.Mesh(rimGeometry, rimMaterial);
    platformRim.rotation.x = Math.PI / 2;
    platformRim.position.y = 0.095;
    this.scene.add(platformRim);

    this.vehicle = createVehicle('#e84d67');
    this.vehicle.position.y = 0.16;
    this.vehicle.rotation.y = -0.35;
    this.scene.add(this.vehicle);

    this.mount.addEventListener('pointerdown', this.handlePointerDown);
    this.mount.addEventListener('pointermove', this.handlePointerMove);
    this.mount.addEventListener('pointerup', this.handlePointerUp);
    this.mount.addEventListener('pointercancel', this.handlePointerUp);
    this.mount.addEventListener('lostpointercapture', this.handlePointerUp);
    this.resizeObserver.observe(this.mount);
    this.resize();
    this.lastFrame = performance.now();
    this.running = true;
    this.frame = requestAnimationFrame(this.animate.bind(this));
  }

  animate(now) {
    if (!this.running) return;
    const dt = Math.min(0.04, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.dragging) {
      this.vehicle.rotation.y += dt * 0.16 + this.angularVelocity;
      this.angularVelocity *= Math.exp(-dt * 3.5);
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate.bind(this));
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
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.mount.removeEventListener('pointerdown', this.handlePointerDown);
    this.mount.removeEventListener('pointermove', this.handlePointerMove);
    this.mount.removeEventListener('pointerup', this.handlePointerUp);
    this.mount.removeEventListener('pointercancel', this.handlePointerUp);
    this.mount.removeEventListener('lostpointercapture', this.handlePointerUp);
    this.scene?.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    this.renderer?.dispose();
    this.mount?.replaceChildren();
  }
}
