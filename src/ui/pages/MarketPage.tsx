import { useCallback, useMemo, useState } from 'react'
import { isValidClassicAddress, type SubmittableTransaction } from 'xrpl'
import { Chip, NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AddressLink, TxLink } from '../components/TxLink'
import { useAppState } from '../lib/appState'
import { countdown, shortHash, textToHex, xrp, xrpToDropsString } from '../lib/format'
import { useLedger } from '../lib/ledger'
import {
  appendLocalLog,
  publishedConditions,
  readLocalLog,
  refereeAddress,
  usePolicies,
  useXrpBalance,
  type LocalTx,
  type Policy,
} from '../lib/market'
import { submitFromWallet } from '../lib/walletTx'
import { useWallet } from '../wallet/WalletContext'

/**
 * The open protection market — the screen that proved the browser could submit at all, and
 * whose autofill-sign-submit path the Dashboard and The Gate now share via
 * `lib/walletActions.ts`.
 *
 * A policy is an `EscrowCreate` over the visitor's own XRP: single-signed, and not gated by
 * the vault's `PermissionedDomain`. That last part is the same asymmetry
 * `FEEDBACK_REPORT.md` §2 reports from the other side — the insurance overlay sits outside
 * the protocol, so it is open to everyone by default rather than by design.
 *
 * The honest part is at the bottom of the page: nothing on-ledger connects one of these
 * escrows to the loan it insures. The referee publishes a secret, and that is the entire
 * settlement mechanism.
 */

type Pending = 'write' | 'premium' | 'claim' | 'reclaim' | null

const DEFAULT_EXPIRY_MINUTES = '60'

