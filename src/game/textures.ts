import * as THREE from 'three';

export interface ProceduralTextures {
  trackAlbedo: THREE.CanvasTexture;
  trackEmissive: THREE.CanvasTexture;
  trackRoughness: THREE.CanvasTexture;
  trackBump: THREE.CanvasTexture;
  startFinishAlbedo: THREE.CanvasTexture;
  boostPadTexture: THREE.CanvasTexture;
  floatPadTexture: THREE.CanvasTexture;
  cornerChevronTexture: THREE.CanvasTexture;
  gantryBannerTexture: THREE.CanvasTexture;
  gatePadTexture: THREE.CanvasTexture;
  approachRunwayTexture: THREE.CanvasTexture;
  buildingEmissive: THREE.CanvasTexture;
  groundGridTexture: THREE.CanvasTexture;
  oceanSurfaceTexture: THREE.CanvasTexture;
  lunarSurfaceTexture: THREE.CanvasTexture;
  skyCloudsTexture: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  particleGlow: THREE.CanvasTexture;
  hullPanelBump: THREE.CanvasTexture;
  hullPanelRoughness: THREE.CanvasTexture;
  carbonWeaveAlbedo: THREE.CanvasTexture;
  carbonWeaveBump: THREE.CanvasTexture;
  titaniumBrushedBump: THREE.CanvasTexture;
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

  // 3b. Track Bump Map (composite road seams, magnetic center ribs & curb grooves)
  const tbTrackCanvas = document.createElement('canvas');
  tbTrackCanvas.width = 512;
  tbTrackCanvas.height = 512;
  const tbCtx = tbTrackCanvas.getContext('2d')!;
  tbCtx.fillStyle = '#909090';
  tbCtx.fillRect(0, 0, 512, 512);
  // Subtle brushed road grip lines
  for (let x = 44; x < 468; x += 12) {
    tbCtx.fillStyle = x % 24 === 0 ? '#9c9c9c' : '#858585';
    tbCtx.fillRect(x, 0, 3, 512);
  }
  // Recessed plate seams
  tbCtx.fillStyle = '#404040';
  for (let y = 0; y < 512; y += 64) {
    tbCtx.fillRect(0, y, 512, 3);
  }
  for (let x = 64; x < 512; x += 128) {
    tbCtx.fillRect(x, 0, 3, 512);
  }
  // Raised magnetic center rail & edge curbs
  tbCtx.fillStyle = '#c8c8c8';
  tbCtx.fillRect(248, 0, 16, 512);
  for (let y = 0; y < 512; y += 64) {
    tbCtx.fillStyle = '#d4d4d4';
    tbCtx.fillRect(8, y + 6, 18, 44);
    tbCtx.fillRect(486, y + 6, 18, 44);
  }
  const trackBump = register(new THREE.CanvasTexture(tbTrackCanvas), false);

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

  // 5. Boost Pad Chevron Texture (seamless 128px vertical period for smooth UV scroll)
  const bpCanvas = document.createElement('canvas');
  bpCanvas.width = 256;
  bpCanvas.height = 512;
  const bpCtx = bpCanvas.getContext('2d')!;
  bpCtx.fillStyle = '#041222';
  bpCtx.fillRect(0, 0, 256, 512);
  // Subtle longitudinal energy rails
  bpCtx.fillStyle = '#082f49';
  bpCtx.fillRect(10, 0, 16, 512);
  bpCtx.fillRect(230, 0, 16, 512);
  bpCtx.fillStyle = '#38bdf8';
  bpCtx.fillRect(16, 0, 4, 512);
  bpCtx.fillRect(236, 0, 4, 512);
  // Repeating seamless glowing chevrons (4 per 512px tile, exact 128px step)
  for (let y = 0; y < 512; y += 128) {
    bpCtx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    bpCtx.lineWidth = 24;
    bpCtx.beginPath();
    bpCtx.moveTo(36, y + 86);
    bpCtx.lineTo(128, y + 22);
    bpCtx.lineTo(220, y + 86);
    bpCtx.stroke();

    bpCtx.strokeStyle = '#67e8f9';
    bpCtx.lineWidth = 11;
    bpCtx.beginPath();
    bpCtx.moveTo(36, y + 86);
    bpCtx.lineTo(128, y + 22);
    bpCtx.lineTo(220, y + 86);
    bpCtx.stroke();
  }
  const boostPadTexture = register(new THREE.CanvasTexture(bpCanvas), true);

