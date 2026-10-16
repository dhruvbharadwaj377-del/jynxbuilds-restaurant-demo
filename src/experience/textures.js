// Procedural canvas textures for the Maison Noir scene.
// Everything is drawn at load time, so the 3D view downloads no image files.

import * as THREE from 'three'

// Seeded random so the composition is identical on every visit.
export function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function canvasTexture(width, height, draw, { srgb = true, repeat, anisotropy = 4 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  texture.anisotropy = anisotropy
  return texture
}

function speckle(ctx, w, h, rand, count, rgb, alpha, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = `rgba(${rgb}, ${alpha * (0.4 + rand() * 0.6)})`
    const s = 0.5 + rand() * size
    ctx.fillRect(rand() * w, rand() * h, s, s)
  }
}

// Cut limestone with horizontal coursing (one texture tile = 2 m × 1.6 m)
export function limestoneTexture(rand) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#cbbda4'
      ctx.fillRect(0, 0, w, h)
      // Soft mottling
      for (let i = 0; i < 160; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = 20 + rand() * 70
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        const dark = rand() > 0.5
        g.addColorStop(0, dark ? 'rgba(120, 104, 82, 0.08)' : 'rgba(240, 230, 210, 0.08)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
      speckle(ctx, w, h, rand, 2600, '90, 76, 58', 0.18, 1.6)
      // Coursing: four courses per tile, staggered vertical joints
      const course = h / 4
      for (let row = 0; row < 4; row++) {
        const y = row * course
        ctx.fillStyle = 'rgba(70, 58, 44, 0.45)'
        ctx.fillRect(0, y, w, 2)
        ctx.fillStyle = 'rgba(255, 248, 232, 0.18)'
        ctx.fillRect(0, y + 2, w, 1)
        const offset = row % 2 ? w / 4 : 0
        ctx.fillStyle = 'rgba(70, 58, 44, 0.32)'
        for (let x = offset; x < w + 1; x += w / 2) ctx.fillRect(x, y, 2, course)
      }
    },
    { repeat: [1, 1] },
  )
}

// Large wet stone slabs for the pavement
export function pavementTexture(rand) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#2a2826'
      ctx.fillRect(0, 0, w, h)
      const rows = 4
      for (let r = 0; r < rows; r++) {
        const y = (r * h) / rows
        const offset = r % 2 ? w / 6 : 0
        for (let x = -offset; x < w; x += w / 3) {
          const v = 34 + rand() * 12
          ctx.fillStyle = `rgb(${v}, ${v - 2}, ${v - 4})`
          ctx.fillRect(x + 2, y + 2, w / 3 - 4, h / rows - 4)
        }
      }
      speckle(ctx, w, h, rand, 4000, '120, 115, 108', 0.12, 1.4)
    },
    { repeat: [8, 2] },
  )
}

// Roughness for the pavement: puddles read as glossy patches
export function puddleRoughness(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = 'rgb(150,150,150)'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 26; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = 10 + rand() * 40
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, 'rgba(25,25,25,0.95)')
        g.addColorStop(1, 'rgba(25,25,25,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(x, y, r * 1.6, r * 0.7, rand() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    { srgb: false, repeat: [3, 1.5] },
  )
}

export function asphaltTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#171717'
      ctx.fillRect(0, 0, w, h)
      speckle(ctx, w, h, rand, 3000, '90, 90, 90', 0.2, 1.2)
    },
    { repeat: [10, 10] },
  )
}

