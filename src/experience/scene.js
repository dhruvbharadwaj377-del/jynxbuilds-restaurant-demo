// Procedural Maison Noir, built with plain Three.js.
//
// One continuous place: a Parisian street at dusk, the stone facade and its
// black shopfront, the vestibule and host stand, the dining room with its bar,
// and the signature table. The camera is the only thing that moves.
//
// This module is loaded lazily (dynamic import) so three.js never touches the
// initial bundle. It renders on demand: frames are only drawn while the camera,
// pointer or lighting mood is still settling, and nothing runs while the
// section is offscreen. The architecture is static, so geometry is merged per
// material and shadow maps are rendered once.

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { segmentAt } from './timeline.js'
import * as T from './textures.js'

// ---------------------------------------------------------------------------
// Lighting moods
// ---------------------------------------------------------------------------

const MOODS = {
  dusk: {
    skyTop: new THREE.Color('#0e1530'),
    skyHorizon: new THREE.Color('#4a3a52'),
    glow: new THREE.Color('#d9844e'),
    glowStrength: 0.75,
    fog: new THREE.Color('#1b1a26'),
    hemi: 0.55,
    interior: 1,
    candle: 1,
    street: 1,
    stars: 0.15,
    exposure: 1,
  },
  late: {
    skyTop: new THREE.Color('#03040a'),
    skyHorizon: new THREE.Color('#0f1018'),
    glow: new THREE.Color('#2a2238'),
    glowStrength: 0.12,
    fog: new THREE.Color('#09090e'),
    hemi: 0.2,
    interior: 0.55,
    candle: 1.45,
    street: 1.15,
    stars: 0.85,
    exposure: 1.12,
  },
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k)

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

function mat(x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _p.set(x, y, z)
  _s.set(sx, sy, sz)
  return _m.clone().compose(_p, _q, _s)
}

// Box whose UVs are in metres / tile, so textures keep a true scale
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d)
  if (tile) {
    const uv = g.attributes.uv
    const dims = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ]
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile[0], (uv.getY(i) * dims[f][1]) / tile[1])
      }
    }
  }
  return g
}

// Rounded-top arch outline, centred on x = 0, sitting on y = 0
function archShape(width, height, inset = 0) {
  const r = width / 2 - inset
  const s = new THREE.Shape()
  s.moveTo(-r, inset)
  s.lineTo(r, inset)
  s.lineTo(r, height - width / 2)
  s.absarc(0, height - width / 2, r, 0, Math.PI, false)
  s.lineTo(-r, inset)
  return s
}

function seededRange(rand, a, b) {
  return a + (b - a) * rand()
}

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------

