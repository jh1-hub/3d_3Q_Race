import * as THREE from 'three';

export interface ProceduralTextures {
  trackAlbedo: THREE.CanvasTexture;
  trackEmissive: THREE.CanvasTexture;
  trackRoughness: THREE.CanvasTexture;
  startFinishAlbedo: THREE.CanvasTexture;
  boostPadTexture: THREE.CanvasTexture;
  buildingEmissive: THREE.CanvasTexture;
  groundGridTexture: THREE.CanvasTexture;
  oceanSurfaceTexture: THREE.CanvasTexture;
  lunarSurfaceTexture: THREE.CanvasTexture;
  skyCloudsTexture: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  particleGlow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextures {
  const created: THREE.Texture[] = [];
  const register = (tex: THREE.CanvasTexture, isSRGB: boolean, repeatX = 1, repeatY = 1): THREE.CanvasTexture => {
    if (isSRGB) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.anisotropy = maxAnisotropy;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Track Deck Albedo (futuristic carbon-composite plates + edge curbs)
  const trackCanvas = document.createElement('canvas');
  trackCanvas.width = 512;
  trackCanvas.height = 512;
  const tCtx = trackCanvas.getContext('2d')!;
  tCtx.fillStyle = '#0d1320';
  tCtx.fillRect(0, 0, 512, 512);

  // Subtle composite panel seams
  tCtx.strokeStyle = '#182236';
  tCtx.lineWidth = 2;
  for (let y = 0; y <= 512; y += 64) {
    tCtx.beginPath();
    tCtx.moveTo(0, y);
    tCtx.lineTo(512, y);
    tCtx.stroke();
  }
  for (let x = 64; x < 512; x += 128) {
    tCtx.beginPath();
    tCtx.moveTo(x, 0);
    tCtx.lineTo(x, 512);
    tCtx.stroke();
  }

  // Micro carbon grain
  for (let i = 0; i < 1600; i++) {
    const gx = (i * 73) % 512;
    const gy = (i * 137) % 512;
    tCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
    tCtx.fillRect(gx, gy, 4, 4);
  }

  // Edge curb strips (amber & cyan industrial chevrons)
  tCtx.fillStyle = '#162033';
  tCtx.fillRect(0, 0, 36, 512);
  tCtx.fillRect(476, 0, 36, 512);
  for (let y = 0; y < 512; y += 64) {
    tCtx.fillStyle = (y / 64) % 2 === 0 ? '#0ea5e9' : '#1e293b';
    tCtx.fillRect(10, y + 4, 14, 48);
    tCtx.fillStyle = (y / 64) % 2 === 0 ? '#f59e0b' : '#1e293b';
    tCtx.fillRect(488, y + 4, 14, 48);
  }

  // 4-lane subtle dashed divider strips (lanes at 25%, 50%, 75% across track)
  tCtx.fillStyle = '#1e293b';
  tCtx.fillRect(246, 0, 20, 512);
  for (let y = 16; y < 512; y += 128) {
    tCtx.fillStyle = '#38bdf8';
    tCtx.fillRect(253, y, 6, 72);
    tCtx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    tCtx.fillRect(138, y + 8, 4, 48);
    tCtx.fillRect(370, y + 8, 4, 48);
  }

  const trackAlbedo = register(new THREE.CanvasTexture(trackCanvas), true);

  // 2. Track Emissive (glowing edge lanes + center guide ticks)
  const emCanvas = document.createElement('canvas');
  emCanvas.width = 512;
  emCanvas.height = 512;
  const eCtx = emCanvas.getContext('2d')!;
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);
  // Crisp cyan left strip & warm amber right strip
  eCtx.fillStyle = '#06b6d4';
  eCtx.fillRect(36, 0, 6, 512);
  eCtx.fillStyle = '#f59e0b';
  eCtx.fillRect(470, 0, 6, 512);
  // Center + lane dashed LED markers
  for (let y = 16; y < 512; y += 128) {
    eCtx.fillStyle = '#0284c7';
    eCtx.fillRect(254, y, 4, 68);
    eCtx.fillStyle = '#0c4a6e';
    eCtx.fillRect(139, y + 8, 3, 48);
    eCtx.fillRect(370, y + 8, 3, 48);
  }
  const trackEmissive = register(new THREE.CanvasTexture(emCanvas), true);

  // 3. Track Roughness Map (linear)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#707070'; // ~0.44 roughness road
  rCtx.fillRect(0, 0, 256, 256);
  // Smoother polished magnetic center track
  rCtx.fillStyle = '#3a3a3a';
  rCtx.fillRect(118, 0, 20, 256);
  const trackRoughness = register(new THREE.CanvasTexture(roughCanvas), false);

  // 4. Start / Finish Line Texture
  const sfCanvas = document.createElement('canvas');
  sfCanvas.width = 512;
  sfCanvas.height = 128;
  const sfCtx = sfCanvas.getContext('2d')!;
  const cell = 32;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 16; c++) {
      sfCtx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      sfCtx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  sfCtx.fillStyle = '#06b6d4';
  sfCtx.fillRect(0, 0, 512, 10);
  sfCtx.fillRect(0, 118, 512, 10);
  const startFinishAlbedo = register(new THREE.CanvasTexture(sfCanvas), true);
  startFinishAlbedo.wrapS = THREE.ClampToEdgeWrapping;
  startFinishAlbedo.wrapT = THREE.ClampToEdgeWrapping;

  // 5. Boost Pad Chevron Texture
  const bpCanvas = document.createElement('canvas');
  bpCanvas.width = 256;
  bpCanvas.height = 512;
  const bpCtx = bpCanvas.getContext('2d')!;
  bpCtx.fillStyle = '#061526';
  bpCtx.fillRect(0, 0, 256, 512);
  bpCtx.strokeStyle = '#22d3ee';
  bpCtx.lineWidth = 14;
  for (let y = 70; y < 480; y += 110) {
    bpCtx.beginPath();
    bpCtx.moveTo(32, y + 60);
    bpCtx.lineTo(128, y);
    bpCtx.lineTo(224, y + 60);
    bpCtx.stroke();
  }
  bpCtx.strokeStyle = '#06b6d4';
  bpCtx.lineWidth = 8;
  bpCtx.strokeRect(8, 8, 240, 496);
  const boostPadTexture = register(new THREE.CanvasTexture(bpCanvas), true);

  // 6. Building Emissive Window Grid
  const bCanvas = document.createElement('canvas');
  bCanvas.width = 256;
  bCanvas.height = 512;
  const bCtx = bCanvas.getContext('2d')!;
  bCtx.fillStyle = '#03050a';
  bCtx.fillRect(0, 0, 256, 512);
  for (let y = 12; y < 500; y += 20) {
    const litRow = ((y * 7) % 5) !== 0;
    if (!litRow) continue;
    for (let x = 10; x < 246; x += 22) {
      const hash = (x * 31 + y * 17) % 11;
      if (hash < 4) {
        bCtx.fillStyle = hash === 0 ? '#f59e0b' : '#0ea5e9';
        bCtx.fillRect(x, y, 14, 8);
      } else if (hash < 6) {
        bCtx.fillStyle = '#1e3a5f';
        bCtx.fillRect(x, y, 14, 8);
      }
    }
  }
  const buildingEmissive = register(new THREE.CanvasTexture(bCanvas), true, 1, 2);

  // 7. Horizon Grid Basin Texture (Orbital)
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 512;
  gCanvas.height = 512;
  const gCtx = gCanvas.getContext('2d')!;
  gCtx.fillStyle = '#05070e';
  gCtx.fillRect(0, 0, 512, 512);
  gCtx.strokeStyle = '#0f213d';
  gCtx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    gCtx.beginPath();
    gCtx.moveTo(i, 0);
    gCtx.lineTo(i, 512);
    gCtx.stroke();
    gCtx.beginPath();
    gCtx.moveTo(0, i);
    gCtx.lineTo(512, i);
    gCtx.stroke();
  }
  gCtx.strokeStyle = '#164e63';
  gCtx.lineWidth = 3;
  gCtx.strokeRect(0, 0, 512, 512);
  const groundGridTexture = register(new THREE.CanvasTexture(gCanvas), true, 120, 120);

