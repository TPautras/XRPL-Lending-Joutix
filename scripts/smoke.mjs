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
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
window.scrollTo = () => {}

const script = window.document.createElement('script')
script.textContent = readFileSync(BUNDLE, 'utf8')
window.document.body.appendChild(script)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const text = () => (window.document.getElementById('root')?.textContent ?? '').replace(/\s+/g, ' ').trim()

await sleep(WAIT)
let failed = 0

for (const route of ROUTES) {
  window.location.hash = `#${route}`
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
  await sleep(WAIT)
  const rendered = text()
  const thin = rendered.length < MIN_CHARS
  if (thin) failed += 1
  console.log(`${thin ? '✗' : '✓'} ${route.padEnd(12)} ${String(rendered.length).padStart(5)} chars`)
  if (thin) console.log(`    ${rendered.slice(0, 300)}`)
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
