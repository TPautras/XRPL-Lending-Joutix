/**
 * Isolation repro for "VaultDeposit doesn't work": fund two fresh accounts from this
 * devnet's faucet, issue a throwaway MPT, create a PUBLIC vault against it (no
 * PermissionedDomain — that gating is a separate, already-diagnosed question, see
 * docs/FRICTION.md "a private vault gates deposits but not loans"), fund the investor
 * with some of the asset, then submit VaultDeposit signed directly with a plain xrpl.js
 * `Wallet` — no browser wallet extension in the loop at all.
 *
 * Why bypass GemWallet/Crossmark here: docs/FRICTION.md already root-caused the
 * Dashboard's VaultDeposit failure to GemWallet's own closed-source popup crashing when
 * asked to render a VaultDeposit + MPTAmount payload (confirmed by reading
 * @gemwallet/api's source — it forwards the tx verbatim, no transformation). This script
 * answers the remaining question: does the ledger itself accept the exact same
 * transaction shape the Dashboard sends? tesSUCCESS here would confirm the fault is
 * 100% inside GemWallet's popup, not in this repo's transaction construction or in the
 * protocol; anything else is a new finding.
 *
 * Run: `node scripts/debug-vault-deposit.mjs`
 * Needs only network access to this devnet + its faucet — no .env, no pre-funded seeds.
 */
import { Client, Wallet } from 'xrpl'

const NETWORK = {
  wss: 'wss://lending-hackathon.dev.ripplex.io:51233',
  explorer: 'https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233',
}
const FAUCET_HOST = 'lending-hackathon-faucet.dev.ripplex.io'
const FAUCET_PATH = '/accounts'

const ASSET_SCALE = 2
const TF_MPT_CAN_LOCK = 0x00000002
const TF_MPT_CAN_ESCROW = 0x00000008
const TF_MPT_CAN_TRADE = 0x00000010
const TF_MPT_CAN_TRANSFER = 0x00000020

function baseUnits(units) {
  return Math.round(units * 10 ** ASSET_SCALE).toString()
}

/**
 * This faucet does not match the xrpl.js `Client.fundWallet()` contract (it returns
 * `account.address`, not `account.classicAddress`, and ignores any destination in the
 * request body -- always mints a brand-new random account). Call it directly instead
 * of going through `fundWallet()`. See docs/FRICTION.md 2026-09-12T14:29Z and
 * FEEDBACK_REPORT.md §6.
 */
