(() => {
  const mounts = document.querySelectorAll("[data-geodesic-sphere]");
  if (!mounts.length || !window.THREE) return;

  mounts.forEach((mount) => initSphereNode(mount));

  function initSphereNode(mount) {
    const canvas = mount.querySelector("[data-sphere-canvas]");
    if (!canvas) return;
    const stage = document.querySelector("#stage");
    const trackballMode = stage?.dataset.inputMode === "trackball";
    if (trackballMode) canvas.dataset.inputMode = "trackball";

    const {
      ACESFilmicToneMapping,
      AmbientLight,
      BufferAttribute,
      BufferGeometry,
      CanvasTexture,
      CylinderGeometry,
      DirectionalLight,
      DoubleSide,
      EquirectangularReflectionMapping,
      Group,
      HemisphereLight,
      IcosahedronGeometry,
      Matrix4,
      Mesh,
      MeshBasicMaterial,
      MeshPhysicalMaterial,
      MeshStandardMaterial,
      PCFSoftShadowMap,
      PerspectiveCamera,
      PlaneGeometry,
      PointLight,
      Quaternion,
      Scene,
      ShadowMaterial,
      SphereGeometry,
      SRGBColorSpace,
      TorusGeometry,
      Vector3,
      WebGLRenderer,
    } = THREE;

    const scene = new Scene();
    const camera = new PerspectiveCamera(37, 1, 0.1, 100);
    camera.position.set(0, 0.16, 9.2);
    scene.add(camera);

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;

    const environmentMap = makeStudioEnvironmentMap();
    scene.environment = environmentMap;

    const world = new Group();
    const sphere = new Group();
    const yAxis = new Vector3(0, 1, 0);
    const radius = 2.05;
    const strutRadius = 0.027;
    const nodeRadius = 0.082;
    const keycapScale = 0.68;
    const labelPlaneGeometry = new PlaneGeometry(1, 1);
    const keycapGeometryCache = new Map();
    const labelTextureCache = new Map();
    const materialCache = new Map();

    sphere.rotation.set(-0.12, 0.36, 0.08);
    world.add(sphere);
    scene.add(world);

    const strutMaterial = new MeshStandardMaterial({
      color: 0x1c2b3d,
      roughness: 0.31,
      metalness: 0.92,
    });
    const nodeMaterial = new MeshStandardMaterial({
      color: 0x263a50,
      roughness: 0.25,
      metalness: 0.94,
    });
    const panelMaterial = new MeshStandardMaterial({
      color: 0x172535,
      roughness: 0.62,
      metalness: 0.38,
      side: DoubleSide,
    });
    const innerPanelMaterial = new MeshStandardMaterial({
      color: 0x09121f,
      roughness: 0.76,
      metalness: 0.22,
      side: DoubleSide,
    });
    const railMaterial = new MeshStandardMaterial({
      color: 0x0a35ff,
      roughness: 0.2,
      metalness: 0.48,
      emissive: 0x082bff,
      emissiveIntensity: 0.18,
    });
    const keycapStyles = [
      { name: "ref_black_code", body: 0xb8b7b0, text: "#171717", glow: 0xd8d6cf, label: "</>", pattern: "slash", patternInk: "rgba(0,0,0,0.58)" },
      { name: "ref_white_bracket", body: 0xe2dfd6, text: "#202020", glow: 0xf2f0e8, label: "<>", pattern: "dot", patternInk: "rgba(0,0,0,0.48)" },
      { name: "ref_blue_css", body: 0xc8c8c2, text: "#1d1d1d", glow: 0xe4e3dc, label: "CSS", pattern: "step" },
      { name: "ref_black_quote", body: 0xa7a7a1, text: "#111111", glow: 0xc9c7bf, label: "\"", pattern: "burst", patternInk: "rgba(0,0,0,0.52)" },
      { name: "ref_clear_at", body: 0xdadbd6, text: "#222222", glow: 0xf0f0eb, label: "@", pattern: "planet", patternInk: "rgba(0,0,0,0.5)" },
      { name: "ref_lime_ok", body: 0xd2d0c8, text: "#161616", glow: 0xe8e5dc, label: "OK", pattern: "face" },
      { name: "ref_white_html", body: 0xe8e5dc, text: "#202020", glow: 0xf6f3ea, label: "HTML", pattern: "block" },
      { name: "ref_black_js", body: 0xb0afa9, text: "#151515", glow: 0xceccc4, label: "JS", pattern: "dot", patternInk: "rgba(0,0,0,0.55)" },
      { name: "ref_ice_cube", body: 0xd6d7d2, text: "#222222", glow: 0xeeeeea, label: "◇", pattern: "block", patternInk: "rgba(0,0,0,0.5)" },
      { name: "ref_white_slash", body: 0xe0ddd4, text: "#181818", glow: 0xf2efe6, label: "/", pattern: "slash", patternInk: "rgba(0,0,0,0.55)" },
      { name: "ref_black_hash", body: 0x9d9c96, text: "#111111", glow: 0xbdbbb3, label: "#", pattern: "block", patternInk: "rgba(0,0,0,0.5)" },
      { name: "ref_deep_blue", body: 0xc1c2bd, text: "#181818", glow: 0xdeddd6, label: "{ }", pattern: "step" },
    ];
    const sphereLongKeyStyles = [
      { name: "sphere_space", body: 0xdfddd5, text: "#1d1d1d", glow: 0xf4f1e8, label: "SPACE", pattern: "slash", patternInk: "rgba(0,0,0,0.46)" },
      { name: "sphere_shift", body: 0xc4c3bd, text: "#151515", glow: 0xdfddd5, label: "SHIFT", pattern: "step", patternInk: "rgba(0,0,0,0.5)" },
      { name: "sphere_tab", body: 0xd6d4cc, text: "#171717", glow: 0xedeae1, label: "TAB", pattern: "dot", patternInk: "rgba(0,0,0,0.48)" },
      { name: "sphere_enter", body: 0xe6e3da, text: "#202020", glow: 0xf7f3ea, label: "ENTER", pattern: "block", patternInk: "rgba(0,0,0,0.42)" },
      { name: "sphere_caps", body: 0xb3b2ac, text: "#111111", glow: 0xd1cfc8, label: "CAPS", pattern: "burst", patternInk: "rgba(0,0,0,0.52)" },
    ];

    const controllerShape = buildKeycapSphere();
    controllerShape.scale.setScalar(1.32);
    sphere.add(controllerShape);
    const pressKeycaps = collectPressKeycaps(controllerShape);

    const shadow = new Mesh(
      new PlaneGeometry(7.4, 3.2),
      new ShadowMaterial({ color: 0x1c1c1c, opacity: 0.19 }),
    );
    shadow.position.set(0, -2.48, 0.05);
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    world.add(shadow);

    scene.add(new AmbientLight(0xffffff, 0.24));
    scene.add(new HemisphereLight(0xf2f4ff, 0x5f5750, 1.15));

    const keyLight = new PointLight(0xffb35d, 20, 10.5, 1.9);
    keyLight.position.set(-2.7, 1.7, 3.1);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.00008;
    camera.add(keyLight);

    const warmFront = new DirectionalLight(0xffb66d, 4.7);
    warmFront.position.set(-2.6, 2.4, 4.4);
    camera.add(warmFront);

    const fillLight = new PointLight(0xd9e9ff, 1.7, 12, 2.3);
    fillLight.position.set(2.2, 2.1, 2.8);
    camera.add(fillLight);
    const xrLights = [keyLight, warmFront, fillLight];

    let targetRotationX = -0.12;
    let targetRotationY = 0.36;
    let spinVelocityX = 0;
    let spinVelocityY = 0;
    let dragging = false;
    let pointerId = null;
    let lastPointer = { x: 0, y: 0 };
    let pointerInsideCanvas = false;
    let trackballLocked = false;
    let previousTime = performance.now();
    let interactionEnabled = true;
    let lastKeypressTrigger = 0;

    function applyXRLayout(levelId = stage?.dataset.level) {
      const finalLevel = levelId === "final";
      world.position.set(0, finalLevel ? -0.48 : 0.2, finalLevel ? -3.9 : -3.3);
      world.scale.setScalar(finalLevel ? 0.11 : 0.14);
    }

    const sphereControllerBridge = {
      world,
      sphere,
      enterXR() {
        const xr = window.__caveVR;
        if (!xr?.scene) return;
        xrLights.forEach((light) => world.add(light));
        xr.scene.add(world);
        world.visible = true;
        // Keep the VR control within comfortable hand reach instead of using the desktop floor layout.
        applyXRLayout();
      },
      exitXR() {
        const xr = window.__caveVR;
        if (xr?.scene) xr.scene.remove(world);
        scene.add(world);
        xrLights.forEach((light) => camera.add(light));
        world.visible = true;
        resize();
      },
      setRotation(x, y) {
        targetRotationX = clamp(x, -0.95, 0.95);
        targetRotationY = y;
        spinVelocityX = 0;
        spinVelocityY = 0;
        // Window animation frames can pause during immersive WebXR. Apply the
        // controller result immediately so the sphere still tracks the stick.
        sphere.rotation.x = targetRotationX;
        sphere.rotation.y = targetRotationY;
        dispatchRotation();
      },
      nudgeRotation(x, y) {
        sphereControllerBridge.setRotation(targetRotationX + x, targetRotationY + y);
      },
    };
    window.__caveVR?.registerSphere(sphereControllerBridge);

    window.addEventListener("cave-level-change", (event) => {
      const xr = window.__caveVR;
      if (!xr?.xrSessionActive && !xr?.renderer?.xr?.isPresenting) return;
      applyXRLayout(event.detail?.level?.id);
    });

    canvas.addEventListener("pointerdown", (event) => {
      if (!interactionEnabled) return;
      dragging = !trackballMode;
      pointerId = trackballMode ? null : event.pointerId;
      lastPointer = { x: event.clientX, y: event.clientY };
      spinVelocityX = 0;
      spinVelocityY = 0;
      triggerControllerKeypress(performance.now(), 1.25);
      if (!trackballMode) {
        canvas.setPointerCapture(pointerId);
      } else {
        try {
          const request = canvas.requestPointerLock?.();
          request?.catch?.(() => {});
        } catch {
          // Browsers can reject pointer lock outside a user gesture.
        }
      }
    });

    canvas.addEventListener("pointerenter", (event) => {
      pointerInsideCanvas = true;
      lastPointer = { x: event.clientX, y: event.clientY };
    });

    canvas.addEventListener("pointerleave", () => {
      pointerInsideCanvas = false;
    });

    document.addEventListener("pointerlockchange", () => {
      trackballLocked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!interactionEnabled) return;
      if (!trackballMode && (!dragging || event.pointerId !== pointerId)) return;
      if (trackballMode && !pointerInsideCanvas && !trackballLocked) return;
      const screenDx = event.clientX - lastPointer.x;
      const screenDy = event.clientY - lastPointer.y;
      const dx = trackballMode && (event.movementX || event.movementY) ? event.movementX : screenDx;
      const dy = trackballMode && (event.movementX || event.movementY) ? event.movementY : screenDy;
      lastPointer = { x: event.clientX, y: event.clientY };
      targetRotationY += dx * 0.008;
      targetRotationX = clamp(targetRotationX + dy * 0.006, -0.95, 0.95);
      spinVelocityY = dx * 0.028;
      spinVelocityX = dy * 0.018;
      const motion = Math.hypot(dx, dy);
      if (motion > 0.8) triggerControllerKeypress(performance.now(), Math.min(1.5, 0.7 + motion * 0.035));
      dispatchRotation();
    });

    canvas.addEventListener("wheel", (event) => {
      if (!trackballMode || !interactionEnabled) return;
      event.preventDefault();
      targetRotationY += event.deltaY * 0.002;
      targetRotationX = clamp(targetRotationX + event.deltaX * 0.001, -0.95, 0.95);
      triggerControllerKeypress(performance.now(), 0.9);
      dispatchRotation();
    }, { passive: false });

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    mount.addEventListener("sphere-lock", () => {
      interactionEnabled = false;
      dragging = false;
      spinVelocityX = 0;
      spinVelocityY = 0;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    });

    mount.addEventListener("sphere-reset", () => {
      interactionEnabled = true;
      dragging = false;
      pointerInsideCanvas = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      targetRotationX = -0.12;
      targetRotationY = 0.36;
      spinVelocityX = 0;
      spinVelocityY = 0;
      sphere.rotation.set(targetRotationX, targetRotationY, 0.08);
      pressKeycaps.forEach((key) => {
        const data = key.userData.press;
        if (!data) return;
        data.press = 0;
        data.targetPress = 0;
        key.position.copy(data.basePosition);
        key.scale.z = 1;
      });
      dispatchRotation();
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    requestAnimationFrame(animate);

    function buildGeodesicData(sphereRadius, detail) {
      const base = new IcosahedronGeometry(sphereRadius, detail);
      const geometry = base.index ? base.toNonIndexed() : base;
      const position = geometry.attributes.position;
      const vertices = [];
      const vertexMap = new Map();
      const edgeMap = new Map();
      const faces = [];

      for (let i = 0; i < position.count; i += 3) {
        const ids = [];

        for (let j = 0; j < 3; j += 1) {
          const point = new Vector3().fromBufferAttribute(position, i + j).normalize().multiplyScalar(sphereRadius);
          const key = point.toArray().map((value) => value.toFixed(4)).join("|");
          if (!vertexMap.has(key)) {
            vertexMap.set(key, vertices.length);
            vertices.push(point);
          }
          ids.push(vertexMap.get(key));
        }

        faces.push(ids);
        addEdge(ids[0], ids[1], edgeMap, vertices);
        addEdge(ids[1], ids[2], edgeMap, vertices);
        addEdge(ids[2], ids[0], edgeMap, vertices);
      }

      if (geometry !== base) geometry.dispose();
      base.dispose();
      return { vertices, faces, edges: Array.from(edgeMap.values()) };
    }

    function addEdge(aId, bId, edgeMap, vertices) {
      const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
      if (!edgeMap.has(key)) edgeMap.set(key, [vertices[aId], vertices[bId]]);
    }

    function addLatticeEdges(edges) {
      const geometry = new CylinderGeometry(strutRadius, strutRadius, 1, 10, 1, false);
      edges.forEach(([start, end]) => {
        const segment = end.clone().sub(start);
        const mesh = new Mesh(geometry, strutMaterial);
        mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
        mesh.quaternion.copy(new Quaternion().setFromUnitVectors(yAxis, segment.clone().normalize()));
        mesh.scale.y = segment.length();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sphere.add(mesh);
      });
    }

    function addLatticeNodes(vertices) {
      const geometry = new SphereGeometry(nodeRadius, 22, 16);
      vertices.forEach((position) => {
        const mesh = new Mesh(geometry, nodeMaterial);
        mesh.position.copy(position);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        sphere.add(mesh);
      });
    }

    function addTriangularPanels(faces) {
      const outerPositions = [];
      const innerPositions = [];

      faces.forEach((face, index) => {
        const scatter = seeded(index);
        if (scatter > 0.28 && index % 9 !== 0) return;

        const a = data.vertices[face[0]];
        const b = data.vertices[face[1]];
        const c = data.vertices[face[2]];
        const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        const normal = centroid.clone().normalize();
        const inset = 0.155 + seeded(index + 41) * 0.045;
        const target = scatter > 0.12 ? outerPositions : innerPositions;

        [a, b, c].forEach((point) => {
          const panelPoint = point.clone().lerp(centroid, inset).addScaledVector(normal, -0.042);
          target.push(panelPoint.x, panelPoint.y, panelPoint.z);
        });
      });

      sphere.add(makePanelMesh(outerPositions, panelMaterial));
      sphere.add(makePanelMesh(innerPositions, innerPanelMaterial));
    }

    function makePanelMesh(positions, material) {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    function buildKeycapSphere() {
      const group = new Group();
      const sphereRadius = 1.26;
      const keycapBoost = 1.82;
      const sphereKeycaps = [];
      const rings = [
        { y: 0.82, count: 7, size: 0.315 * keycapBoost, shift: 0.08 },
        { y: 0.59, count: 9, size: 0.325 * keycapBoost, shift: 0.28 },
        { y: 0.36, count: 11, size: 0.322 * keycapBoost, shift: 0.04 },
        { y: 0.12, count: 12, size: 0.318 * keycapBoost, shift: 0.26 },
        { y: -0.12, count: 12, size: 0.318 * keycapBoost, shift: 0.08 },
        { y: -0.36, count: 11, size: 0.322 * keycapBoost, shift: 0.32 },
        { y: -0.59, count: 9, size: 0.325 * keycapBoost, shift: 0.14 },
        { y: -0.82, count: 7, size: 0.315 * keycapBoost, shift: 0.38 },
      ];

      rings.forEach((ring, ringIndex) => {
        for (let i = 0; i < ring.count; i += 1) {
          const style = keycapStyles[(i * 2 + ringIndex * 3) % keycapStyles.length];
          const dimensions = getSphereKeycapDimensions(ring.size, ring.count, i, ringIndex);
          sphereKeycaps.push({
            width: dimensions.width,
            depth: dimensions.depth,
            height: dimensions.height,
            style,
            twist: ring.shift + ringIndex * 0.08 + dimensions.twist,
          });
        }
      });

      const fillerKeycaps = [
        { y: 0.705, angle: 0.52, width: 0.22, depth: 0.34, height: 0.14, twist: 0.22, style: 2 },
        { y: 0.705, angle: 2.04, width: 0.28, depth: 0.24, height: 0.135, twist: -0.1, style: 6 },
        { y: 0.705, angle: 3.62, width: 0.2, depth: 0.32, height: 0.14, twist: 0.18, style: 8 },
        { y: 0.705, angle: 5.1, width: 0.3, depth: 0.22, height: 0.135, twist: -0.2, style: 10 },
        { y: 0.475, angle: 1.08, width: 0.24, depth: 0.26, height: 0.15, twist: -0.28, style: 4 },
        { y: 0.475, angle: 2.62, width: 0.33, depth: 0.2, height: 0.14, twist: 0.08, style: 9 },
        { y: 0.475, angle: 4.18, width: 0.2, depth: 0.31, height: 0.14, twist: 0.32, style: 1 },
        { y: 0.475, angle: 5.72, width: 0.26, depth: 0.24, height: 0.145, twist: -0.16, style: 11 },
        { y: 0.235, angle: 0.78, width: 0.28, depth: 0.22, height: 0.145, twist: 0.16, style: 5 },
        { y: 0.235, angle: 2.38, width: 0.21, depth: 0.32, height: 0.14, twist: -0.24, style: 0 },
        { y: 0.235, angle: 3.96, width: 0.31, depth: 0.21, height: 0.14, twist: 0.28, style: 7 },
        { y: 0.235, angle: 5.54, width: 0.24, depth: 0.26, height: 0.15, twist: -0.12, style: 3 },
        { y: -0.245, angle: 0.28, width: 0.2, depth: 0.32, height: 0.14, twist: 0.3, style: 6 },
        { y: -0.245, angle: 1.86, width: 0.3, depth: 0.22, height: 0.145, twist: -0.2, style: 2 },
        { y: -0.245, angle: 3.44, width: 0.23, depth: 0.27, height: 0.14, twist: 0.12, style: 10 },
        { y: -0.245, angle: 5.02, width: 0.33, depth: 0.2, height: 0.135, twist: -0.32, style: 8 },
        { y: -0.485, angle: 0.92, width: 0.27, depth: 0.23, height: 0.14, twist: 0.24, style: 1 },
        { y: -0.485, angle: 2.48, width: 0.2, depth: 0.3, height: 0.135, twist: -0.16, style: 4 },
        { y: -0.485, angle: 4.08, width: 0.31, depth: 0.21, height: 0.14, twist: 0.18, style: 11 },
        { y: -0.485, angle: 5.62, width: 0.23, depth: 0.27, height: 0.14, twist: -0.28, style: 9 },
        { y: -0.705, angle: 1.28, width: 0.22, depth: 0.3, height: 0.135, twist: 0.14, style: 3 },
        { y: -0.705, angle: 2.92, width: 0.29, depth: 0.22, height: 0.14, twist: -0.22, style: 5 },
        { y: -0.705, angle: 4.48, width: 0.2, depth: 0.31, height: 0.135, twist: 0.26, style: 0 },
        { y: -0.705, angle: 6.02, width: 0.29, depth: 0.22, height: 0.14, twist: -0.08, style: 7 },
        { y: 0.67, angle: 4.48, width: 0.46, depth: 0.17, height: 0.135, twist: 0.44, customStyle: 0 },
        { y: 0.49, angle: 0.28, width: 0.4, depth: 0.18, height: 0.135, twist: -0.38, customStyle: 2 },
        { y: 0.255, angle: 1.58, width: 0.5, depth: 0.16, height: 0.13, twist: 0.34, customStyle: 1 },
        { y: 0.02, angle: 2.96, width: 0.45, depth: 0.17, height: 0.135, twist: -0.42, customStyle: 3 },
        { y: -0.04, angle: 4.74, width: 0.42, depth: 0.18, height: 0.13, twist: 0.32, customStyle: 4 },
        { y: -0.29, angle: 0.98, width: 0.48, depth: 0.16, height: 0.135, twist: -0.36, customStyle: 0 },
        { y: -0.52, angle: 3.26, width: 0.4, depth: 0.18, height: 0.13, twist: 0.38, customStyle: 2 },
        { y: -0.68, angle: 5.28, width: 0.44, depth: 0.17, height: 0.135, twist: -0.34, customStyle: 3 },
      ];

      fillerKeycaps.forEach((item) => {
        const style = item.customStyle === undefined
          ? keycapStyles[item.style % keycapStyles.length]
          : sphereLongKeyStyles[item.customStyle % sphereLongKeyStyles.length];
        sphereKeycaps.push({
          width: item.width * keycapBoost,
          depth: item.depth * keycapBoost,
          height: item.height * keycapBoost,
          style,
          twist: item.angle + item.twist,
          lift: item.customStyle === undefined ? 0.004 : 0.018,
        });
      });

      [new Vector3(0, 1, 0), new Vector3(0, -1, 0)].forEach((normal, index) => {
        sphereKeycaps.push({
          width: (index ? 0.31 : 0.36) * keycapBoost,
          depth: (index ? 0.31 : 0.26) * keycapBoost,
          height: 0.145 * keycapBoost,
          style: keycapStyles[index ? 11 : 4],
          twist: index * Math.PI,
          lift: 0.006,
        });
      });

      const reducedKeycaps = sphereKeycaps.filter((_, index) => index % 2 === 0);
      const total = reducedKeycaps.length;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const orderedKeycaps = reducedKeycaps
        .slice()
        .sort((a, b) => Math.max(b.width, b.depth) - Math.max(a.width, a.depth));
      const distributedKeycaps = new Array(total);
      orderedKeycaps.forEach((item, index) => {
        distributedKeycaps[(index * 37) % total] = item;
      });

      distributedKeycaps.forEach((item, index) => {
        const t = (index + 0.5) / total;
        const y = 1 - t * 2;
        const ringRadius = Math.sqrt(Math.max(0.01, 1 - y * y));
        const angle = index * goldenAngle + 0.18 * Math.sin(index * 1.37);
        const normal = new Vector3(Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius).normalize();
        const key = createKeycap(item.width, item.depth, item.height, item.style);
        orientObjectToNormal(key, normal, angle + Math.PI / 4 + item.twist);
        key.position.copy(normal.clone().multiplyScalar(sphereRadius + (item.lift || 0)));
        group.add(key);
      });

      return group;
    }

    function getSphereKeycapDimensions(baseSize, ringCount, slotIndex, ringIndex) {
      const variant = (slotIndex * 5 + ringIndex * 3) % 11;
      const roomyRing = ringCount <= 10;
      const height = (0.15 + ((slotIndex + ringIndex) % 3) * 0.01) * 1.82;

      if (roomyRing && variant === 0) {
        return { width: baseSize * 1.1, depth: baseSize * 0.76, height, twist: 0.2 };
      }

      if (roomyRing && variant === 4) {
        return { width: baseSize * 0.76, depth: baseSize * 1.02, height, twist: -0.22 };
      }

      if (variant === 2 || variant === 8) {
        return { width: baseSize * 1.03, depth: baseSize * 0.96, height, twist: 0.08 };
      }

      if (variant === 5) {
        return { width: baseSize * 0.84, depth: baseSize * 0.84, height, twist: -0.1 };
      }

      return { width: baseSize, depth: baseSize * 0.92, height, twist: 0 };
    }

    function createKeycap(width, depth, height, style) {
      const group = new Group();
      group.userData.pressableKeycap = true;
      const scaledWidth = width * keycapScale;
      const scaledDepth = depth * keycapScale;
      const scaledHeight = height * keycapScale;
      const mesh = new Mesh(createRoundedKeycapGeometry(scaledWidth, scaledDepth, scaledHeight), getKeyMaterial(style));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      const label = createKeycapLabel(style, scaledWidth, scaledDepth);
      label.position.z = scaledHeight + 0.018;
      group.add(label);
      return group;
    }

    function collectPressKeycaps(group) {
      const keycaps = [];
      group.traverse((object) => {
        if (!object.userData.pressableKeycap) return;
        const normal = new Vector3(0, 0, 1).applyQuaternion(object.quaternion).normalize();
        object.userData.press = {
          basePosition: object.position.clone(),
          normal,
          press: 0,
          targetPress: 0,
        };
        keycaps.push(object);
      });
      return keycaps;
    }

    function orientObjectToNormal(object, normal, twist = 0) {
      const seed = Math.abs(normal.y) > 0.86 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
      const tangent = seed.clone().addScaledVector(normal, -seed.dot(normal)).normalize();
      const bitangent = new Vector3().crossVectors(normal, tangent).normalize();
      orientObjectToBasis(object, tangent, bitangent, normal, twist);
    }

    function orientObjectToBasis(object, tangent, bitangent, normal, twist = 0) {
      const matrix = new Matrix4().makeBasis(tangent.clone().normalize(), bitangent.clone().normalize(), normal.clone().normalize());
      object.setRotationFromMatrix(matrix);
      object.rotateZ(twist);
    }

    function createRoundedKeycapGeometry(width, depth, height) {
      const key = `${width.toFixed(3)}-${depth.toFixed(3)}-${height.toFixed(3)}`;
      if (keycapGeometryCache.has(key)) return keycapGeometryCache.get(key);

      const positions = [];
      const base = roundedRectLoop(width * 1.08, depth * 1.08, Math.min(width, depth) * 0.18, 5, 0);
      const shoulder = roundedRectLoop(width * 0.95, depth * 0.95, Math.min(width, depth) * 0.19, 5, height * 0.47);
      const top = roundedRectLoop(width * 0.78, depth * 0.74, Math.min(width, depth) * 0.17, 5, height);
      const dish = roundedRectLoop(width * 0.52, depth * 0.46, Math.min(width, depth) * 0.13, 5, height * 0.78);
      const center = new Vector3(0, 0, height * 0.755);

      connectLoops(positions, base, shoulder);
      connectLoops(positions, shoulder, top);
      connectLoops(positions, top, dish);
      for (let i = 0; i < dish.length; i += 1) {
        pushTriangle(positions, dish[i], dish[(i + 1) % dish.length], center);
      }

      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.computeVertexNormals();
      keycapGeometryCache.set(key, geometry);
      return geometry;
    }

    function roundedRectLoop(width, depth, radiusValue, segments, z) {
      const points = [];
      const cornerRadius = Math.min(radiusValue, Math.min(width, depth) * 0.48);
      const halfWidth = width / 2 - cornerRadius;
      const halfDepth = depth / 2 - cornerRadius;
      const corners = [
        { x: halfWidth, y: halfDepth, start: 0, end: Math.PI / 2 },
        { x: -halfWidth, y: halfDepth, start: Math.PI / 2, end: Math.PI },
        { x: -halfWidth, y: -halfDepth, start: Math.PI, end: Math.PI * 1.5 },
        { x: halfWidth, y: -halfDepth, start: Math.PI * 1.5, end: Math.PI * 2 },
      ];

      corners.forEach((corner) => {
        for (let i = 0; i <= segments; i += 1) {
          const angle = corner.start + (corner.end - corner.start) * (i / segments);
          points.push(new Vector3(corner.x + Math.cos(angle) * cornerRadius, corner.y + Math.sin(angle) * cornerRadius, z));
        }
      });

      return points;
    }

    function connectLoops(target, lower, upper) {
      for (let i = 0; i < lower.length; i += 1) {
        const next = (i + 1) % lower.length;
        pushQuad(target, lower[i], lower[next], upper[next], upper[i]);
      }
    }

    function pushTriangle(target, a, b, c) {
      target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }

    function pushQuad(target, a, b, c, d) {
      pushTriangle(target, a, b, c);
      pushTriangle(target, a, c, d);
    }

    function getKeyMaterial(style) {
      const key = style.name;
      if (!materialCache.has(key)) {
        const translucent = style.translucent === true;
        materialCache.set(key, new MeshPhysicalMaterial({
          color: style.body,
          roughness: translucent ? 0.18 : 0.42,
          metalness: 0,
          clearcoat: translucent ? 0.9 : 0.66,
          clearcoatRoughness: translucent ? 0.13 : 0.28,
          sheen: 0.18,
          emissive: style.glow,
          emissiveIntensity: style.emissiveIntensity ?? 0.04,
          transparent: translucent,
          opacity: translucent ? style.opacity ?? 0.55 : 1,
          envMapIntensity: translucent ? 1.9 : 1.35,
          side: DoubleSide,
        }));
      }
      return materialCache.get(key);
    }

    function makeStudioEnvironmentMap() {
      const envCanvas = document.createElement("canvas");
      envCanvas.width = 1024;
      envCanvas.height = 512;
      const ctx = envCanvas.getContext("2d");

      const sky = ctx.createLinearGradient(0, 0, 0, envCanvas.height);
      sky.addColorStop(0, "#f6f8ff");
      sky.addColorStop(0.32, "#9fb7ff");
      sky.addColorStop(0.58, "#101426");
      sky.addColorStop(1, "#001861");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, envCanvas.width, envCanvas.height);

      const warmBox = ctx.createLinearGradient(0, 0, envCanvas.width, 0);
      warmBox.addColorStop(0, "rgba(255, 178, 92, 0.08)");
      warmBox.addColorStop(0.22, "rgba(255, 255, 255, 0.92)");
      warmBox.addColorStop(0.38, "rgba(255, 204, 138, 0.28)");
      warmBox.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = warmBox;
      ctx.fillRect(0, 0, envCanvas.width, 170);

      const blueFloor = ctx.createRadialGradient(640, 430, 40, 640, 430, 390);
      blueFloor.addColorStop(0, "rgba(39, 80, 255, 0.96)");
      blueFloor.addColorStop(0.4, "rgba(20, 52, 190, 0.82)");
      blueFloor.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = blueFloor;
      ctx.fillRect(0, 270, envCanvas.width, 242);

      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.fillRect(72, 72, 180, 34);
      ctx.fillRect(820, 88, 110, 22);
      ctx.fillStyle = "rgba(35,73,255,0.55)";
      ctx.fillRect(690, 104, 170, 42);
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.fillRect(350, 190, 320, 96);

      const texture = new CanvasTexture(envCanvas);
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }

    function createKeycapLabel(style, width, depth) {
      const material = new MeshBasicMaterial({
        map: getLabelTexture(style),
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      const label = new Mesh(labelPlaneGeometry, material);
      label.scale.set(width * 0.6, depth * 0.36, 1);
      return label;
    }

    function getLabelTexture(style) {
      const key = `${style.name}-${style.label}-${style.pattern}`;
      if (labelTextureCache.has(key)) return labelTextureCache.get(key);

      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 256;
      labelCanvas.height = 128;
      const ctx = labelCanvas.getContext("2d");
      ctx.clearRect(0, 0, 256, 128);
      ctx.imageSmoothingEnabled = false;
      drawPixelPattern(ctx, style);
      ctx.fillStyle = style.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = style.text === "#ffffff" || style.text === "#f4f4f4" || style.text === "#f0f0f0" || style.text === "#eeeeee"
        ? "rgba(255,255,255,0.2)"
        : "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 2;
      ctx.font = `800 ${style.label.length > 3 ? 40 : 58}px "Courier New", monospace`;
      ctx.fillText(style.label, 128, 68);

      const texture = new CanvasTexture(labelCanvas);
      texture.needsUpdate = true;
      labelTextureCache.set(key, texture);
      return texture;
    }

    function drawPixelPattern(ctx, style) {
      const ink = style.patternInk || "rgba(0,0,0,0.62)";
      ctx.fillStyle = ink;

      if (style.pattern === "step") {
        [[24, 78, 28, 14], [52, 64, 28, 14], [80, 50, 28, 14], [108, 36, 28, 14]].forEach((r) => ctx.fillRect(...r));
      } else if (style.pattern === "face") {
        ctx.fillRect(76, 42, 14, 14);
        ctx.fillRect(166, 42, 14, 14);
        ctx.fillRect(92, 88, 72, 10);
      } else if (style.pattern === "planet") {
        ctx.beginPath();
        ctx.arc(128, 64, 28, 0, Math.PI * 2);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.fillRect(66, 70, 126, 8);
      } else if (style.pattern === "slash") {
        for (let i = 0; i < 4; i += 1) ctx.fillRect(72 + i * 28, 30, 12, 72);
      } else if (style.pattern === "burst") {
        [[62, 42, 34, 12], [92, 70, 26, 12], [122, 40, 40, 14], [154, 76, 32, 10]].forEach((r) => ctx.fillRect(...r));
      } else if (style.pattern === "block") {
        ctx.fillRect(54, 30, 52, 18);
        ctx.fillRect(150, 74, 46, 18);
      } else if (style.pattern === "eyes") {
        ctx.fillRect(88, 56, 16, 16);
        ctx.fillRect(152, 56, 16, 16);
      } else {
        ctx.fillRect(122, 26, 12, 12);
        ctx.fillRect(122, 78, 12, 30);
      }
    }

    function addRod(group, start, end, rodRadius = 0.025, material = strutMaterial) {
      const segment = end.clone().sub(start);
      const mesh = new Mesh(new CylinderGeometry(rodRadius, rodRadius, segment.length(), 10, 1, false), material);
      mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
      mesh.quaternion.copy(new Quaternion().setFromUnitVectors(yAxis, segment.clone().normalize()));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    }

    function endDrag(event) {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
    }

    function resize() {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      const xr = window.__caveVR;
      if (xr?.xrSessionActive || xr?.renderer?.xr?.isPresenting) return;

      const narrow = width < 720;
      const scale = narrow ? 0.5 : Math.min(0.48, Math.max(0.42, width / 3035));
      world.scale.setScalar(scale);
      world.position.set(0, narrow ? -0.42 : -0.24, 0);
    }

    function animate(now) {
      const delta = Math.min((now - previousTime) / 1000, 0.034);
      previousTime = now;

      if (!dragging && interactionEnabled) {
        targetRotationX += spinVelocityX * delta;
        targetRotationY += spinVelocityY * delta;
        spinVelocityX *= Math.pow(0.11, delta);
        spinVelocityY *= Math.pow(0.11, delta);
      }

      sphere.rotation.x += (targetRotationX - sphere.rotation.x) * 0.11;
      sphere.rotation.y += (targetRotationY - sphere.rotation.y) * 0.11;
      sphere.rotation.z = 0.08 + Math.sin(now * 0.00042) * 0.025;
      updateControllerKeypresses(delta);

      dispatchRotation();

      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }

    function triggerControllerKeypress(now, force = 1) {
      if (!pressKeycaps.length || now - lastKeypressTrigger < 55) return;
      lastKeypressTrigger = now;

      const presses = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < presses; i += 1) {
        const key = pressKeycaps[Math.floor(Math.random() * pressKeycaps.length)];
        const data = key.userData.press;
        if (!data) continue;
        data.targetPress = Math.max(data.targetPress, 0.18 * force * (0.78 + Math.random() * 0.58));
      }
    }

    function updateControllerKeypresses(delta) {
      if (!pressKeycaps.length) return;
      const decay = Math.pow(0.03, delta);
      pressKeycaps.forEach((key) => {
        const data = key.userData.press;
        if (!data) return;
        data.targetPress *= decay;
        data.press += (data.targetPress - data.press) * Math.min(1, delta * 18);
        key.position.copy(data.basePosition).addScaledVector(data.normal, -data.press);
        key.scale.z = Math.max(0.72, 1 - data.press * 0.82);
      });
    }

    function dispatchRotation() {
      mount.dispatchEvent(new CustomEvent("sphere-rotation", {
        detail: {
          x: sphere.rotation.x,
          y: normalizeAngle(sphere.rotation.y),
          dragging,
        },
      }));
    }
  }

  function seeded(value) {
    const x = Math.sin(value * 93.9898 + 41.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    return ((value % fullTurn) + fullTurn) % fullTurn;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