  // 5b. Aero Float Pad Texture (seamless 128px period mint-teal levitation ellipses & updraft glyphs)
  const fpCanvas = document.createElement('canvas');
  fpCanvas.width = 256;
  fpCanvas.height = 512;
  const fpCtx = fpCanvas.getContext('2d')!;
  fpCtx.fillStyle = '#021b1b';
  fpCtx.fillRect(0, 0, 256, 512);
  fpCtx.fillStyle = '#14b8a6';
  fpCtx.fillRect(12, 0, 5, 512);
  fpCtx.fillRect(239, 0, 5, 512);
  for (let y = 0; y < 512; y += 128) {
    fpCtx.strokeStyle = 'rgba(94, 234, 212, 0.45)';
    fpCtx.lineWidth = 6;
    fpCtx.beginPath();
    fpCtx.ellipse(128, y + 72, 84, 24, 0, 0, Math.PI * 2);
    fpCtx.stroke();

    fpCtx.strokeStyle = '#5eead4';
    fpCtx.lineWidth = 11;
    fpCtx.beginPath();
    fpCtx.moveTo(46, y + 76);
    fpCtx.lineTo(128, y + 24);
    fpCtx.lineTo(210, y + 76);
    fpCtx.stroke();
  }
  const floatPadTexture = register(new THREE.CanvasTexture(fpCanvas), true);

  // 5c. Corner Turn Warning Chevron Board (256x128)
  const ccCanvas = document.createElement('canvas');
  ccCanvas.width = 256;
  ccCanvas.height = 128;
  const ccCtx = ccCanvas.getContext('2d')!;
  ccCtx.fillStyle = '#0a0f1c';
  ccCtx.fillRect(0, 0, 256, 128);
  ccCtx.strokeStyle = '#f59e0b';
  ccCtx.lineWidth = 5;
  ccCtx.strokeRect(4, 4, 248, 120);
  // Three bold forward-directional chevrons pointing right (+X)
  for (let cx = 42; cx <= 178; cx += 68) {
    ccCtx.strokeStyle = cx === 110 ? '#fde047' : '#f59e0b';
    ccCtx.lineWidth = 14;
    ccCtx.beginPath();
    ccCtx.moveTo(cx, 24);
    ccCtx.lineTo(cx + 38, 64);
    ccCtx.lineTo(cx, 104);
    ccCtx.stroke();
  }
  const cornerChevronTexture = register(new THREE.CanvasTexture(ccCanvas), true);
  cornerChevronTexture.wrapS = THREE.ClampToEdgeWrapping;
  cornerChevronTexture.wrapT = THREE.ClampToEdgeWrapping;

