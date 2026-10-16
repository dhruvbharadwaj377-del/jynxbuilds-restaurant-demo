// Story beats for the Maison Noir evening.
// Each chapter is one viewport of scroll. The camera travels between the
// keyframes (through any `via` points on the way, so it walks through the
// door instead of the wall), and the same data drives the text, the hotspots
// and the photographic fallback, so the three can never drift apart.
//
// World units are metres. The facade sits on z = 0; the street is +z and the
// restaurant runs back to z = -22.

const IMG = '/images'

export const chapters = [
  {
    id: 'arrival',
    label: 'Arrival',
    index: '01',
    // Framed off-centre: the facade sits right, the name reads on the left
    camera: { position: [-1, 1.7, 27], target: [-5.5, 4.0, 0] },
    // Portrait screens: step back along the view axis (only where it's safe)
    portraitPush: 0.45,
    still: `${IMG}/hero.jpg`,
    hotspots: [
      {
        id: 'facade',
        label: 'The house',
        position: [0, 4.05, 0.2],
        detail:
          'A Parisian stone facade with a lacquered black shopfront. The name is set in gold above the door and lit softly from below.',
      },
      {
        id: 'entrance',
        label: 'Lantern-lit door',
        position: [1.45, 2.55, 0.3],
        detail:
          'Two brass lanterns and a pair of clipped topiaries mark the door. The evening starts on the pavement.',
      },
      {
        id: 'windows',
        label: 'Window tables',
        position: [-4.65, 1.55, 0.1],
        detail:
          'Tables for two sit just inside the glass: the warmest view of the street on a quiet night.',
      },
    ],
  },
  {
    id: 'threshold',
    label: 'Threshold',
    index: '02',
    eyebrow: 'Chapter 02 / The Threshold',
    title: ['Leave the', 'street outside.'],
    copy:
      'Through the lacquered doors the city falls quiet. A host stand in walnut and brass and, past a slatted screen, the first glimpse of the dining room.',
    via: [
      { position: [0, 1.7, 8], target: [0, 2.0, -2] },
      { position: [0, 1.62, 0.4], target: [0.3, 1.45, -5] },
    ],
    camera: { position: [-0.45, 1.6, -1.8], target: [1.3, 1.2, -6.6] },
    // Phones: the frame is too narrow to hold the host stand at that angle, so
    // turn toward it (and tilt down so it sits above the chapter card).
    portraitCamera: { position: [-0.6, 1.62, -1.5], target: [1.9, 1.0, -5.83] },
    portraitPush: 0,
    still: `${IMG}/gallery-02.jpg`,
    hotspots: [
      {
        id: 'host',
        label: 'The host stand',
        position: [1.25, 1.18, -3.85],
        detail:
          'Every evening is greeted here, a few steps in from the door, before you are walked through to your table.',
      },
      {
        id: 'screen',
        label: 'Walnut screen',
        position: [2.0, 1.95, -2.4],
        detail:
          'Slatted walnut keeps the dining room private while letting the candlelight through: a glimpse, not a reveal.',
      },
    ],
  },
  {
    id: 'dining',
    label: 'Dining Room',
    index: '03',
    eyebrow: 'Chapter 03 / The Dining Room',
    title: ['Candlelit,', 'unhurried.'],
    copy:
      'Linen-dressed tables, velvet seating and dark walnut, lit low so the room stays intimate however full it is. Nothing is rushed. Nothing is accidental.',
    via: [{ position: [-1.2, 1.85, -3.9], target: [-0.2, 1.3, -10] }],
    camera: { position: [-6.4, 2.35, -4.3], target: [4.0, 0.9, -16.2] },
    portraitPush: 0,
    still: `${IMG}/interior-01.jpg`,
    hotspots: [
      {
        id: 'tables',
        label: 'Candlelit tables',
        position: [-2.6, 0.98, -11.6],
        detail:
          'Each table carries its own candle, so the light in the room comes from the tables up rather than the ceiling down.',
      },
      {
        id: 'banquette',
        label: 'Velvet banquette',
        position: [-7.3, 0.85, -10],
        detail:
          'A long burgundy banquette lines the wall: the seat to choose if you like to watch the room.',
      },
      {
        id: 'bar',
        label: 'The bar',
        position: [3.0, 1.55, -20.1],
        detail:
          'A black marble counter in front of a backlit arch of bottles. Start here with an aperitif, or end the evening here.',
      },
    ],
  },
  {
    id: 'dish',
    label: 'Signature Dish',
    index: '04',
    eyebrow: 'Chapter 04 / From the Kitchen',
    title: ['The plate,', 'composed.'],
    copy:
      'Tagliolini Noir: black truffle, Parmesan, wild mushroom. Seasonal ingredients, classical technique, and a little imagination.',
    note: 'Illustrative 3D plating',
    via: [
      { position: [-1.0, 2.2, -9.6], target: [2.4, 0.9, -15.5] },
      { position: [3.4, 1.6, -12.3], target: [5.0, 0.85, -15] },
    ],
    camera: { position: [4.98, 1.27, -13.92], target: [5.25, 0.8, -14.66] },
    portraitPush: 0.3,
    still: `${IMG}/dish-01.jpg`,
    photo: { src: `${IMG}/dish-01.jpg`, alt: 'Tagliolini Noir, photographed' },
    hotspots: [
      {
        id: 'plate',
        label: 'Tagliolini Noir',
        position: [5.1, 0.83, -14.62],
        detail:
          'Black truffle · Parmesan · Wild mushroom. This plating is an illustrative render; the photograph and the full selection follow below.',
      },
      {
        id: 'setting',
        label: 'The setting',
        position: [5.38, 0.98, -14.86],
        detail:
          'Black stoneware, pressed linen and fine stemware: a table dressed for the dish, not the other way round.',
      },
    ],
  },
  {
    id: 'reserve',
    label: 'Reserve',
    index: '05',
    via: [{ position: [3.5, 1.45, -10.2], target: [4.8, 1.0, -3] }],
    // Looking out toward the street (+z), screen-right is -x. Aiming ~11° past
    // the table toward +x puts it right of frame; the copy reads on the left.
    camera: { position: [3.75, 1.3, -4.5], target: [5.72, 1.0, -1.85] },
    // Phones: the booking copy fills the lower screen, so a seated-height view
    // pitched down puts the candlelit table in the top third, street above it.
    portraitCamera: { position: [4.25, 1.15, -4.1], target: [5.26, 0.23, -1.43] },
    portraitPush: 0,
    still: `${IMG}/interior-02.jpg`,
    hotspots: [],
  },
]

export const hotspotIndex = Object.fromEntries(
  chapters.flatMap((chapter) =>
    chapter.hotspots.map((hotspot) => [hotspot.id, { ...hotspot, chapter: chapter.id }]),
  ),
)
