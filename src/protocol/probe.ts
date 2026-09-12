/** Phase 0 — run this first, every session: `npm run probe`.
 * Confirms the amendments TrustFlow depends on are actually enabled on the Custom
 * Hackathon Devnet, funds any role whose wallet is missing or low on XRP, and prints
 * balances. CLAUDE.md: "everything else depends on this — better to know it Saturday
 * noon than Sunday 11am." */
import { Wallet } from 'xrpl'
import { getClient, disconnectClient } from './lib/client.js'
import { loadWallets, seedEnvName, type RoleName } from './lib/env.js'
import { requestFaucetAccount } from './lib/faucet.js'

const REQUIRED_AMENDMENTS = [
  'SingleAssetVault',
  'LendingProtocol',
  'Credentials',
  'PermissionedDomains',
  'TokenEscrow',
  'MPTokensV1',
]

const MIN_XRP_RESERVE = 100

async function main() {
  const client = await getClient()

  const serverInfo = await client.request({ command: 'server_info' })
  const info = serverInfo.result.info
  console.log('== server_info ==')
  console.log(`  build_version     ${info.build_version}`)
  console.log(`  network_id        ${info.network_id}`)
  console.log(`  complete_ledgers  ${info.complete_ledgers}`)

  const featureResp = (await client.request({ command: 'feature' })) as unknown as {
    result: { features: Record<string, { name: string; enabled: boolean }> }
  }
  const features = featureResp.result.features
  const byName = new Map(Object.values(features).map((f) => [f.name, f.enabled]))

  console.log('\n== Required amendments ==')
  let allEnabled = true
  for (const name of REQUIRED_AMENDMENTS) {
    const enabled = byName.get(name) ?? false
    if (!enabled) allEnabled = false
    console.log(`  ${enabled ? '✓' : '✗'} ${name}`)
  }
  if (!allEnabled) {
    console.error('\nOne or more required amendments are NOT enabled on this network. Stop and re-check')
    console.error('CLAUDE.md\'s fallback table before building further.')
  }

  const wallets = loadWallets()
  console.log('\n== Accounts ==')
  for (const role of Object.keys(wallets) as RoleName[]) {
    let wallet = wallets[role]
    const hadSeed = Boolean(process.env[seedEnvName(role)])
    let balanceXrp = 0
    try {
      balanceXrp = Number(await client.getXrpBalance(wallet.classicAddress))
    } catch {
      balanceXrp = 0 // account not funded yet
    }

    if (balanceXrp < MIN_XRP_RESERVE) {
      if (hadSeed) {
        // This faucet ignores any destination/address in the request and always mints
        // a brand-new random account (see lib/faucet.ts) — there is no way to top up
        // an existing seed through it, so don't silently swap in an unrelated wallet
        // for a role the rest of state/hackathon.json may already depend on.
        console.error(
          `  ${role}: ${wallet.classicAddress} has only ${balanceXrp} XRP and this faucet cannot top up an ` +
            'existing account. Fund it manually, or clear its .env seed to mint a fresh one.',
        )
        continue
      }
      console.log(`  ${role}: requesting a fresh funded account from the faucet...`)
      const funded = await requestFaucetAccount()
      wallet = Wallet.fromSeed(funded.secret)
      balanceXrp = funded.balance
    }

    const seedNote = hadSeed ? '' : `  <- paste into ${seedEnvName(role)}=${wallet.seed}`
    console.log(`  ${role.padEnd(20)} ${wallet.classicAddress}  ${balanceXrp} XRP${seedNote}`)
  }

  await disconnectClient()
  if (!allEnabled) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
