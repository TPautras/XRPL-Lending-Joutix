/**
 * Mounts the real app in jsdom, against the real devnet, and walks every route.
 *
 * This exists because there is no browser in the loop: the screens are typechecked and
 * built on every change, and neither of those notices a component that throws the moment
 * it meets live ledger data. It found two that way — a fully repaid `Loan` reported as
 * "Active", and a chart series that never accumulated a second point on a quiet reserve.
 *
 * What it does NOT check is layout: Recharts' `ResponsiveContainer` measures to zero in
 * jsdom, so the charts render as empty SVG here. Read this as "nothing crashed and every
 * screen produced its text", not "it looks right".
 *
 * Run with `npm run smoke`. Needs the devnet reachable and `public/state.json` present.
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'smoke-build', 'app.js')
const ROUTES = (process.env.ROUTES ?? '/,/dashboard,/gate,/insurance,/market,/explorer,/findings').split(',')
const WAIT = Number(process.env.WAIT ?? 6000)
/** Below this, a route rendered the shell and nothing else — which is a failure, not a screen. */
const MIN_CHARS = 400

const problems = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => problems.push(`jsdomError: ${e.message}`))
vc.on('error', (...a) => problems.push(`console.error: ${a.join(' ')}`))
vc.on('warn', (...a) => {
  const text = a.join(' ')
  if (/React|key|hook|Warning/i.test(text)) problems.push(`console.warn: ${text}`)
})

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
})
const { window } = dom

// The app's two data sources, wired to the real thing: a live socket to the devnet, and the
// state file Vite would otherwise serve from `public/`.
window.WebSocket = WebSocket
globalThis.WebSocket = WebSocket
window.fetch = async (input) => {
  const url = String(input?.url ?? input)
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  const ok = path === '/state.json'
  const body = ok ? readFileSync(join(ROOT, 'public', 'state.json'), 'utf8') : '{}'
  return { ok, status: ok ? 200 : 404, text: async () => body, json: async () => JSON.parse(body) }
}
// Recharts sizes itself from the DOM, and jsdom measures everything as zero — a no-op
// ResizeObserver means `ResponsiveContainer` renders an empty SVG and the charts are never
// actually exercised. Give it a real viewport so the series geometry is computed for real.
const BOX = { width: 520, height: 150 }
window.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback
  }
  observe(target) {
    setTimeout(() => this.callback([{ target, contentRect: { ...BOX, top: 0, left: 0, bottom: BOX.height, right: BOX.width } }], this), 0)
  }
  unobserve() {}
  disconnect() {}
}
for (const [prop, value] of [['clientWidth', BOX.width], ['clientHeight', BOX.height], ['offsetWidth', BOX.width], ['offsetHeight', BOX.height]]) {
  Object.defineProperty(window.HTMLElement.prototype, prop, { configurable: true, get: () => value })
}
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { ...BOX, x: 0, y: 0, top: 0, left: 0, bottom: BOX.height, right: BOX.width, toJSON() {} }
}
window.SVGElement.prototype.getBBox ??= function getBBox() {
  return { x: 0, y: 0, width: 40, height: 12 }
}
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
window.scrollTo = () => {}

const script = window.document.createElement('script')
script.textContent = readFileSync(BUNDLE, 'utf8')
window.document.body.appendChild(script)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const root = () => window.document.getElementById('root')
const text = () => (root()?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The manager's posted cover, as rendered — the figure the live-update check watches. */
function cushionValue() {
  const match = text().match(/Manager cushionfirst-loss(€[\d,.]+)/)
  return match?.[1] ?? null
}

/** A drawn series is an SVG path with real coordinates — not merely a mounted chart. */
function drawnSeries() {
  return [...(root()?.querySelectorAll('svg.recharts-surface path.recharts-curve') ?? [])]
    .map((node) => node.getAttribute('d') ?? '')
    .filter((d) => /\d/.test(d))
}

await sleep(WAIT)
let failed = 0

for (const route of ROUTES) {
  window.location.hash = `#${route}`
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
  await sleep(WAIT)
  const rendered = text()
  const thin = rendered.length < MIN_CHARS
  if (thin) failed += 1
  const curves = drawnSeries()
  // The dashboard is the only screen that charts anything, and its three series are the
  // demo's whole visual payload — a dashboard that renders its text but draws no line is a
  // failure this test exists to catch.
  const chartsMissing = route === '/dashboard' && curves.length < 3
  if (chartsMissing) failed += 1
  const chartNote = route === '/dashboard' ? `  ${curves.length}/3 series drawn` : ''
  console.log(`${thin || chartsMissing ? '✗' : '✓'} ${route.padEnd(12)} ${String(rendered.length).padStart(5)} chars${chartNote}`)
  if (thin) console.log(`    ${rendered.slice(0, 300)}`)
  if (chartsMissing) console.log(`    charts did not draw: ${curves.length} path(s) with coordinates`)
}

// Opt-in, because it spends a real transaction. Everything above proves the screens render
// what the ledger currently says; this proves a change *arrives* — which is the only claim
// that matters for a dashboard performed live, and the one a static render cannot make.
if (process.env.LIVE === '1') {
  console.log('\n── live update: posting cover and watching the dashboard')
  window.location.hash = '#/dashboard'
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
  await sleep(WAIT)

  const cushionBefore = cushionValue()
  const curvesBefore = drawnSeries().join('|')
  console.log(`   before: cushion ${cushionBefore ?? '(not found)'}`)

  try {
    const { stdout } = await run('npx', ['tsx', '--env-file=.env', 'scripts/post-cover.ts', '3'], { cwd: ROOT })
    console.log(`   ${stdout.trim()}`)
  } catch (error) {
    console.log(`   ✗ could not post cover: ${error.stderr?.trim() ?? error.message}`)
    failed += 1
  }

  // Four ledger closes is comfortably more than the one the dashboard needs.
  await sleep(20000)
  const cushionAfter = cushionValue()
  const curvesAfter = drawnSeries().join('|')
  console.log(`   after:  cushion ${cushionAfter ?? '(not found)'}`)

  if (!cushionBefore || !cushionAfter) {
    console.log('   ✗ could not read the cushion figure off the screen')
    failed += 1
  } else if (cushionBefore === cushionAfter) {
    console.log('   ✗ the ledger changed and the screen did not')
    failed += 1
  } else {
    console.log(`   ✓ screen followed the ledger: ${cushionBefore} → ${cushionAfter}`)
  }

  if (curvesBefore === curvesAfter) {
    console.log('   ✗ the chart geometry did not move')
    failed += 1
  } else {
    console.log('   ✓ chart geometry redrew')
  }
}

const unique = [...new Set(problems)]
if (unique.length) {
  console.log(`\n${unique.length} console problem(s):`)
  for (const problem of unique.slice(0, 20)) console.log(' •', problem.slice(0, 400))
}

window.close()
const bad = failed + unique.length
console.log(bad ? `\nFAIL — ${failed} thin route(s), ${unique.length} console problem(s)` : '\nOK — every route rendered, console clean')
process.exit(bad ? 1 : 0)
