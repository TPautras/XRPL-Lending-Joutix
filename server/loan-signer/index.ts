import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Client, Wallet } from 'xrpl'
import { countersignAndBuildSubmission } from './countersign.ts'

/**
 * TrustFlow's one deliberate exception to "no backend" (see
 * docs/plans/loanset-signing-service.md). Holds exactly one secret -- the broker-owner's
 * seed -- and exposes exactly one route: apply the broker's counter-signature to an
 * already borrower-signed `LoanSet` blob, submit it, report the raw engine result.
 *
 * Deliberately no auth beyond CORS-origin restriction. Fine for a hackathon devnet demo,
 * not for anything real -- logged as a friction/finding entry in docs/FRICTION.md rather
 * than treated as an oversight.
 *
 * Same devnet as src/ui/lib/network.ts's NETWORK.wss, duplicated rather than imported:
 * this process holds a secret and the webapp bundle doesn't, so nothing here shares code
 * (or a build) with src/ui, on purpose.
 */
const DEVNET_WSS = 'wss://lending-hackathon.dev.ripplex.io:51233'

const PORT = Number(process.env.PORT ?? 8788)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
const MAX_BODY_BYTES = 64 * 1024

const brokerSeed = process.env.BROKER_SEED
if (!brokerSeed) {
  throw new Error('BROKER_SEED environment variable is required to start the loan-signer service')
}
// Parsed once at startup; never logged, never echoed in a response, never written to disk.
const brokerWallet = Wallet.fromSeed(brokerSeed)

const client = new Client(DEVNET_WSS)

async function ensureConnected(): Promise<void> {
  if (!client.isConnected()) await client.connect()
}

interface CountersignResponse {
  resultCode: string
  hash?: string
}

function sendJson(res: ServerResponse, status: number, body: CountersignResponse): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': FRONTEND_ORIGIN,
  })
  res.end(payload)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleCountersign(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let txBlob: string
  try {
    const raw = await readBody(req)
    const parsed = JSON.parse(raw) as { tx_blob?: unknown }
    if (typeof parsed.tx_blob !== 'string' || parsed.tx_blob.length === 0) {
      sendJson(res, 400, { resultCode: 'invalid_request' })
      return
    }
    txBlob = parsed.tx_blob
  } catch {
    sendJson(res, 400, { resultCode: 'invalid_request' })
    return
  }

  let fullySignedBlob: string
  try {
    fullySignedBlob = countersignAndBuildSubmission(brokerWallet, txBlob)
  } catch (err) {
    // Not a ledger engine code -- the blob itself was malformed, already
    // counter-signed, or not a LoanSet at all. Surface it as such, not as tesSUCCESS's
    // sibling shape.
    sendJson(res, 400, { resultCode: err instanceof Error ? err.message : 'countersign_failed' })
    return
  }

  try {
    await ensureConnected()
    const response = await client.submitAndWait(fullySignedBlob)
    const meta = response.result.meta
    const resultCode =
      meta && typeof meta === 'object' && 'TransactionResult' in meta
        ? String((meta as { TransactionResult: string }).TransactionResult)
        : 'unknown'

    if (resultCode === 'tesSUCCESS') {
      sendJson(res, 200, { resultCode, hash: response.result.hash })
    } else {
      sendJson(res, 200, { resultCode })
    }
  } catch (err) {
    sendJson(res, 502, { resultCode: err instanceof Error ? err.message : 'submit_failed' })
  }
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': FRONTEND_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    })
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/loanset/countersign') {
    handleCountersign(req, res).catch(() => sendJson(res, 500, { resultCode: 'internal_error' }))
    return
  }

  sendJson(res, 404, { resultCode: 'not_found' })
})

server.listen(PORT, () => {
  console.log(`loan-signer listening on :${PORT}, allowing origin ${FRONTEND_ORIGIN}`)
})
