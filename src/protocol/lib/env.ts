import 'dotenv/config'
import { Wallet } from 'xrpl'

export const NETWORK = {
  rpc: required('HACKATHON_RPC'),
  wss: required('HACKATHON_WSS'),
  faucetHost: required('HACKATHON_FAUCET_HOST'),
  faucetPath: '/accounts',
  explorer: required('HACKATHON_EXPLORER'),
}

export const ROLE_NAMES = [
  'authority',
  'issuer',
  'manager',
  'sme',
  'smeUncredentialed',
  'investorA',
  'investorB',
  'insurer',
] as const

export type RoleName = (typeof ROLE_NAMES)[number]

const SEED_ENV: Record<RoleName, string> = {
  authority: 'AUTHORITY_SEED',
  issuer: 'ISSUER_SEED',
  manager: 'MANAGER_SEED',
  sme: 'SME_SEED',
  smeUncredentialed: 'SME_UNCREDENTIALED_SEED',
  investorA: 'INVESTOR_A_SEED',
  investorB: 'INVESTOR_B_SEED',
  insurer: 'INSURER_SEED',
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`)
  return value
}

/**
 * Roles whose seed is blank get a fresh random Wallet — `probe.ts` funds it from the
 * faucet and prints the seed so it can be pasted back into `.env` for the next run.
 * Without this, a missing seed would only surface as a confusing signing failure deep
 * inside the first flow that touches that role.
 */
export function loadWallets(): Record<RoleName, Wallet> {
  const wallets = {} as Record<RoleName, Wallet>
  for (const role of ROLE_NAMES) {
    const seed = process.env[SEED_ENV[role]]
    wallets[role] = seed ? Wallet.fromSeed(seed) : Wallet.generate()
  }
  return wallets
}

export function seedEnvName(role: RoleName): string {
  return SEED_ENV[role]
}