  // 5d. Start / Finish Gantry Overhead Banner (512x128)
  const gbCanvas = document.createElement('canvas');
  gbCanvas.width = 512;
  gbCanvas.height = 128;
  const gbCtx = gbCanvas.getContext('2d')!;
  gbCtx.fillStyle = '#070b14';
  gbCtx.fillRect(0, 0, 512, 128);
  gbCtx.strokeStyle = '#22d3ee';
  gbCtx.lineWidth = 4;
  gbCtx.strokeRect(4, 4, 504, 120);
  // Diagonal racing accent bars on ends
  for (let i = 0; i < 4; i++) {
    gbCtx.fillStyle = i % 2 === 0 ? '#06b6d4' : '#f59e0b';
    gbCtx.fillRect(14 + i * 14, 16, 8, 96);
    gbCtx.fillRect(490 - i * 14, 16, 8, 96);
  }
  gbCtx.fillStyle = '#f8fafc';
  gbCtx.font = 'bold 38px "Chakra Petch", sans-serif';
  gbCtx.textAlign = 'center';
  gbCtx.textBaseline = 'middle';
  gbCtx.fillText('HYPERION GP', 256, 52);
  gbCtx.fillStyle = '#38bdf8';
  gbCtx.font = 'bold 16px "Chakra Petch", sans-serif';
  gbCtx.fillText('ANTI-GRAVITY GRAND PRIX // START GRID', 256, 94);
  const gantryBannerTexture = register(new THREE.CanvasTexture(gbCanvas), true);
  gantryBannerTexture.wrapS = THREE.ClampToEdgeWrapping;
  gantryBannerTexture.wrapT = THREE.ClampToEdgeWrapping;

  // 5e. Quiz Gate Holographic Floor Pad (256x256)
  const gpCanvas = document.createElement('canvas');
  gpCanvas.width = 256;
  gpCanvas.height = 256;
  const gpCtx = gpCanvas.getContext('2d')!;
  gpCtx.clearRect(0, 0, 256, 256);
  gpCtx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  gpCtx.fillRect(12, 12, 232, 232);
  gpCtx.strokeStyle = '#ffffff';
  gpCtx.lineWidth = 8;
  gpCtx.strokeRect(14, 14, 228, 228);
  gpCtx.lineWidth = 4;
  gpCtx.beginPath();
  gpCtx.arc(128, 128, 76, 0, Math.PI * 2);
  gpCtx.stroke();
  gpCtx.beginPath();
  gpCtx.moveTo(64, 152);
  gpCtx.lineTo(128, 86);
  gpCtx.lineTo(192, 152);
  gpCtx.stroke();
  const gatePadTexture = register(new THREE.CanvasTexture(gpCanvas), true);
  gatePadTexture.wrapS = THREE.ClampToEdgeWrapping;
  gatePadTexture.wrapT = THREE.ClampToEdgeWrapping;

  // 5f. Quiz Gate Approach Runway Guide Chevrons (128x256, seamless repeat)
  const arCanvas = document.createElement('canvas');
  arCanvas.width = 128;
  arCanvas.height = 256;
  const arCtx = arCanvas.getContext('2d')!;
  arCtx.clearRect(0, 0, 128, 256);
  arCtx.fillStyle = 'rgba(14, 165, 233, 0.16)';
  arCtx.fillRect(10, 0, 4, 256);
  arCtx.fillRect(114, 0, 4, 256);
  arCtx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
  arCtx.lineWidth = 7;
  for (let y = 0; y < 256; y += 64) {
    arCtx.beginPath();
    arCtx.moveTo(26, y + 48);
    arCtx.lineTo(64, y + 16);
    arCtx.lineTo(102, y + 48);
    arCtx.stroke();
  }
  const approachRunwayTexture = register(new THREE.CanvasTexture(arCanvas), true, 1, 3);

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

  // 13. Machine Hull Aerospace Panel Seam & Rivet Bump / Roughness Maps (512x512)
  const hpBumpCanvas = document.createElement('canvas');
  hpBumpCanvas.width = 512;
  hpBumpCanvas.height = 512;
  const hpb = hpBumpCanvas.getContext('2d')!;
  hpb.fillStyle = '#c8c8c8';
  hpb.fillRect(0, 0, 512, 512);

  const hpRoughCanvas = document.createElement('canvas');
  hpRoughCanvas.width = 512;
  hpRoughCanvas.height = 512;
  const hpr = hpRoughCanvas.getContext('2d')!;
  hpr.fillStyle = '#404040';
  hpr.fillRect(0, 0, 512, 512);

  // Subtle metallic micro-grain across plates
  for (let i = 0; i < 900; i++) {
    const x = (i * 97) % 512;
    const y = (i * 193) % 512;
    hpb.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    hpb.fillRect(x, y, 6, 2);
  }

