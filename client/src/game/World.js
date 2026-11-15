import * as THREE from 'three';

function seededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addInstanced(scene, geometry, material, entries) {
  if (!entries.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  const dummy = new THREE.Object3D();
  entries.forEach((entry, index) => {
    dummy.position.set(entry.x, entry.y, entry.z);
    dummy.rotation.set(entry.rx || 0, entry.ry || 0, entry.rz || 0);
    dummy.scale.set(entry.sx || 1, entry.sy || 1, entry.sz || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (entry.color) mesh.setColorAt(index, new THREE.Color(entry.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function buildWorld(scene, map, curve) {
  const p = map.palette;
  scene.background = new THREE.Color(p.sky);
  scene.fog = new THREE.Fog(p.fog, 125, 420);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color: p.ground, roughness: 0.94, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadVertices = [];
  const roadIndices = [];
  const edgeLeft = [];
  const edgeRight = [];
  const samples = 220;
  const halfWidth = 7.2;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const left = point.clone().addScaledVector(side, halfWidth);
    const right = point.clone().addScaledVector(side, -halfWidth);
    roadVertices.push(left.x, 0.025, left.z, right.x, 0.025, right.z);
    edgeLeft.push(left.x, 0.09, left.z);
    edgeRight.push(right.x, 0.09, right.z);
    if (i < samples) {
      const a = i * 2;
      roadIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
  roadGeometry.setIndex(roadIndices);
  roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({
    color: p.road, roughness: 0.84, metalness: 0.18, side: THREE.DoubleSide
  }));
  road.receiveShadow = true;
  scene.add(road);

  const edgeMat = new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: map.theme === 'tech' ? 0.65 : 0.1, roughness: 0.7 });
  for (const edge of [edgeLeft, edgeRight]) {
    const points = [];
    for (let i = 0; i < edge.length; i += 3) points.push(new THREE.Vector3(edge[i], edge[i + 1], edge[i + 2]));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: p.accent }));
    scene.add(line);
  }

  const random = seededRandom(map.id);
  const treeTrunks = [];
  const foliage = [];
  const buildings = [];
  const rocks = [];
  const racks = [];
  for (let i = 0; i < 190; i++) {
    const t = (i / 190 + random() * 0.004) % 1;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const offset = 17 + random() * 58;
    const pos = point.clone().addScaledVector(side, sign * offset);
    if (map.theme === 'sakura' || map.theme === 'jurassic') {
      const size = map.theme === 'sakura' ? 0.75 + random() * 1.45 : 1 + random() * 2.1;
      treeTrunks.push({ x: pos.x, y: 2.2 * size, z: pos.z, sx: 0.35 * size, sy: 2.3 * size, sz: 0.35 * size });
      for (let j = 0; j < (map.theme === 'sakura' ? 3 : 1); j++) {
        foliage.push({ x: pos.x + (random() - 0.5) * 1.7, y: 4.15 * size + j * 0.55, z: pos.z + (random() - 0.5) * 1.7, sx: 1.8 * size, sy: 1.45 * size, sz: 1.8 * size, color: map.theme === 'sakura' ? (random() > 0.5 ? '#f5a7c8' : '#f4c3d8') : (random() > 0.5 ? '#356e45' : '#52844d') });
      }
    } else if (map.theme === 'city') {
      const h = 8 + random() * 24;
      buildings.push({ x: pos.x, y: h / 2, z: pos.z, sx: 7 + random() * 7, sy: h, sz: 7 + random() * 7, ry: random() * 0.3, color: random() > 0.5 ? '#4a566c' : '#343e53' });
    } else if (map.theme === 'coast') {
      const h = 5 + random() * 16;
      buildings.push({ x: pos.x, y: h / 2, z: pos.z, sx: 5 + random() * 5, sy: h, sz: 5 + random() * 7, color: random() > 0.5 ? '#d7c5a7' : '#9aa8b7' });
      rocks.push({ x: pos.x * 1.12, y: 1.1, z: pos.z * 1.12, sx: 2.5 + random() * 4, sy: 2.2, sz: 2.5 + random() * 4 });
    } else if (map.theme === 'tech') {
      racks.push({ x: pos.x, y: 4 + random() * 2, z: pos.z, sx: 2.3, sy: 8 + random() * 3, sz: 2.2, color: '#1c344a' });
    } else if (map.theme === 'moon') {
      rocks.push({ x: pos.x, y: 1 + random() * 2, z: pos.z, sx: 2 + random() * 5, sy: 1.8 + random() * 2.5, sz: 2 + random() * 5, ry: random() * Math.PI });
    }
  }

  if (treeTrunks.length) addInstanced(scene, new THREE.CylinderGeometry(0.5, 0.7, 1, 7), new THREE.MeshStandardMaterial({ color: map.theme === 'sakura' ? '#584137' : '#4c4031', roughness: 1 }), treeTrunks);
  if (foliage.length) addInstanced(scene, new THREE.SphereGeometry(1, 8, 7), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), foliage);
  if (buildings.length) addInstanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), buildings);
  if (racks.length) {
    addInstanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.35 }), racks);
    const glowBars = [];
    for (const rack of racks) glowBars.push({ x: rack.x + 1.18, y: rack.y, z: rack.z, sx: 0.04, sy: rack.sy * 0.88, sz: 0.08 });
    addInstanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: p.accent }), glowBars);
  }
  if (rocks.length) addInstanced(scene, new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: map.theme === 'moon' ? '#8b919e' : '#53604d', roughness: 1 }), rocks);

  // Far landmarks make the circuit read as a world, not only a road ribbon.
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const marker = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.5, 18 + (i % 3) * 5, 1.5), new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: map.theme === 'tech' ? 0.8 : 0.1, metalness: 0.55, roughness: 0.35 }));
    tower.position.y = tower.geometry.parameters.height / 2;
    marker.add(tower);
    marker.position.copy(point).addScaledVector(side, i % 2 ? -95 : 95);
    scene.add(marker);
  }

  const linePoints = [];
  for (let i = 0; i < 80; i++) linePoints.push(curve.getPointAt(i / 80).setY(0.12));
  const guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(linePoints), new THREE.LineBasicMaterial({ color: '#f2e5b5', transparent: true, opacity: 0.45 }));
  scene.add(guide);

  const start = curve.getPointAt(0);
  const tangent = curve.getTangentAt(0).normalize();
  const checker = new THREE.Group();
  const gateMat = new THREE.MeshStandardMaterial({ color: '#e7edf5', emissive: '#ffffff', emissiveIntensity: 0.1 });
  const postGeo = new THREE.BoxGeometry(0.45, 4.8, 0.45);
  const leftPost = new THREE.Mesh(postGeo, gateMat);
  leftPost.position.set(-7.1, 2.4, 0);
  const rightPost = leftPost.clone();
  rightPost.position.x = 7.1;
  checker.add(leftPost, rightPost);
  const top = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.5, 0.5), gateMat);
  top.position.y = 4.65;
  checker.add(top);
  checker.position.set(start.x, 0, start.z);
  checker.rotation.y = Math.atan2(tangent.x, tangent.z);
  scene.add(checker);

  return { road, start, tangent, checkpoints: Array.from({ length: 10 }, (_, index) => curve.getPointAt((index + 1) / 10)), dispose() {
    scene.traverse((object) => {
      if (object.geometry && !object.userData.sharedGeometry) object.geometry.dispose?.();
      if (object.material && !Array.isArray(object.material)) object.material.dispose?.();
    });
  } };
}