export function MarketPage() {
  const { state } = useAppState()
  const { client, ledgerTime } = useLedger()
  const { walletManager, account, isConnected } = useWallet()

  const conditions = publishedConditions(state)
  const referee = refereeAddress(state)
  const address = account?.address ?? null

  const [extraAccount, setExtraAccount] = useState('')
  const [watchlist, setWatchlist] = useState<string[]>([])
  const policies = usePolicies(state, address, watchlist)
  const balance = useXrpBalance(address)

  const [log, setLog] = useState<LocalTx[]>(() => readLocalLog())
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)

  // Write-a-policy form.
  const [loan, setLoan] = useState('')
  const [buyer, setBuyer] = useState('')
  const [cover, setCover] = useState('10')
  const [expiry, setExpiry] = useState(DEFAULT_EXPIRY_MINUTES)
  const [premium, setPremium] = useState('1')

  const selectedCondition = useMemo(
    () => conditions.find((entry) => entry.loan === (loan || conditions[0]?.loan)) ?? null,
    [conditions, loan],
  )

  const send = useCallback(
    async (kind: Exclude<Pending, null>, tx: SubmittableTransaction, note: string) => {
      if (!walletManager || !address) return
      setPending(kind)
      setError(null)
      try {
        const outcome = await submitFromWallet(walletManager, client, tx)
        setLog(
          appendLocalLog({
            ts: new Date().toISOString(),
            type: tx.TransactionType,
            result: outcome.result,
            hash: outcome.hash,
            note,
          }),
        )
        // The raw engine code is the signal, so a tec* outcome is shown as plainly as a
        // thrown error rather than being reported as success.
        if (outcome.result !== 'tesSUCCESS') setError(`${tx.TransactionType} → ${outcome.result}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setPending(null)
      }
    },
    [walletManager, address, client],
  )

  const writePolicy = () => {
    if (!address || !selectedCondition) return
    const drops = xrpToDropsString(cover)
    const minutes = Number(expiry)
    if (!drops) return setError('Cover must be a plain amount in XRP, at most six decimals.')
    if (!isValidClassicAddress(buyer)) return setError('The protection buyer must be a classic r-address.')
    if (buyer === address) return setError('A policy pays its Destination — writing one to yourself locks your own XRP for nothing.')
    if (!Number.isFinite(minutes) || minutes < 2) return setError('Expiry must be at least 2 minutes out.')
    if (ledgerTime === null) return setError('No ledger time yet — wait for the next close.')

    void send(
      'write',
      {
        TransactionType: 'EscrowCreate',
        Account: address,
        Destination: buyer,
        Amount: drops,
        Condition: selectedCondition.condition,
        // Ledger time, never Date.now(): CancelAfter is in the Ripple epoch and the two
        // clocks are 946,684,800 seconds apart.
        CancelAfter: Math.floor(ledgerTime + minutes * 60),
      },
      `cover on loan ${selectedCondition.loan} for ${buyer}`,
    )
  }

  const payPremium = (policy: Policy) => {
    if (!address) return
    const drops = xrpToDropsString(premium)
    if (!drops) return setError('Premium must be a plain amount in XRP, at most six decimals.')
    void send(
      'premium',
      {
        TransactionType: 'Payment',
        Account: address,
        Destination: policy.seller,
        Amount: drops,
        // The memo is the only thing tying a premium to the policy it pays for: the
        // protocol has no leg for it, so this is a convention, not a guarantee.
        Memos: [
          {
            Memo: {
              MemoType: textToHex('trustflow/premium'),
              MemoData: textToHex(`${policy.seller}:${policy.offerSequence}`),
            },
          },
        ],
      },
      `premium on ${shortHash(policy.key, 10, 4)}`,
    )
  }

  const claim = (policy: Policy) => {
    if (!address) return
    const match = conditions.find((entry) => entry.condition === policy.condition)
    if (!match?.fulfillment) {
      return setError('The referee has not published the fulfillment for this loan — nothing to claim with yet.')
    }
    void send(
      'claim',
      {
        TransactionType: 'EscrowFinish',
        Account: address,
        Owner: policy.seller,
        OfferSequence: policy.offerSequence,
        Condition: policy.condition,
        Fulfillment: match.fulfillment,
      },
      `claim on loan ${policy.loan} → ${policy.buyer}`,
    )
  }

  const reclaim = (policy: Policy) => {
    if (!address) return
    void send(
      'reclaim',
      {
        TransactionType: 'EscrowCancel',
        Account: address,
        Owner: policy.seller,
        OfferSequence: policy.offerSequence,
      },
      `reclaim of ${shortHash(policy.key, 10, 4)}`,
    )
  }

  const rows = policies.data ?? []
  const busy = pending !== null

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        sub={
          <>
            Anyone with a wallet on this devnet can sell default protection, buy it, and settle
            it — with their own XRP, from this page. The rest of TrustFlow signs nothing in the
            browser; this screen is the exception, and the reason is at the bottom.
          </>
        }
      >
        Open protection market
      </SectionHeading>

      {conditions.length === 0 ? (
        <Panel title="No conditions published" tone="off">
          <NeedsDemo command="npm run demo referee" what="The referee has not published a condition to write policies against yet" />
        </Panel>
      ) : (
        <>
          <Panel
            title="How a policy works here"
            tone="on"
            aside={
              referee && (
                <Chip>
                  referee&nbsp;<AddressLink address={referee} />
                </Chip>
              )
            }
          >
            <ol className="m-0 grid list-decimal gap-2 pl-5 text-sm">
              <li>
                <strong>The referee publishes a condition</strong> per loan — a PREIMAGE-SHA-256
                hash. The preimage that opens it stays with them.
              </li>
              <li>
                <strong>A seller writes a policy</strong>: an <code>EscrowCreate</code> locking
                their own XRP, carrying that condition, with the buyer as <code>Destination</code>.
              </li>
              <li>
                <strong>The buyer pays premiums</strong> as ordinary <code>Payment</code>s while
                the loan performs.
              </li>
              <li>
                <strong>Settlement is one of two things.</strong> The loan defaults, the referee
                publishes the fulfillment, and anyone can submit <code>EscrowFinish</code> — the
                cover goes to the buyer regardless of who sent it. Or the loan performs, the
                expiry passes, and anyone can submit <code>EscrowCancel</code> to return the cover
                to the seller, who keeps the premiums.
              </li>
            </ol>
            <p className="text-muted-foreground mt-2.5 text-[13px]">
              Verified on this devnet: an escrow is listed in both the seller's and the buyer's
              owner directory, and a third party who is neither can finish it.
            </p>
          </Panel>

          <Panel title="Reference loans" tone="on">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conditions.map((entry) => (
                    <TableRow key={entry.condition}>
                      <TableCell className="font-semibold">Loan {entry.loan}</TableCell>
                      <TableCell>
                        <code title={entry.condition}>{shortHash(entry.condition, 16, 6)}</code>
                      </TableCell>
                      <TableCell>
                        {entry.revealed ? (
                          <Badge variant="warn" className="gap-1.5 px-2.5 py-1">
                            <code>defaulted</code>
                            <span className="text-[10.5px] tracking-wide uppercase opacity-75">claimable</span>
                          </Badge>
                        ) : (
                          <Badge variant="ok" className="gap-1.5 px-2.5 py-1">
                            <code>performing</code>
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          {!isConnected ? (
            <Panel title="Connect a wallet to take a position" tone="warn">
              <p className="text-muted-foreground text-sm">
                Use <strong>Connect wallet</strong> in the header. Your wallet must be pointed at{' '}
                <code>wss://lending-hackathon.dev.ripplex.io:51233</code> — a policy signed against
                another network lands on a ledger where none of this exists.
              </p>
            </Panel>
          ) : (
            <Panel
              title="Write a policy"
              tone="on"
              aside={
                <Chip>
                  <AddressLink address={address ?? ''} /> · {xrp(balance.data, 2)}
                </Chip>
              }
            >
              <div className="my-3.5 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-[13px]">Reference loan</span>
                  <select
                    className="border-input bg-muted h-9 rounded-md border px-3 text-sm"
                    value={loan || conditions[0]?.loan}
                    onChange={(e) => setLoan(e.target.value)}
                  >
                    {conditions.map((entry) => (
                      <option key={entry.condition} value={entry.loan}>
                        Loan {entry.loan} {entry.revealed ? '(already defaulted)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-[13px]">Protection buyer</span>
                  <Input
                    value={buyer}
                    onChange={(e) => setBuyer(e.target.value)}
                    placeholder="r… — who gets paid if the loan defaults"
                    spellCheck={false}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-[13px]">Cover (XRP)</span>
                  <Input value={cover} onChange={(e) => setCover(e.target.value)} inputMode="decimal" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-[13px]">Expires in (minutes)</span>
                  <Input value={expiry} onChange={(e) => setExpiry(e.target.value)} inputMode="numeric" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                <Button type="button" onClick={writePolicy} disabled={busy}>
                  {pending === 'write' ? 'Waiting for your wallet…' : 'Lock the cover'}
                </Button>
                <span className="text-muted-foreground text-[13px]">
                  Signs an <code>EscrowCreate</code> from your account. Your XRP is locked until the
                  loan defaults or the expiry passes.
                </span>
              </div>
            </Panel>
          )}

          {error && (
            <Alert className="border-err/40" role="alert" aria-live="polite">
              <AlertDescription>
              <strong>Last action</strong>
              <p>{error}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Panel
            title="Positions"
            tone={rows.length ? 'on' : 'off'}
            aside={
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (isValidClassicAddress(extraAccount)) {
                    setWatchlist((prev) => [...new Set([...prev, extraAccount])])
                    setExtraAccount('')
                  } else {
                    setError('That is not a classic r-address.')
                  }
                }}
              >
                <Input
                  value={extraAccount}
                  onChange={(e) => setExtraAccount(e.target.value)}
                  placeholder="watch another account"
                  spellCheck={false}
                  className="w-56"
                />
                <Button type="submit" variant="outline" size="sm">
                  Add
                </Button>
              </form>
            }
          >
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No policies on the accounts being watched — the demo roles, your own account, and
                anything added above. {policies.loading && 'Still reading the ledger…'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Buyer</TableHead>
                      <TableHead>Cover</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Settle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((policy) => {
                      const expired = policy.cancelAfter !== null && ledgerTime !== null && ledgerTime >= policy.cancelAfter
                      const mine = address === policy.seller || address === policy.buyer
                      return (
                        <TableRow key={policy.key}>
                          <TableCell className="font-semibold">
                            Loan {policy.loan}
                            {mine && (
                              <span className="text-muted-foreground text-[10.5px] tracking-wide uppercase"> yours</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <AddressLink address={policy.seller} />
                          </TableCell>
                          <TableCell>
                            <AddressLink address={policy.buyer} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{xrp(policy.amountDrops, 2)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {countdown(policy.cancelAfter, ledgerTime)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {policy.claimable && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || !isConnected}
                                  onClick={() => claim(policy)}
                                >
                                  Claim → buyer
                                </Button>
                              )}
                              {expired && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy || !isConnected}
                                  onClick={() => reclaim(policy)}
                                >
                                  Reclaim → seller
                                </Button>
                              )}
                              {address === policy.buyer && !policy.claimable && !expired && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => payPremium(policy)}
                                >
                                  Pay {premium} XRP premium
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            {isConnected && rows.length > 0 && (
              <label className="mt-3.5 flex max-w-[260px] flex-col gap-1.5">
                <span className="text-muted-foreground text-[13px]">Premium amount (XRP)</span>
                <Input value={premium} onChange={(e) => setPremium(e.target.value)} inputMode="decimal" />
              </label>
            )}
          </Panel>

          <Panel title="Submitted from this browser" tone={log.length ? 'on' : 'off'}>
            {log.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing yet. Transactions you send from this page are recorded here, in this
                browser only — the Explorer's log is written by the protocol scripts and cannot
                see them.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {log.map((entry) => (
                      <TableRow key={entry.hash}>
                        <TableCell className="whitespace-nowrap">{new Date(entry.ts).toLocaleTimeString()}</TableCell>
                        <TableCell>
                          <code>{entry.type}</code>
                          {entry.note && <span className="text-muted-foreground text-[13px]"> — {entry.note}</span>}
                        </TableCell>
                        <TableCell>
                          <span className={`pill pill-${entry.result === 'tesSUCCESS' ? 'success' : 'failure'}`}>
                            <code>{entry.result}</code>
                          </span>
                        </TableCell>
                        <TableCell>
                          <TxLink hash={entry.hash} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel title="What the protocol does not provide here" tone="warn">
            <p>
              <strong>Nothing on-ledger ties a policy to the loan it insures.</strong> An escrow
              releases on a time condition or a crypto-condition and on nothing else, so it cannot
              ask whether a <code>Loan</code> carries <code>lsfLoanDefault</code>. Every position
              on this page is settled by one named party publishing a preimage — they can publish
              it early, or never, and the protocol neither prevents nor records either.
            </p>
            <p>
              <strong>There is no way to find these policies.</strong> An escrow is discoverable
              only through the owner directories of the two accounts named in it, so this table
              scans a list of accounts rather than querying a market. A real venue needs an
              indexer for what is, on-ledger, an unremarkable escrow.
            </p>
            <p>
              <strong>A premium is not part of the contract.</strong> It is a separate{' '}
              <code>Payment</code> tied to the policy by a memo convention and nothing else — miss
              one and the escrow does not notice.
            </p>
            <p className="text-muted-foreground mt-2.5 text-[13px]">
              The same three gaps, from the demo's own side, are <code>FEEDBACK_REPORT.md</code> §1
              and §4. This page exists to show what they cost once strangers' money is behind them.
            </p>
          </Panel>
        </>
      )}
    </div>
  )
}