  // Slight tonal variation between adjacent aerospace armor panels
  const panelRects: [number, number, number, number, string, string][] = [
    [0, 0, 256, 192, '#d2d2d2', '#383838'],
    [256, 0, 256, 192, '#bebebe', '#4c4c4c'],
    [0, 192, 160, 160, '#c2c2c2', '#464646'],
    [160, 192, 192, 160, '#d6d6d6', '#343434'],
    [352, 192, 160, 160, '#c0c0c0', '#4a4a4a'],
    [0, 352, 256, 160, '#cacaca', '#3e3e3e'],
    [256, 352, 256, 160, '#d0d0d0', '#3a3a3a'],
  ];
  for (const [x, y, w, h, bCol, rCol] of panelRects) {
    hpb.fillStyle = bCol;
    hpb.fillRect(x + 2, y + 2, w - 4, h - 4);
    hpr.fillStyle = rCol;
    hpr.fillRect(x + 2, y + 2, w - 4, h - 4);
  }

  // Crisp recessed panel seams (orthogonal + angled aero cuts)
  const drawSeam = (x1: number, y1: number, x2: number, y2: number, width = 3) => {
    hpb.strokeStyle = '#323232';
    hpb.lineWidth = width;
    hpb.beginPath();
    hpb.moveTo(x1, y1);
    hpb.lineTo(x2, y2);
    hpb.stroke();

    hpb.strokeStyle = '#ececec';
    hpb.lineWidth = 1;
    hpb.beginPath();
    hpb.moveTo(x1 + 1, y1 + 1);
    hpb.lineTo(x2 + 1, y2 + 1);
    hpb.stroke();

    hpr.strokeStyle = '#a8a8a8';
    hpr.lineWidth = width + 1;
    hpr.beginPath();
    hpr.moveTo(x1, y1);
    hpr.lineTo(x2, y2);
    hpr.stroke();
  };

  drawSeam(0, 192, 512, 192, 3);
  drawSeam(0, 352, 512, 352, 3);
  drawSeam(256, 0, 256, 192, 3);
  drawSeam(160, 192, 160, 352, 2.5);
  drawSeam(352, 192, 352, 352, 2.5);
  drawSeam(256, 352, 256, 512, 3);
  // Angled technical access hatch seams
  drawSeam(48, 32, 208, 32, 2);
  drawSeam(208, 32, 228, 156, 2);
  drawSeam(228, 156, 36, 156, 2);
  drawSeam(36, 156, 48, 32, 2);
  drawSeam(288, 384, 464, 384, 2);
  drawSeam(464, 384, 480, 480, 2);
  drawSeam(480, 480, 272, 480, 2);
  drawSeam(272, 480, 288, 384, 2);

  // Cooling louver slits inside middle panel
  for (let ly = 224; ly <= 320; ly += 16) {
    drawSeam(192, ly, 320, ly, 2.5);
  }

  // Micro flush rivets along main seams
  const rivetPositions: [number, number][] = [];
  for (let rx = 24; rx < 512; rx += 32) {
    rivetPositions.push([rx, 184], [rx, 200], [rx, 344], [rx, 360]);
  }
  for (let ry = 24; ry < 192; ry += 32) {
    rivetPositions.push([248, ry], [264, ry]);
  }
  for (const [rx, ry] of rivetPositions) {
    hpb.fillStyle = '#555555';
    hpb.beginPath();
    hpb.arc(rx, ry, 2.1, 0, Math.PI * 2);
    hpb.fill();
    hpb.fillStyle = '#e5e5e5';
    hpb.beginPath();
    hpb.arc(rx - 0.5, ry - 0.5, 0.9, 0, Math.PI * 2);
    hpb.fill();
  }

  const hullPanelBump = register(new THREE.CanvasTexture(hpBumpCanvas), false);
  const hullPanelRoughness = register(new THREE.CanvasTexture(hpRoughCanvas), false);

