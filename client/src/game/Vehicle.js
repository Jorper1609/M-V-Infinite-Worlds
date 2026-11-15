import * as THREE from 'three';

export function createVehicle(color = '#e84d67') {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: '#111721', metalness: 0.45, roughness: 0.42 });
  const glass = new THREE.MeshStandardMaterial({ color: '#8fb7ca', metalness: 0.55, roughness: 0.12, transparent: true, opacity: 0.76 });
  const trim = new THREE.MeshStandardMaterial({ color: '#e6edf5', metalness: 0.72, roughness: 0.25 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.42, 3.05), paint);
  chassis.position.y = 0.35;
  chassis.castShadow = true;
  root.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.22, 0.75), paint);
  nose.position.set(0, 0.28, 1.65);
  root.add(nose);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.58, 1.35), glass);
  cabin.position.set(0, 0.78, -0.18);
  cabin.castShadow = true;
  root.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, 1.12), dark);
  roof.position.set(0, 1.08, -0.18);
  root.add(roof);

  const spoiler = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.34), trim);
  wing.position.y = 0.96;
  spoiler.add(wing);
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), dark);
  support.position.set(0, 0.68, 0);
  spoiler.add(support);
  spoiler.position.z = -1.52;
  root.add(spoiler);

  const wheelGeometry = new THREE.CylinderGeometry(0.39, 0.39, 0.25, 20);
  const wheels = [];
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.02, 1.05]) {
      const wheel = new THREE.Mesh(wheelGeometry, dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.16, z);
      wheel.castShadow = true;
      root.add(wheel);
      wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.27, 16), trim);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      root.add(hub);
    }
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: '#fff1cf' });
  for (const x of [-0.55, 0.55]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), lightMat);
    light.position.set(x, 0.42, 1.91);
    root.add(light);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ff3156' });
  for (const x of [-0.58, 0.58]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), tailMat);
    light.position.set(x, 0.42, -1.55);
    root.add(light);
  }

  root.traverse((object) => {
    if (object.isMesh) {
      object.geometry.computeBoundingSphere();
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  root.userData.wheels = wheels;
  return root;
}
