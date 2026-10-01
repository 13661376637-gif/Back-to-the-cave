const THREE = globalThis.THREE;

if (!THREE) throw new Error("Three.js failed to load.");

const canvas = document.querySelector("#space");
const stage = document.querySelector("#stage");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});

renderer.xr.enabled = true;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x01020a, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x01020a, 0.026);
const CAMERA_FOV = 52;
const CAMERA_Z = 8.15;
const CAMERA_LOOK_AT_Z = -8;
const XR_CAVE_OFFSET_Z = -4.2;
// 173 cm standing player: place the cave's visual centre at approximate eye height.
const XR_STANDING_USER_HEIGHT = 1.73;
const XR_STANDING_EYE_HEIGHT = 1.61;
const XR_UI_VERTICAL_OFFSET = -0.08;
const CAMERA_BOB = 0;
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 95);
camera.position.set(0, 0.12, CAMERA_Z);

const rig = new THREE.Group();
const tunnel = new THREE.Group();
const wallContent = new THREE.Group();
const wallMarquee = new THREE.Group();
const xrFrameCallbacks = new Set();
rig.add(tunnel);
tunnel.add(wallContent);
tunnel.add(wallMarquee);
scene.add(rig);

window.__caveVR = {
  renderer,
  scene,
  camera,
  stage,
  rig,
  xrComfort: {
    userHeight: XR_STANDING_USER_HEIGHT,
    eyeHeight: XR_STANDING_EYE_HEIGHT,
    uiVerticalOffset: XR_UI_VERTICAL_OFFSET,
  },
  frameCallbacks: xrFrameCallbacks,
  sphere: null,
  xrSessionActive: false,
  registerFrameCallback(callback) {
    xrFrameCallbacks.add(callback);
    return () => xrFrameCallbacks.delete(callback);
  },
  registerSphere(controller) {
    if (!controller?.world) return;
    this.sphere = controller;
  },
};

// The VR room is intentionally wider so the side walls read as a panoramic field of view.
const W = 12.8;
const H = 9.65;
const Z_NEAR = 6.4;
const Z_FAR_ORIGINAL = -12.8;
const GRID_X = 20;
const GRID_Y = 20;
const CENTER_WALL_FORWARD_CELLS = 5;
const GRID_Z_ORIGINAL = 20;
const GRID_Z = GRID_Z_ORIGINAL - CENTER_WALL_FORWARD_CELLS;
const Z_FAR = Z_NEAR - ((Z_NEAR - Z_FAR_ORIGINAL) / GRID_Z_ORIGINAL) * GRID_Z;
const wallMarqueeClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_FAR);
window.__caveVR.centerWallZ = Z_FAR;
const GRID_COLOR = 0x657089;
const TUNNEL_NEAR_COLOR = 0x080892;
const TUNNEL_FAR_COLOR = 0x01020a;
const TUNNEL_FULL_COLOR_Z = 0.8;
const CELL_X = W / GRID_X;
const CELL_Y = H / GRID_Y;
const CELL_Z = Math.abs(Z_NEAR - Z_FAR) / GRID_Z;
const CENTER_WALL_DEPTH_INDEX = GRID_Z - 1;
const CENTER_WALL_Z = Z_FAR;
window.__caveVR.roomSize = { width: W, height: H };
const SURFACE_OFFSET = 0.032;
const STEP_SECONDS = 0.16;
const CENTER_INSET_STEPS = 4;
const FIRST_GLYPH_SCALE = 1.16;
const FINAL_GLYPH_SCALE = FIRST_GLYPH_SCALE;
const FIRST_LEVEL_TEXT_FILL = 1.34;
const FINAL_LEVEL_TEXT_FILL = 1.02;
const FINAL_LEVEL_TEXT_Y_OFFSET = -0.1;
const COMPLETION_HOLD_MS = 260;
const FINAL_LEVEL_DELAY_MS = 900;
const WALL_MARQUEE_PERSON_COUNT = 8;
const WALL_MARQUEE_CARD_COUNT = WALL_MARQUEE_PERSON_COUNT * 2;
// Deliberately non-palindromic lanes: no adjacent duplicate and no mirrored left/right order.
const WALL_MARQUEE_PERSON_ORDER = [
  0, 3, 6, 1, 5, 2, 7, 4,
  6, 2, 4, 0, 7, 1, 5, 3,
];
const WALL_MARQUEE_SPEED = 1.8;
const WALL_MARQUEE_OPACITY = 1;
const WALL_MARQUEE_Y = 0;
const WALL_MARQUEE_CARD_SCALE = (H * 0.9) / 1.9;
const WALL_MARQUEE_CARD_HEIGHT = 1.9 * WALL_MARQUEE_CARD_SCALE;
const WALL_MARQUEE_CARD_WIDTH = (Z_NEAR - Z_FAR) / (WALL_MARQUEE_CARD_COUNT / 2) * 0.92 * WALL_MARQUEE_CARD_SCALE;
const WALL_MARQUEE_VISIBLE_TRACK_LENGTH = Z_NEAR - Z_FAR;
const WALL_MARQUEE_STEP = WALL_MARQUEE_CARD_WIDTH * 0.98;
const WALL_MARQUEE_TRACK_LENGTH = Math.max(
  WALL_MARQUEE_VISIBLE_TRACK_LENGTH,
  WALL_MARQUEE_STEP * (WALL_MARQUEE_CARD_COUNT / 2),
);
const WALL_MARQUEE_CYCLE_LENGTH = WALL_MARQUEE_TRACK_LENGTH * 2;
const WALL_MARQUEE_PERSON_ASSETS = Array.from({ length: WALL_MARQUEE_PERSON_COUNT }, (_, index) => {
  const id = String(index + 1).padStart(2, "0");
  return {
    base: `./assets/person-${id}-base.png`,
    reaction: `./assets/person-${id}-reaction.png`,
  };
});
let wallMarqueeTextures = [];
let wallMarqueeCards = [];