async function requestFaucetAccount() {
  const response = await fetch(`https://${FAUCET_HOST}${FAUCET_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    throw new Error(`Faucet request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const secret = body.account?.secret ?? body.seed
  if (!secret) throw new Error(`Faucet response had no secret/seed: ${JSON.stringify(body)}`)
  return { address: body.account.address, secret, balance: body.balance ?? body.amount ?? 0 }
}

function createdNode(meta, entryType) {
  const nodes = meta?.AffectedNodes ?? []
  for (const node of nodes) {
    if (node?.CreatedNode?.LedgerEntryType === entryType) {
      return { index: node.CreatedNode.LedgerIndex, fields: node.CreatedNode.NewFields ?? {} }
    }
  }
  throw new Error(`No CreatedNode of type ${entryType} in transaction metadata`)
}

/** Autofills, signs, submits, waits for validation, and prints the raw engine code --
 * CLAUDE.md rule 8: the engine code is the fastest debugging signal for these tx types,
 * never swallow it. Throws unless the result matches `expect` (default `tesSUCCESS`). */
async function submit(client, wallet, tx, expect = 'tesSUCCESS') {
  const prepared = await client.autofill({ Account: wallet.classicAddress, ...tx })
  // xrpl.js's autofill() hardcodes LastLedgerSequence = currentLedger + 20 (~100s at this
  // devnet's ~5s close time, confirmed via `ledger_closed` two calls apart) with no override
  // param on autofill() itself. That 100s margin was not enough even for the very first,
  // simplest transaction of a run (MPTokenIssuanceCreate, no prior activity) -- reproduced
  // twice, both times failing tefPAST_SEQ by exactly the ledger the tx was submitted in.
  // Widen the margin well past what autofill sets rather than fight the root cause here.
  prepared.LastLedgerSequence = (await client.getLedgerIndex()) + 200
  const signed = wallet.sign(prepared)
  const response = await client.submitAndWait(signed.tx_blob)
  const meta = response.result.meta
  const resultCode = meta && typeof meta === 'object' && 'TransactionResult' in meta ? meta.TransactionResult : 'unknown'
  const hash = response.result.hash ?? ''
  const ok = resultCode === expect
  console.log(`  ${ok ? '✓' : '✗'} ${tx.TransactionType} -> ${resultCode} (expected ${expect})`)
  console.log(`    ${NETWORK.explorer}/transactions/${hash}`)
  if (!ok) {
    const err = new Error(`${tx.TransactionType} returned ${resultCode}, expected ${expect}`)
    err.resultCode = resultCode
    err.meta = meta
    throw err
  }
  return { hash, resultCode, meta }
}

async function main() {
  const client = new Client(NETWORK.wss)
  await client.connect()

  try {
    console.log('== Funding two fresh accounts from the faucet ==')
    const managerFunded = await requestFaucetAccount()
    const investorFunded = await requestFaucetAccount()
    const manager = Wallet.fromSeed(managerFunded.secret)
    const investor = Wallet.fromSeed(investorFunded.secret)
    console.log(`  manager  ${manager.classicAddress}  ${managerFunded.balance} XRP`)
    console.log(`  investor ${investor.classicAddress}  ${investorFunded.balance} XRP`)

    console.log('\n== Issuing a throwaway test MPT (manager is the issuer) ==')
    const issuance = await submit(client, manager, {
      TransactionType: 'MPTokenIssuanceCreate',
      AssetScale: ASSET_SCALE,
      MaximumAmount: '100000000000',
      Flags: TF_MPT_CAN_TRANSFER | TF_MPT_CAN_ESCROW | TF_MPT_CAN_TRADE | TF_MPT_CAN_LOCK,
      MPTokenMetadata: Buffer.from(JSON.stringify({ ticker: 'DBG', name: 'VaultDeposit debug asset' })).toString(
        'hex',
      ),
    })
    const issuanceId = issuance.meta.mpt_issuance_id
    if (!issuanceId) throw new Error('mpt_issuance_id missing from MPTokenIssuanceCreate metadata')
    console.log(`  issuance id: ${issuanceId}`)

    console.log('\n== Creating a PUBLIC vault against it (no PermissionedDomain) ==')
    const vaultCreate = await submit(client, manager, {
      TransactionType: 'VaultCreate',
      Asset: { mpt_issuance_id: issuanceId },
      WithdrawalPolicy: 1,
      Data: Buffer.from('debug-vault-deposit').toString('hex').toUpperCase(),
    })
    const { index: vaultId, fields } = createdNode(vaultCreate.meta, 'Vault')
    console.log(`  vault id: ${vaultId}`)
    console.log(`  share MPT id: ${fields.ShareMPTID}`)

    console.log('\n== Investor opts in to hold the asset, manager funds the investor ==')
    await submit(client, investor, { TransactionType: 'MPTokenAuthorize', MPTokenIssuanceID: issuanceId })
    await submit(client, manager, {
      TransactionType: 'Payment',
      Destination: investor.classicAddress,
      Amount: { mpt_issuance_id: issuanceId, value: baseUnits(100) },
    })

    console.log('\n== The transaction under test: investor VaultDeposit, signed directly (no browser wallet) ==')
    await submit(client, investor, {
      TransactionType: 'VaultDeposit',
      VaultID: vaultId,
      Amount: { mpt_issuance_id: issuanceId, value: baseUnits(50) },
    })

    console.log('\nVaultDeposit succeeded end to end with a plain xrpl.js signer.')
    console.log('If the Dashboard/GemWallet path still fails, that confirms the fault is in')
    console.log("GemWallet's own popup (docs/FRICTION.md), not in this transaction shape or the protocol.")
  } finally {
    await client.disconnect()
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err.message)
  if (err.resultCode) console.error('  raw engine code:', err.resultCode)
  process.exitCode = 1
})
