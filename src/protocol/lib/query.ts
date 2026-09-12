import type { Client } from 'xrpl'

export async function vaultInfo(client: Client, vaultId: string): Promise<Record<string, unknown>> {
  const { result } = await client.request({ command: 'vault_info', vault_id: vaultId } as never)
  return (result as { vault: Record<string, unknown> }).vault
}

export async function ledgerEntry(client: Client, index: string): Promise<Record<string, unknown>> {
  const { result } = await client.request({
    command: 'ledger_entry',
    index,
    ledger_index: 'validated',
  } as never)
  return (result as { node: Record<string, unknown> }).node
}

export async function mptBalance(client: Client, account: string, issuanceId: string): Promise<string> {
  const { result } = await client.request({
    command: 'account_objects',
    account,
    type: 'mptoken',
  } as never)
  const objects = (result as { account_objects: Array<Record<string, unknown>> }).account_objects
  const match = objects.find((o) => o.MPTokenIssuanceID === issuanceId)
  return (match?.MPTAmount as string | undefined) ?? '0'
}

export async function accountEscrows(client: Client, account: string): Promise<Array<Record<string, unknown>>> {
  const { result } = await client.request({
    command: 'account_objects',
    account,
    type: 'escrow',
  } as never)
  return (result as { account_objects: Array<Record<string, unknown>> }).account_objects
}