const LEVELS = [
  {
    id: "level-one",
    index: 1,
    scene: "transition",
    lines: [
      "Police report: The male individual did",
      "not carry any weapons into the station",
      "no prohibited items were found",
    ],
    layout: {
      gridX: 20,
      gridY: 20,
      startY: 9,
      glyphScale: FIRST_GLYPH_SCALE,
      lineGap: 1,
      unit: "word",
      figmaRows: {
        leftPx: 77,
        textWidthPx: 499,
        wordGapPx: 7,
        lineIndices: [12, 10, 8],
        rowCentersPx: [480.5, 519.5, 558.5],
        lineAnchorOffset: 0.22,
      },
    },
    masks: [
      { id: "first", spans: [{ line: 0, from: 0, to: 1 }], padX: 0.03, padY: 0.08 },
      { id: "not", spans: [{ line: 1, from: 0, to: 0 }, { line: 2, from: 0, to: 0 }], merge: true, padX: 0.03, padY: 0.1 },
      { id: "none", spans: [{ line: 1, from: 2, to: 2 }], padX: 0.04, padY: 0.08 },
    ],
    shadowMotion: {
      first: { targetAngle: 1.42, targetPitch: -0.16, yawScale: 1.08, pitchScale: 1.05 },
      not: { targetAngle: 1.42, targetPitch: -0.16, yawScale: 1.32, pitchScale: 1.2 },
      none: { targetAngle: 1.42, targetPitch: -0.16, yawScale: 1.18, pitchScale: 1.1 },
    },
  },
  {
    id: "final",
    index: 15,
    scene: "final-transition",
    lines: [
      "A visitor gets into an argument with",
      "staff in front of an interactive installation",
      "at a city art museum. The installation is",
      "already full; in a twenty-second video,",
      "staff block the entrance and ask the",
      "visitor to leave. The visitor had already",
      "been told to wait; he repeatedly asks,",
      "\"Why can't I go in?\" He then enters from",
      "the exit side; staff intervene again and",
      "their tone becomes noticeably",
      "impatient. Ten minutes later, he enters in",
      "turn and views the installation normally;",
      "nearby visitors stop to watch the",
      "dispute. The video is then reposted by",
      "multiple accounts, and the dispute",
      "continues into the next day. The filmer",
      "did not know what had happened",
    ],
    layout: {
      gridX: GRID_X,
      gridY: GRID_Y,
      startY: 1,
      glyphScale: FINAL_GLYPH_SCALE,
      lineGap: 1,
      wrapAt: 10,
      paragraphGap: 1,
      unit: "word",
      figmaRows: {
        leftPx: 47,
        textWidthPx: 560,
        flow: true,
        wordGapPx: 7,
        lineIndices: [19, 17.75, 16.5, 15.25, 14, 12.75, 11.5, 10.25, 9, 7.75, 6.5, 5.25, 4, 3],
        rowCentersPx: [202.5, 250.5, 299.5, 348, 397.5, 446, 494.5, 543, 591.5, 640, 688.5, 737, 785, 832],
        lineAnchorOffset: 0.22,
      },
    },
    masks: [
      { id: "final-rule", spans: [{ line: 1, from: 6, to: 6 }], padX: 0.04, padY: 0.08 },
      { id: "final-full", spans: [{ line: 3, from: 0, to: 1 }], padX: 0.04, padY: 0.08 },
      { id: "final-entry", spans: [{ line: 5, from: 3, to: 6 }], padX: 0.04, padY: 0.08 },
      { id: "final-return", spans: [{ line: 6, from: 0, to: 3 }], padX: 0.04, padY: 0.1 },
      { id: "final-media", spans: [{ line: 7, from: 5, to: 8 }], padX: 0.04, padY: 0.08 },
      { id: "final-edit-one-a", spans: [{ line: 8, from: 0, to: 2 }], padX: 0.04, padY: 0.08 },
      { id: "final-edit-one-b", spans: [{ line: 10, from: 1, to: 6 }], padX: 0.04, padY: 0.08 },
      { id: "final-edit-two", spans: [{ line: 11, from: 0, to: 5 }], padX: 0.04, padY: 0.08 },
      { id: "final-source", spans: [{ line: 16, from: 0, to: 5 }], padX: 0.04, padY: 0.1 },
      { id: "final-question", spans: [{ line: 15, from: 5, to: 6 }], padX: 0.04, padY: 0.08 },
      { id: "final-title", rectPx: { x: 562, y: 647, width: 25, height: 143 } },
      { id: "final-attitude", rectPx: { x: 560, y: 379, width: 25, height: 249 } },
    ],
    shadowMotion: {
      "final-rule": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.9, pitchScale: 0.82 },
      "final-full": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.86, pitchScale: 0.78 },
      "final-entry": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.82, pitchScale: 0.78 },
      "final-return": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.78, pitchScale: 0.76 },
      "final-media": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.74, pitchScale: 0.72 },
      "final-edit-one-a": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.72, pitchScale: 0.7 },
      "final-edit-one-b": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.72, pitchScale: 0.7 },
      "final-edit-two": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.72, pitchScale: 0.7 },
      "final-source": { targetAngle: 1.04, targetPitch: -0.28, yawScale: 0.7, pitchScale: 0.68 },
      "final-question": { targetAngle: 4.18, targetPitch: 0.14, yawScale: 0.9, pitchScale: 0.82 },
      "final-title": { targetAngle: 4.18, targetPitch: 0.14, yawScale: 0.86, pitchScale: 0.78 },
      "final-attitude": { targetAngle: 4.18, targetPitch: 0.14, yawScale: 0.82, pitchScale: 0.74 },
    },
  },
];

const textActors = [];
const wallShadows = new Map();
let activeLevel = LEVELS[0];
let mapRevealQueued = false;
let finalLevelQueued = false;
let globalStep = 0;
const SHADOW_OPACITY = 0.92;
const WALL_SHADOWS_ENABLED = false;
const CENTER_WALL_TEXT_ENABLED = false;

stage.dataset.scene = "transition";
stage.dataset.flow = "transition-plus-game-start";
stage.dataset.level = activeLevel.id;

function addLineSegments(name, points, color = GRID_COLOR, opacity = 0.62, order = 4) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = name;
  mesh.renderOrder = order;
  tunnel.add(mesh);
}

function pushSegment(points, a, b) {
  points.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
}

function gridValue(start, end, index, groups) {
  return THREE.MathUtils.lerp(start, end, index / groups);
}

function gridCellCenter(start, end, index, groups) {
  return gridValue(start, end, index + 0.5, groups);
}

function buildSurfaceGrid(step = 1) {
  const floor = [];
  const ceiling = [];
  const left = [];
  const right = [];
  for (let i = 0; i <= GRID_Y; i += step) {
    const y = gridValue(-H / 2, H / 2, i, GRID_Y);
    pushSegment(left, [-W / 2, y, Z_NEAR], [-W / 2, y, Z_FAR]);
    pushSegment(right, [W / 2, y, Z_NEAR], [W / 2, y, Z_FAR]);
  }
  for (let i = 0; i <= GRID_Z; i += step) {
    const z = gridValue(Z_NEAR, Z_FAR, i, GRID_Z);
    pushSegment(floor, [-W / 2, -H / 2, z], [W / 2, -H / 2, z]);
    pushSegment(ceiling, [-W / 2, H / 2, z], [W / 2, H / 2, z]);
  }
  addLineSegments("floor-grid", floor, GRID_COLOR, 0.56);
  addLineSegments("ceiling-grid", ceiling, GRID_COLOR, 0.5);
  addLineSegments("left-wall-grid", left, GRID_COLOR, 0.56);
  addLineSegments("right-wall-grid", right, GRID_COLOR, 0.56);
}

function buildBackWall(step = 1) {
  const points = [];
  for (let i = 0; i <= GRID_Y; i += step) {
    const y = gridValue(-H / 2, H / 2, i, GRID_Y);
    pushSegment(points, [-W / 2, y, Z_FAR], [W / 2, y, Z_FAR]);
  }
  addLineSegments("back-grid", points, GRID_COLOR, 0.54, 6);
}

function gridStepForLevel(level) {
  return level.id === "level-one" ? 2 : 1;
}

function removeGridLines() {
  const names = ["floor-grid", "ceiling-grid", "left-wall-grid", "right-wall-grid", "back-grid"];
  names.forEach((name) => {
    const mesh = tunnel.getObjectByName(name);
    if (mesh) {
      tunnel.remove(mesh);
      disposeObject(mesh);
    }
  });
}

function rebuildGridLines(level) {
  removeGridLines();
  const step = gridStepForLevel(level);
  buildSurfaceGrid(step);
  if (CENTER_WALL_TEXT_ENABLED) buildBackWall(step);
}

