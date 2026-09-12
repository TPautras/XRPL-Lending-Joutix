import { appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const FRICTION_PATH = join(REPO_ROOT, 'docs', 'FRICTION.md')

/** Append one entry the moment friction happens, per CLAUDE.md's "running friction
 * log, continuously, not reconstructed Sunday morning." */
export function logFriction(entry: { where: string; expected: string; got: string; note?: string }): void {
  mkdirSync(dirname(FRICTION_PATH), { recursive: true })
  if (!existsSync(FRICTION_PATH)) {
    writeFileSync(FRICTION_PATH, '# Friction log\n\nAppend-only. One entry per surprise, the moment it happens.\n\n')
  }
  const ts = new Date().toISOString()
  const lines = [
    `## ${ts} — ${entry.where}`,
    `- expected: ${entry.expected}`,
    `- got: ${entry.got}`,
    entry.note ? `- note: ${entry.note}` : undefined,
    '',
  ].filter(Boolean)
  appendFileSync(FRICTION_PATH, lines.join('\n') + '\n')
}