function createSky() {
  const uniforms = {
    topColor: { value: MOODS.dusk.skyTop.clone() },
    horizonColor: { value: MOODS.dusk.skyHorizon.clone() },
    glowColor: { value: MOODS.dusk.glow.clone() },
    glowStrength: { value: MOODS.dusk.glowStrength },
    glowDir: { value: new THREE.Vector3(0.35, 0.05, -0.94).normalize() },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      uniform float glowStrength;
      uniform vec3 glowDir;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizonColor, topColor, pow(h, 0.5));
        float sun = max(dot(normalize(vec3(vDir.x, max(vDir.y, 0.0), vDir.z)), glowDir), 0.0);
        col += glowColor * pow(sun, 5.0) * glowStrength * (1.0 - h);
        col = mix(col, horizonColor * 0.4, smoothstep(0.0, -0.1, vDir.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material)
  mesh.renderOrder = -1
  return { mesh, uniforms }
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export function createRestaurantScene({ canvas, chapters, quality = 'high', onRender, onContextLost }) {
  const high = quality === 'high'
  const rand = T.seeded(11)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !high, // high tier antialiases in the composer's target instead
    alpha: false,
    powerPreference: high ? 'high-performance' : 'low-power',
  })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.25)
  renderer.setPixelRatio(pixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = high
  renderer.shadowMap.type = THREE.PCFShadowMap
  // The room never moves, so shadows are drawn once rather than every frame.
  renderer.shadowMap.autoUpdate = false

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(MOODS.dusk.fog.clone(), 26, 150)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = envTarget.texture
  scene.environmentIntensity = 0.14
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 900)

  // Post-processing (high tier): a restrained bloom on flames and bulbs only.
  let composer = null
  let bloom = null
  let output = null
  if (high) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    composer = new EffectComposer(renderer, target)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.36, 0.5, 1.05)
    composer.addPass(bloom)
    output = new OutputPass()
    composer.addPass(output)
  }

  const disposables = []
  const tex = (t) => {
    disposables.push(t)
    return t
  }

  // ---------------- Materials ----------------

  const M = {
    stone: new THREE.MeshStandardMaterial({ color: '#d6cab4', map: tex(T.limestoneTexture(rand)), roughness: 0.86 }),
    zinc: new THREE.MeshStandardMaterial({ color: '#3c434b', roughness: 0.48, metalness: 0.65 }),
    lacquer: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.2, metalness: 0.15 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b48a4c', roughness: 0.32, metalness: 1, envMapIntensity: 2.2 }),
    silver: new THREE.MeshStandardMaterial({ color: '#e2ddd2', roughness: 0.2, metalness: 1, envMapIntensity: 5 }),
    iron: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5, metalness: 0.6 }),
    darkGlass: new THREE.MeshStandardMaterial({ color: '#0b0f15', roughness: 0.08, metalness: 0.85, envMapIntensity: 0.7 }),
    windowLit: new THREE.MeshStandardMaterial({
      color: '#000',
      emissive: '#ffffff',
      emissiveMap: tex(T.windowGlowTexture(rand)),
      emissiveIntensity: 0.9,
      roughness: 1,
    }),
    shopGlass: new THREE.MeshStandardMaterial({
      color: '#1a1f24',
      roughness: 0.04,
      metalness: 0.4,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      envMapIntensity: 1.6,
    }),
    pavement: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: tex(T.pavementTexture(rand)),
      roughnessMap: tex(T.puddleRoughness(rand)),
      roughness: 1,
      metalness: 0,
      // The studio environment reads as grey daylight sheen outdoors at night;
      // wet-look highlights come from the lamps and the additive streaks instead.
      envMapIntensity: 0.25,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: tex(T.asphaltTexture(rand)),
      roughness: 0.72,
      metalness: 0,
      envMapIntensity: 0.15,
    }),
    curb: new THREE.MeshStandardMaterial({ color: '#57524b', roughness: 0.8, envMapIntensity: 0.3 }),
    shutter: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.7, metalness: 0.4, envMapIntensity: 0.4 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#1f2c18', roughness: 0.92, flatShading: true }),
    floor: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.herringboneTexture(rand)), roughness: 0.48, envMapIntensity: 0.3 }),
    checker: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.checkerTexture(rand)), roughness: 0.22 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.plasterTexture(rand)), roughness: 0.93 }),
    wainscot: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.walnutPanelTexture(rand)), roughness: 0.55 }),
    walnut: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.walnutTexture(rand)), roughness: 0.5 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#17110f', roughness: 0.95 }),
    linen: new THREE.MeshStandardMaterial({ color: '#efe7da', roughness: 0.9 }),
    velvet: high
      ? new THREE.MeshPhysicalMaterial({
          color: '#5a1820',
          roughness: 0.82,
          sheen: 1,
          sheenColor: new THREE.Color('#c46470'),
          sheenRoughness: 0.45,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({ color: '#5e1a22', roughness: 0.8, side: THREE.DoubleSide }),
    drape: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.foldTexture()), roughness: 0.85, side: THREE.DoubleSide }),
    porcelain: new THREE.MeshStandardMaterial({ color: '#f1ede5', roughness: 0.28 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      envMapIntensity: 2,
    }),
    marble: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.marbleTexture(rand)), roughness: 0.16, envMapIntensity: 1.4 }),
    mirror: new THREE.MeshStandardMaterial({ color: '#4e4234', roughness: 0.16, metalness: 1, envMapIntensity: 1.1 }),
    bottleGreen: new THREE.MeshStandardMaterial({ color: '#1d3322', roughness: 0.12, metalness: 0.2 }),
    bottleAmber: new THREE.MeshStandardMaterial({ color: '#4a2a10', roughness: 0.12, metalness: 0.2 }),
    bottleClear: new THREE.MeshStandardMaterial({ color: '#8e8a7c', roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.75 }),
    backlight: new THREE.MeshBasicMaterial({ map: tex(T.backlightTexture()), color: hdr('#ffffff', 1.25) }),
    led: new THREE.MeshBasicMaterial({ color: hdr('#ffb86a', 1.1) }),
    shade: new THREE.MeshStandardMaterial({ color: '#b8956a', emissive: '#ff9a44', emissiveIntensity: 0.32, roughness: 0.9 }),
    bulb: new THREE.MeshBasicMaterial({ color: hdr('#ffd2a0', 3) }),
    flame: new THREE.MeshBasicMaterial({ color: hdr('#ffae52', 7) }),
    votive: new THREE.MeshStandardMaterial({
      color: '#3a1e08',
      emissive: '#ff9a3c',
      emissiveIntensity: 1.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    }),
    lanternGlow: new THREE.MeshBasicMaterial({ color: hdr('#ffc27e', 4) }),
    stoneware: new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex(T.stonewareTexture(rand)), roughness: 0.62 }),
    pasta: new THREE.MeshStandardMaterial({ color: '#e9c77c', roughness: 0.34, emissive: '#3a2408', emissiveIntensity: 0.2 }),
    pastaDeep: new THREE.MeshStandardMaterial({ color: '#cfa860', roughness: 0.4, emissive: '#2a1806', emissiveIntensity: 0.2 }),
    card: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }),
    mushroom: new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.55 }),
    mushroomStem: new THREE.MeshStandardMaterial({ color: '#d8c3a0', roughness: 0.6 }),
    parmesan: new THREE.MeshStandardMaterial({ color: '#f0dc9c', roughness: 0.55 }),
    truffle: new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.75 }),
    herb: new THREE.MeshStandardMaterial({ color: '#4c6a2c', roughness: 0.6 }),
    book: new THREE.MeshStandardMaterial({ color: '#d8ccb4', roughness: 0.8 }),
  }

  const signage = T.signageTexture('MAISON NOIR')
  disposables.push(signage.texture)
  const signMat = new THREE.MeshStandardMaterial({
    color: '#d9b373',
    map: signage.texture,
    emissive: '#ffd08a',
    emissiveMap: signage.texture,
    emissiveIntensity: 1.4,
    metalness: 0.6,
    roughness: 0.35,
    transparent: true,
    alphaTest: 0.2,
  })
  const plaqueMat = new THREE.MeshStandardMaterial({ map: tex(T.plaqueTexture()), roughness: 0.4 })
  const blobMat = new THREE.MeshBasicMaterial({
    color: '#000',
    map: tex(T.blobTexture()),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })

  // ---------------- Batching ----------------
  // Every static part is collected per material and merged into one mesh.

  const batches = new Map()
  // Optional placement applied on top of each part's own matrix (used to set
  // a whole facade down on the far side of the street)
  let placement = null
  function add(material, geometry, matrix, { cast = true, receive = true } = {}) {
    const key = `${material.uuid}:${cast}:${receive}`
    let batch = batches.get(key)
    if (!batch) {
      batch = { material, cast, receive, geos: [] }
      batches.set(key, batch)
    }
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    }
    g.clearGroups()
    if (matrix) g.applyMatrix4(matrix)
    if (placement) g.applyMatrix4(placement)
    batch.geos.push(g)
  }

  // Axis-aligned box from min/max corners: reads like a plan drawing
  function box(material, [x0, y0, z0], [x1, y1, z1], { tile, cast = true, receive = true, ry = 0 } = {}) {
    const g = boxGeo(x1 - x0, y1 - y0, z1 - z0, tile)
    add(material, g, mat((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, { ry }), { cast, receive })
    g.dispose()
  }

  const root = new THREE.Group()
  scene.add(root)

  // Glow sprites (flames, bulbs, lamps). Grouped so moods can scale them.
  const glowMap = tex(T.glowTexture())
  const glowMaterials = { candle: [], interior: [], street: [] }
  const glowMatCache = new Map()
  function glow(position, size, { color = '#ffc98c', opacity = 0.7, kind = 'interior' } = {}) {
    const key = `${kind}:${color}:${opacity}`
    let material = glowMatCache.get(key)
    if (!material) {
      material = new THREE.SpriteMaterial({
        map: glowMap,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      material.userData.base = opacity
      glowMaterials[kind].push(material)
      glowMatCache.set(key, material)
    }
    const sprite = new THREE.Sprite(material)
    sprite.position.set(...position)
    sprite.scale.setScalar(size)
    root.add(sprite)
    return sprite
  }

  // Lights, tagged with a mood channel
  const lights = []
  function light(object, kind) {
    object.userData.base = object.intensity
    object.userData.kind = kind
    scene.add(object)
    if (object.target) scene.add(object.target)
    lights.push(object)
    return object
  }

  // Wet-street reflections: long additive streaks running toward the viewer
  const streakMats = new Map()
  function streak(x, z0, length, width, color, opacity) {
    const key = `${color}:${opacity}`
    let material = streakMats.get(key)
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        map: glowMap,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      })
      material.userData.base = opacity
      streakMats.set(key, material)
      glowMaterials.street.push(material)
    }
    const g = new THREE.PlaneGeometry(width, length)
    add(material, g, mat(x, 0.004, z0 + length / 2, { rx: -Math.PI / 2 }), { cast: false, receive: false })
    g.dispose()
  }

  // ======================================================================
  // EXTERIOR
  // ======================================================================

  const sky = createSky()
  scene.add(sky.mesh)

  // Stars (visible as the night deepens)
  const starGeo = new THREE.BufferGeometry()
  const starPositions = []
  for (let i = 0; i < 500; i++) {
    const theta = rand() * Math.PI * 2
    const phi = Math.acos(1 - rand() * 0.75)
    const r = 380
    starPositions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
  const starMat = new THREE.PointsMaterial({
    color: '#dfe6ff',
    size: 1.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: MOODS.dusk.stars,
    depthWrite: false,
    fog: false,
  })
  scene.add(new THREE.Points(starGeo, starMat))

  // Street: pavement, curb, road
  box(M.pavement, [-46, -0.16, 0], [46, 0, 5], { tile: [11.5, 2.5], cast: false })
  box(M.curb, [-46, -0.16, 5], [46, 0, 5.2], { cast: false })
  box(M.asphalt, [-46, -0.32, 5.2], [46, -0.16, 47], { tile: [9, 6.5], cast: false })

  const neighbourStone = M.stone.clone()
  neighbourStone.color.set('#a39886')

  // ---- Upper facades (shared by Maison Noir and its neighbours) ----

  function upperFacade({ x0, x1, base, top, stone, columns, litChance, balconyFloors = [0], roof = true }) {
    const floors = [
      { y0: base + 0.75, h: 2.55 },
      { y0: base + 4.3, h: 2.35 },
      { y0: base + 7.6, h: 2.1 },
    ].filter((f) => f.y0 + f.h < top - 0.4)

    // Wall
    box(stone, [x0, base, -0.5], [x1, top, 0], { tile: [2, 1.6] })
    // String courses and cornice
    for (const f of floors) box(stone, [x0, f.y0 - 0.32, 0], [x1, f.y0 - 0.12, 0.12], { tile: [2, 1.6] })
    box(stone, [x0 - 0.1, top - 0.35, 0], [x1 + 0.1, top, 0.45], { tile: [2, 1.6] })
    box(stone, [x0, base - 0.1, 0], [x1, base + 0.15, 0.18], { tile: [2, 1.6] })

    floors.forEach((f, fi) => {
      for (const cx of columns) {
        const w = 1.25
        // Stone surround
        box(stone, [cx - w / 2 - 0.16, f.y0 - 0.1, 0], [cx + w / 2 + 0.16, f.y0, 0.08], { tile: [2, 1.6] })
        box(stone, [cx - w / 2 - 0.16, f.y0 + f.h, 0], [cx + w / 2 + 0.16, f.y0 + f.h + 0.22, 0.1], { tile: [2, 1.6] })
        box(stone, [cx - w / 2 - 0.16, f.y0, 0], [cx - w / 2, f.y0 + f.h, 0.06], { tile: [2, 1.6] })
        box(stone, [cx + w / 2, f.y0, 0], [cx + w / 2 + 0.16, f.y0 + f.h, 0.06], { tile: [2, 1.6] })
        // Pane: lit or dark
        const lit = rand() < litChance
        const g = new THREE.PlaneGeometry(w, f.h)
        add(lit ? M.windowLit : M.darkGlass, g, mat(cx, f.y0 + f.h / 2, 0.01), { cast: false })
        g.dispose()
        // French-window mullion and transom
        box(M.iron, [cx - 0.025, f.y0, 0.01], [cx + 0.025, f.y0 + f.h, 0.04], { cast: false })
        box(M.iron, [cx - w / 2, f.y0 + f.h * 0.74, 0.01], [cx + w / 2, f.y0 + f.h * 0.74 + 0.04, 0.04], { cast: false })
        // Juliet rail where there is no continuous balcony
        if (!balconyFloors.includes(fi)) {
          box(M.iron, [cx - w / 2, f.y0 + 0.9, 0.1], [cx + w / 2, f.y0 + 0.94, 0.14], { cast: false })
          for (let bx = cx - w / 2; bx <= cx + w / 2 + 0.01; bx += 0.11) {
            box(M.iron, [bx - 0.008, f.y0, 0.11], [bx + 0.008, f.y0 + 0.9, 0.13], { cast: false })
          }
        }
      }
      // Continuous wrought-iron balcony
      if (balconyFloors.includes(fi)) {
        box(stone, [x0 + 0.2, f.y0 - 0.12, 0], [x1 - 0.2, f.y0, 0.7], { tile: [2, 1.6] })
        box(M.iron, [x0 + 0.2, f.y0 + 1.0, 0.62], [x1 - 0.2, f.y0 + 1.05, 0.7], { cast: false })
        box(M.iron, [x0 + 0.2, f.y0 + 0.12, 0.64], [x1 - 0.2, f.y0 + 0.15, 0.68], { cast: false })
        for (let bx = x0 + 0.25; bx < x1 - 0.2; bx += 0.12) {
          box(M.iron, [bx - 0.009, f.y0, 0.64], [bx + 0.009, f.y0 + 1.0, 0.68], { cast: false })
        }
      }
    })

    // Mansard roof with dormers
    if (roof) {
      const roofH = 3.1
      const g = boxGeo(x1 - x0, roofH / Math.cos(0.42), 0.2)
      add(M.zinc, g, mat((x0 + x1) / 2, top + roofH / 2, -0.55 - Math.tan(0.42) * (roofH / 2), { rx: -0.42 }))
      g.dispose()
      for (const cx of columns) {
        if (rand() < 0.35) continue
        box(M.zinc, [cx - 0.55, top + 0.2, -0.4], [cx + 0.55, top + 1.7, 0.05])
        const lit = rand() < litChance * 0.7
        const pg = new THREE.PlaneGeometry(0.7, 1.0)
        add(lit ? M.windowLit : M.darkGlass, pg, mat(cx, top + 0.85, 0.06), { cast: false })
        pg.dispose()
      }
      box(M.stone, [x0 + 0.4, top + 2.2, -2.6], [x0 + 1.4, top + 4.2, -1.8])
      box(M.stone, [x1 - 1.4, top + 2.4, -2.6], [x1 - 0.4, top + 4.0, -1.8])
    }
  }

  // Maison Noir: four bays above the shopfront
  upperFacade({ x0: -8.2, x1: 8.2, base: 4.6, top: 15.6, stone: M.stone, columns: [-6, -2, 2, 6], litChance: 0.3, balconyFloors: [0] })

  // Neighbours: a little darker, shops closed for the night
  for (const [x0, x1, top] of [
    [-30, -8.2, 16.4],
    [8.2, 30, 14.8],
  ]) {
    upperFacade({
      x0,
      x1,
      base: 4.4,
      top,
      stone: neighbourStone,
      columns: Array.from({ length: Math.floor((x1 - x0) / 3.2) }, (_, i) => x0 + 1.9 + i * 3.2),
      litChance: 0.22,
      balconyFloors: [0, 2],
    })
    // Closed ground floor: stone piers and lowered shutters
    box(neighbourStone, [x0, 0, -0.5], [x1, 4.4, -0.1], { tile: [2, 1.6] })
    for (let sx = x0 + 0.8; sx < x1 - 3; sx += 4.2) {
      box(M.shutter, [sx, 0.02, -0.1], [sx + 3.2, 3.4, -0.02], { cast: false })
      box(M.lacquer, [sx - 0.1, 3.4, -0.1], [sx + 3.3, 3.75, 0.04], { cast: false })
    }
  }

  // The far side of the street, seen through the windows from inside:
  // the same facade builder, turned round and set down 47 m away.
  placement = new THREE.Matrix4().makeTranslation(0, 0, 47).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
  box(M.curb, [-46, -0.16, -0.2], [46, 0, 0], { cast: false })
  box(M.pavement, [-46, -0.16, 0], [46, 0, 4], { tile: [11.5, 2.5], cast: false })
  for (const [x0, x1, top] of [
    [-34, -12, 16],
    [-12, 6, 17.2],
    [6, 30, 15.4],
  ]) {
    upperFacade({
      x0,
      x1,
      base: 4.4,
      top,
      stone: neighbourStone,
      columns: Array.from({ length: Math.floor((x1 - x0) / 3.2) }, (_, i) => x0 + 1.9 + i * 3.2),
      litChance: 0.4,
      balconyFloors: [0],
      roof: false,
    })
    box(neighbourStone, [x0, 0, -0.5], [x1, 4.4, -0.1], { tile: [2, 1.6] })
    // Ground floor: a lit cafe front or two among closed shutters
    for (let sx = x0 + 0.8; sx < x1 - 3; sx += 4.2) {
      const lit = rand() < 0.4
      const g = new THREE.PlaneGeometry(3.2, 3.2)
      add(lit ? M.windowLit : M.shutter, g, mat(sx + 1.6, 1.62, -0.06), { cast: false })
      g.dispose()
      box(M.lacquer, [sx - 0.1, 3.4, -0.1], [sx + 3.3, 3.75, 0.04], { cast: false })
    }
  }
  placement = null

  // ---- Shopfront ----

  // Stone piers at the party walls
  box(M.stone, [-8.2, 0, -0.45], [-7.6, 4.6, 0.06], { tile: [2, 1.6] })
  box(M.stone, [7.6, 0, -0.45], [8.2, 4.6, 0.06], { tile: [2, 1.6] })
  // Lacquered frame: fascia, piers either side of the door, stall risers
  box(M.lacquer, [-7.6, 3.55, -0.42], [7.6, 4.6, 0.16])
  box(M.lacquer, [-2.05, 0, -0.42], [-1.0, 3.55, 0.1])
  box(M.lacquer, [1.0, 0, -0.42], [2.05, 3.55, 0.1])
  box(M.lacquer, [-1.0, 3.25, -0.42], [1.0, 3.55, 0.06])
  for (const s of [-1, 1]) {
    const [a, b] = s < 0 ? [-7.6, -2.05] : [2.05, 7.6]
    box(M.lacquer, [a, 0, -0.3], [b, 0.55, 0.08])
    box(M.lacquer, [a, 0.55, -0.12], [b, 0.62, 0.06], { cast: false })
    box(M.lacquer, [a, 3.47, -0.12], [b, 3.55, 0.06], { cast: false })
    box(M.lacquer, [s * 4.8 - 0.04, 0.55, -0.12], [s * 4.8 + 0.04, 3.55, 0.06], { cast: false })
    box(M.lacquer, [a, 2.92, -0.12], [b, 2.97, 0.06], { cast: false })
    box(M.lacquer, [a, 0.55, -0.12], [a + 0.06, 3.55, 0.06], { cast: false })
    box(M.lacquer, [b - 0.06, 0.55, -0.12], [b, 3.55, 0.06], { cast: false })
    const g = new THREE.PlaneGeometry(b - a, 2.93)
    add(M.shopGlass, g, mat((a + b) / 2, 0.55 + 2.93 / 2, -0.03), { cast: false, receive: false })
    g.dispose()
    // Brass kick line along the stall riser
    box(M.brass, [a, 0.06, 0.08], [b, 0.09, 0.1], { cast: false })
  }
  // Brass bead under the fascia
  box(M.brass, [-7.6, 3.52, 0.12], [7.6, 3.56, 0.18], { cast: false })

  // The name, in gold on the black fascia
  {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 0.825), signMat)
    sign.position.set(0, 4.06, 0.165)
    root.add(sign)
  }
  // Street number plaque
  {
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), plaqueMat)
    plaque.position.set(1.52, 3.12, 0.105)
    root.add(plaque)
  }

  // Door leaves, swung open into the vestibule
  for (const s of [-1, 1]) {
    const hinge = new THREE.Matrix4().makeTranslation(s * 0.97, 0, -0.42)
    const swing = new THREE.Matrix4().makeRotationY(s * -1.62)
    const leaf = (material, [x0, y0, z0], [x1, y1, z1], opts) => {
      const g = boxGeo(x1 - x0, y1 - y0, z1 - z0)
      const local = mat((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
      add(material, g, hinge.clone().multiply(swing).multiply(local), opts)
      g.dispose()
    }
    // Leaf geometry is drawn from the hinge toward the door's centre line
    const w = 0.95
    const x0 = s < 0 ? 0 : -w
    const x1 = s < 0 ? w : 0
    leaf(M.lacquer, [x0, 0, -0.03], [x1, 1.0, 0.03])
    leaf(M.lacquer, [x0, 3.1, -0.03], [x1, 3.22, 0.03])
    leaf(M.lacquer, [x0, 1.0, -0.03], [x0 + 0.1, 3.1, 0.03])
    leaf(M.lacquer, [x1 - 0.1, 1.0, -0.03], [x1, 3.1, 0.03])
    leaf(M.shopGlass, [x0 + 0.1, 1.0, -0.005], [x1 - 0.1, 3.1, 0.005], { cast: false, receive: false })
    leaf(M.brass, [s < 0 ? x1 - 0.18 : x0 + 0.14, 1.1, 0.03], [s < 0 ? x1 - 0.14 : x0 + 0.18, 1.7, 0.07], { cast: false })
  }

  // Lanterns either side of the door, and topiaries below them
  for (const s of [-1, 1]) {
    const x = s * 1.52
    box(M.brass, [x - 0.03, 2.56, 0.1], [x + 0.03, 2.62, 0.3], { cast: false })
    box(M.brass, [x - 0.13, 2.3, 0.2], [x + 0.13, 2.33, 0.46], { cast: false })
    box(M.brass, [x - 0.13, 2.86, 0.2], [x + 0.13, 2.9, 0.46], { cast: false })
    for (const [cx, cz] of [
      [-0.12, 0.21],
      [0.12, 0.21],
      [-0.12, 0.45],
      [0.12, 0.45],
    ]) {
      box(M.brass, [x + cx - 0.012, 2.33, cz - 0.012], [x + cx + 0.012, 2.86, cz + 0.012], { cast: false })
    }
    box(M.lanternGlow, [x - 0.1, 2.36, 0.23], [x + 0.1, 2.84, 0.43], { cast: false, receive: false })
    glow([x, 2.6, 0.36], 1.5, { color: '#ffc17a', opacity: 0.75, kind: 'street' })
    glow([x, 2.6, 0.36], 4.2, { color: '#ff9d4a', opacity: 0.16, kind: 'street' })

    // Planter + clipped bay topiary
    box(M.lacquer, [x - 0.3, 0, 0.2], [x + 0.3, 0.62, 0.8])
    box(M.brass, [x - 0.31, 0.58, 0.19], [x + 0.31, 0.62, 0.81], { cast: false })
    const stem = new THREE.CylinderGeometry(0.025, 0.03, 0.7, 8)
    add(M.walnut, stem, mat(x, 0.95, 0.5))
    stem.dispose()
    const ball = new THREE.IcosahedronGeometry(0.36, 2)
    add(M.foliage, ball, mat(x, 1.48, 0.5))
    ball.dispose()
    streak(x, 0.5, 6.5, 0.6, '#ffb065', 0.38)
  }

  // Shop-window light falling on the wet pavement
  for (const x of [-4.8, 4.8]) streak(x, 0.1, 9, 5.4, '#ff9c50', 0.2)

  // Paris street lamps
  for (const s of [-1, 1]) {
    const x = s * 9.8
    const z = 4.55
    const post = new THREE.CylinderGeometry(0.06, 0.1, 4.1, 10)
    add(M.iron, post, mat(x, 2.05, z))
    post.dispose()
    const base = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10)
    add(M.iron, base, mat(x, 0.35, z))
    base.dispose()
    box(M.iron, [x - 0.2, 4.08, z - 0.2], [x + 0.2, 4.14, z + 0.2], { cast: false })
    box(M.iron, [x - 0.24, 4.68, z - 0.24], [x + 0.24, 4.76, z + 0.24], { cast: false })
    box(M.lanternGlow, [x - 0.15, 4.14, z - 0.15], [x + 0.15, 4.68, z + 0.15], { cast: false, receive: false })
    glow([x, 4.42, z], 2.2, { color: '#ffd29a', opacity: 0.7, kind: 'street' })
    glow([x, 4.42, z], 7, { color: '#ffb36e', opacity: 0.12, kind: 'street' })
    streak(x, z + 0.6, 18, 1.1, '#ffc489', 0.4)
  }

  // Exterior lights
  for (const s of [-1, 1]) {
    const lantern = new THREE.PointLight('#ffb46a', high ? 2.6 : 4, 6, 2)
    lantern.position.set(s * 1.52, 2.6, 0.6)
    if (high || s > 0) light(lantern, 'street')

    const street = new THREE.PointLight('#ffcf96', 26, 18, 2)
    street.position.set(s * 9.8, 4.4, 4.55)
    if (high) light(street, 'street')

    // Uplights grazing the stone above the shopfront
    const up = new THREE.SpotLight('#ffd3a0', high ? 90 : 70, 16, 0.32, 0.9, 2)
    up.position.set(s * 4.4, 4.7, 0.9)
    up.target.position.set(s * 4.4, 15, 0)
    light(up, 'street')
  }

  // ======================================================================
  // INTERIOR
  // ======================================================================

  const ROOM = { x0: -7.8, x1: 7.8, z0: -0.42, z1: -22, h: 4.4 }

  // Floor: herringbone oak, with a marble checkerboard in the vestibule
  box(M.floor, [ROOM.x0, -0.05, ROOM.z1], [ROOM.x1, 0, ROOM.z0], { tile: [1.6, 1.6], cast: false })
  box(M.checker, [-1.98, 0, -3.4], [1.98, 0.004, ROOM.z0], { tile: [0.8, 0.8], cast: false })
  // Ceiling with beams
  box(M.ceiling, [ROOM.x0, ROOM.h, ROOM.z1], [ROOM.x1, ROOM.h + 0.1, ROOM.z0], { cast: false })
  for (let z = -3; z > ROOM.z1; z -= 3.2) box(M.walnut, [ROOM.x0, ROOM.h - 0.28, z - 0.14], [ROOM.x1, ROOM.h, z + 0.14], { cast: false })

  // Walls: walnut wainscot, plaster above, crown moulding
  box(M.plaster, [-8.2, 0, ROOM.z1], [ROOM.x0, ROOM.h, ROOM.z0], { tile: [3, 4.4] })
  box(M.plaster, [ROOM.x1, 0, ROOM.z1], [8.2, ROOM.h, ROOM.z0], { tile: [3, 4.4] })
  box(M.plaster, [-8.2, 0, ROOM.z1 - 0.4], [8.2, ROOM.h, ROOM.z1], { tile: [3, 4.4] })
  box(M.wainscot, [ROOM.x0, 0, ROOM.z1], [ROOM.x0 + 0.04, 1.1, ROOM.z0], { tile: [1.2, 1.1], cast: false })
  box(M.wainscot, [ROOM.x1 - 0.04, 0, ROOM.z1], [ROOM.x1, 1.1, ROOM.z0], { tile: [1.2, 1.1], cast: false })
  box(M.walnut, [ROOM.x0, 1.1, ROOM.z1], [ROOM.x0 + 0.07, 1.16, ROOM.z0], { cast: false })
  box(M.walnut, [ROOM.x1 - 0.07, 1.1, ROOM.z1], [ROOM.x1, 1.16, ROOM.z0], { cast: false })
  box(M.walnut, [ROOM.x0, ROOM.h - 0.18, ROOM.z1], [ROOM.x0 + 0.12, ROOM.h, ROOM.z0], { cast: false })
  box(M.walnut, [ROOM.x1 - 0.12, ROOM.h - 0.18, ROOM.z1], [ROOM.x1, ROOM.h, ROOM.z0], { cast: false })
  // Inside face of the front wall, above the windows
  box(M.plaster, [ROOM.x0, 3.55, -0.5], [ROOM.x1, ROOM.h, -0.42], { tile: [3, 4.4], cast: false })

  // Contact shadows: a soft dark pool under each piece of furniture
  function blob(x, z, sx, sz = sx) {
    const g = new THREE.PlaneGeometry(sx, sz)
    add(blobMat, g, mat(x, 0.006, z, { rx: -Math.PI / 2 }), { cast: false, receive: false })
    g.dispose()
  }

  // ---- Reusable furniture geometry ----

  const chairParts = (() => {
    const velvet = []
    const wood = []
    const seat = new THREE.CylinderGeometry(0.25, 0.24, 0.1, 20)
    seat.translate(0, 0.48, 0.02)
    velvet.push(seat)
    const back = new THREE.CylinderGeometry(0.27, 0.26, 0.42, 20, 1, true, Math.PI / 2, Math.PI)
    back.translate(0, 0.74, 0.02)
    velvet.push(back)
    const rim = new THREE.TorusGeometry(0.265, 0.035, 6, 20, Math.PI)
    rim.rotateX(-Math.PI / 2)
    rim.translate(0, 0.95, 0.02)
    velvet.push(rim)
    for (const [lx, lz] of [
      [-0.17, 0.17],
      [0.17, 0.17],
      [-0.17, -0.13],
      [0.17, -0.13],
    ]) {
      const leg = new THREE.CylinderGeometry(0.014, 0.02, 0.43, 6)
      leg.translate(lx, 0.215, lz)
      wood.push(leg)
    }
    const toNI = (gs) => gs.map((g) => (g.index ? g.toNonIndexed() : g))
    return { velvet: mergeGeometries(toNI(velvet)), wood: mergeGeometries(toNI(wood)) }
  })()

  function chair(x, z, faceX, faceZ) {
    const ry = Math.atan2(faceX - x, faceZ - z)
    const m = mat(x, 0, z, { ry })
    add(M.velvet, chairParts.velvet, m)
    add(M.walnut, chairParts.wood, m)
    blob(x, z, 0.75)
  }

  const wineGlass = (() => {
    const p = [
      [0, 0],
      [0.034, 0],
      [0.034, 0.003],
      [0.005, 0.008],
      [0.004, 0.1],
      [0.024, 0.118],
      [0.04, 0.15],
      [0.041, 0.185],
      [0.034, 0.215],
      [0.033, 0.214],
      [0.039, 0.185],
      [0.038, 0.15],
      [0.022, 0.122],
      [0, 0.116],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(p, 14)
  })()

  const plateGeo = (() => {
    const p = [
      [0, 0],
      [0.07, 0],
      [0.09, 0.006],
      [0.13, 0.014],
      [0.135, 0.019],
      [0.13, 0.021],
      [0.09, 0.015],
      [0.075, 0.011],
      [0, 0.011],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    return new THREE.LatheGeometry(p, 32)
  })()

  const candleGeo = {
    votive: new THREE.CylinderGeometry(0.034, 0.03, 0.075, 14),
    flame: new THREE.SphereGeometry(0.01, 8, 6),
  }

  function candle(x, y, z, glowSize = 0.42) {
    add(M.votive, candleGeo.votive, mat(x, y + 0.0375, z), { cast: false })
    add(M.flame, candleGeo.flame, mat(x, y + 0.085, z, { sy: 2.4 }), { cast: false, receive: false })
    glow([x, y + 0.09, z], glowSize, { color: '#ffb35c', opacity: 0.85, kind: 'candle' })
    glow([x, y + 0.09, z], glowSize * 3.2, { color: '#ff8f3a', opacity: 0.1, kind: 'candle' })
  }

  // Place setting for one seat, facing from (sx, sz) toward the table centre
  function setting(cx, cz, angle, radius, top) {
    const px = cx + Math.sin(angle) * radius
    const pz = cz + Math.cos(angle) * radius
    add(M.porcelain, plateGeo, mat(px, top, pz), { cast: false })
    // folded napkin on the plate
    const n = boxGeo(0.12, 0.022, 0.08)
    add(M.linen, n, mat(px, top + 0.022, pz, { ry: angle + 0.3 }), { cast: false })
    n.dispose()
    // Glass to the right of the plate
    const gx = px + Math.sin(angle + 1.1) * 0.17 - Math.sin(angle) * 0.1
    const gz = pz + Math.cos(angle + 1.1) * 0.17 - Math.cos(angle) * 0.1
    add(M.glass, wineGlass, mat(gx, top, gz), { cast: false, receive: false })
    // Cutlery either side
    for (const side of [-1, 1]) {
      const g = boxGeo(0.014, 0.004, 0.19)
      const off = side * 0.16
      add(M.silver, g, mat(px + Math.cos(angle) * off, top + 0.002, pz - Math.sin(angle) * off, { ry: angle }), { cast: false })
      g.dispose()
    }
  }

  function roundTable(x, z, r, seats, { candleOn = true, settings = true, rot = Math.PI / 4, smooth = false } = {}) {
    const top = 0.76
    const segs = smooth ? 96 : 40
    const cloth = new THREE.CylinderGeometry(r, r + 0.06, top - 0.02, segs, 1, true)
    add(M.linen, cloth, mat(x, (top - 0.02) / 2 + 0.02, z))
    cloth.dispose()
    const disc = new THREE.CylinderGeometry(r, r, 0.02, segs)
    add(M.linen, disc, mat(x, top - 0.01, z))
    disc.dispose()
    blob(x, z, r * 3.2)
    for (let i = 0; i < seats; i++) {
      const a = rot + (i / seats) * Math.PI * 2
      chair(x + Math.sin(a) * (r + 0.36), z + Math.cos(a) * (r + 0.36), x, z)
      if (settings) setting(x, z, a, r - 0.2, top)
    }
    if (candleOn) candle(x, top, z)
  }

  function squareTable(x, z, size, { candleOn = true } = {}) {
    const top = 0.76
    box(M.linen, [x - size / 2, 0.02, z - size / 2], [x + size / 2, top, z + size / 2])
    blob(x, z, size * 1.9)
    if (candleOn) candle(x, top, z)
  }

  // ---- Vestibule & host stand ----

  // Slatted walnut screens either side of the entrance
  for (const s of [-1, 1]) {
    const x = s * 2.0
    for (let z = ROOM.z0 - 0.08; z > -3.4; z -= 0.1) {
      box(M.walnut, [x - 0.03, 0, z - 0.04], [x + 0.03, 2.75, z], { cast: true })
    }
    box(M.walnut, [x - 0.06, 2.75, -3.42], [x + 0.06, 2.85, ROOM.z0], { cast: false })
    box(M.brass, [x - 0.05, 0, -3.42], [x + 0.05, 0.06, ROOM.z0], { cast: false })
  }
  // Entrance mat
  box(M.iron, [-0.8, 0.004, -1.6], [0.8, 0.014, -0.5], { cast: false })

  // Host stand
  {
    const hx = 1.25
    const hz = -3.95
    box(M.walnut, [hx - 0.45, 0, hz - 0.25], [hx + 0.45, 1.05, hz + 0.25])
    box(M.brass, [hx - 0.46, 0, hz + 0.24], [hx + 0.46, 0.08, hz + 0.27], { cast: false })
    for (let fx = hx - 0.38; fx <= hx + 0.39; fx += 0.08) {
      box(M.walnut, [fx - 0.018, 0.1, hz + 0.25], [fx + 0.018, 1.0, hz + 0.27], { cast: false })
    }
    box(M.marble, [hx - 0.5, 1.05, hz - 0.3], [hx + 0.5, 1.09, hz + 0.3])
    box(M.book, [hx - 0.24, 1.09, hz - 0.08], [hx + 0.08, 1.11, hz + 0.16], { cast: false })
    // Brass reading lamp
    const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8)
    add(M.brass, stem, mat(hx + 0.32, 1.3, hz - 0.12))
    stem.dispose()
    const shade = new THREE.CylinderGeometry(0.05, 0.11, 0.12, 20, 1, true)
    add(M.shade, shade, mat(hx + 0.32, 1.52, hz - 0.12), { cast: false })
    shade.dispose()
    glow([hx + 0.32, 1.47, hz - 0.12], 0.5, { color: '#ffc27e', opacity: 0.28 })
    blob(hx, hz, 1.5, 1.0)
    // Set back from the shade so it lights the stand without burning the shade out
    const lamp = new THREE.PointLight('#ffb870', 2.2, 5, 2)
    lamp.position.set(hx - 0.1, 1.9, hz + 0.6)
    light(lamp, 'interior')
  }
  // A tall olive tree beside the host stand
  {
    box(M.lacquer, [2.6, 0, -4.4], [3.2, 0.7, -3.8])
    const trunk = new THREE.CylinderGeometry(0.035, 0.05, 1.6, 8)
    add(M.walnut, trunk, mat(2.9, 1.4, -4.1, { rz: 0.06 }))
    trunk.dispose()
    for (let i = 0; i < 9; i++) {
      const g = new THREE.IcosahedronGeometry(seededRange(rand, 0.22, 0.34), 1)
      add(M.foliage, g, mat(2.9 + seededRange(rand, -0.35, 0.35), seededRange(rand, 1.9, 2.6), -4.1 + seededRange(rand, -0.35, 0.35)))
      g.dispose()
    }
    blob(2.9, -4.1, 1.2)
  }

  // ---- Window tables (seen from the street) ----

  M.card.map = tex(T.tentCardTexture())
  for (const s of [-1, 1]) {
    const x = s * 5.0
    const z = -1.9
    roundTable(x, z, 0.42, 2, { rot: Math.PI / 2, smooth: true })
    if (s > 0) {
      // A folded "Réservé" card, turned toward the room
      const ry = Math.atan2(3.75 - x, -4.5 - z)
      for (const lean of [-0.28, 0.28]) {
        const g = new THREE.PlaneGeometry(0.1, 0.055)
        // Hinged along the top fold, so the two faces form an A-frame
        g.translate(0, -0.0275, 0)
        const m = mat(x - 0.06, 0.762 + 0.053, z - 0.08, { ry }).multiply(new THREE.Matrix4().makeRotationX(lean))
        add(M.card, g, m, { cast: false })
        g.dispose()
      }
    }
    if (high) {
      const alcove = new THREE.PointLight('#ffa95c', 2.4, 4.5, 2)
      alcove.position.set(x, 1.3, z + 0.3)
      light(alcove, 'candle')
    }
  }

  // Velvet drapes framing the shop windows
  {
    const drapeGeo = new THREE.PlaneGeometry(0.5, 3.4, 24, 1)
    const pos = drapeGeo.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 44) * 0.035)
    drapeGeo.computeVertexNormals()
    for (const x of [-7.3, -2.35, 2.35, 7.3]) add(M.drape, drapeGeo, mat(x, 0.02 + 1.7, -0.6))
    drapeGeo.dispose()
    box(M.brass, [-7.6, 3.46, -0.66], [-2.05, 3.49, -0.6], { cast: false })
    box(M.brass, [2.05, 3.46, -0.66], [7.6, 3.49, -0.6], { cast: false })
  }

  // ---- Dining room ----

  // Banquette along the left wall, with two-tops in front of it
  {
    const z0 = -18.6
    const z1 = -5.4
    box(M.walnut, [ROOM.x0, 0, z0], [-7.12, 0.36, z1])
    box(M.velvet, [ROOM.x0 + 0.02, 0.36, z0], [-7.12, 0.48, z1])
    // Channel-tufted back
    for (let z = z1 - 0.02; z > z0; z -= 0.3) {
      const g = new THREE.CylinderGeometry(0.06, 0.06, 0.62, 10)
      add(M.velvet, g, mat(ROOM.x0 + 0.12, 0.84, z - 0.15))
      g.dispose()
    }
    box(M.walnut, [ROOM.x0, 1.15, z0], [ROOM.x0 + 0.22, 1.2, z1], { cast: false })
    blob(-7.45, (z0 + z1) / 2, 1.0, z1 - z0 + 0.4)
    for (const z of [-7, -10, -13, -16]) {
      squareTable(-6.45, z, 0.66)
      chair(-5.62, z, -6.45, z)
      setting(-6.45, z, -Math.PI / 2, 0.16, 0.76)
      setting(-6.45, z, Math.PI / 2, 0.16, 0.76)
    }
  }

  // Round tables: a central row of four-tops, a second row, and wall tables
  roundTable(-2.6, -7.6, 0.62, 4)
  roundTable(-2.6, -11.6, 0.62, 4, { rot: 0 })
  roundTable(-2.6, -15.6, 0.62, 4)
  roundTable(1.25, -9.6, 0.62, 4, { rot: 0 })
  roundTable(1.25, -13.6, 0.62, 4)
  roundTable(5.4, -7.4, 0.45, 2, { rot: Math.PI / 2 })
  roundTable(5.4, -10.8, 0.45, 2, { rot: Math.PI / 2 })

  // Arched antique mirrors and sconces along both walls
  {
    // Frame and glass share an origin; the glass is the frame's inset outline
    const mirrorGeo = new THREE.ShapeGeometry(archShape(1.64, 2.48, 0.07), 24)
    const frameShape = archShape(1.64, 2.48)
    frameShape.holes.push(archShape(1.64, 2.48, 0.07))
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.04, bevelEnabled: false, curveSegments: 24 })
    for (const s of [-1, 1]) {
      const wallX = s < 0 ? ROOM.x0 + 0.03 : ROOM.x1 - 0.03
      const ry = s < 0 ? Math.PI / 2 : -Math.PI / 2
      const y0 = s < 0 ? 1.38 : 1.3
      for (const z of [-7.2, -11.0, -14.8]) {
        add(M.mirror, mirrorGeo, mat(wallX + s * -0.005, y0, z, { ry }), { cast: false })
        add(M.brass, frameGeo, mat(wallX - s * 0.01, y0, z, { ry }), { cast: false })
      }
      for (const z of [-5.3, -9.1, -12.9, -16.7]) {
        const sx = wallX - s * 0.12
        box(M.brass, [sx - 0.04, 2.1, z - 0.06], [sx + 0.04, 2.3, z + 0.06], { cast: false })
        const shade = new THREE.CylinderGeometry(0.06, 0.09, 0.16, 16, 1, true)
        add(M.shade, shade, mat(wallX - s * 0.18, 2.42, z), { cast: false })
        shade.dispose()
        glow([wallX - s * 0.18, 2.38, z], 0.8, { color: '#ffbf78', opacity: 0.34 })
      }
    }
    mirrorGeo.dispose()
    frameGeo.dispose()
  }

  // Chandeliers: brass ring, candle bulbs, crystal-glint glows
  const chandeliers = [
    [-0.7, -8.6],
    [-0.7, -13.6],
  ]
  for (const [cx, cz] of chandeliers) {
    const y = 3.15
    const rod = new THREE.CylinderGeometry(0.012, 0.012, ROOM.h - y, 6)
    add(M.brass, rod, mat(cx, y + (ROOM.h - y) / 2, cz), { cast: false })
    rod.dispose()
    for (const [r, dy] of [
      [0.62, 0],
      [0.38, 0.32],
    ]) {
      const ring = new THREE.TorusGeometry(r, 0.016, 8, 48)
      add(M.brass, ring, mat(cx, y + dy, cz, { rx: Math.PI / 2 }), { cast: false })
      ring.dispose()
      const n = r > 0.5 ? 12 : 8
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const bx = cx + Math.cos(a) * r
        const bz = cz + Math.sin(a) * r
        const cup = new THREE.CylinderGeometry(0.02, 0.012, 0.03, 8)
        add(M.brass, cup, mat(bx, y + dy + 0.03, bz), { cast: false })
        cup.dispose()
        add(M.bulb, candleGeo.flame, mat(bx, y + dy + 0.075, bz, { sx: 1.4, sy: 3, sz: 1.4 }), { cast: false, receive: false })
        glow([bx, y + dy + 0.08, bz], 0.32, { color: '#ffd29a', opacity: 0.55 })
      }
    }
    glow([cx, y + 0.1, cz], 3.4, { color: '#ffb468', opacity: 0.18 })

    if (high) {
      const spot = new THREE.SpotLight('#ffcf98', 26, 9, 1.0, 0.75, 2)
      spot.position.set(cx, y - 0.05, cz)
      spot.target.position.set(cx, 0, cz)
      spot.castShadow = true
      spot.shadow.mapSize.set(1024, 1024)
      spot.shadow.bias = -0.0004
      spot.shadow.radius = 4
      spot.shadow.camera.near = 0.5
      spot.shadow.camera.far = 6
      light(spot, 'interior')
    }
    const fill = new THREE.PointLight('#ffbc7c', high ? 5 : 12, 11, 2)
    fill.position.set(cx, y + 0.2, cz)
    light(fill, 'interior')
  }

  // ---- The bar ----

  {
    const x0 = -0.2
    const x1 = 6.4
    // Counter: fluted walnut front, black marble top, brass foot rail
    box(M.walnut, [x0, 0, -20.1], [x1, 1.04, -19.35])
    for (let fx = x0 + 0.04; fx < x1; fx += 0.075) {
      const g = new THREE.CylinderGeometry(0.03, 0.03, 0.96, 8, 1, false, 0, Math.PI)
      add(M.walnut, g, mat(fx, 0.52, -19.35), { cast: false })
      g.dispose()
    }
    box(M.marble, [x0 - 0.06, 1.04, -20.16], [x1 + 0.06, 1.1, -19.24])
    const rail = new THREE.CylinderGeometry(0.025, 0.025, x1 - x0, 12)
    add(M.brass, rail, mat((x0 + x1) / 2, 0.22, -19.12, { rz: Math.PI / 2 }), { cast: false })
    rail.dispose()
    blob((x0 + x1) / 2, -19.7, x1 - x0 + 1, 1.6)

    // Stools
    for (let sx = x0 + 0.8; sx < x1 - 0.3; sx += 1.2) {
      const stem = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8)
      add(M.brass, stem, mat(sx, 0.36, -18.85))
      stem.dispose()
      const foot = new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20)
      add(M.brass, foot, mat(sx, 0.015, -18.85))
      foot.dispose()
      const seat = new THREE.CylinderGeometry(0.2, 0.18, 0.09, 20)
      add(M.velvet, seat, mat(sx, 0.77, -18.85))
      seat.dispose()
      blob(sx, -18.85, 0.6)
    }

    // Back bar: an arched, backlit niche of bottles
    const archW = 5.0
    const archH = 3.3
    const ax = (x0 + x1) / 2
    const inner = () => archShape(archW + 0.3, archH + 0.15, 0.15)
    const backGeo = new THREE.ShapeGeometry(inner(), 32)
    // Shape UVs come out in shape units; normalise them for the backlight map
    const uv = backGeo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / archW + 0.5, uv.getY(i) / archH)
    add(M.backlight, backGeo, mat(ax, 0.95, ROOM.z1 + 0.02), { cast: false, receive: false })
    backGeo.dispose()
    const frame = archShape(archW + 0.3, archH + 0.15)
    frame.holes.push(inner())
    const frameGeo = new THREE.ExtrudeGeometry(frame, { depth: 0.12, bevelEnabled: false, curveSegments: 32 })
    add(M.brass, frameGeo, mat(ax, 0.95, ROOM.z1), { cast: false })
    frameGeo.dispose()
    box(M.walnut, [ax - archW / 2 - 0.2, 0, ROOM.z1], [ax + archW / 2 + 0.2, 0.95, ROOM.z1 + 0.55])
    box(M.marble, [ax - archW / 2 - 0.22, 0.95, ROOM.z1], [ax + archW / 2 + 0.22, 0.99, ROOM.z1 + 0.58])

    const bottle = (() => {
      const p = [
        [0, 0],
        [0.036, 0],
        [0.038, 0.01],
        [0.038, 0.2],
        [0.03, 0.235],
        [0.013, 0.26],
        [0.012, 0.32],
        [0.014, 0.325],
        [0, 0.325],
      ].map(([r, y]) => new THREE.Vector2(r, y))
      return new THREE.LatheGeometry(p, 12)
    })()
    const bottleMats = [M.bottleGreen, M.bottleAmber, M.bottleClear, M.bottleGreen, M.bottleAmber]
    for (const [shelfY, half] of [
      [1.3, 2.2],
      [1.95, 2.2],
      [2.6, 1.9],
      [3.22, 1.15],
    ]) {
      box(M.glass, [ax - half, shelfY - 0.02, ROOM.z1 + 0.04], [ax + half, shelfY, ROOM.z1 + 0.34], { cast: false, receive: false })
      box(M.brass, [ax - half, shelfY - 0.025, ROOM.z1 + 0.33], [ax + half, shelfY, ROOM.z1 + 0.35], { cast: false })
      for (let bx = ax - half + 0.1; bx < ax + half - 0.05; bx += seededRange(rand, 0.1, 0.16)) {
        const material = bottleMats[Math.floor(rand() * bottleMats.length)]
        const scale = seededRange(rand, 0.85, 1.12)
        add(material, bottle, mat(bx, shelfY, ROOM.z1 + 0.2, { sx: scale, sy: scale, sz: scale }), { cast: false })
      }
    }

    // Pendants over the counter
    for (const px of [0.9, 3.1, 5.3]) {
      const cord = new THREE.CylinderGeometry(0.006, 0.006, ROOM.h - 2.7, 4)
      add(M.iron, cord, mat(px, 2.7 + (ROOM.h - 2.7) / 2, -19.7), { cast: false })
      cord.dispose()
      const dome = new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)
      add(M.brass, dome, mat(px, 2.55, -19.7), { cast: false })
      dome.dispose()
      add(M.bulb, candleGeo.flame, mat(px, 2.52, -19.7, { sx: 4, sy: 4, sz: 4 }), { cast: false, receive: false })
      glow([px, 2.48, -19.7], 0.9, { color: '#ffcf96', opacity: 0.38 })
    }
    const barLight = new THREE.PointLight('#ffb66e', high ? 9 : 14, 8, 2)
    barLight.position.set(ax, 2.2, -19.2)
    light(barLight, 'interior')
    bottle.dispose()

    // Wine wall, left of the bar: racked bottles behind glass
    const wx0 = ROOM.x0 + 0.3
    const wx1 = -1.0
    box(M.iron, [wx0 - 0.08, 0, ROOM.z1], [wx1 + 0.08, 3.7, ROOM.z1 + 0.42])
    const lying = new THREE.CylinderGeometry(0.036, 0.036, 0.3, 10)
    lying.rotateX(Math.PI / 2)
    const cols = high ? 12 : 8
    for (let r = 0; r < 14; r++) {
      for (let c = 0; c < cols; c++) {
        const bx = wx0 + 0.25 + (c / (cols - 1)) * (wx1 - wx0 - 0.5)
        const by = 0.35 + r * 0.24
        add(rand() > 0.4 ? M.bottleGreen : M.bottleAmber, lying, mat(bx, by, ROOM.z1 + 0.55), { cast: false })
      }
    }
    lying.dispose()
    for (const lx of [wx0 + 0.05, (wx0 + wx1) / 2, wx1 - 0.05]) {
      box(M.led, [lx - 0.015, 0.2, ROOM.z1 + 0.43], [lx + 0.015, 3.6, ROOM.z1 + 0.46], { cast: false, receive: false })
    }
    const wineGlassPane = new THREE.PlaneGeometry(wx1 - wx0, 3.6)
    add(M.shopGlass, wineGlassPane, mat((wx0 + wx1) / 2, 1.85, ROOM.z1 + 0.78), { cast: false, receive: false })
    wineGlassPane.dispose()
  }

  // ---- The signature table ----

  const DISH = { x: 5.1, y: 0.76, z: -14.6 }
  {
    const tx = 5.35
    const tz = -14.6
    roundTable(tx, tz, 0.5, 0, { candleOn: false, settings: false, smooth: true })
    chair(tx - 0.86, tz, tx, tz)
    chair(tx + 0.86, tz, tx, tz)
    // Opposite place, simply laid
    setting(tx, tz, Math.PI / 2, 0.26, 0.76)
    candle(tx + 0.02, 0.76, tz - 0.22, 0.38)

    const { x, y, z } = DISH
    // Linen runner under the plate, slate charger, black stoneware plate
    box(M.linen, [x - 0.2, y, z - 0.18], [x + 0.2, y + 0.004, z + 0.2], { cast: false })
    const charger = new THREE.CylinderGeometry(0.16, 0.16, 0.008, 48)
    add(M.iron, charger, mat(x, y + 0.008, z))
    charger.dispose()
    const plateP = [
      [0, 0],
      [0.06, 0],
      [0.075, 0.006],
      [0.08, 0.016],
      [0.13, 0.026],
      [0.135, 0.03],
      [0.13, 0.032],
      [0.08, 0.02],
      [0.07, 0.012],
      [0, 0.012],
    ].map(([r, py]) => new THREE.Vector2(r, py))
    const bowl = new THREE.LatheGeometry(plateP, 48)
    add(M.stoneware, bowl, mat(x, y + 0.012, z))
    bowl.dispose()

    // Tagliolini nest: ribbons spiralling up into a soft dome
    const base = y + 0.024
    const strands = high ? 64 : 34
    for (let i = 0; i < strands; i++) {
      const phase = rand() * Math.PI * 2
      const turns = seededRange(rand, 1.6, 2.8)
      const R = seededRange(rand, 0.048, 0.07)
      const lift = seededRange(rand, 0.016, 0.026)
      const pts = []
      for (let k = 0; k <= 26; k++) {
        const t = k / 26
        const a = phase + t * turns * Math.PI * 2
        const r = R * (1 - t * 0.86) + Math.sin(t * 11 + phase) * 0.0035
        const h = Math.sin(t * Math.PI * 0.8) * lift + t * 0.01 + (rand() - 0.5) * 0.002
        pts.push(new THREE.Vector3(x + Math.cos(a) * r, base + h, z + Math.sin(a) * r * 0.92))
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.0014, 5, false)
      add(i % 3 ? M.pasta : M.pastaDeep, tube, null)
      tube.dispose()
    }
    // Wild mushrooms: caps and stems tucked into the nest
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4
      const r = seededRange(rand, 0.03, 0.055)
      const mx = x + Math.cos(a) * r
      const mz = z + Math.sin(a) * r
      const my = base + seededRange(rand, 0.018, 0.028)
      const cap = new THREE.SphereGeometry(0.013, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      add(M.mushroom, cap, mat(mx, my, mz, { sy: 0.6, rx: seededRange(rand, -0.5, 0.5), rz: seededRange(rand, -0.5, 0.5) }))
      cap.dispose()
      const stem = new THREE.CylinderGeometry(0.004, 0.006, 0.016, 8)
      add(M.mushroomStem, stem, mat(mx, my - 0.008, mz))
      stem.dispose()
    }
    // Black truffle shaved over the top
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2
      const r = rand() * 0.03
      const disc = new THREE.CylinderGeometry(0.0075, 0.0075, 0.0009, 14)
      add(M.truffle, disc, mat(x + Math.cos(a) * r, base + 0.033 + rand() * 0.005, z + Math.sin(a) * r, { rx: seededRange(rand, -0.5, 0.5), rz: seededRange(rand, -0.5, 0.5) }))
      disc.dispose()
    }
    // Parmesan shavings
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2
      const r = rand() * 0.04
      const sh = boxGeo(0.014, 0.001, 0.007)
      add(M.parmesan, sh, mat(x + Math.cos(a) * r, base + 0.031 + rand() * 0.006, z + Math.sin(a) * r, { ry: rand() * Math.PI, rx: 0.3 }))
      sh.dispose()
    }
    // A few herb leaves
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2
      const leaf = new THREE.SphereGeometry(0.008, 8, 6)
      add(M.herb, leaf, mat(x + Math.cos(a) * 0.02, base + 0.037, z + Math.sin(a) * 0.02, { sx: 1.6, sy: 0.2, sz: 0.7, ry: a }))
      leaf.dispose()
    }

    // Cutlery, wine glass and water glass
    // Fork (left): handle, neck and four tines
    const cut = (geo, px, pz, opts) => {
      add(M.silver, geo, mat(px, y + 0.007, pz, opts))
      geo.dispose()
    }
    cut(boxGeo(0.011, 0.004, 0.12), x - 0.2, z + 0.07)
    cut(boxGeo(0.016, 0.003, 0.035), x - 0.2, z - 0.01)
    for (let t = 0; t < 4; t++) cut(boxGeo(0.0025, 0.0025, 0.04), x - 0.2 - 0.006 + t * 0.004, z - 0.045)
    // Knife (right): handle and a tapering blade
    cut(boxGeo(0.012, 0.005, 0.1), x + 0.2, z + 0.08)
    const blade = new THREE.CylinderGeometry(0.0001, 0.009, 0.12, 3, 1)
    blade.rotateX(-Math.PI / 2)
    blade.scale(1, 0.18, 1)
    cut(blade, x + 0.2, z - 0.025)
    add(M.glass, wineGlass, mat(x + 0.24, y, z - 0.24), { cast: false, receive: false })
    const tumbler = new THREE.CylinderGeometry(0.034, 0.03, 0.1, 18, 1, true)
    add(M.glass, tumbler, mat(x + 0.12, y + 0.05, z - 0.3), { cast: false, receive: false })
    tumbler.dispose()

    // A narrow warm key light on the plate
    const key = new THREE.SpotLight('#ffd2a0', high ? 7 : 9, 4, 0.32, 0.85, 2)
    key.position.set(x - 0.9, y + 1.6, z - 0.4)
    key.target.position.set(x, y, z)
    if (high) {
      key.castShadow = true
      key.shadow.mapSize.set(1024, 1024)
      key.shadow.bias = -0.0002
      key.shadow.radius = 3
      key.shadow.camera.near = 0.6
      key.shadow.camera.far = 3.5
    }
    light(key, 'candle')
  }

  // Soft fill for street and room alike
  const hemi = new THREE.HemisphereLight('#3a4466', '#2a160c', MOODS.dusk.hemi)
  scene.add(hemi)

  // ---------------- Merge ----------------

  for (const batch of batches.values()) {
    const merged = mergeGeometries(batch.geos, false)
    for (const g of batch.geos) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, batch.material)
    mesh.castShadow = batch.cast && high
    mesh.receiveShadow = batch.receive && high
    mesh.matrixAutoUpdate = false
    root.add(mesh)
  }
  batches.clear()

  // The wet-street streaks are aimed at the street-side camera; seen from
  // indoors they read as stray rays through the glass, so they are hidden there.
  const streakMeshes = root.children.filter((o) => o.isMesh && [...streakMats.values()].includes(o.material))
  chairParts.velvet.dispose()
  chairParts.wood.dispose()
  wineGlass.dispose()
  plateGeo.dispose()
  candleGeo.votive.dispose()
  candleGeo.flame.dispose()

  renderer.shadowMap.needsUpdate = true

  // ---------------- Camera path ----------------
  // One curve per chapter segment, through that segment's via points. The
  // camera rests at every chapter mark, so the joins are never seen in motion.

  const v3 = (a) => new THREE.Vector3(...a)
  const segments = []
  for (let i = 0; i < chapters.length - 1; i++) {
    const from = chapters[i]
    const to = chapters[i + 1]
    const curve = (stops, key) =>
      stops.length > 2
        ? new THREE.CatmullRomCurve3(stops.map((s) => v3(s[key])), false, 'centripetal')
        : new THREE.LineCurve3(v3(stops[0][key]), v3(stops[1][key]))
    const stops = [from.camera, ...(to.via || []), to.camera]
    const segment = { pos: curve(stops, 'position'), target: curve(stops, 'target'), from, to }
    // Chapters may give phones their own framing; that path is blended in by
    // how portrait the screen is, so landscape screens never see it.
    if (from.portraitCamera || to.portraitCamera) {
      const tall = [from.portraitCamera || from.camera, ...(to.via || []), to.portraitCamera || to.camera]
      segment.posTall = curve(tall, 'position')
      segment.targetTall = curve(tall, 'target')
    }
    segments.push(segment)
  }
  const parallaxFor = (chapter) => (chapter.id === 'arrival' ? 0.6 : chapter.id === 'dish' ? 0.025 : 0.1)

  // ---------------- State & loop ----------------

  const state = {
    progress: 0,
    progressTarget: 0,
    pointer: new THREE.Vector2(),
    pointerTarget: new THREE.Vector2(),
    mood: 0,
    moodTarget: 0,
    active: true,
    frame: 0,
    last: 0,
    width: 1,
    height: 1,
    portrait: 0,
  }

  const camPos = new THREE.Vector3()
  const camTarget = new THREE.Vector3()
  const right = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  const flameBase = M.flame.color.clone()
  const bulbBase = M.bulb.color.clone()
  const ledBase = M.led.color.clone()
  const backlightBase = M.backlight.color.clone()
  const lanternBase = M.lanternGlow.color.clone()

  function applyMood(t) {
    const a = MOODS.dusk
    const b = MOODS.late
    sky.uniforms.topColor.value.copy(a.skyTop).lerp(b.skyTop, t)
    sky.uniforms.horizonColor.value.copy(a.skyHorizon).lerp(b.skyHorizon, t)
    sky.uniforms.glowColor.value.copy(a.glow).lerp(b.glow, t)
    sky.uniforms.glowStrength.value = lerp(a.glowStrength, b.glowStrength, t)
    scene.fog.color.copy(a.fog).lerp(b.fog, t)
    hemi.intensity = lerp(a.hemi, b.hemi, t)
    starMat.opacity = lerp(a.stars, b.stars, t)
    const scale = {
      interior: lerp(a.interior, b.interior, t),
      candle: lerp(a.candle, b.candle, t),
      street: lerp(a.street, b.street, t),
    }
    for (const l of lights) l.intensity = l.userData.base * scale[l.userData.kind]
    for (const [kind, materials] of Object.entries(glowMaterials)) {
      for (const m of materials) m.opacity = Math.min(1, m.userData.base * scale[kind])
    }
    M.flame.color.copy(flameBase).multiplyScalar(scale.candle)
    M.votive.emissiveIntensity = 1.3 * scale.candle
    M.bulb.color.copy(bulbBase).multiplyScalar(scale.interior)
    M.led.color.copy(ledBase).multiplyScalar(scale.interior)
    M.backlight.color.copy(backlightBase).multiplyScalar(lerp(1, 0.75, t))
    M.shade.emissiveIntensity = 0.32 * scale.interior
    M.lanternGlow.color.copy(lanternBase).multiplyScalar(scale.street)
    M.windowLit.emissiveIntensity = lerp(0.9, 0.6, t)
    signMat.emissiveIntensity = lerp(1.4, 1.7, t)
    renderer.toneMappingExposure = lerp(a.exposure, b.exposure, t)
  }

  function updateCamera() {
    const { index, travel } = segmentAt(state.progress, segments.length)
    const seg = segments[index]
    seg.pos.getPointAt(travel, camPos)
    seg.target.getPointAt(travel, camTarget)
    if (seg.posTall && state.portrait > 0) {
      camPos.lerp(seg.posTall.getPointAt(travel, tmp), state.portrait)
      camTarget.lerp(seg.targetTall.getPointAt(travel, tmp), state.portrait)
    }

    // Portrait screens: step back along the view axis where the chapter allows
    if (state.portrait > 0) {
      const push = lerp(seg.from.portraitPush || 0, seg.to.portraitPush || 0, travel) * state.portrait
      if (push > 0) {
        forward.subVectors(camPos, camTarget)
        camPos.addScaledVector(forward, push)
      }
    }

    camera.position.copy(camPos)
    camera.lookAt(camTarget)

    // Pointer parallax in the camera's own frame: a gentle head movement,
    // kept tiny indoors so the camera never leans into furniture
    if (state.pointer.lengthSq() > 1e-6) {
      const amount = lerp(parallaxFor(seg.from), parallaxFor(seg.to), travel)
      right.setFromMatrixColumn(camera.matrix, 0)
      camUp.setFromMatrixColumn(camera.matrix, 1)
      camera.position.addScaledVector(right, state.pointer.x * amount)
      camera.position.addScaledVector(camUp, state.pointer.y * amount * 0.5)
      camera.lookAt(camTarget)
    }
  }

  function render() {
    updateCamera()
    const outside = camera.position.z > 0.2
    for (const mesh of streakMeshes) mesh.visible = outside
    if (composer) composer.render()
    else renderer.render(scene, camera)
    if (onRender) onRender(project, state.progress)
  }

  function project(position) {
    tmp.set(position[0], position[1], position[2]).project(camera)
    return {
      x: (tmp.x * 0.5 + 0.5) * state.width,
      y: (-tmp.y * 0.5 + 0.5) * state.height,
      visible: tmp.z < 1 && Math.abs(tmp.x) < 0.94 && Math.abs(tmp.y) < 0.9,
    }
  }

  function tick(now) {
    state.frame = 0
    if (!state.active) return
    const dt = Math.min((now - (state.last || now)) / 1000, 0.1)
    state.last = now

    // Frame-rate independent damping
    const kProgress = 1 - Math.exp(-dt * 4.5)
    const kPointer = 1 - Math.exp(-dt * 3)
    const kMood = 1 - Math.exp(-dt * 2.2)

    state.progress += (state.progressTarget - state.progress) * kProgress
    state.pointer.lerp(state.pointerTarget, kPointer)
    state.mood += (state.moodTarget - state.mood) * kMood
    applyMood(state.mood)
    render()

    const settled =
      Math.abs(state.progressTarget - state.progress) < 1e-4 &&
      state.pointer.distanceToSquared(state.pointerTarget) < 1e-6 &&
      Math.abs(state.moodTarget - state.mood) < 1e-3

    if (settled) {
      state.progress = state.progressTarget
      state.pointer.copy(state.pointerTarget)
      state.mood = state.moodTarget
      state.last = 0
      applyMood(state.mood)
      render()
      return
    }
    state.frame = requestAnimationFrame(tick)
  }

  function invalidate() {
    if (!state.frame && state.active) state.frame = requestAnimationFrame(tick)
  }

  function resize(width, height) {
    state.width = Math.max(1, width)
    state.height = Math.max(1, height)
    const aspect = state.width / state.height
    // 0 on landscape, rising to 1 on a tall phone
    state.portrait = clamp01((1.05 - aspect) / 0.55)
    camera.aspect = aspect
    camera.fov = aspect >= 1.6 ? 38 : aspect >= 1.25 ? 44 : aspect >= 0.85 ? 52 : 62
    camera.updateProjectionMatrix()
    renderer.setSize(state.width, state.height, false)
    if (composer) {
      composer.setPixelRatio(pixelRatio)
      composer.setSize(state.width, state.height)
    }
    render()
  }

  // Redraw the sign once the brand serif has arrived
  signage.ready.then(() => invalidate())

  // ---------------- Context loss ----------------

  const onLost = (event) => {
    event.preventDefault()
    state.active = false
    if (onContextLost) onContextLost()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  applyMood(0)

  return {
    setProgress(value, { instant = false } = {}) {
      state.progressTarget = clamp01(value)
      if (instant) state.progress = state.progressTarget
      invalidate()
    },
    setPointer(x, y) {
      state.pointerTarget.set(x, y)
      invalidate()
    },
    setMood(value, { instant = false } = {}) {
      state.moodTarget = value
      if (instant) {
        state.mood = value
        applyMood(value)
      }
      invalidate()
    },
    setActive(active) {
      state.active = active
      if (active) invalidate()
      else if (state.frame) {
        cancelAnimationFrame(state.frame)
        state.frame = 0
        state.last = 0
      }
    },
    resize,
    render,
    dispose() {
      state.active = false
      if (state.frame) cancelAnimationFrame(state.frame)
      canvas.removeEventListener('webglcontextlost', onLost)
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material?.dispose?.()
      })
      for (const l of lights) l.shadow?.map?.dispose()
      for (const texture of disposables) texture.dispose()
      for (const material of Object.values(M)) material?.dispose?.()
      neighbourStone.dispose()
      envTarget.dispose()
      bloom?.dispose()
      output?.dispose()
      composer?.dispose()
      renderer.dispose()
    },
  }
}