function buildTunnelEdges() {
  const points = [];
  const corners = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
  for (const [x, y] of corners) pushSegment(points, [x, y, Z_NEAR], [x, y, Z_FAR]);
  for (const z of [Z_NEAR, Z_FAR]) {
    pushSegment(points, [-W / 2, -H / 2, z], [W / 2, -H / 2, z]);
    pushSegment(points, [W / 2, -H / 2, z], [W / 2, H / 2, z]);
    pushSegment(points, [W / 2, H / 2, z], [-W / 2, H / 2, z]);
    pushSegment(points, [-W / 2, H / 2, z], [-W / 2, -H / 2, z]);
  }
  addLineSegments("tunnel-edges", points, 0x788198, 0.82, 8);
}

function buildTunnelGradientShell() {
  const inset = 0.055;
  const positions = [];
  const addQuad = (a, b, c, d) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  addQuad(
    [-W / 2, -H / 2 - inset, Z_NEAR],
    [W / 2, -H / 2 - inset, Z_NEAR],
    [W / 2, -H / 2 - inset, Z_FAR],
    [-W / 2, -H / 2 - inset, Z_FAR],
  );
  addQuad(
    [-W / 2, H / 2 + inset, Z_FAR],
    [W / 2, H / 2 + inset, Z_FAR],
    [W / 2, H / 2 + inset, Z_NEAR],
    [-W / 2, H / 2 + inset, Z_NEAR],
  );
  addQuad(
    [-W / 2 - inset, -H / 2, Z_FAR],
    [-W / 2 - inset, -H / 2, Z_NEAR],
    [-W / 2 - inset, H / 2, Z_NEAR],
    [-W / 2 - inset, H / 2, Z_FAR],
  );
  addQuad(
    [W / 2 + inset, -H / 2, Z_NEAR],
    [W / 2 + inset, -H / 2, Z_FAR],
    [W / 2 + inset, H / 2, Z_FAR],
    [W / 2 + inset, H / 2, Z_NEAR],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      nearColor: { value: new THREE.Color(TUNNEL_NEAR_COLOR) },
      farColor: { value: new THREE.Color(TUNNEL_FAR_COLOR) },
      nearZ: { value: TUNNEL_FULL_COLOR_Z },
      farZ: { value: Z_FAR },
    },
    vertexShader: `
      uniform float nearZ;
      uniform float farZ;
      varying float vNearMix;

      void main() {
        vNearMix = clamp((position.z - farZ) / max(0.001, nearZ - farZ), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec3 nearColor;
      uniform vec3 farColor;
      varying float vNearMix;

      void main() {
        float depthFade = pow(smoothstep(0.0, 1.0, vNearMix), 0.58);
        gl_FragColor = vec4(mix(farColor, nearColor, depthFade), 1.0);
      }
    `,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    toneMapped: false,
  });
  const shell = new THREE.Mesh(geometry, material);
  shell.name = "tunnel-depth-gradient";
  shell.renderOrder = 0;
  tunnel.add(shell);
}

// Four authored poses per person. Durations include anticipation, impact and recovery.
const WALL_MARQUEE_ACTIONS = [
  { name: "clap", seconds: [0.36, 0.18, 0.14, 0.26] },
  { name: "clap", seconds: [0.46, 0.22, 0.16, 0.30] },
  { name: "cheer", seconds: [0.60, 0.36, 0.75, 0.42] },
  { name: "fist-pump", seconds: [0.55, 0.30, 0.60, 0.36] },
  { name: "clap", seconds: [0.40, 0.20, 0.15, 0.30] },
  { name: "cheer", seconds: [0.55, 0.33, 0.68, 0.40] },
  { name: "clap", seconds: [0.52, 0.25, 0.18, 0.36] },
  { name: "wave", seconds: [0.52, 0.36, 0.52, 0.36] },
];

