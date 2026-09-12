interface CreatedNodeEntry {
  CreatedNode: {
    LedgerEntryType: string
    LedgerIndex: string
    NewFields?: Record<string, unknown>
  }
}

function isCreatedNode(node: unknown): node is CreatedNodeEntry {
  return typeof node === 'object' && node !== null && 'CreatedNode' in node
}

/** Finds the ledger object of `entryType` created by this transaction and returns
 * its index plus the fields the ledger recorded for it (e.g. `Vault.ShareMPTID`). */
export function createdNode(
  meta: unknown,
  entryType: string,
): { index: string; fields: Record<string, unknown> } {
  const nodes = (meta as { AffectedNodes?: unknown[] })?.AffectedNodes ?? []
  for (const node of nodes) {
    if (isCreatedNode(node) && node.CreatedNode.LedgerEntryType === entryType) {
      return { index: node.CreatedNode.LedgerIndex, fields: node.CreatedNode.NewFields ?? {} }
    }
  }
  throw new Error(`No CreatedNode of type ${entryType} in transaction metadata`)
}

export function mptIssuanceIdFromMeta(meta: unknown): string {
  const id = (meta as { mpt_issuance_id?: string }).mpt_issuance_id
  if (!id) throw new Error('mpt_issuance_id missing from MPTokenIssuanceCreate metadata')
  return id
}