  // 14. 2x2 Twill Carbon Fiber Weave (128x128)
  const cwCanvas = document.createElement('canvas');
  cwCanvas.width = 128;
  cwCanvas.height = 128;
  const cwc = cwCanvas.getContext('2d')!;
  const cwBumpCanvas = document.createElement('canvas');
  cwBumpCanvas.width = 128;
  cwBumpCanvas.height = 128;
  const cwbc = cwBumpCanvas.getContext('2d')!;

  const cellSz = 8;
  for (let gy = 0; gy < 128; gy += cellSz) {
    for (let gx = 0; gx < 128; gx += cellSz) {
      const ix = gx / cellSz;
      const iy = gy / cellSz;
      const phase = (ix + iy) % 4;
      const isWarp = phase < 2;
      if (isWarp) {
        const gradW = cwc.createLinearGradient(gx, gy, gx + cellSz, gy);
        gradW.addColorStop(0, '#0b101b');
        gradW.addColorStop(0.5, '#1e293b');
        gradW.addColorStop(1, '#0b101b');
        cwc.fillStyle = gradW;
        cwc.fillRect(gx, gy, cellSz, cellSz);

        const gradB = cwbc.createLinearGradient(gx, gy, gx + cellSz, gy);
        gradB.addColorStop(0, '#404040');
        gradB.addColorStop(0.5, '#dcdcdc');
        gradB.addColorStop(1, '#404040');
        cwbc.fillStyle = gradB;
        cwbc.fillRect(gx, gy, cellSz, cellSz);
      } else {
        const gradW = cwc.createLinearGradient(gx, gy, gx, gy + cellSz);
        gradW.addColorStop(0, '#090e17');
        gradW.addColorStop(0.5, '#162032');
        gradW.addColorStop(1, '#090e17');
        cwc.fillStyle = gradW;
        cwc.fillRect(gx, gy, cellSz, cellSz);

        const gradB = cwbc.createLinearGradient(gx, gy, gx, gy + cellSz);
        gradB.addColorStop(0, '#363636');
        gradB.addColorStop(0.5, '#b8b8b8');
        gradB.addColorStop(1, '#363636');
        cwbc.fillStyle = gradB;
        cwbc.fillRect(gx, gy, cellSz, cellSz);
      }
    }
  }
  const carbonWeaveAlbedo = register(new THREE.CanvasTexture(cwCanvas), true);
  const carbonWeaveBump = register(new THREE.CanvasTexture(cwBumpCanvas), false);

  // 15. Brushed Titanium Anisotropic Streak Bump (128x128)
  const tbCanvas = document.createElement('canvas');
  tbCanvas.width = 128;
  tbCanvas.height = 128;
  const tbc = tbCanvas.getContext('2d')!;
  tbc.fillStyle = '#808080';
  tbc.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y++) {
    const shade = 104 + ((y * 53 + (y % 5) * 19) % 52);
    tbc.fillStyle = `rgb(${shade},${shade},${shade})`;
    tbc.fillRect(0, y, 128, 1);
  }
  //Machined collar grooves
  tbc.fillStyle = '#383838';
  tbc.fillRect(0, 28, 128, 3);
  tbc.fillRect(0, 96, 128, 3);
  const titaniumBrushedBump = register(new THREE.CanvasTexture(tbCanvas), false);

  return {
    trackAlbedo,
    trackEmissive,
    trackRoughness,
    trackBump,
    startFinishAlbedo,
    boostPadTexture,
    floatPadTexture,
    cornerChevronTexture,
    gantryBannerTexture,
    gatePadTexture,
    approachRunwayTexture,
    buildingEmissive,
    groundGridTexture,
    oceanSurfaceTexture,
    lunarSurfaceTexture,
    skyCloudsTexture,
    contactShadow,
    particleGlow,
    hullPanelBump,
    hullPanelRoughness,
    carbonWeaveAlbedo,
    carbonWeaveBump,
    titaniumBrushedBump,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
