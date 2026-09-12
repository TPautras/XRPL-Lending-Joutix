/**
 * The recorded evidence from the verified devnet runs of 2026-09-12, transcribed once from
 * `README.md`'s verified-transactions tables.
 *
 * Why it exists at all: the live pages read `public/state.json`, which is written by the
 * protocol scripts and is absent on a fresh clone — and the Custom Hackathon Devnet can
 * reset without warning, taking the live objects with it. Rather than show empty tables on
 * stage, the Gate and Explorer pages fall back to this and label it as a recorded run with
 * its date. Live data always wins when it is there.
 *
 * This is a transcription, not a second source of truth: `README.md`, `FEEDBACK_REPORT.md`
 * and `docs/FRICTION.md` remain authoritative, and the `report`/`repro` fields point back
 * at them so a judge can check any claim here against the file it came from.
 */

export const RECORDED_RUN_DATE = '2026-09-12'

export interface RecordedTx {
  phase: 'Phase 1' | 'Phase 2' | 'Phase 3'
  step: string
  type: string
  result: string
  hash: string
  /** Present when the non-`tesSUCCESS` code was the point of the transaction. */
  deliberate?: string
}

export const RECORDED_TXS: RecordedTx[] = [
  { phase: 'Phase 1', step: 'setup', type: 'VaultCreate', result: 'tesSUCCESS', hash: 'FF8DBC4548F051B1D76F9D20AA749A166D9AED8AFB38509BDB344F1F783EAE87' },
  { phase: 'Phase 1', step: 'setup', type: 'LoanBrokerSet', result: 'tesSUCCESS', hash: 'B952C9D3A85878B86DFA9421B0A0B8E04BF78177C502C1AE5110788096138F49' },
  { phase: 'Phase 1', step: 's4', type: 'LoanSet (dual-signed)', result: 'tesSUCCESS', hash: 'C7B2620D41A46094A60A2E53527808CDE0C31F1A3A18D7AD0DE22A0F3C1CAAF2' },
  { phase: 'Phase 1', step: 's6', type: 'LoanPay (full repayment)', result: 'tesSUCCESS', hash: 'B1F6E04DDCF1819656273A6414B2453C88F79844D027A1E3EB6B0D35E008DF08' },
  { phase: 'Phase 1', step: 's7', type: 'VaultWithdraw', result: 'tecINSUFFICIENT_FUNDS', hash: '11C963A77DA075B56D0752DF5C23999F5E3C4B7418D3C6E0EE69B3FF5E55A6E3', deliberate: 'over-withdraw past available liquidity — the protocol guardrail firing on cue' },
  { phase: 'Phase 1', step: 's10', type: 'VaultWithdraw', result: 'tesSUCCESS', hash: '329502AA4C885AD67DA28F3F468B984A7ED3F186AC91B120D5464D482B1798C3' },

  { phase: 'Phase 2', step: 's8', type: 'VaultDeposit (funded intruder)', result: 'tecNO_AUTH', hash: 'A7F1DEB1ADF4FD7A912AA5114F14E9553537573C2DE0168058CCCF4F820E3D27', deliberate: 'uncredentialed account holding more TFEUR than it deposits — refused on the credential, not the balance' },
  { phase: 'Phase 2', step: 's8', type: 'CredentialDelete', result: 'tesSUCCESS', hash: 'C02CFE069D225C5E0554D8AB1B0680CFD0E089116FB404A641E4DA5D71337489' },
  { phase: 'Phase 2', step: 's8', type: 'VaultDeposit (after revocation)', result: 'tecNO_AUTH', hash: '037C701A3B549B7D5EA7573E706B643E3C6DDF4FEDC06002CCBF1DA4511C5165', deliberate: 'the door closes on the way in once the credential is gone' },
  { phase: 'Phase 2', step: 's8', type: 'VaultWithdraw (after revocation)', result: 'tesSUCCESS', hash: 'AE48D99C42BF9D9F7F4A8BD4CEAD4BC748665070B98529B5B9AB2C92DD7F0359' },

  { phase: 'Phase 3', step: 'prestage', type: 'EscrowCreate', result: 'tesSUCCESS', hash: '8176143DD6D6F34FD90D7CA291E2DB1A4B34217B7F98574F6EC9FF24F7C1F8BD' },
  { phase: 'Phase 3', step: 's5', type: 'Payment (premium)', result: 'tesSUCCESS', hash: 'F893A293EDAD84B2061F26CD49B104F1DB9DB5890C48FEB335A43BADE3D4DE6F' },
  { phase: 'Phase 3', step: 's9', type: 'LoanManage (tfLoanImpair)', result: 'tesSUCCESS', hash: '807EE4DF021A59A4555D1FD1CC76C081DD7164C9ED54CBF0E510CD911334EEF5' },
  { phase: 'Phase 3', step: 's9', type: 'LoanManage (tfLoanDefault)', result: 'tesSUCCESS', hash: '4F8324E976FCCDDA18D629446E4E53FBFC619A34C9176257AA38C62FE47A7536' },
  { phase: 'Phase 3', step: 's9', type: 'EscrowFinish', result: 'tesSUCCESS', hash: '8C6658F773FAC83F3F0A6D869E8098D9729954DAD7E7919CB10C348D39DD7F1E' },
]