// Dark smoked-oak herringbone (one tile = 1.6 m square)
export function herringboneTexture(rand) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#2a1a10'
      ctx.fillRect(0, 0, w, h)
      const L = 128
      const W = 32
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(Math.PI / 4)
      for (let i = -12; i < 12; i++) {
        for (let j = -12; j < 12; j++) {
          const x = i * W * 2 + j * W
          const y = j * W * 2 - i * W * 0
          for (let k = 0; k < 2; k++) {
            const tone = 40 + rand() * 26
            ctx.fillStyle = `rgb(${tone + 14}, ${tone - 2}, ${tone - 18})`
            if (k === 0) ctx.fillRect(x, y, L, W - 1.5)
            else ctx.fillRect(x + L - W, y + W, W - 1.5, L)
            // Grain
            ctx.fillStyle = 'rgba(20, 10, 4, 0.25)'
            for (let g = 0; g < 4; g++) {
              if (k === 0) ctx.fillRect(x, y + rand() * W, L, 0.8)
              else ctx.fillRect(x + L - W + rand() * W, y + W, 0.8, L)
            }
          }
        }
      }
      ctx.restore()
    },
    { repeat: [10, 14], anisotropy: 8 },
  )
}

// Walnut wainscot with raised panels (one tile = 1.2 m wide × 1.1 m tall)
export function walnutPanelTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#3a2416'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `rgba(${20 + rand() * 30}, ${10 + rand() * 14}, 4, ${0.12 + rand() * 0.15})`
        ctx.fillRect(0, rand() * h, w, 0.6 + rand() * 1.4)
      }
      // Panel mouldings
      const m = 22
      ctx.strokeStyle = 'rgba(14, 8, 4, 0.7)'
      ctx.lineWidth = 3
      ctx.strokeRect(m, m, w - m * 2, h - m * 2)
      ctx.strokeStyle = 'rgba(160, 110, 70, 0.22)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(m + 3, m + 3, w - m * 2 - 6, h - m * 2 - 6)
    },
    { repeat: [1, 1] },
  )
}

export function walnutTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#3b2415'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(${18 + rand() * 30}, ${8 + rand() * 12}, 3, ${0.1 + rand() * 0.18})`
        ctx.fillRect(rand() * w, 0, 0.6 + rand() * 1.6, h)
      }
    },
    { repeat: [1, 1] },
  )
}

// Deep aubergine-charcoal lime plaster
export function plasterTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#2b1d1d'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 90; i++) {
        const x = rand() * w
        const y = rand() * h
        const r = 10 + rand() * 50
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, rand() > 0.5 ? 'rgba(70, 44, 40, 0.18)' : 'rgba(10, 6, 6, 0.2)')
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
    },
    { repeat: [6, 1] },
  )
}

// Nero Marquina: black marble with fine white veining
export function marbleTexture(rand) {
  return canvasTexture(
    512,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#0d0c0c'
      ctx.fillRect(0, 0, w, h)
      for (let v = 0; v < 18; v++) {
        let x = rand() * w
        let y = rand() * h
        ctx.strokeStyle = `rgba(230, 225, 215, ${0.08 + rand() * 0.28})`
        ctx.lineWidth = 0.4 + rand() * 1.4
        ctx.beginPath()
        ctx.moveTo(x, y)
        const steps = 30 + rand() * 30
        const dir = rand() * Math.PI * 2
        for (let s = 0; s < steps; s++) {
          x += Math.cos(dir + (rand() - 0.5) * 1.6) * 9
          y += Math.sin(dir + (rand() - 0.5) * 1.6) * 5
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    },
    { repeat: [2, 1] },
  )
}

// Matte black stoneware with a fine speckle, for the signature plate
export function stonewareTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#141313'
      ctx.fillRect(0, 0, w, h)
      speckle(ctx, w, h, rand, 1800, '140, 132, 120', 0.25, 1.2)
      speckle(ctx, w, h, rand, 600, '0, 0, 0', 0.5, 1.6)
    },
  )
}

// Warm interior seen through an upper-floor window (curtains half drawn)
export function windowGlowTexture(rand) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#5a3418')
    g.addColorStop(0.35, '#c98a4a')
    g.addColorStop(1, '#6a3c1a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // Curtains
    for (const side of [0, 1]) {
      const cw = w * (0.22 + rand() * 0.12)
      const x = side ? w - cw : 0
      const cg = ctx.createLinearGradient(x, 0, x + cw, 0)
      cg.addColorStop(0, 'rgba(60, 30, 16, 0.92)')
      cg.addColorStop(0.5, 'rgba(110, 60, 30, 0.85)')
      cg.addColorStop(1, 'rgba(60, 30, 16, 0.92)')
      ctx.fillStyle = cg
      ctx.fillRect(x, 0, cw, h)
    }
  })
}

