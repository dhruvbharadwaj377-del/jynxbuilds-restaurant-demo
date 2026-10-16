// Shared scroll → journey mapping for the 3D camera.
//
// Scroll progress runs 0 → 1 across the experience section. Each chapter
// occupies an equal slice; within a slice the journey holds still at the
// chapter's mark for a moment (so the text can be read over a steady frame),
// eases into motion, and settles again at the next mark.

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smooth = (t) => t * t * (3 - 2 * t)

// How much of each slice is spent holding at either end
const HOLD = 0.18

// Returns { index, travel }: the chapter segment and eased 0..1 travel along it.
export function segmentAt(progress, segments) {
  const f = clamp01(progress) * segments
  const index = Math.min(Math.floor(f), segments - 1)
  const local = f - index
  return { index, travel: smooth(clamp01((local - HOLD) / (1 - HOLD * 2))) }
}
