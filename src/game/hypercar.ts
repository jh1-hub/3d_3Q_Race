import * as THREE from 'three';
import { ChassisStyle } from './types';

export interface HypercarModel {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  thrusterFlames: THREE.Mesh[];
  boostGlowMaterial: THREE.MeshStandardMaterial;
  shadowPlane: THREE.Mesh;
  shieldDome: THREE.Mesh;
  glowAura: THREE.Group;
  hoverHalo: THREE.Mesh;
  spinSparkRing: THREE.Group;
  boostAura: THREE.Group;
  dispose: () => void;
}

/**
 * Builds one of three distinct composite futuristic anti-grav hypercar silhouettes
 * ('valkyrie' delta GT, 'tempest' twin-prong spearhead, 'phantom' forward-swept stealth)
 * with two-tone PBR liveries, turbine pods, dynamic thrusters, contact shadow, and shield dome.
 */
export function createHypercarMesh(
  bodyColor: number,
  secondaryColor: number,
  accentColor: number,
  shadowTexture: THREE.Texture,
  castShadow: boolean,
  chassisStyle: ChassisStyle = 'valkyrie'
): HypercarModel {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  // Hover height above track surface (lowest turbine coil at -0.32 -> +0.48m clear above deck)
  chassisGroup.position.y = 0.80;
  root.add(chassisGroup);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Distinct PBR materials with >= 0.25 roughness/metalness contrast
  const hullMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: bodyColor,
      metalness: chassisStyle === 'tempest' ? 0.65 : 0.85,
      roughness: chassisStyle === 'tempest' ? 0.34 : 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    })
  );

  const secondaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: secondaryColor,
      metalness: 0.78,
      roughness: 0.26,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    })
  );

  const carbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.25,
      roughness: 0.72,
    })
  );

  const canopyMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x070d18,
      metalness: 0.18,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.7,
    })
  );

  const brushedTitaniumMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.28,
      anisotropy: 0.7,
    })
  );

  const accentGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 2.3,
      roughness: 0.2,
      metalness: 0.1,
    })
  );

  const tailLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2a4b,
      emissive: 0xff1e42,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    })
  );

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.88,
    })
  );

  const thrusterFlames: THREE.Mesh[] = [];

  // Shared turbine nacelle LatheGeometry
  const podPoints = [
    new THREE.Vector2(0.0, -0.14),
    new THREE.Vector2(0.32, -0.14),
    new THREE.Vector2(0.42, -0.02),
    new THREE.Vector2(0.38, 0.14),
    new THREE.Vector2(0.24, 0.18),
    new THREE.Vector2(0.0, 0.18),
  ];
  const podGeo = trackGeo(new THREE.LatheGeometry(podPoints, 18));
  const coilGeo = trackGeo(new THREE.TorusGeometry(0.29, 0.038, 10, 24));
  coilGeo.rotateX(Math.PI / 2);

  if (chassisStyle === 'tempest') {
    // === TEMPEST-R: Twin-Prong Spearhead Interceptor + Delta Wings + Dorsal Shark Fin ===
    const coreShape = new THREE.Shape();
    coreShape.moveTo(-2.55, -0.14);
    coreShape.lineTo(1.25, -0.14);
    coreShape.lineTo(1.85, 0.02);
    coreShape.lineTo(0.85, 0.34);
    coreShape.lineTo(-1.1, 0.44);
    coreShape.lineTo(-2.55, 0.24);
    coreShape.closePath();

    const coreGeo = trackGeo(
      new THREE.ExtrudeGeometry(coreShape, {
        depth: 1.05,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.08,
        bevelSegments: 3,
      })
    );
    coreGeo.translate(0, 0, -0.525);
    coreGeo.rotateY(-Math.PI / 2);
    coreGeo.computeVertexNormals();
    const coreMesh = new THREE.Mesh(coreGeo, hullMat);
    coreMesh.castShadow = castShadow;
    coreMesh.receiveShadow = true;
    chassisGroup.add(coreMesh);

    // Twin protruding needle-spear prongs + copper intake cowls
    const prongGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.22, 2.35));
    const prongTipGeo = trackGeo(new THREE.ConeGeometry(0.19, 0.72, 4));
    prongTipGeo.rotateX(Math.PI / 2);
    prongTipGeo.rotateZ(Math.PI / 4);

    [-0.64, 0.64].forEach((px) => {
      const prong = new THREE.Mesh(prongGeo, secondaryMat);
      prong.position.set(px, -0.02, 1.55);
      prong.castShadow = castShadow;
      chassisGroup.add(prong);

      const tip = new THREE.Mesh(prongTipGeo, hullMat);
      tip.position.set(px, -0.02, 2.95);
      chassisGroup.add(tip);

      const stripeGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.04, 2.2));
      const stripe = new THREE.Mesh(stripeGeo, accentGlowMat);
      stripe.position.set(px, 0.11, 1.5);
      chassisGroup.add(stripe);
    });

    // Swept-back Delta Wings
    const wingGeo = trackGeo(new THREE.BoxGeometry(1.38, 0.08, 1.45));
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(wingGeo, hullMat);
      wing.position.set(side * 1.12, 0.06, -1.05);
      wing.rotation.y = side * -0.44;
      wing.castShadow = castShadow;
      chassisGroup.add(wing);

      const wingEdgeGeo = trackGeo(new THREE.BoxGeometry(1.35, 0.04, 0.1));
      const edge = new THREE.Mesh(wingEdgeGeo, accentGlowMat);
      edge.position.set(side * 1.15, 0.07, -0.35);
      edge.rotation.y = side * -0.44;
      chassisGroup.add(edge);
    });

    // Low-drag Canopy
    const canopyGeo = trackGeo(new THREE.CapsuleGeometry(0.38, 1.1, 6, 14));
    canopyGeo.rotateX(Math.PI / 2);
    canopyGeo.scale(1.0, 0.68, 1.0);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.42, 0.1);
    chassisGroup.add(canopy);

    // Tall Central Dorsal Shark Fin
    const finShape = new THREE.Shape();
    finShape.moveTo(-2.35, 0.28);
    finShape.lineTo(-0.45, 0.36);
    finShape.lineTo(-1.85, 0.96);
    finShape.lineTo(-2.45, 0.88);
    finShape.closePath();
    const sharkGeo = trackGeo(
      new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 })
    );
    sharkGeo.translate(0, 0, -0.04);
    sharkGeo.rotateY(-Math.PI / 2);
    const sharkFin = new THREE.Mesh(sharkGeo, secondaryMat);
    sharkFin.castShadow = castShadow;
    chassisGroup.add(sharkFin);

    // 4 Turbine Pods
    [
      [-0.86, 1.45],
      [0.86, 1.45],
      [-1.36, -1.45],
      [1.36, -1.45],
    ].forEach(([px, pz]) => {
      const pod = new THREE.Mesh(podGeo, brushedTitaniumMat);
      pod.position.set(px, -0.16, pz);
      chassisGroup.add(pod);
      const coil = new THREE.Mesh(coilGeo, accentGlowMat);
      coil.position.set(px, -0.28, pz);
      chassisGroup.add(coil);
    });

    // Oversized Dual Afterburners
    const nozzleGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.31, 0.42, 16));
    nozzleGeo.rotateX(Math.PI / 2);
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.22, 1.4, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.7);
    [-0.46, 0.46].forEach((tx) => {
      const nozzle = new THREE.Mesh(nozzleGeo, brushedTitaniumMat);
      nozzle.position.set(tx, 0.06, -2.58);
      chassisGroup.add(nozzle);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(tx, 0.06, -2.76);
      chassisGroup.add(flame);
      thrusterFlames.push(flame);
    });

    const tailBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 0.08, 0.08)), tailLightMat);
    tailBar.position.set(0, 0.22, -2.6);
    chassisGroup.add(tailBar);
  } else if (chassisStyle === 'phantom') {
    // === PHANTOM-V: Forward-Swept Stealth Wings + Dorsal Sensor Pod + Triple Thrusters ===
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.1, -0.14);
    hullShape.lineTo(1.4, -0.14);
    hullShape.lineTo(2.15, 0.08);
    hullShape.lineTo(1.1, 0.38);
    hullShape.lineTo(-0.35, 0.48);
    hullShape.lineTo(-2.1, 0.3);
    hullShape.closePath();

    const hullGeo = trackGeo(
      new THREE.ExtrudeGeometry(hullShape, {
        depth: 1.38,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.08,
        bevelSegments: 3,
      })
    );
    hullGeo.translate(0, 0, -0.69);
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.computeVertexNormals();
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.castShadow = castShadow;
    hullMesh.receiveShadow = true;
    chassisGroup.add(hullMesh);

    // Armored White Secondary Shoulder Cowls
    const cowlGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.22, 2.5));
    [-0.78, 0.78].forEach((cx) => {
      const cowl = new THREE.Mesh(cowlGeo, secondaryMat);
      cowl.position.set(cx, 0.24, -0.25);
      cowl.castShadow = castShadow;
      chassisGroup.add(cowl);
    });

    // Armored Canopy
    const canopyGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.34, 1.65));
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 0.48, 0.15);
    canopy.rotation.x = 0.08;
    chassisGroup.add(canopy);

    // Dorsal Tactical Item-Launcher / Sensor Pod
    const podHousing = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.54, 0.22, 0.92)),
      carbonMat
    );
    podHousing.position.set(0, 0.64, -1.05);
    chassisGroup.add(podHousing);
    const sensorRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.18, 0.04, 8, 18)),
      accentGlowMat
    );
    sensorRing.position.set(0, 0.72, -0.6);
    chassisGroup.add(sensorRing);

    // Forward-Swept Outer Stealth Wings (+0.38 rad forward sweep!)
    const fWingGeo = trackGeo(new THREE.BoxGeometry(1.25, 0.08, 0.72));
    const tipPodGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.12, 1.35, 10));
    tipPodGeo.rotateX(Math.PI / 2);
    [-1, 1].forEach((side) => {
      const fWing = new THREE.Mesh(fWingGeo, secondaryMat);
      fWing.position.set(side * 1.28, 0.08, 0.15);
      fWing.rotation.y = side * 0.38;
      fWing.castShadow = castShadow;
      chassisGroup.add(fWing);

      const tipPod = new THREE.Mesh(tipPodGeo, hullMat);
      tipPod.position.set(side * 1.82, 0.08, 0.48);
      chassisGroup.add(tipPod);

      const blade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.18, 0.04, 0.08)), accentGlowMat);
      blade.position.set(side * 1.28, 0.11, 0.52);
      blade.rotation.y = side * 0.38;
      chassisGroup.add(blade);
    });

    // Outward-Canted V-Tail Stabilizers
    const vTailGeo = trackGeo(new THREE.BoxGeometry(0.1, 0.74, 0.95));
    [-1, 1].forEach((side) => {
      const vTail = new THREE.Mesh(vTailGeo, hullMat);
      vTail.position.set(side * 0.78, 0.62, -1.78);
      vTail.rotation.z = side * -0.48;
      vTail.castShadow = castShadow;
      chassisGroup.add(vTail);
    });

    // 4 Turbine Pods
    [
      [-1.38, 0.75],
      [1.38, 0.75],
      [-1.08, -1.4],
      [1.08, -1.4],
    ].forEach(([px, pz]) => {
      const pod = new THREE.Mesh(podGeo, brushedTitaniumMat);
      pod.position.set(px, -0.16, pz);
      chassisGroup.add(pod);
      const coil = new THREE.Mesh(coilGeo, accentGlowMat);
      coil.position.set(px, -0.28, pz);
      chassisGroup.add(coil);
    });

    // Triple-Nozzle Thruster Array
    const nozzleGeo = trackGeo(new THREE.CylinderGeometry(0.15, 0.2, 0.32, 14));
    nozzleGeo.rotateX(Math.PI / 2);
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.14, 1.05, 12));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.525);
    [-0.5, 0, 0.5].forEach((tx, idx) => {
      const ty = idx === 1 ? 0.16 : 0.05;
      const nozzle = new THREE.Mesh(nozzleGeo, brushedTitaniumMat);
      nozzle.position.set(tx, ty, -2.18);
      chassisGroup.add(nozzle);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(tx, ty, -2.32);
      chassisGroup.add(flame);
      thrusterFlames.push(flame);
    });

    const tailBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.48, 0.07, 0.07)), tailLightMat);
    tailBar.position.set(0, 0.24, -2.18);
    chassisGroup.add(tailBar);
  } else {
    // === VALKYRIE-X: Pearl Titanium + Deep Cobalt GT Flagship Wedge ===
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.35, -0.14);
    hullShape.lineTo(1.75, -0.14);
    hullShape.lineTo(2.45, 0.04);
    hullShape.lineTo(1.35, 0.28);
    hullShape.lineTo(0.35, 0.42);
    hullShape.lineTo(-1.15, 0.45);
    hullShape.lineTo(-2.35, 0.26);
    hullShape.closePath();

    const hullGeo = trackGeo(
      new THREE.ExtrudeGeometry(hullShape, {
        depth: 1.56,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.09,
        bevelSegments: 3,
      })
    );
    hullGeo.translate(0, 0, -0.78);
    hullGeo.rotateY(-Math.PI / 2);
    hullGeo.computeVertexNormals();

    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.castShadow = castShadow;
    hullMesh.receiveShadow = true;
    chassisGroup.add(hullMesh);

    // Cobalt Racing Sidepods + Carbon Undertray
    const undertray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.88, 0.14, 4.3)), carbonMat);
    undertray.position.set(0, -0.15, -0.05);
    undertray.castShadow = castShadow;
    chassisGroup.add(undertray);

    const sidePodGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.22, 2.7));
    [-0.92, 0.92].forEach((sx) => {
      const sp = new THREE.Mesh(sidePodGeo, secondaryMat);
      sp.position.set(sx, 0.12, -0.35);
      sp.castShadow = castShadow;
      chassisGroup.add(sp);
    });

    // Smoked Canopy
    const canopyShape = new THREE.Shape();
    canopyShape.moveTo(-1.1, 0.0);
    canopyShape.lineTo(1.05, 0.0);
    canopyShape.lineTo(0.45, 0.34);
    canopyShape.lineTo(-0.55, 0.36);
    canopyShape.closePath();

    const canopyGeo = trackGeo(
      new THREE.ExtrudeGeometry(canopyShape, {
        depth: 0.86,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.06,
        bevelSegments: 3,
      })
    );
    canopyGeo.translate(0, 0, -0.43);
    canopyGeo.rotateY(-Math.PI / 2);
    canopyGeo.computeVertexNormals();
    const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
    canopyMesh.position.set(0, 0.36, -0.05);
    canopyMesh.castShadow = castShadow;
    chassisGroup.add(canopyMesh);

    // Forward Canards + Cyan LED Blades
    const canardGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.06, 0.85));
    [-1, 1].forEach((side) => {
      const canard = new THREE.Mesh(canardGeo, secondaryMat);
      canard.position.set(side * 1.02, -0.02, 1.52);
      canard.rotation.y = side * -0.22;
      canard.rotation.z = side * -0.08;
      canard.castShadow = castShadow;
      chassisGroup.add(canard);

      const blade = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.035, 0.08)), accentGlowMat);
      blade.position.set(side * 1.04, 0.01, 1.92);
      blade.rotation.y = side * -0.22;
      chassisGroup.add(blade);
    });

    // 4 Turbine Pods
    [
      [-1.08, 1.25],
      [1.08, 1.25],
      [-1.16, -1.35],
      [1.16, -1.35],
    ].forEach(([px, pz]) => {
      const pod = new THREE.Mesh(podGeo, brushedTitaniumMat);
      pod.position.set(px, -0.16, pz);
      pod.castShadow = castShadow;
      chassisGroup.add(pod);
      const coil = new THREE.Mesh(coilGeo, accentGlowMat);
      coil.position.set(px, -0.28, pz);
      chassisGroup.add(coil);
    });

    // High-Downforce Split GT Wing
    const finGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.62, 0.95));
    [-1, 1].forEach((side) => {
      const fin = new THREE.Mesh(finGeo, secondaryMat);
      fin.position.set(side * 0.88, 0.56, -1.85);
      fin.rotation.z = side * -0.22;
      fin.castShadow = castShadow;
      chassisGroup.add(fin);
    });

    const wingMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 0.08, 0.44)), carbonMat);
    wingMesh.position.set(0, 0.84, -2.08);
    wingMesh.rotation.x = 0.12;
    wingMesh.castShadow = castShadow;
    chassisGroup.add(wingMesh);

    const wingTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.34, 0.03, 0.08)), accentGlowMat);
    wingTrim.position.set(0, 0.85, -2.28);
    chassisGroup.add(wingTrim);

    // Dorsal Spine & Tailbar
    const spine = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.05, 1.45)), accentGlowMat);
    spine.position.set(0, 0.48, -1.15);
    chassisGroup.add(spine);

    const tailBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.52, 0.07, 0.07)), tailLightMat);
    tailBar.position.set(0, 0.2, -2.42);
    chassisGroup.add(tailBar);

    // Twin Rear Plasma Thrusters
    const nozzleGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.24, 0.34, 16));
    nozzleGeo.rotateX(Math.PI / 2);
    const flameGeo = trackGeo(new THREE.ConeGeometry(0.16, 1.15, 14));
    flameGeo.rotateX(-Math.PI / 2);
    flameGeo.translate(0, 0, -0.575);
    [-0.44, 0.44].forEach((tx) => {
      const nozzle = new THREE.Mesh(nozzleGeo, brushedTitaniumMat);
      nozzle.position.set(tx, 0.06, -2.38);
      chassisGroup.add(nozzle);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(tx, 0.06, -2.52);
      chassisGroup.add(flame);
      thrusterFlames.push(flame);
    });
  }

  // Grounded Contact Shadow Plane (sits flush at Y = 0.03 above track)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(3.2, 5.6));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  // Aegis Shield Holographic Energy Dome (hidden unless shield sub-item is active)
  const shieldGeo = trackGeo(new THREE.IcosahedronGeometry(2.9, 1));
  shieldGeo.scale(0.76, 0.46, 1.08);
  const shieldMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      wireframe: true,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    })
  );
  const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
  shieldDome.position.set(0, 0.18, 0);
  const shieldRimGeo = trackGeo(new THREE.TorusGeometry(2.25, 0.06, 8, 32));
  shieldRimGeo.rotateX(Math.PI / 2);
  shieldRimGeo.scale(0.95, 1.35, 1.0);
  const shieldRim = new THREE.Mesh(
    shieldRimGeo,
    trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.85,
      })
    )
  );
  shieldDome.add(shieldRim);
  shieldDome.visible = false;
  chassisGroup.add(shieldDome);

  // Luminous Hyper-Glow Aura Rings (hidden unless glow_boost is active)
  const glowAura = new THREE.Group();
  const auraRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const auraOuterMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const auraRingA = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.35, 0.07, 8, 32)), auraRingMat);
  auraRingA.rotation.x = Math.PI / 2;
  auraRingA.scale.set(0.86, 1.25, 1.0);
  const auraRingB = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.95, 0.055, 8, 28)), auraRingMat);
  auraRingB.rotation.z = Math.PI / 6;
  const auraShellGeo = trackGeo(new THREE.SphereGeometry(2.4, 16, 12));
  auraShellGeo.scale(0.74, 0.42, 1.15);
  const auraShell = new THREE.Mesh(auraShellGeo, auraOuterMat);
  glowAura.add(auraRingA, auraRingB, auraShell);
  glowAura.position.set(0, 0.14, 0);
  glowAura.visible = false;
  chassisGroup.add(glowAura);

  // Anti-Grav Aero Float Underbody Vortex Ring (hidden unless hover_glide is active)
  const hoverHaloGeo = trackGeo(new THREE.TorusGeometry(1.85, 0.11, 10, 32));
  hoverHaloGeo.rotateX(Math.PI / 2);
  hoverHaloGeo.scale(0.88, 1.32, 1.0);
  const hoverHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x2dd4bf,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const hoverHalo = new THREE.Mesh(hoverHaloGeo, hoverHaloMat);
  hoverHalo.position.set(0, -0.34, 0);
  hoverHalo.visible = false;
  chassisGroup.add(hoverHalo);

  // Damage / Spin Hazard Arcs (visible whenever hitSpinTimer > 0)
  const spinSparkRing = new THREE.Group();
  const spinRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const spinWarnMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const spinRingA = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.55, 0.11, 8, 28)), spinRingMat);
  spinRingA.rotation.x = Math.PI / 2;
  const spinRingB = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.15, 0.08, 8, 24)), spinWarnMat);
  spinRingB.rotation.x = Math.PI / 2.4;
  spinRingB.rotation.y = Math.PI / 4;
  const spinRingC = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.15, 0.08, 8, 24)), spinRingMat);
  spinRingC.rotation.x = -Math.PI / 2.4;
  spinRingC.rotation.y = -Math.PI / 4;
  spinSparkRing.add(spinRingA, spinRingB, spinRingC);
  spinSparkRing.position.set(0, 0.35, 0);
  spinSparkRing.visible = false;
  chassisGroup.add(spinSparkRing);

  // Supersonic Dash / Turbo Aura (Mach shock rings + wingtip plasma streaks, hidden unless boosting)
  const boostAura = new THREE.Group();
  const machRingMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const machHotMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const wingStreakGeo = trackGeo(new THREE.ConeGeometry(0.14, 3.8, 8));
  wingStreakGeo.rotateX(-Math.PI / 2);
  wingStreakGeo.translate(0, 0, -1.9);

  const machRingFront = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(1.55, 0.055, 8, 28)), machRingMat);
  machRingFront.position.set(0, 0.12, 1.35);
  const machRingMid = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.05, 0.07, 8, 32)), machHotMat);
  machRingMid.position.set(0, 0.14, -0.15);
  const machRingRear = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(2.45, 0.085, 8, 32)), machRingMat);
  machRingRear.position.set(0, 0.14, -1.75);

  const streakLeft = new THREE.Mesh(wingStreakGeo, machHotMat);
  streakLeft.position.set(-1.62, 0.04, -1.35);
  const streakRight = new THREE.Mesh(wingStreakGeo, machHotMat);
  streakRight.position.set(1.62, 0.04, -1.35);

  const coreJetGeo = trackGeo(new THREE.ConeGeometry(0.46, 3.6, 12));
  coreJetGeo.rotateX(-Math.PI / 2);
  coreJetGeo.translate(0, 0, -1.8);
  const coreJet = new THREE.Mesh(coreJetGeo, machRingMat);
  coreJet.position.set(0, 0.08, -2.55);

  boostAura.add(machRingFront, machRingMid, machRingRear, streakLeft, streakRight, coreJet);
  boostAura.visible = false;
  chassisGroup.add(boostAura);

  return {
    root,
    chassisGroup,
    thrusterFlames,
    boostGlowMaterial: accentGlowMat,
    shadowPlane,
    shieldDome,
    glowAura,
    hoverHalo,
    spinSparkRing,
    boostAura,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