// The name above the door, gold on transparent. Redrawn once the brand serif
// has loaded so it never ships in a fallback face.
export function signageTexture(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 256
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8

  const draw = () => {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#e6c58c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '400 168px "Playfair Display", "Times New Roman", serif'
    // Letter-spaced by hand: canvas letterSpacing is not universal yet
    const letters = [...text]
    const spacing = 46
    const widths = letters.map((ch) => ctx.measureText(ch).width)
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (letters.length - 1)
    let x = (canvas.width - total) / 2
    letters.forEach((ch, i) => {
      ctx.fillText(ch, x + widths[i] / 2, canvas.height / 2 + 8)
      x += widths[i] + spacing
    })
    texture.needsUpdate = true
  }

  draw()
  const ready = document.fonts?.load
    ? document.fonts.load('400 168px "Playfair Display"').then(draw).catch(() => {})
    : Promise.resolve()
  return { texture, ready }
}

// Small street-number plaque
export function plaqueTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1b3a5c'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#e8e2d4'
    ctx.lineWidth = 5
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.fillStyle = '#f2ede2'
    ctx.font = '600 64px "DM Sans", Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('14', w / 2, h / 2 + 3)
  })
}

export function glowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255, 255, 255, 1)')
    g.addColorStop(0.18, 'rgba(255, 226, 180, 0.55)')
    g.addColorStop(0.5, 'rgba(255, 200, 140, 0.12)')
    g.addColorStop(1, 'rgba(255, 190, 130, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

// Soft contact shadow under furniture
export function blobTexture() {
  return canvasTexture(
    64,
    64,
    (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      g.addColorStop(0, 'rgba(0, 0, 0, 0.75)')
      g.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)')
      g.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    },
    { srgb: false },
  )
}

// Warm backlight for the bar's bottle arch
export function backlightTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.75, w * 0.8)
    g.addColorStop(0, '#ffd59a')
    g.addColorStop(0.45, '#c47a34')
    g.addColorStop(1, '#3a1c0a')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

// Black and white marble checkerboard for the vestibule (one tile = 0.8 m)
export function checkerTexture(rand) {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      const n = 2
      const s = w / n
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const dark = (x + y) % 2 === 0
          ctx.fillStyle = dark ? '#121111' : '#d9d2c4'
          ctx.fillRect(x * s, y * s, s, s)
          ctx.strokeStyle = dark ? 'rgba(220, 214, 200, 0.12)' : 'rgba(80, 70, 60, 0.2)'
          for (let v = 0; v < 4; v++) {
            ctx.lineWidth = 0.5 + rand()
            ctx.beginPath()
            ctx.moveTo(x * s + rand() * s, y * s)
            ctx.bezierCurveTo(x * s + rand() * s, y * s + s * 0.3, x * s + rand() * s, y * s + s * 0.7, x * s + rand() * s, y * s + s)
            ctx.stroke()
          }
        }
      }
      ctx.fillStyle = 'rgba(60, 52, 44, 0.6)'
      for (let i = 0; i <= n; i++) {
        ctx.fillRect(i * s - 0.5, 0, 1, h)
        ctx.fillRect(0, i * s - 0.5, w, 1)
      }
    },
    { repeat: [1, 1] },
  )
}

// Vertical light/shadow folds for the velvet drapes
export function foldTexture() {
  return canvasTexture(128, 8, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    for (let i = 0; i <= 8; i++) {
      g.addColorStop(i / 8, i % 2 ? '#8a5058' : '#3a1a1e')
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

// "Réservé" tent card for the table for two
export function tentCardTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#efe7d8'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(150, 110, 60, 0.6)'
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.fillStyle = '#1a1612'
    ctx.font = 'italic 400 46px "Playfair Display", "Times New Roman", serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Réservé', w / 2, h / 2 + 2)
  })
}