export interface GateRow {
  state: string
  action: string
  result: string
  hash: string
  note?: string
}

/** The four-state credential walk from `npm run demo gate`, second of two identical runs. */
export const RECORDED_GATE: GateRow[] = [
  { state: 'none', action: 'VaultDeposit', result: 'tecNO_AUTH', hash: 'B0EF83FE333241766DF49BE93CF88F739E6ADC91177ED70855FA38A636DD4774' },
  { state: 'none', action: 'LoanSet (borrow)', result: 'tesSUCCESS', hash: 'DD77E5807DC4D052530238268687EB33BA812504C860A26794088565FE5EC1E2', note: 'uncredentialed borrower, same gated vault, next transaction' },
  { state: 'issued, not accepted', action: 'VaultDeposit', result: 'tecNO_AUTH', hash: '401575D50300DD9DB42C1A8F5C0B5EBD5105D7E44855A01919DE7C9AC6D8FB4D' },
  { state: 'accepted', action: 'VaultDeposit', result: 'tesSUCCESS', hash: 'F630C1CF269DD2E5D416A678440BC54D8186C0E8161B7B655D8C5C3B3FAB2A53' },
  { state: 'revoked', action: 'VaultDeposit', result: 'tecNO_AUTH', hash: '8E1B2240CDBD0C70AD445CF12FB5FEA183551B943B53F6ECA67A382251FF7EE2' },
  { state: 'revoked', action: 'VaultWithdraw', result: 'tesSUCCESS', hash: '58DCF5361D030D7142102889D94DC732FD3D52B63EDB6060F18706DB7C603B38', note: 'funds deposited while credentialed — still paid out' },
]

/** The account walked through every credential state, and the vault it was walked against. */
export const GATE_SUBJECT = 'rDyibrtuGLxhscYJ59fpV3Tq2JzZb2WZ7G'
export const GATE_VAULT = '8B3F561021ED6688FEF0FEAEE21350EA35D1707CD96F0ABCEEBEBC3B04CE7261'

/**
 * The transaction/engine-code pairs this demo produces on purpose. The Explorer renders
 * these as evidence rather than errors — a refused transaction is the whole point of
 * steps s7 and s8. Anything else that is not `tesSUCCESS` is shown as an unexpected
 * failure, because quietly relabelling a real bug as "deliberate" is how a demo lies.
 *
 * Keyed on the pair and not on the code alone: the same `tecINSUFFICIENT_FUNDS` that is
 * the point of `s7`'s `VaultWithdraw` is a genuine failure on a `LoanSet` — originating
 * against a reserve that has no liquidity yet — and the two must not read alike.
 */
