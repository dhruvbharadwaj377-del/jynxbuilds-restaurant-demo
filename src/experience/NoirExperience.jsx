import { useCallback, useEffect, useRef, useState } from 'react'
import { chapters, hotspotIndex } from './chapters.js'
import './experience.css'

const LAST = chapters.length - 1
const STORAGE_KEY = 'maison-noir:view'

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function saveData() {
  return Boolean(navigator.connection?.saveData)
}

// Returns null when 3D should not run at all, otherwise a quality tier.
function detectQuality() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return null
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    return null
  }
  if (saveData()) return null
  if (navigator.deviceMemory && navigator.deviceMemory < 2) return null

  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const small = window.innerWidth < 820
  const fewCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory < 4
  return coarse || small || fewCores || lowMemory ? 'low' : 'high'
}

// 'auto' | '3d' | 'photo'
function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || 'auto'
  } catch {
    return 'auto'
  }
}

function writePreference(view) {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Storage unavailable (private mode): the choice still applies for this visit.
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NoirExperience() {
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const menuRef = useRef(null)
  const blockRefs = useRef([])
  const hotspotRefs = useRef({})
  const sceneRef = useRef(null)
  const activeRef = useRef(0)

  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const finePointer = useMediaQuery('(hover: hover) and (pointer: fine)')

  const [quality] = useState(detectQuality)
  const [preference, setPreference] = useState(readPreference)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState(null)
  const [active, setActive] = useState(0)
  const [mood, setMood] = useState('dusk')
  const [selectedHotspot, setOpenHotspot] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // ----- Which view to show -----
  // The procedural 3D restaurant is the default wherever it can run well;
  // the restaurant's own photography is the fallback and the opt-out.
  const can3D = Boolean(quality) && !failed
  const view = can3D && preference !== 'photo' ? '3d' : 'photo'
  const mode = view === 'photo' ? 'still' : ready ? 'ready' : 'loading'
  const live3D = view === '3d' && ready

  // A feature card only stays open while its chapter is on screen
  const openHotspot =
    selectedHotspot && hotspotIndex[selectedHotspot].chapter === chapters[active].id ? selectedHotspot : null

  // ----- Scroll → progress -----

  const readProgress = useCallback(() => {
    const section = sectionRef.current
    if (!section) return 0
    const rect = section.getBoundingClientRect()
    const range = rect.height - window.innerHeight
    if (range <= 0) return 0
    return Math.min(1, Math.max(0, -rect.top / range))
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const progress = readProgress()
      const chapter = Math.round(progress * LAST)
      if (chapter !== activeRef.current) {
        activeRef.current = chapter
        setActive(chapter)
      }
      const scene = sceneRef.current
      if (scene) {
        // Reduced motion: cut between chapter views instead of travelling
        if (reducedMotion) scene.setProgress(chapter / LAST, { instant: true })
        else scene.setProgress(progress)
      }
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [readProgress, reducedMotion])

  // Escape closes the feature card, then the menu
  useEffect(() => {
    if (!openHotspot && !menuOpen) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (menuOpen) setMenuOpen(false)
      else setOpenHotspot(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openHotspot, menuOpen])

  // Clicking anywhere outside the experience menu closes it
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  // ----- Hotspot projection (runs after every rendered frame, no React work) -----

  const positionHotspots = useCallback((project, progress) => {
    const position = progress * LAST
    // Labels open toward the middle of the frame so they never run off-screen
    const flipAt = (stageRef.current?.clientWidth || window.innerWidth) * 0.6
    chapters.forEach((chapter, index) => {
      const arrived = Math.abs(position - index) < 0.16
      for (const hotspot of chapter.hotspots) {
        const el = hotspotRefs.current[hotspot.id]
        if (!el) continue
        const point = project(hotspot.position)
        const show = arrived && point.visible
        el.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`
        if (el.dataset.visible !== String(show)) el.dataset.visible = String(show)
        const side = point.x > flipAt ? 'left' : 'right'
        if (el.dataset.side !== side) el.dataset.side = side
      }
    })
  }, [])

  // ----- 3D lifecycle -----

  useEffect(() => {
    if (view !== '3d') return undefined

    let cancelled = false
    let scene = null
    let resizeObserver = null
    let visibilityObserver = null
    let onScreen = true

    const fail = () => {
      if (cancelled) return
      sceneRef.current?.dispose()
      sceneRef.current = null
      setNotice('3D unavailable, showing photography')
      setFailed(true)
    }

    // Draw only while the section is on screen and the tab is visible
    const syncActive = () => scene?.setActive(onScreen && document.visibilityState !== 'hidden')

    const start = async () => {
      try {
        const { createRestaurantScene } = await import('./scene.js')
        if (cancelled || !canvasRef.current) return
        scene = createRestaurantScene({
          canvas: canvasRef.current,
          chapters,
          quality,
          onRender: positionHotspots,
          onContextLost: fail,
        })
        sceneRef.current = scene

        const rect = stageRef.current.getBoundingClientRect()
        scene.resize(rect.width, rect.height)

        const progress = readProgress()
        const chapter = Math.round(progress * LAST)
        scene.setProgress(reducedMotion ? chapter / LAST : progress, { instant: true })

        resizeObserver = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect
          scene.resize(width, height)
        })
        resizeObserver.observe(stageRef.current)

        visibilityObserver = new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting
          syncActive()
        })
        visibilityObserver.observe(sectionRef.current)
        document.addEventListener('visibilitychange', syncActive)

        setReady(true)
      } catch (error) {
        console.warn('[Maison Noir] 3D view unavailable, showing photography instead.', error)
        fail()
      }
    }

    // Let the page paint its photographic poster first, then build the scene.
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(start, { timeout: 900 })
      : window.setTimeout(start, 200)

    return () => {
      cancelled = true
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
      resizeObserver?.disconnect()
      visibilityObserver?.disconnect()
      document.removeEventListener('visibilitychange', syncActive)
      scene?.dispose()
      sceneRef.current = null
      setReady(false)
    }
  }, [view, quality, positionHotspots, readProgress, reducedMotion])

  // Lighting mood
  useEffect(() => {
    sceneRef.current?.setMood(mood === 'late' ? 1 : 0, { instant: reducedMotion })
  }, [mood, ready, reducedMotion])

  // Pointer parallax (desktop, 3D only)
  useEffect(() => {
    if (!live3D || !finePointer || reducedMotion) return undefined
    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = (event.clientY / window.innerHeight) * 2 - 1
      sceneRef.current?.setPointer(x, -y)
    }
    const onLeave = () => sceneRef.current?.setPointer(0, 0)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      sceneRef.current?.setPointer(0, 0)
    }
  }, [live3D, finePointer, reducedMotion])

  const goToChapter = (index) => {
    blockRefs.current[index]?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const chooseView = (next) => {
    writePreference(next)
    setPreference(next)
    setNotice(null)
    setOpenHotspot(null)
  }

  const toggleHotspot = (id) => setOpenHotspot(openHotspot === id ? null : id)
  const feature = openHotspot ? hotspotIndex[openHotspot] : null

  const featureList = (chapter) =>
    chapter.hotspots.length > 0 && (
      <div className="noir-card-features">
        <span>In this view</span>
        <ul>
          {chapter.hotspots.map((hotspot) => (
            <li key={hotspot.id}>
              <button
                type="button"
                aria-expanded={openHotspot === hotspot.id}
                aria-controls="noir-feature"
                onClick={() => toggleHotspot(hotspot.id)}
              >
                {hotspot.label}
                <b aria-hidden="true">+</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <section
      ref={sectionRef}
      id="experience"
      className={`noir noir--${mode} noir--${mood}`}
      aria-label="An evening at Maison Noir, in five chapters"
    >
      {/* ================= STAGE (sticky) ================= */}

      <div ref={stageRef} className="noir-stage">
        <div className="noir-stills" aria-hidden="true">
          {chapters.map((chapter, index) => {
            // Outside the photographic view only the poster is kept, so the
            // chapter photos are never downloaded alongside the 3D scene.
            if (mode !== 'still' && index !== 0) return null
            return (
              <img
                key={chapter.id}
                src={chapter.still}
                alt=""
                decoding="async"
                fetchPriority={index === 0 ? 'high' : 'auto'}
                loading={index === 0 ? 'eager' : 'lazy'}
                className={(mode === 'still' ? index === active : true) ? 'is-active' : ''}
              />
            )
          })}
        </div>

        {view === '3d' && <canvas ref={canvasRef} className="noir-canvas" aria-hidden="true" />}

        <div className="noir-scrim" aria-hidden="true" />

        {/* Hotspots, positioned imperatively from the 3D camera. They are a
            pointer shortcut: keyboard and screen-reader users get the same
            features, in reading order, from each chapter's "In this view" list. */}
        <div className="noir-hotspots" aria-hidden="true">
          {live3D &&
            chapters.flatMap((chapter) =>
              chapter.hotspots.map((hotspot) => (
                <button
                  key={hotspot.id}
                  ref={(el) => {
                    hotspotRefs.current[hotspot.id] = el
                  }}
                  type="button"
                  className={`noir-hotspot ${openHotspot === hotspot.id ? 'is-open' : ''}`}
                  data-visible="false"
                  tabIndex={-1}
                  onClick={() => toggleHotspot(hotspot.id)}
                >
                  <span className="noir-hotspot-dot" />
                  <span className="noir-hotspot-label">{hotspot.label}</span>
                </button>
              )),
            )}
        </div>

        {/* Chapter rail */}
        <nav className="noir-rail" aria-label="Experience chapters">
          <ol>
            {chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className={index === active ? 'is-active' : ''}
                  aria-current={index === active ? 'step' : undefined}
                  aria-label={`Chapter ${chapter.index}: ${chapter.label}`}
                  onClick={() => goToChapter(index)}
                >
                  <span>
                    <em>{chapter.index}</em> {chapter.label}
                  </span>
                  <i aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* Feature card (opened from a hotspot or the chapter list) */}
        <div id="noir-feature" className="noir-feature" data-side={active === 3 ? 'left' : 'right'} aria-live="polite">
          {feature && (
            <div className="noir-feature-card">
              <span>In this view</span>
              <h3>{feature.label}</h3>
              <p>{feature.detail}</p>
              <button type="button" onClick={() => setOpenHotspot(null)}>
                Close <b aria-hidden="true">×</b>
              </button>
            </div>
          )}
        </div>

        {/* Status and the experience menu */}
        <div className="noir-controls">
          <div className="noir-status" role="status">
            {mode === 'loading' && <span className="noir-loading">Setting the room</span>}
            {mode !== 'loading' && notice && <span>{notice}</span>}
            {mode === 'still' && !notice && !can3D && <span>Photographic view</span>}
          </div>

          <div ref={menuRef} className={`noir-menu ${menuOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="noir-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="noir-menu-panel"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span>Experience</span>
              <i aria-hidden="true" />
            </button>
            <div id="noir-menu-panel" className="noir-menu-panel" hidden={!menuOpen}>
              {live3D && (
                <div className="noir-menu-group">
                  <span id="noir-light-label">Lighting</span>
                  <div className="noir-segmented" role="group" aria-labelledby="noir-light-label">
                    {[
                      ['dusk', 'Dusk'],
                      ['late', 'Late night'],
                    ].map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={mood === value} onClick={() => setMood(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {can3D && (
                <div className="noir-menu-group">
                  <span id="noir-view-label">View</span>
                  <div className="noir-segmented" role="group" aria-labelledby="noir-view-label">
                    {[
                      ['3d', '3D'],
                      ['photo', 'Photographs'],
                    ].map(([value, label]) => (
                      <button key={value} type="button" aria-pressed={view === value} onClick={() => chooseView(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!can3D && (
                <p className="noir-menu-note">
                  {quality ? '3D could not start here, so the photographs are shown.' : 'Photographs are shown on this device to keep things fast.'}
                </p>
              )}
              <a href="#story" className="noir-menu-skip" onClick={() => setMenuOpen(false)}>
                Skip the walkthrough <b aria-hidden="true">↓</b>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ================= TRACK (scrolling content) ================= */}

      <div className="noir-track">
        {/* Chapter 01: Arrival (the hero) */}
        <div ref={(el) => {
            blockRefs.current[0] = el
          }} className={`noir-block noir-intro ${active === 0 ? 'is-active' : ''}`}>
          <div className="noir-intro-main">
            <p className="noir-eyebrow">CONTEMPORARY FINE DINING</p>
            <h1>
              MAISON
              <br />
              <span>NOIR</span>
            </h1>
            <p className="noir-tagline">An evening worth remembering.</p>
            <div className="noir-actions">
              <a href="#menu" className="noir-btn noir-btn--solid">
                Explore the Menu
              </a>
              <a href="#reservation" className="noir-btn">
                Reserve a Table
              </a>
            </div>
          </div>

          <div className="noir-intro-bottom">
            <span>PARIS · EST. 2026</span>
            {chapters[0].hotspots.length > 0 && (
              <ul className="noir-intro-features" aria-label="In this view">
                {chapters[0].hotspots.map((hotspot) => (
                  <li key={hotspot.id}>
                    <button
                      type="button"
                      aria-expanded={openHotspot === hotspot.id}
                      aria-controls="noir-feature"
                      onClick={() => toggleHotspot(hotspot.id)}
                    >
                      {hotspot.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="noir-scroll-cue" onClick={() => goToChapter(1)}>
              SCROLL TO ENTER <b aria-hidden="true">↓</b>
            </button>
          </div>
        </div>

        {/* Chapters 02 – 04 */}
        {chapters.slice(1, LAST).map((chapter, i) => {
          const index = i + 1
          return (
            <div
              key={chapter.id}
              ref={(el) => {
            blockRefs.current[index] = el
          }}
              className={`noir-block noir-chapter noir-chapter--${index === 3 ? 'right' : 'left'} ${
                active === index ? 'is-active' : ''
              }`}
            >
              <article className="noir-card">
                <p className="noir-card-eyebrow">{chapter.eyebrow}</p>
                <h2>
                  {chapter.title[0]}
                  <br />
                  <i>{chapter.title[1]}</i>
                </h2>
                <p className="noir-card-copy">{chapter.copy}</p>

                {chapter.photo && (
                  <a href="#menu" className="noir-card-photo">
                    <img src={chapter.photo.src} alt={chapter.photo.alt} loading="lazy" decoding="async" />
                    <span>
                      {live3D && chapter.note && <small>{chapter.note} · photograph shown here</small>}
                      See the signature dishes <b aria-hidden="true">→</b>
                    </span>
                  </a>
                )}

                {featureList(chapter)}

                <span className="noir-card-index" aria-hidden="true">
                  {chapter.index} / 05
                </span>
              </article>
            </div>
          )
        })}

        {/* Chapter 05: The Reservation */}
        <div ref={(el) => {
            blockRefs.current[LAST] = el
          }} className={`noir-block noir-closing ${active === LAST ? 'is-active' : ''}`}>
          <div className="noir-closing-inner">
            <p className="noir-card-eyebrow">Chapter 05 / Reservations</p>
            <h2>
              Make an evening
              <br />
              <i>of it.</i>
            </h2>
            <p className="noir-card-copy">
              Join us for an evening of thoughtful cuisine, intimate surroundings, and moments worth lingering over.
            </p>
            <div className="noir-actions">
              <p className="noir-demo-note" role="note">
                Concept demonstration only — no real reservations are accepted or sent.
              </p>
              <a href="#reservation" className="noir-btn">
                Hours &amp; location <b aria-hidden="true">↓</b>
              </a>
            </div>
            <dl className="noir-closing-meta">
              <div>
                <dt>Dinner</dt>
                <dd>Tuesday — Saturday · 18:30 — 23:30</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>14 Rue de Noir, Paris</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}
