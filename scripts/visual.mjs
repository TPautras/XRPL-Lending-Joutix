/**
 * Real browser, real CSS layout. `npm run smoke` proves nothing threw; this proves the
 * result is not visibly broken — and it found things the jsdom pass structurally could not:
 * a roles table clipped behind a scrollbar, chart axes running −1 to 3 on a flat series,
 * ticks at €1,737.06, two panels leaving holes in the grid.
 *
 * Drives the system Firefox over WebDriver BiDi (no browser download). Two jobs:
 *   - screenshots every route full-page into `screenshots/`, for a human to look at;
 *   - fails the run if any element is wider than its container, which is how a table ends up
 *     silently cut off on a projector, where nobody scrolls sideways.
 *
 * Needs a dev server: `npm run dev -- --port 5199` (or set BASE).
 */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.OUT ?? join(ROOT, 'screenshots')
const BASE = process.env.BASE ?? 'http://localhost:5199'
const FIREFOX = process.env.FIREFOX ?? '/run/current-system/sw/bin/firefox'
const ROUTES = (process.env.ROUTES ?? '/,/dashboard,/gate,/insurance,/market,/explorer,/findings').split(',')
const WAIT = Number(process.env.WAIT ?? 10000)

mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  browser: 'firefox',
  executablePath: FIREFOX,
  headless: true,
  protocol: 'webDriverBiDi',
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200 })

const problems = []
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console.error ${m.text()}`)
})

let failed = 0
for (const route of ROUTES) {
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'load' })
  await page.evaluate((r) => {
    window.location.hash = `#${r}`
  }, route)
  await new Promise((resolve) => setTimeout(resolve, WAIT))

  const name = route === '/' ? 'home' : route.replaceAll('/', '')
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })

  const layout = await page.evaluate(() => {
    const wide = []
    for (const el of document.querySelectorAll('*')) {
      // 2px of slack: sub-pixel rounding is not an overflow.
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} ${el.clientWidth}<${el.scrollWidth}`)
      }
    }
    return { wide: wide.slice(0, 5), pageScrolls: document.documentElement.scrollWidth > window.innerWidth }
  })

  const bad = layout.wide.length > 0 || layout.pageScrolls
  if (bad) failed += 1
  console.log(`${bad ? '✗' : '✓'} ${route.padEnd(12)} ${name}.png${bad ? `  overflow: ${layout.wide.join(' | ')}${layout.pageScrolls ? ' (page scrolls sideways)' : ''}` : ''}`)
}

await browser.close()

const unique = [...new Set(problems)]
if (unique.length) {
  console.log(`\n${unique.length} console problem(s):`)
  for (const problem of unique.slice(0, 10)) console.log(' •', problem.slice(0, 300))
}
console.log(failed || unique.length ? `\nFAIL — ${failed} route(s) with overflow, ${unique.length} console problem(s)` : `\nOK — no overflow anywhere; screenshots in ${OUT}`)
process.exit(failed || unique.length ? 1 : 0)