export const DELIBERATE_CASES: Array<{ type: string; result: string; why: string }> = [
  { type: 'VaultDeposit', result: 'tecNO_AUTH', why: 'the compliance gate refusing an account without an accepted credential' },
  { type: 'VaultWithdraw', result: 'tecINSUFFICIENT_FUNDS', why: 'a withdrawal past available liquidity, refused by the protocol' },
  { type: 'LoanPay', result: 'tecKILLED', why: 'tfLoanFullPayment on a loan with PaymentRemaining == 1 (XLS-66 §3.11.2)' },
]

/**
 * The annotation for a submitted transaction, or `undefined` if this code was not the
 * point. Type strings carry parentheticals ("VaultDeposit (funded intruder)") and the
 * live `txLog` carries the bare type, so only the leading transaction type is matched.
 */
export function deliberateNote(type: string | undefined, result: string): string | undefined {
  const txType = (type ?? '').trim().split(' ')[0]
  return DELIBERATE_CASES.find((entry) => entry.type === txType && entry.result === result)?.why
}

export interface Finding {
  id: string
  title: string
  category: string
  severity: 'high' | 'medium' | 'low'
  /** One sentence, worded exactly as the report words it — no stronger. */
  claim: string
  detail: string[]
  repro: string
  hashes: Array<{ label: string; hash: string }>
  fix: string
  refs: string[]
}