function createWallMarquee() {
  const loader = new THREE.TextureLoader();
  wallMarqueeTextures = WALL_MARQUEE_PERSON_ASSETS.map((asset, index) => {
    const id = String(index + 1).padStart(2, "0");
    const texture = loader.load(
      `./assets/actions/person-${id}-actions.png`,
      () => { texture.userData.ready = true; },
      undefined,
      () => {
        // A missing atlas falls back to the original portrait, not an empty wall.
        loader.load(asset.base, (fallback) => {
          texture.image = fallback.image;
          texture.userData.fallback = true;
          texture.userData.ready = true;
          texture.needsUpdate = true;
          fallback.dispose();
        }, undefined, error => console.warn("Wall portrait failed to load", error));
      },
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  wallMarqueeCards = Array.from({ length: WALL_MARQUEE_CARD_COUNT }, (_, index) => {
    const personIndex = WALL_MARQUEE_PERSON_ORDER[index];
    const source = wallMarqueeTextures[personIndex];
    // Texture clones share the image source but have independent frame UVs.
    const map = source.clone();
    const material = new THREE.MeshBasicMaterial({
      map, transparent: true, opacity: WALL_MARQUEE_OPACITY,
      clippingPlanes: [wallMarqueeClipPlane],
      depthTest: true, depthWrite: true, side: THREE.DoubleSide,
    });
    const action = new THREE.Mesh(geometry, material);
    action.name = `wall-marquee-card-${index + 1}-action`;
    action.renderOrder = 9;
    action.visible = false;
    const group = new THREE.Group();
    group.add(action);
    group.scale.set(WALL_MARQUEE_CARD_WIDTH, WALL_MARQUEE_CARD_HEIGHT, 1);
    wallMarquee.add(group);
    return { group, action, map, source, personIndex, phase: index * 0.13, frame: -1 };
  });
}

function updateWallMarqueeAction(card, elapsedSeconds) {
  if (!card.source.userData.ready) return;
  if (!card.action.visible) {
    card.map.needsUpdate = true;
    card.action.visible = true;
  }
  if (card.source.userData.fallback) return;
  const durations = WALL_MARQUEE_ACTIONS[card.personIndex].seconds;
  const cycle = durations.reduce((total, seconds) => total + seconds, 0);
  let time = (elapsedSeconds + card.phase * 7.3) % cycle;
  let frame = 0;
  while (frame < durations.length - 1 && time >= durations[frame]) {
    time -= durations[frame++];
  }
  if (card.frame === frame) return;
  card.frame = frame;
  // Inset the cell by two texels so filtering never samples the adjacent pose.
  const insetX = 2 / card.map.image.width;
  const insetY = 2 / card.map.image.height;
  card.map.repeat.set(0.5 - insetX * 2, 0.5 - insetY * 2);
  card.map.offset.set((frame % 2) * 0.5 + insetX, (frame < 2 ? 0.5 : 0) + insetY);
  // UV changes are uniforms only: no canvas copies or per-frame GPU uploads.
}

function smoothstep(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function updateWallMarquee(elapsedSeconds) {
  if (!wallMarqueeCards.length) return;

  const phase = (elapsedSeconds * WALL_MARQUEE_SPEED) % WALL_MARQUEE_CYCLE_LENGTH;
  wallMarqueeClipPlane.constant = -(Z_FAR + rig.position.z);
  wallMarqueeCards.forEach((card, index) => {
    updateWallMarqueeAction(card, elapsedSeconds);
    const distance = (phase + index * WALL_MARQUEE_STEP) % WALL_MARQUEE_CYCLE_LENGTH;
    if (distance < WALL_MARQUEE_TRACK_LENGTH) {
      card.group.visible = distance <= WALL_MARQUEE_VISIBLE_TRACK_LENGTH + WALL_MARQUEE_CARD_WIDTH / 2;
      card.group.position.set(-W / 2 + SURFACE_OFFSET * 1.6, WALL_MARQUEE_Y, Z_NEAR - distance);
      card.group.rotation.set(0, Math.PI / 2, 0);
    } else {
      const sideDistance = distance - WALL_MARQUEE_TRACK_LENGTH;
      card.group.visible = sideDistance <= WALL_MARQUEE_VISIBLE_TRACK_LENGTH + WALL_MARQUEE_CARD_WIDTH / 2;
      card.group.position.set(W / 2 - SURFACE_OFFSET * 1.6, WALL_MARQUEE_Y, Z_NEAR - sideDistance);
      card.group.rotation.set(0, -Math.PI / 2, 0);
    }
  });
}

function textUnitsForLine(level, line) {
  if (level.layout.unit === "word") return line.trim().split(/\s+/).filter(Boolean);
  return [...line];
}

const WORD_TEXTURE_FONT = '400 72px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const WORD_TEXTURE_HEIGHT = 128;
const WORD_TEXTURE_PAD_X = 24;
const WORD_BASELINE_RATIO = 0.72;
const FIGMA_FRAME_WIDTH = 654;
const wordAspectCache = new Map();
const wordLayoutCache = new WeakMap();

function measureWordAspect(text) {
  if (wordAspectCache.has(text)) return wordAspectCache.get(text);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  measureContext.font = WORD_TEXTURE_FONT;
  const width = Math.ceil(measureContext.measureText(text).width) + WORD_TEXTURE_PAD_X * 2;
  const aspect = width / WORD_TEXTURE_HEIGHT;
  wordAspectCache.set(text, aspect);
  return aspect;
}

function makeGlyphTexture(text) {
  const textureCanvas = document.createElement("canvas");
  const ctx = textureCanvas.getContext("2d");
  ctx.font = WORD_TEXTURE_FONT;
  textureCanvas.width = Math.ceil(ctx.measureText(text).width) + WORD_TEXTURE_PAD_X * 2;
  textureCanvas.height = WORD_TEXTURE_HEIGHT;
  ctx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  ctx.shadowColor = "rgba(255, 255, 255, 0.18)";
  ctx.shadowBlur = 2;
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  ctx.strokeStyle = "rgba(0, 3, 10, 0.84)";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = WORD_TEXTURE_FONT;
  ctx.lineWidth = 2;
  ctx.strokeText(text, textureCanvas.width / 2, textureCanvas.height * WORD_BASELINE_RATIO);
  ctx.fillText(text, textureCanvas.width / 2, textureCanvas.height * WORD_BASELINE_RATIO);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function wordDisplayHeight(level) {
  const cellY = H / level.layout.gridY;
  if (level.id === "level-one") return cellY * FIRST_LEVEL_TEXT_FILL;
  if (level.id === "final") return cellY * FINAL_LEVEL_TEXT_FILL;
  return level.layout.figmaRows ? cellY * 0.64 : cellY * 0.78;
}

function levelContentYOffset(level) {
  return level.id === "final" ? FINAL_LEVEL_TEXT_Y_OFFSET : 0;
}

function worldToGridIndex(level, axis, value) {
  const groups = axis === "x" ? level.layout.gridX : level.layout.gridY;
  const size = axis === "x" ? W : H;
  return ((value + size / 2) / size) * groups - 0.5;
}

function figmaXToWallWorld(px) {
  return -W / 2 + (px / FIGMA_FRAME_WIDTH) * W;
}

function figmaWidthToWallWorld(px) {
  return (px / FIGMA_FRAME_WIDTH) * W;
}

function wallHorizontalLineWorld(index) {
  return gridValue(-H / 2, H / 2, THREE.MathUtils.clamp(index, 0, GRID_Y), GRID_Y);
}

function figmaPxPerGridStep(figmaRows) {
  const centers = figmaRows?.rowCentersPx || [];
  const indices = figmaRows?.lineIndices || [];
  const samples = [];
  for (let i = 1; i < Math.min(centers.length, indices.length); i += 1) {
    const indexDelta = Math.abs(indices[i] - indices[i - 1]);
    if (indexDelta > 0) samples.push(Math.abs(centers[i] - centers[i - 1]) / indexDelta);
  }
  if (!samples.length) return 39.25;
  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
}

function figmaYToWallWorld(level, px) {
  const figmaRows = level.layout.figmaRows;
  const anchorPx = figmaRows?.rowCentersPx?.[0];
  const anchorIndex = figmaRows?.lineIndices?.[0];
  if (!Number.isFinite(anchorPx) || !Number.isFinite(anchorIndex)) return 0;
  const anchorOffset = wordDisplayHeight(level) * (figmaRows.lineAnchorOffset || 0);
  return wallHorizontalLineWorld(anchorIndex) + anchorOffset + levelContentYOffset(level)
    - ((px - anchorPx) / figmaPxPerGridStep(figmaRows)) * CELL_Y;
}

function figmaHeightToWallWorld(level, px) {
  return (px / figmaPxPerGridStep(level.layout.figmaRows)) * CELL_Y;
}

function snapToBackWallHorizontalLine(value) {
  const nearestLine = THREE.MathUtils.clamp(
    Math.round(((value + H / 2) / H) * GRID_Y),
    1,
    GRID_Y - 1,
  );
  return gridValue(-H / 2, H / 2, nearestLine, GRID_Y);
}

function buildFigmaRowTargetLayout(level, displayHeight) {
  const { figmaRows } = level.layout;
  const result = new Map();
  const maxRowWidth = figmaWidthToWallWorld(figmaRows.textWidthPx || 499);
  const wordGap = figmaWidthToWallWorld(figmaRows.wordGapPx || 7);
  const leftX = figmaXToWallWorld(figmaRows.leftPx || 87);

  const tokens = level.lines.flatMap((line, lineIndex) => textUnitsForLine(level, line).map((text, unitIndex) => ({
    key: `${lineIndex}:${unitIndex}`,
    text,
    width: measureWordAspect(text) * displayHeight,
  })));
  const rows = [];
  if (figmaRows.flow) {
    let row = [];
    let rowWidth = 0;
    tokens.forEach((token) => {
      const nextWidth = row.length ? rowWidth + wordGap + token.width : token.width;
      if (row.length && nextWidth > maxRowWidth) {
        rows.push(row);
        row = [];
        rowWidth = 0;
      }
      row.push(token);
      rowWidth = row.length > 1 ? rowWidth + wordGap + token.width : token.width;
    });
    if (row.length) rows.push(row);
  } else {
    level.lines.forEach((line, lineIndex) => {
      rows.push(textUnitsForLine(level, line).map((text, unitIndex) => ({
        key: `${lineIndex}:${unitIndex}`,
        text,
        width: measureWordAspect(text) * displayHeight,
      })));
    });
  }

  rows.forEach((row, rowIndex) => {
    const rawRowWidth = row.reduce((sum, token) => sum + token.width, 0)
      + Math.max(0, row.length - 1) * wordGap;
    const lineScale = rawRowWidth > maxRowWidth ? maxRowWidth / rawRowWidth : 1;
    const lineHeight = displayHeight * lineScale;
    const gap = wordGap * lineScale;
    const firstAnchor = figmaRows.lineIndices?.[0] ?? (level.layout.gridY - 1);
    const lastAnchor = figmaRows.lineIndices?.[figmaRows.lineIndices.length - 1] ?? 1;
    const anchorIndex = figmaRows.flow && rows.length > 1
      ? THREE.MathUtils.lerp(firstAnchor, lastAnchor, rowIndex / (rows.length - 1))
      : figmaRows.lineIndices?.[rowIndex] ?? (level.layout.gridY - 1 - rowIndex);
    const anchorLineY = wallHorizontalLineWorld(anchorIndex);
    const lineY = anchorLineY + lineHeight * (figmaRows.lineAnchorOffset || 0) + levelContentYOffset(level);
    let cursorX = leftX;

    row.forEach((token) => {
      const width = token.width * lineScale;
      result.set(token.key, {
        x: worldToGridIndex(level, "x", cursorX + width / 2),
        y: worldToGridIndex(level, "y", lineY),
        displayWidth: width,
        displayHeight: lineHeight,
      });
      cursorX += width + gap;
    });
  });

  return result;
}

function buildWordTargetLayout(level) {
  const cached = wordLayoutCache.get(level);
  if (cached) return cached;

  const result = new Map();
  const displayHeight = wordDisplayHeight(level);
  if (level.layout.figmaRows) {
    const figmaLayout = buildFigmaRowTargetLayout(level, displayHeight);
    wordLayoutCache.set(level, figmaLayout);
    return figmaLayout;
  }

  const maxRowWidth = W * (level.id === "level-one" ? 0.86 : 0.91);
  const wordGap = level.id === "level-one" ? W * 0.052 : W * 0.024;
  const rowGap = level.id === "level-one" ? displayHeight * 0.34 : H / level.layout.gridY - displayHeight;
  const blockGap = level.id === "level-one" ? displayHeight * 0.34 : H / level.layout.gridY;
  const groups = level.layout.paragraphs || level.lines.map((_, lineIndex) => [lineIndex]);
  const rows = [];

  groups.forEach((lineGroup, groupIndex) => {
    const tokens = [];
    lineGroup.forEach((lineIndex) => {
      textUnitsForLine(level, level.lines[lineIndex]).forEach((text, unitIndex) => {
        tokens.push({
          key: `${lineIndex}:${unitIndex}`,
          text,
          width: Math.min(maxRowWidth, measureWordAspect(text) * displayHeight),
        });
      });
    });

    let row = [];
    let rowWidth = 0;
    tokens.forEach((token) => {
      const nextWidth = row.length ? rowWidth + wordGap + token.width : token.width;
      if (row.length && nextWidth > maxRowWidth) {
        rows.push({ tokens: row, width: rowWidth, groupEnd: false });
        row = [];
        rowWidth = 0;
      }
      rowWidth = row.length ? rowWidth + wordGap + token.width : token.width;
      row.push(token);
    });
    if (row.length) rows.push({ tokens: row, width: rowWidth, groupEnd: groupIndex < groups.length - 1 });
  });

  const extraBlockGaps = rows.filter((row) => row.groupEnd).length;
  const totalHeight = rows.length * displayHeight
    + Math.max(0, rows.length - 1) * rowGap
    + extraBlockGaps * blockGap;
  const centerY = level.id === "level-one" ? H * 0.09 : 0;
  let rowCenterY = centerY + totalHeight / 2 - displayHeight / 2;

  rows.forEach((row) => {
    const lineY = snapToBackWallHorizontalLine(rowCenterY);
    let cursorX = -row.width / 2;
    row.tokens.forEach((token) => {
      const centerX = cursorX + token.width / 2;
      result.set(token.key, {
        x: worldToGridIndex(level, "x", centerX),
        y: worldToGridIndex(level, "y", lineY),
        displayWidth: token.width,
        displayHeight,
      });
      cursorX += token.width + wordGap;
    });
    rowCenterY -= displayHeight + rowGap + (row.groupEnd ? blockGap : 0);
  });

  wordLayoutCache.set(level, result);
  return result;
}

function clampGridIndex(value, max) {
  return THREE.MathUtils.clamp(Math.round(value), 0, max - 1);
}

function targetIndexForGlyph(level, lineIndex, charIndex, lineLength) {
  const { layout } = level;
  if (layout.unit === "word") {
    const target = buildWordTargetLayout(level).get(`${lineIndex}:${charIndex}`);
    if (target) return target;
  }
  const paragraphGroups = layout.paragraphs;

  if (paragraphGroups) {
    const wrapAt = layout.wrapAt || layout.gridX;
    const paragraphIndex = paragraphGroups.findIndex((group) => group.includes(lineIndex));
    const paragraph = paragraphIndex >= 0 ? paragraphGroups[paragraphIndex] : [lineIndex];
    let paragraphStartY = layout.startY;
    let charOffset = 0;

    for (let i = 0; i < paragraphIndex; i += 1) {
      const paragraphLength = paragraphGroups[i].reduce((sum, currentLine) => {
        return sum + textUnitsForLine(level, level.lines[currentLine]).length;
      }, 0);
      paragraphStartY += Math.ceil(paragraphLength / wrapAt) * layout.lineGap + (layout.paragraphGap || 0);
    }

    for (const currentLine of paragraph) {
      if (currentLine === lineIndex) break;
      charOffset += textUnitsForLine(level, level.lines[currentLine]).length;
    }

    const paragraphLength = paragraph.reduce((sum, currentLine) => {
      return sum + textUnitsForLine(level, level.lines[currentLine]).length;
    }, 0);
    const paragraphCharIndex = charOffset + charIndex;
    const wrapRow = Math.floor(paragraphCharIndex / wrapAt);
    const segmentStart = wrapRow * wrapAt;
    const segmentLength = Math.min(wrapAt, paragraphLength - segmentStart);
    const startX = (layout.gridX - segmentLength) / 2;

    return {
      x: clampGridIndex(startX + paragraphCharIndex - segmentStart, layout.gridX),
      y: clampGridIndex(paragraphStartY + wrapRow * layout.lineGap, layout.gridY),
    };
  }

  const wrapAt = layout.wrapAt || lineLength || 1;
  const wrapRow = Math.floor(charIndex / wrapAt);
  const segmentStart = wrapRow * wrapAt;
  const segmentLength = Math.min(wrapAt, lineLength - segmentStart);
  const startX = (layout.gridX - segmentLength) / 2;
  return {
    x: clampGridIndex(startX + charIndex - segmentStart, layout.gridX),
    y: clampGridIndex(layout.startY + lineIndex * layout.lineGap + wrapRow * layout.lineGap, layout.gridY),
  };
}

function gridCellCenterForLevel(level, axis, index) {
  const groups = axis === "x" ? level.layout.gridX : level.layout.gridY;
  const start = axis === "x" ? -W / 2 : -H / 2;
  const end = axis === "x" ? W / 2 : H / 2;
  return gridCellCenter(start, end, index, groups);
}

function surfaceFromIndex(index) {
  return ["left", "right"][index % 2];
}

function fitGlyphToSurface(actor, surface) {
  const mesh = actor.mesh;
  const glyphScale = actor.level.layout.glyphScale;
  const cellX = W / actor.level.layout.gridX;
  const cellY = H / actor.level.layout.gridY;
  const displayWidth = actor.displayWidth || cellX * glyphScale;
  const displayHeight = actor.displayHeight || cellY * glyphScale;
  if (surface === "floor") {
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.scale.set(displayWidth, CELL_Z * glyphScale, 1);
  } else if (surface === "ceiling") {
    mesh.rotation.set(Math.PI / 2, 0, 0);
    mesh.scale.set(displayWidth, CELL_Z * glyphScale, 1);
  } else if (surface === "left") {
    mesh.rotation.set(0, Math.PI / 2, 0);
    mesh.scale.set(Math.min(displayWidth, CELL_Z * 2.8), displayHeight, 1);
  } else if (surface === "right") {
    mesh.rotation.set(0, -Math.PI / 2, 0);
    mesh.scale.set(Math.min(displayWidth, CELL_Z * 2.8), displayHeight, 1);
  } else {
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(displayWidth, displayHeight, 1);
  }
}

function setCenterEntryIndices(actor) {
  if (actor.surface === "floor") {
    actor.centerXIndex = actor.target.x;
    actor.centerYIndex = 0;
  } else if (actor.surface === "ceiling") {
    actor.centerXIndex = actor.target.x;
    actor.centerYIndex = actor.level.layout.gridY - 1;
  } else if (actor.surface === "left") {
    actor.centerXIndex = 0;
    actor.centerYIndex = actor.target.y;
  } else {
    actor.centerXIndex = actor.level.layout.gridX - 1;
    actor.centerYIndex = actor.target.y;
  }
}

function chooseEntry(actor, index) {
  const target = actor.target;
  const surface = actor.surface;
  const stagger = Math.floor(index / 4);
  if (surface === "floor") return { crossIndex: target.x, depthIndex: Math.max(0, stagger % 3) };
  if (surface === "ceiling") return { crossIndex: target.x, depthIndex: Math.max(0, stagger % 3) };
  if (surface === "left") return { crossIndex: target.y, depthIndex: Math.max(0, stagger % 3) };
  return { crossIndex: target.y, depthIndex: Math.max(0, stagger % 3) };
}

function createGlyphMesh(char) {
  const material = new THREE.MeshBasicMaterial({
    map: makeGlyphTexture(char),
    transparent: true,
    opacity: 1,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 10;
  wallContent.add(mesh);
  return mesh;
}

function setActorPosition(actor) {
  if (actor.phase === "surround") {
    const z = gridCellCenter(Z_NEAR, Z_FAR, actor.depthIndex, GRID_Z);
    fitGlyphToSurface(actor, actor.surface);

    if (actor.surface === "floor") {
      actor.mesh.position.set(gridCellCenter(-W / 2, W / 2, actor.crossIndex, GRID_X), -H / 2 + SURFACE_OFFSET, z);
    } else if (actor.surface === "ceiling") {
      actor.mesh.position.set(gridCellCenter(-W / 2, W / 2, actor.crossIndex, GRID_X), H / 2 - SURFACE_OFFSET, z);
    } else if (actor.surface === "left") {
      actor.mesh.position.set(-W / 2 + SURFACE_OFFSET, gridCellCenter(-H / 2, H / 2, actor.crossIndex, GRID_Y), z);
    } else {
      actor.mesh.position.set(W / 2 - SURFACE_OFFSET, gridCellCenter(-H / 2, H / 2, actor.crossIndex, GRID_Y), z);
    }
    return;
  }

  fitGlyphToSurface(actor, "center");
  const settle = actor.phase === "stopped" ? 0 : Math.sin(actor.centerStepCount * 0.9) * 0.01;
  actor.mesh.position.set(
    gridCellCenterForLevel(actor.level, "x", actor.centerXIndex),
    gridCellCenterForLevel(actor.level, "y", actor.centerYIndex) + settle,
    CENTER_WALL_Z + SURFACE_OFFSET,
  );
}

function enterCenterWall(actor) {
  actor.phase = "center";
  actor.centerStepCount = 0;
  setCenterEntryIndices(actor);

  setActorPosition(actor);
}

function advanceActor(actor) {
  if (actor.phase === "waiting" || actor.phase === "stopped") return;

  if (actor.phase === "surround") {
    if (actor.depthIndex < CENTER_WALL_DEPTH_INDEX) {
      actor.depthIndex += 1;
      setActorPosition(actor);
    } else {
      enterCenterWall(actor);
    }
    return;
  }

  const dxDelta = actor.target.x - actor.centerXIndex;
  const dyDelta = actor.target.y - actor.centerYIndex;
  const dx = Math.abs(dxDelta) <= 1 ? dxDelta : Math.sign(dxDelta);
  const dy = Math.abs(dyDelta) <= 1 ? dyDelta : Math.sign(dyDelta);
  if (actor.centerStepCount < CENTER_INSET_STEPS || Math.abs(dxDelta) > 0.001 || Math.abs(dyDelta) > 0.001) {
    actor.centerXIndex += dx;
    actor.centerYIndex += dy;
    actor.centerStepCount += 1;
    setActorPosition(actor);
  }

  if (Math.abs(actor.centerXIndex - actor.target.x) <= 0.001 && Math.abs(actor.centerYIndex - actor.target.y) <= 0.001) {
    actor.phase = "stopped";
    setActorPosition(actor);
  }
}

function advanceTextActors(step) {
  for (const actor of textActors) {
    if (actor.level !== activeLevel) continue;
    if (actor.phase === "waiting" && step >= actor.startStep) {
      actor.phase = "surround";
      setActorPosition(actor);
    }
    advanceActor(actor);
  }
}

function clearWallContent() {
  while (wallContent.children.length) {
    const child = wallContent.children.pop();
    disposeObject(child);
  }
  textActors.length = 0;
  wallShadows.clear();
}

function disposeObject(object) {
  if (object.geometry && object.geometry !== shadowGeometry) object.geometry.dispose();
  if (object.material) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.map && material.map !== shadowTexture) material.map.dispose();
      material.dispose();
    });
  }
}

function addWallTextNodes(level) {
  let index = 0;
  level.lines.forEach((line, lineIndex) => {
    const units = textUnitsForLine(level, line);
    units.forEach((unit, unitIndex) => {
      const surface = surfaceFromIndex(index);
      const target = targetIndexForGlyph(level, lineIndex, unitIndex, units.length);
      const actor = {
        char: unit,
        level,
        surface,
        target,
        mesh: createGlyphMesh(unit),
        phase: "waiting",
        startStep: Math.floor(index * 0.22),
        centerStepCount: 0,
        centerXIndex: target.x,
        centerYIndex: target.y,
        displayWidth: target.displayWidth || wordDisplayWidth(unit, level),
        displayHeight: target.displayHeight || wordDisplayHeight(level),
      };
      actor.mesh.name = `${level.id}-word-${lineIndex + 1}-${unitIndex + 1}`;
      actor.mesh.visible = false;
      Object.assign(actor, chooseEntry(actor, index));
      textActors.push(actor);
      index += 1;
    });
  });
}

function wordDisplayWidth(unit, level) {
  return Math.min(W * 0.86, measureWordAspect(unit) * wordDisplayHeight(level));
}

function buildReadableTextRows(level) {
  const rows = new Map();
  level.lines.forEach((line, lineIndex) => {
    const units = textUnitsForLine(level, line);
    units.forEach((unit, unitIndex) => {
      const target = targetIndexForGlyph(level, lineIndex, unitIndex, units.length);
      const row = rows.get(target.y) || { y: target.y, words: [] };
      row.words.push({ text: unit, x: target.x });
      rows.set(target.y, row);
    });
  });

  return [...rows.values()]
    .sort((a, b) => a.y - b.y)
    .map((row) => {
      row.words.sort((a, b) => a.x - b.x);
      const minX = Math.min(...row.words.map((word) => word.x));
      const maxX = Math.max(...row.words.map((word) => word.x));
      return {
        y: row.y,
        centerX: (minX + maxX) / 2,
        widthCells: maxX - minX + 1,
        displayWidth: Math.min(W * 1.04, Math.max((maxX - minX + 1) * CELL_X * 1.52, W * 0.92)),
        text: row.words.map((word) => word.text).join(" "),
      };
    });
}

function revealMapControls() {
  if (
    mapRevealQueued ||
    textActors.length === 0 ||
    !textActors.every((actor) => actor.level !== activeLevel || actor.phase === "stopped")
  ) return;

  mapRevealQueued = true;
  window.setTimeout(() => {
    stage.dataset.scene = "map";
    stage.classList.add("is-map-ready");
    window.dispatchEvent(new CustomEvent("cave-map-ready", { detail: { levelId: activeLevel.id } }));
  }, COMPLETION_HOLD_MS);
}

function makeShadowTexture() {
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 512;
  shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext("2d");
  ctx.shadowColor = "rgba(0,0,0,1)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(4, 4, 504, 248);
  const texture = new THREE.CanvasTexture(shadowCanvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const shadowTexture = makeShadowTexture();
const shadowMaterial = new THREE.MeshBasicMaterial({
  map: shadowTexture,
  color: 0x000000,
  transparent: true,
  opacity: 1,
  depthWrite: false,
});
const shadowGeometry = new THREE.PlaneGeometry(1, 1);

function addWallShadow(level, id, x, y, width, height, motionId = id) {
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial.clone());
  shadow.name = `${level.id}-center-wall-shadow-${id}`;
  shadow.position.set(x, y, Z_FAR + 0.085);
  shadow.scale.set(width, height, 1);
  shadow.material.opacity = SHADOW_OPACITY;
  shadow.visible = false;
  shadow.renderOrder = 12;
  wallContent.add(shadow);
  wallShadows.set(id, { mesh: shadow, home: new THREE.Vector2(x, y), width, height, motionId, seed: seededString(motionId) });
}

function maskLineY(level, lineIndex) {
  const figmaIndex = level.layout.figmaRows?.lineIndices?.[lineIndex];
  if (Number.isFinite(figmaIndex)) return wallHorizontalLineWorld(figmaIndex) + levelContentYOffset(level);
  return gridCellCenterForLevel(level, "y", targetIndexForGlyph(level, lineIndex, 0, 1).y);
}

function transformFigmaRectForLevel(level, rect) {
  const figmaRows = level.layout.figmaRows;
  if (!figmaRows?.flow) return rect;

  const sourceLeft = 88;
  const sourceWidth = 499;
  const widthScale = (figmaRows.textWidthPx || sourceWidth) / sourceWidth;
  const sourceHeight = (H / level.layout.gridY) * 0.64;
  const heightScale = wordDisplayHeight(level) / sourceHeight;
  const targetLeft = figmaRows.leftPx || 87;
  const targetHeight = rect.height * heightScale;

  return {
    ...rect,
    x: targetLeft + (rect.x - sourceLeft) * widthScale,
    y: rect.y - (targetHeight - rect.height) / 2,
    width: rect.width * widthScale,
    height: targetHeight,
  };
}

function addFigmaRectMask(level, mask) {
  const rect = transformFigmaRectForLevel(level, mask.rectPx);
  const displayHeight = wordDisplayHeight(level);
  const width = figmaWidthToWallWorld(rect.width);
  const x = figmaXToWallWorld(rect.x + rect.width / 2);
  let y = Number.isFinite(rect.y)
    ? figmaYToWallWorld(level, rect.y + rect.height / 2)
    : maskLineY(level, mask.line || 0);
  let height = Number.isFinite(rect.height)
    ? figmaHeightToWallWorld(level, rect.height)
    : displayHeight * (mask.heightRows || 1);

  if (mask.lineRange) {
    const [fromLine, toLine] = mask.lineRange;
    const fromY = maskLineY(level, fromLine);
    const toY = maskLineY(level, toLine);
    y = (fromY + toY) / 2;
    height = Math.abs(fromY - toY) + displayHeight * (mask.capRows || 1);
  }

  addWallShadow(level, mask.id, x, y, width, height, mask.motionId || mask.id);
}

function addSpanMask(level, mask) {
  const segments = [];
  const defaultPadX = CELL_X * 0.06;
  const defaultPadY = wordDisplayHeight(level) * 0.08;
  const padX = Number.isFinite(mask.padX) ? mask.padX : defaultPadX;
  const padY = Number.isFinite(mask.padY) ? mask.padY : defaultPadY;

  mask.spans.forEach((span) => {
    const units = textUnitsForLine(level, level.lines[span.line] || "");
    if (!units.length) return;
    const from = THREE.MathUtils.clamp(span.from, 0, units.length - 1);
    const to = THREE.MathUtils.clamp(span.to, from, units.length - 1);
    let leftWorld = Infinity;
    let rightWorld = -Infinity;
    let y = 0;
    let height = 0;

    for (let unitIndex = from; unitIndex <= to; unitIndex += 1) {
      const target = targetIndexForGlyph(level, span.line, unitIndex, units.length);
      const centerX = gridCellCenterForLevel(level, "x", target.x);
      const halfWidth = (target.displayWidth || CELL_X) / 2;
      leftWorld = Math.min(leftWorld, centerX - halfWidth);
      rightWorld = Math.max(rightWorld, centerX + halfWidth);
      y = gridCellCenterForLevel(level, "y", target.y);
      height = Math.max(height, target.displayHeight || wordDisplayHeight(level));
    }

    segments.push({
      leftWorld: leftWorld - padX,
      rightWorld: rightWorld + padX,
      topWorld: y + height / 2 + padY,
      bottomWorld: y - height / 2 - padY,
    });
  });

  if (!segments.length) return;

  if (mask.merge) {
    const leftWorld = Math.min(...segments.map((segment) => segment.leftWorld));
    const rightWorld = Math.max(...segments.map((segment) => segment.rightWorld));
    const topWorld = Math.max(...segments.map((segment) => segment.topWorld));
    const bottomWorld = Math.min(...segments.map((segment) => segment.bottomWorld));
    addWallShadow(
      level,
      mask.id,
      (leftWorld + rightWorld) / 2,
      (topWorld + bottomWorld) / 2,
      rightWorld - leftWorld,
      topWorld - bottomWorld,
      mask.motionId || mask.id,
    );
    return;
  }

  segments.forEach((segment, index) => {
    const id = segments.length === 1 ? mask.id : `${mask.id}-${index + 1}`;
    addWallShadow(
      level,
      id,
      (segment.leftWorld + segment.rightWorld) / 2,
      (segment.topWorld + segment.bottomWorld) / 2,
      segment.rightWorld - segment.leftWorld,
      segment.topWorld - segment.bottomWorld,
      mask.motionId || mask.id,
    );
  });
}

function addTextMask(level, mask) {
  if (mask.spans) {
    addSpanMask(level, mask);
    return;
  }

  if (mask.rectPx) {
    addFigmaRectMask(level, mask);
    return;
  }

  const line = textUnitsForLine(level, level.lines[mask.line]);
  const cellX = W / level.layout.gridX;
  const cellY = H / level.layout.gridY;
  const segments = new Map();
  const from = THREE.MathUtils.clamp(mask.from, 0, line.length - 1);
  const to = THREE.MathUtils.clamp(mask.to, from, line.length - 1);

  for (let unitIndex = from; unitIndex <= to; unitIndex += 1) {
    const target = targetIndexForGlyph(level, mask.line, unitIndex, line.length);
    const centerX = gridCellCenterForLevel(level, "x", target.x);
    const halfWidth = (target.displayWidth || cellX) / 2;
    const segment = segments.get(target.y) || {
      y: target.y,
      leftWorld: centerX - halfWidth,
      rightWorld: centerX + halfWidth,
      height: target.displayHeight || cellY,
    };
    segment.leftWorld = Math.min(segment.leftWorld, centerX - halfWidth);
    segment.rightWorld = Math.max(segment.rightWorld, centerX + halfWidth);
    segment.height = Math.max(segment.height, target.displayHeight || cellY);
    segments.set(target.y, segment);
  }

  [...segments.values()].forEach((segment, index) => {
    const y = gridCellCenterForLevel(level, "y", segment.y);
    const width = segment.rightWorld - segment.leftWorld;
    const id = segments.size === 1 ? mask.id : `${mask.id}-${index + 1}`;
    addWallShadow(level, id, (segment.leftWorld + segment.rightWorld) / 2, y, width, segment.height * 1.04, mask.id);
  });
}

function addWallShadows(level) {
  if (!WALL_SHADOWS_ENABLED) return;
  level.masks.forEach((mask) => addTextMask(level, mask));
}

window.addEventListener("cave-shadow-state", (event) => {
  if (!WALL_SHADOWS_ENABLED) return;
  const { rotation = { x: 0, y: 0 }, levelId = activeLevel.id } = event.detail || {};
  if (levelId !== activeLevel.id) return;
  for (const [key, data] of wallShadows) {
    const motion = activeLevel.shadowMotion[data.motionId];
    if (!motion) continue;
    const pathOffset = shadowPathOffset(data, motion, rotation);
    data.mesh.position.x = THREE.MathUtils.clamp(data.home.x + pathOffset.x, -W / 2 + data.width / 2, W / 2 - data.width / 2);
    data.mesh.position.y = THREE.MathUtils.clamp(data.home.y + pathOffset.y, -H / 2 + data.height / 2, H / 2 - data.height / 2);
    data.mesh.scale.set(data.width, data.height, 1);
    data.mesh.material.opacity = SHADOW_OPACITY;
    data.mesh.visible = true;
  }
});

function shadowPathOffset(data, motion, rotation) {
  const targetRotation = { x: motion.targetPitch, y: motion.targetAngle };
  const currentWave = shadowWave(data.seed, rotation);
  const targetWave = shadowWave(data.seed, targetRotation);
  const yawOffset = signedAngleDelta(rotation.y, motion.targetAngle);
  const pitchOffset = rotation.x - motion.targetPitch;

  return {
    x: yawOffset * motion.yawScale + currentWave.x - targetWave.x,
    y: -pitchOffset * motion.pitchScale + currentWave.y - targetWave.y,
  };
}

function shadowWave(seed, rotation) {
  return {
    x: Math.sin(rotation.y * (1.15 + seed * 0.9) + seed * 11.7) * 0.2
      + Math.sin(rotation.x * (2.35 + seed) + seed * 5.1) * 0.08,
    y: Math.cos(rotation.y * (0.95 + seed * 0.7) + seed * 8.3) * 0.14
      + Math.sin(rotation.x * (1.7 + seed * 0.8) + seed * 13.9) * 0.1,
  };
}

function seededString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

window.addEventListener("level-one-success", () => {
  if (finalLevelQueued) return;
  finalLevelQueued = true;
  window.setTimeout(() => startLevel(LEVELS[1]), FINAL_LEVEL_DELAY_MS);
});

function signedAngleDelta(value, target) {
  const fullTurn = Math.PI * 2;
  let delta = (value - target) % fullTurn;
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  return delta;
}

function startLevel(level) {
  activeLevel = level;
  globalStep = 0;
  mapRevealQueued = false;
  stage.dataset.level = level.id;
  stage.dataset.scene = level.scene;
  stage.dataset.gameState = "transition";
  stage.dataset.result = "";
  stage.classList.remove("is-map-ready", "is-success");
  window.dispatchEvent(new CustomEvent("cave-level-change", { detail: { level } }));
  rebuildGridLines(level);
  clearWallContent();
  if (CENTER_WALL_TEXT_ENABLED) addWallTextNodes(level);
  addWallShadows(level);
}

buildTunnelGradientShell();
buildTunnelEdges();
createWallMarquee();

const blue = new THREE.PointLight(0x254dff, 6.5, 42);
blue.position.set(0, 0.4, -1.5);
scene.add(blue);
const magenta = new THREE.PointLight(0xff168f, 4, 32);
magenta.position.set(2.8, 1.2, -8);
scene.add(magenta);
const cyan = new THREE.PointLight(0x08f6ff, 2.8, 26);
cyan.position.set(-2.6, -0.6, -11.5);
scene.add(cyan);

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = CAMERA_FOV;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

startLevel(activeLevel);

const clock = new THREE.Clock();
let previousStep = 0;

function animate(_time, xrFrame) {
  const t = clock.getElapsedTime();
  const currentStep = Math.floor(t / STEP_SECONDS);
  if (currentStep > previousStep) {
    for (let i = previousStep; i < currentStep; i += 1) {
      advanceTextActors(globalStep);
      globalStep += 1;
    }
    previousStep = currentStep;
  }

  for (const actor of textActors) {
    actor.mesh.visible = actor.phase !== "waiting";
    if (actor.phase === "stopped") actor.mesh.material.opacity = THREE.MathUtils.lerp(actor.mesh.material.opacity, 0.98, 0.08);
  }

  revealMapControls();
  updateWallMarquee(t);
  xrFrameCallbacks.forEach((callback) => callback(t, xrFrame));

  rig.rotation.set(0, 0, 0);
  const xrActive = renderer.xr.isPresenting || window.__caveVR.xrSessionActive;
  rig.position.y = xrActive ? XR_STANDING_EYE_HEIGHT : 0;
  rig.position.z = xrActive ? XR_CAVE_OFFSET_Z : 0;
  if (!xrActive) {
    camera.position.z = CAMERA_Z + Math.sin(t * 0.28) * CAMERA_BOB;
    camera.lookAt(0, -0.04, CAMERA_LOOK_AT_Z);
  }
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