  // 8. Ocean Surface Texture (Oceanic City & Tidal Power Plants)
  const oCanvas = document.createElement('canvas');
  oCanvas.width = 512;
  oCanvas.height = 512;
  const oCtx = oCanvas.getContext('2d')!;
  oCtx.fillStyle = '#031728';
  oCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 48; i++) {
    const wy = (i * 17) % 512;
    const wx = (i * 89) % 512;
    oCtx.fillStyle = i % 3 === 0 ? 'rgba(45, 212, 191, 0.14)' : 'rgba(14, 165, 233, 0.10)';
    oCtx.fillRect(wx, wy, 96, 4);
  }
  oCtx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
  oCtx.lineWidth = 2;
  oCtx.strokeRect(0, 0, 512, 512);
  const oceanSurfaceTexture = register(new THREE.CanvasTexture(oCanvas), true, 90, 90);

  // 9. Lunar Regolith Surface Texture (Lunar Exploration Base)
  const lCanvas = document.createElement('canvas');
  lCanvas.width = 512;
  lCanvas.height = 512;
  const lCtx = lCanvas.getContext('2d')!;
  lCtx.fillStyle = '#1d222d';
  lCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1200; i++) {
    const lx = (i * 79) % 512;
    const ly = (i * 151) % 512;
    lCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.18)';
    lCtx.fillRect(lx, ly, 5, 5);
  }
  for (let c = 0; c < 18; c++) {
    const cx = (c * 137 + 40) % 440 + 36;
    const cy = (c * 193 + 60) % 440 + 36;
    const r = 14 + ((c * 19) % 28);
    lCtx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    lCtx.lineWidth = 3;
    lCtx.beginPath();
    lCtx.arc(cx, cy, r, 0, Math.PI * 2);
    lCtx.stroke();
    lCtx.fillStyle = 'rgba(10, 13, 20, 0.45)';
    lCtx.beginPath();
    lCtx.arc(cx + 2, cy + 2, Math.max(4, r - 4), 0, Math.PI * 2);
    lCtx.fill();
  }
  const lunarSurfaceTexture = register(new THREE.CanvasTexture(lCanvas), true, 72, 72);

  // 10. Aerial Cloud-Sea Texture (Sky City)
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 512;
  cCanvas.height = 512;
  const cCtx = cCanvas.getContext('2d')!;
  cCtx.fillStyle = '#111330';
  cCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 42; i++) {
    const px = (i * 103) % 512;
    const py = (i * 67) % 512;
    const rad = 54 + ((i * 23) % 72);
    const cg = cCtx.createRadialGradient(px, py, 6, px, py, rad);
    cg.addColorStop(0, i % 3 === 0 ? 'rgba(192, 132, 252, 0.22)' : 'rgba(56, 189, 248, 0.18)');
    cg.addColorStop(1, 'rgba(17, 19, 48, 0)');
    cCtx.fillStyle = cg;
    cCtx.beginPath();
    cCtx.arc(px, py, rad, 0, Math.PI * 2);
    cCtx.fill();
  }
  const skyCloudsTexture = register(new THREE.CanvasTexture(cCanvas), true, 36, 36);

  // 11. Soft Radial Contact Shadow
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 128;
  sCanvas.height = 128;
  const sCtx = sCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadow = register(new THREE.CanvasTexture(sCanvas), true);
  contactShadow.wrapS = THREE.ClampToEdgeWrapping;
  contactShadow.wrapT = THREE.ClampToEdgeWrapping;

  // 12. Speed Particle Soft Glow
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 64;
  pCanvas.height = 64;
  const pCtx = pCanvas.getContext('2d')!;
  const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  pGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.8)');
  pGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 64, 64);
  const particleGlow = register(new THREE.CanvasTexture(pCanvas), true);
  particleGlow.wrapS = THREE.ClampToEdgeWrapping;
  particleGlow.wrapT = THREE.ClampToEdgeWrapping;

  return {
    trackAlbedo,
    trackEmissive,
    trackRoughness,
    startFinishAlbedo,
    boostPadTexture,
    buildingEmissive,
    groundGridTexture,
    oceanSurfaceTexture,
    lunarSurfaceTexture,
    skyCloudsTexture,
    contactShadow,
    particleGlow,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