export const FINDINGS: Finding[] = [
  {
    id: 'escrow-wall',
    title: 'No lock can trigger on another ledger object’s state',
    category: 'Missing primitive',
    severity: 'high',
    claim:
      'TokenEscrow releases on a time condition or a crypto-condition fulfillment — never on the state of another ledger object, so an escrow cannot ask whether a specific Loan is in default and self-trigger.',
    detail: [
      'Credit insurance needs to pay out exactly when a Loan is marked defaulted by LoanManage (tfLoanDefault). Nothing in the protocol lets an Escrow observe that flag.',
      'Our workaround is a named, disclosed trusted party: the manager holds the crypto-condition’s fulfillment and reveals it with EscrowFinish once they have recorded the real default on-ledger.',
      'Conclusion, stated plainly: a genuinely trustless credit derivative is not buildable on XRPL today.',
    ],
    repro: 'npm run demo prestage && npm run demo s9',
    hashes: [
      { label: 'EscrowCreate (insurer locks cover)', hash: '8176143DD6D6F34FD90D7CA291E2DB1A4B34217B7F98574F6EC9FF24F7C1F8BD' },
      { label: 'LoanManage tfLoanDefault', hash: '4F8324E976FCCDDA18D629446E4E53FBFC619A34C9176257AA38C62FE47A7536' },
      { label: 'EscrowFinish (manager reveals fulfillment)', hash: '8C6658F773FAC83F3F0A6D869E8098D9729954DAD7E7919CB10C348D39DD7F1E' },
    ],
    fix:
      'A lock/escrow variant that can reference another ledger object’s field — a Loan’s lsfLoanDefault flag — as a release condition. This sits squarely in the programmable-locks / sponsor-signing territory already in progress, and credit insurance is a concrete motivating example for it.',
    refs: ['FEEDBACK_REPORT.md §1', 'XLS-66 §3.12 (LoanManage)', 'XLS-85 (TokenEscrow)'],
  },
  {
    id: 'private-vault-loans',
    title: 'A private vault gates deposits but not loans',
    category: 'Missing primitive, borderline documentation',
    severity: 'high',
    claim:
      'With a PermissionedDomain configured, an uncredentialed borrower is stopped by the broker’s off-ledger discretion alone, not by the protocol.',
    detail: [
      'XLS-65 §3.5.2.2 #6 refuses a VaultDeposit from a non-member of the share issuance’s PermissionedDomain. XLS-66 §3.8.5.2 lists 24 failure conditions for LoanSet and none consults MPTokenIssuance(Vault.ShareMPTID).DomainID.',
      'Its two tecNO_AUTH cases (#22 the Borrower, #23 the LoanBroker.Owner) are asset-holding authorization — does an MPToken/RippleState exist — which is a different question from domain membership.',
      'So an account the vault refuses a deposit from was handed that same vault’s assets as a loan, in the very next transaction, in the same ledger state. Reproduced identically on two independent runs.',
      'This is not an exploit and we are not claiming one: LoanSet is dual-signed, so the broker must still counter-sign and nobody originates a loan unilaterally.',
    ],
    repro: 'npm run demo gate',
    hashes: [
      { label: 'VaultDeposit → tecNO_AUTH (run 2)', hash: 'B0EF83FE333241766DF49BE93CF88F739E6ADC91177ED70855FA38A636DD4774' },
      { label: 'LoanSet → tesSUCCESS (run 2, next tx)', hash: 'DD77E5807DC4D052530238268687EB33BA812504C860A26794088565FE5EC1E2' },
      { label: 'VaultDeposit → tecNO_AUTH (run 1)', hash: '4727C0825DCE0DE304C128041EF9D20F1AB761004D9870A79EDB06678D2020FC' },
      { label: 'LoanSet → tesSUCCESS (run 1)', hash: 'D30EA1A153CDB1B92E04373643AF12486DC3F95D37B4F6F0FE2F55B25C644603' },
    ],
    fix:
      'Preferred: have LoanSet check the Borrower against the vault share issuance’s DomainID when lsfVaultPrivate is set, and add it to §3.8.5.2 as a tecNO_AUTH case. Otherwise, if the asymmetry is deliberate, say so explicitly in XLS-65 §3.4 and XLS-66 §3.8 — “a private vault restricts who may deposit, not who may borrow” — because the natural reading of “private vault” is that both sides are permissioned, and nothing currently contradicts it.',
    refs: ['FEEDBACK_REPORT.md §2', 'XLS-65 §3.5.2.2 #6', 'XLS-66 §3.8.5.2'],
  },
  {
    id: 'principal-base-units',
    title: 'PrincipalRequested is not scaled by the funding asset’s AssetScale',
    category: 'Documentation, borderline protocol',
    severity: 'high',
    claim:
      'For a loan funded by an MPT with AssetScale 2, PrincipalRequested: "2000" disbursed 2,000 raw base units (€20.00), not €2,000 — the field is base-unit denominated end to end, and nothing says so.',
    detail: [
      'PrincipalRequested is a self-describing “Number” ledger field, not an MPTAmount, so the natural reading is that it carries its own magnitude independent of the funding asset’s AssetScale.',
      'The resulting Loan.PrincipalOutstanding also reads "2000", confirming the convention on both sides. By the same convention TotalValueOutstanding, PeriodicPayment and the broker’s DebtTotal / CoverAvailable are base-unit values too.',
      'Failure mode: no error, just a loan 100x smaller than intended — which is exactly the kind of mistake that ships.',
    ],
    repro: 'npm run demo s4  (flows/loan.ts originate() re-reads the Loan and checks the scale against the live ledger)',
    hashes: [{ label: 'LoanSet after the fix (s4)', hash: 'C7B2620D41A46094A60A2E53527808CDE0C31F1A3A18D7AD0DE22A0F3C1CAAF2' }],
    fix:
      'State explicitly, in the XLS-66 reference next to PrincipalRequested and every other Loan “Number” amount field, that these values share the funding asset’s base-unit representation regardless of its AssetScale.',
    refs: ['FEEDBACK_REPORT.md §7', 'docs/FRICTION.md 17:15Z', 'src/protocol/lib/mpt.ts'],
  },
]
