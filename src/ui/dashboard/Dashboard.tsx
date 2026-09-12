import { useEffect, useState } from 'react'
import type { SubmittableTransaction } from 'xrpl'
import { ArrowDownToLine, ArrowUpFromLine, HandCoins, ShieldPlus } from 'lucide-react'
import { Chip, NeedsDemo, Panel, SectionHeading } from '../components/Panel'
import { Field, Fields, Hero, Meter, Metric } from '../components/Figures'
import { Changed } from '../components/Changed'
import { AddressLink, TxLink } from '../components/TxLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAppState, type AppState } from '../lib/appState'
import { useLedger } from '../lib/ledger'
import { useMptBalance, useRedeemable, useWalletSubmit } from '../lib/walletActions'
import { useXrpBalance } from '../lib/market'
import { useProtection, type ProtectionView } from '../lib/protection'
import {
  clockTime,
  countdown,
  coverRatePercent,
  eur,
  eurToBaseUnits,
  fillPercent,
  isoToClock,
  lessThanBase,
  minimumCover,
  sharePrice,
  subtractBase,
  units,
  xrp,
} from '../lib/format'
import { hrefFor } from '../lib/router'
import { useWallet } from '../wallet/WalletContext'
import { useDashboard, type BrokerView, type DashboardData, type LoanView, type VaultView } from './useDashboard'
import { recordSample, useHistory, type Sample } from './useHistory'
import { Trend } from './Trend'

/**
 * The reserve's headline, and the one hero figure on this screen. Share price is what an
 * investor's stake is worth, and it is the number that rises on its own as the reserve
 * collects interest — there is no distribution transaction to watch, so this is the only
 * place the yield shows up.
 */
function ReservePanel({ vault, history }: { vault: VaultView | null; history: Sample[] }) {
  if (!vault) {
    return (
      <Panel title="Reserve" tone="off">
        <NeedsDemo what="The vault does not exist yet" command="npm run demo setup" />
      </Panel>
    )
  }

  const price = sharePrice(vault.assetsTotal, vault.outstandingShares, vault.assetScale, vault.shareScale)
  const lent = subtractBase(vault.assetsTotal, vault.assetsAvailable)

  return (
    <Panel
      title="Reserve"
      aside={<Chip>{vault.private ? 'private · domain-gated' : 'open'}</Chip>}
      className="lg:col-span-2"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(200px,260px)_1fr] md:items-center">
        <div>
          <Changed value={price} tone="accent">
            <Hero value={price ?? '—'} label="share price (assets per share)" />
          </Changed>

          <div className="mt-5">
            <Meter
              percent={fillPercent(lent, vault.assetsTotal)}
              label={`${eur(lent, vault.assetScale)} of ${eur(vault.assetsTotal, vault.assetScale)} deployed into loans`}
            />
            <p className="text-muted-foreground mt-2 text-[13px]">
              {eur(lent, vault.assetScale)} of {eur(vault.assetsTotal, vault.assetScale)} deployed into loans
            </p>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1 text-xs tracking-wide uppercase">Share price since this page opened</p>
          <Trend data={history} metric="sharePrice" name="Share price" format={(v) => v.toFixed(4)} height={150} />
        </div>
      </div>

      <Fields>
        <Field label="Assets total">{eur(vault.assetsTotal, vault.assetScale)}</Field>
        <Field label="Available">{eur(vault.assetsAvailable, vault.assetScale)}</Field>
        <Field label="Shares out">{units(vault.outstandingShares, vault.shareScale)}</Field>
      </Fields>
    </Panel>
  )
}

/**
 * What the reserve has already lost and not yet realized.
 *
 * Zero is three different stories and the panel has to tell them apart. With no default on
 * the books it is simply "nothing has gone wrong yet". With a loan carrying
 * `lsfLoanDefault` and `LossUnrealized` still absent from the vault, it is the demo's whole
 * point: the manager's first-loss cover absorbed the hit before any investor saw it. Saying
 * only "€0.00" at that moment leaves the audience to guess which of the two they are
 * looking at — and the second one is the thing worth watching.
 */
function LossPanel({
  vault,
  loans,
  history,
}: {
  vault: VaultView | null
  loans: Record<'A' | 'B', LoanView | null>
  history: Sample[]
}) {
  if (!vault) return null
  const hasLoss = Number(vault.lossUnrealized) > 0
  const formatted = eur(vault.lossUnrealized, vault.assetScale)
  const defaulted = (['A', 'B'] as const).filter((slot) => loans[slot]?.status === 'defaulted')
  const absorbed = !hasLoss && defaulted.length > 0

  return (
    <Panel
      title="Unrealized loss"
      tone={hasLoss ? 'err' : absorbed ? 'warn' : 'on'}
      aside={
        <Chip>
          {hasLoss
            ? 'investors are carrying it'
            : absorbed
              ? 'absorbed by the cushion'
              : 'no default on the books'}
        </Chip>
      }
    >
      <Changed value={formatted} tone="err">
        <Metric
          value={formatted}
          label="LossUnrealized, straight off vault_info"
          tone={hasLoss ? 'err' : undefined}
        />
      </Changed>

      {absorbed && (
        <p className="text-warn mt-2.5 text-[13px]">
          Loan {defaulted.join(' and ')} {defaulted.length > 1 ? 'are' : 'is'} defaulted, and this is still zero — the
          manager’s first-loss cover took the hit. The vault only writes down a loss once the cushion is exhausted, so
          a reserve showing €0.00 next to a defaulted loan is the cushion doing its job, not a missing number.
        </p>
      )}

      <div className="mt-4">
        <Trend data={history} metric="lossUnrealized" name="Unrealized loss" format={(v) => `€${v.toLocaleString()}`} />
      </div>
    </Panel>
  )
}

function CushionPanel({
  broker,
  history,
  onPostCover,
  busy,
}: {
  broker: BrokerView | null
  history: Sample[]
  onPostCover: (eurAmount: string) => void
  busy: boolean
}) {
  const { isConnected } = useWallet()
  const [amount, setAmount] = useState('500')

  if (!broker) {
    return (
      <Panel title="Manager cushion" tone="off">
        <NeedsDemo what="No loan broker yet" command="npm run demo setup" />
      </Panel>
    )
  }

  const required = minimumCover(broker.debtTotal, broker.coverRateMinimum)
  const short = lessThanBase(broker.coverAvailable, required)
  const formatted = eur(broker.coverAvailable)
  const requiredNumber = Number(required) / 100

  return (
    <Panel title="Manager cushion" tone={short ? 'warn' : 'on'} aside={<Chip>first-loss</Chip>}>
      <Changed value={formatted} tone={short ? 'warn' : 'ok'}>
        <Metric value={formatted} label="cover posted by the manager" tone={short ? 'warn' : undefined} />
      </Changed>

      <div className="mt-3.5">
        <Meter
          percent={fillPercent(broker.coverAvailable, required === '0' ? '1' : required)}
          tone={short ? 'warn' : 'ok'}
          label={`Cover available against the ${eur(required)} minimum the protocol requires`}
        />
      </div>

      <div className="mt-4">
        <Trend
          data={history}
          metric="cover"
          name="Cover available"
          format={(v) => `€${v.toLocaleString()}`}
          referenceValue={requiredNumber > 0 ? requiredNumber : null}
          referenceLabel="minimum required"
        />
      </div>

      <Fields>
        <Field label="Debt total">{eur(broker.debtTotal)}</Field>
        <Field label="Min required">
          {eur(required)}{' '}
          <span className="text-muted-foreground">({coverRatePercent(broker.coverRateMinimum)} of debt)</span>
        </Field>
        <Field label="Debt ceiling">
          {Number(broker.debtMaximum) > 0 ? eur(broker.debtMaximum) : <span className="text-muted-foreground">unlimited</span>}
        </Field>
      </Fields>

      <p className="text-muted-foreground mt-3 text-[13px]">
        This is the manager’s own money, and it absorbs a default before any investor does.
      </p>

      {isConnected && (
        <form
          className="mt-3.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onPostCover(amount)
          }}
        >
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Cover amount in EUR"
            className="w-32"
          />
          <Button type="submit" variant="outline" size="sm" disabled={busy}>
            <ShieldPlus /> Post cover (as manager)
          </Button>
        </form>
      )}
    </Panel>
  )
}

const LOAN_TONE = { active: 'on', repaid: 'on', impaired: 'warn', defaulted: 'err' } as const
const LOAN_BADGE = { active: 'ok', repaid: 'muted', impaired: 'warn', defaulted: 'err' } as const
const LOAN_LABEL = { active: 'Active', repaid: 'Repaid in full', impaired: 'Impaired', defaulted: 'Defaulted' } as const

function LoanCard({
  slot,
  loan,
  ledgerTime,
  onRepay,
  busy,
}: {
  slot: 'A' | 'B'
  loan: LoanView | null
  ledgerTime: number | null
  onRepay: (loan: LoanView) => void
  busy: boolean
}) {
  const { isConnected } = useWallet()

  if (!loan) {
    return (
      <Panel title={`Loan ${slot}`} tone="off">
        <NeedsDemo what="Not originated yet" command={slot === 'A' ? 'npm run demo s4' : 'npm run demo prestage'} />
      </Panel>
    )
  }

  const defaultableAt = loan.nextPaymentDueDate ? loan.nextPaymentDueDate + loan.gracePeriod : null
  const payable = loan.status !== 'defaulted' && loan.paymentRemaining > 0
  const closed = loan.status === 'repaid'

  return (
    <Panel
      title={
        <>
          Loan {slot}
          <Badge variant={LOAN_BADGE[loan.status]}>{LOAN_LABEL[loan.status]}</Badge>
        </>
      }
      tone={LOAN_TONE[loan.status]}
      aside={<Chip>{closed ? 'nothing left to pay' : `${loan.paymentRemaining} payment(s) left`}</Chip>}
    >
      <Fields>
        <Field label="Outstanding">
          <Changed value={eur(loan.principalOutstanding)}>{eur(loan.principalOutstanding)}</Changed>
        </Field>
        <Field label="Total due">{eur(loan.totalValueOutstanding)}</Field>
        <Field label="Per payment">{eur(loan.periodicPayment)}</Field>
        {loan.nextPaymentDueDate > 0 && (
          <>
            <Field label="Next due">
              {clockTime(loan.nextPaymentDueDate)}{' '}
              <span className="text-muted-foreground">{countdown(loan.nextPaymentDueDate, ledgerTime)}</span>
            </Field>
            <Field label="Defaultable" tone={loan.status === 'defaulted' ? 'err' : undefined}>
              {loan.status === 'defaulted' ? 'already defaulted' : countdown(defaultableAt, ledgerTime)}
            </Field>
          </>
        )}
      </Fields>

      <p className="text-muted-foreground mt-3 text-[13px]">
        {closed ? (
          <>
            The ledger keeps no “repaid” flag — a settled loan simply stops carrying{' '}
            <code className="text-foreground">PrincipalOutstanding</code> and{' '}
            <code className="text-foreground">PaymentRemaining</code>, and its{' '}
            <code className="text-foreground">Flags</code> read <code className="text-foreground">0</code>, exactly like
            an untouched one.
          </>
        ) : (
          <>Grace period {loan.gracePeriod}s after the due date — measured in ledger time, not wall clock.</>
        )}
      </p>

      {isConnected && payable && (
        <div className="mt-3.5">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onRepay(loan)}>
            <HandCoins /> Repay {eur(loan.periodicPayment)} (as borrower)
          </Button>
        </div>
      )}
    </Panel>
  )
}

const PROTECTION_TONE: Record<ProtectionView['phase'], 'on' | 'off' | 'warn' | 'err'> = {
  none: 'off',
  locked: 'on',
  released: 'on',
  expired: 'off',
  'settled elsewhere': 'warn',
}

const PROTECTION_LABEL: Record<ProtectionView['phase'], string> = {
  none: 'Not sold yet',
  locked: 'Locked — awaiting the outcome',
  released: 'Paid out to the protection buyer',
  expired: 'Expired — the insurer reclaimed the cover',
  'settled elsewhere': 'The escrow object is gone and the demo did not release it',
}

function ProtectionPanel({ protection }: { protection: ProtectionView | null }) {
  const view = protection ?? {
    phase: 'none' as const,
    amount: null,
    destination: null,
    owner: null,
    condition: null,
    cancelAfter: null,
    onLedger: false,
  }

  return (
    <Panel
      title="Credit insurance"
      tone={PROTECTION_TONE[view.phase]}
      aside={
        <Badge variant="muted" asChild className="px-2.5 py-1 font-normal">
          <a href={hrefFor('/insurance')}>the wall →</a>
        </Badge>
      }
    >
      <Changed value={view.phase} tone="ok">
        <Metric value={view.amount ? eur(view.amount) : '—'} label={PROTECTION_LABEL[view.phase]} />
      </Changed>
      {view.destination && (
        <Fields>
          <Field label="Buyer">
            <AddressLink address={view.destination} />
          </Field>
          <Field label="Insurer">{view.owner ? <AddressLink address={view.owner} /> : '—'}</Field>
        </Fields>
      )}
      {view.phase === 'none' && (
        <div className="mt-3">
          <NeedsDemo what="No protection on the books" command="npm run demo prestage" />
        </div>
      )}
    </Panel>
  )
}

function EventFeed() {
  const { events, ledgerIndex, status } = useLedger()

  return (
    <Panel
      title="Live feed"
      tone={status === 'online' ? 'on' : status === 'connecting' ? 'off' : 'err'}
      aside={ledgerIndex ? <Chip>ledger {ledgerIndex}</Chip> : null}
    >
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm">Waiting for the first ledger close…</p>
      ) : (
        <ul className="m-0 list-none p-0 text-[13px]">
          {events.map((event) => (
            <li key={`${event.ts}-${event.text}`} className="border-border/60 text-muted-foreground flex gap-3 border-b py-1.5 last:border-b-0">
              <span className="tabular text-border-strong shrink-0">{isoToClock(event.ts)}</span>
              {event.text}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The investor's own actions on the reserve — deposit, and redeem exactly what the
 * connected account's shares are worth right now (mirrors `flows/vault.ts withdrawMax()`,
 * not a face-value amount fixed at deposit time, since share price moves).
 */
function WalletPanel({
  vaultId,
  shareMptId,
  issuanceId,
  onDeposit,
  onWithdrawAll,
  busy,
}: {
  vaultId: string | undefined
  shareMptId: string | undefined
  issuanceId: string | undefined
  onDeposit: (eurAmount: string) => void
  onWithdrawAll: (redeemableBaseUnits: string) => void
  busy: boolean
}) {
  const { account, isConnected } = useWallet()
  const address = account?.address ?? null
  const [amount, setAmount] = useState('1000')

  const xrpBalance = useXrpBalance(address)
  const tfeurBalance = useMptBalance(address, issuanceId)
  const redeemable = useRedeemable(address, vaultId, shareMptId)

  if (!isConnected) {
    return (
      <Panel title="Your wallet" tone="off">
        <p className="text-muted-foreground text-sm">
          Use <strong className="text-foreground">Connect wallet</strong> in the header to deposit into the reserve,
          repay a loan or post cover — from your own account, pointed at this devnet.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="Your wallet"
      aside={
        <Chip>
          <AddressLink address={address ?? ''} /> · {xrp(xrpBalance.data, 2)}
        </Chip>
      }
    >
      <Fields wide>
        <Field label="TFEUR balance">{eur(tfeurBalance.data)}</Field>
        {vaultId && <Field label="Redeemable now">{eur(redeemable.data)}</Field>}
      </Fields>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {vaultId && issuanceId && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onDeposit(amount)
            }}
          >
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              aria-label="Deposit amount in EUR"
              className="w-32"
            />
            <Button type="submit" disabled={busy}>
              <ArrowDownToLine /> Deposit into reserve
            </Button>
          </form>
        )}
        {vaultId && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !redeemable.data || redeemable.data === '0'}
            onClick={() => onWithdrawAll(redeemable.data ?? '0')}
          >
            <ArrowUpFromLine /> Withdraw everything redeemable
          </Button>
        )}
      </div>

      <p className="text-muted-foreground mt-3.5 text-[13px]">
        <code className="text-foreground">VaultDeposit</code> needs an accepted{' '}
        <code className="text-foreground">Credential</code> for this account if the reserve is private — a visitor
        without one gets <code className="text-foreground">tecNO_AUTH</code>, which is the gate working, not a broken
        button. <code className="text-foreground">VaultWithdraw</code> is never gated (see{' '}
        <a className="text-primary" href={hrefFor('/gate')}>
          The Gate
        </a>
        ).
      </p>
    </Panel>
  )
}

function SubmittedPanel({ log }: { log: ReturnType<typeof useWalletSubmit>['log'] }) {
  return (
    <Panel title="Submitted from this browser" tone={log.length ? 'on' : 'off'}>
      {log.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing yet. Deposits, withdrawals, repayments and cover posted from a connected wallet on this page are
          recorded here, in this browser only.
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
              {log.map((entry, index) => (
                // The hash alone is not a key: a wallet can resubmit and land the same hash
                // twice in this list.
                <TableRow key={`${entry.hash}-${entry.ts}-${index}`}>
                  <TableCell className="whitespace-nowrap">{new Date(entry.ts).toLocaleTimeString()}</TableCell>
                  <TableCell>
                    <code>{entry.type}</code>
                    {entry.note && <span className="text-muted-foreground text-xs"> — {entry.note}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.result === 'tesSUCCESS' ? 'ok' : 'err'}>
                      <code>{entry.result}</code>
                    </Badge>
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
  )
}

function StateNotice({ state, error }: { state: AppState | null; error: string | null }) {
  if (state) return null
  return (
    <Alert className="border-warn/30">
      <AlertTitle className="text-warn">No demo state yet</AlertTitle>
      <AlertDescription>
        <p>
          This screen reads object IDs from <code>public/state.json</code>, written by the protocol scripts. Run{' '}
          <code>npm run demo setup</code>, then <code>prestage</code> and <code>s1</code>…<code>s10</code>.
        </p>
        {error && <p className="text-xs">Last fetch: {error}</p>}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Pitch 1:00–3:00, and the screen the default trigger (`s9`) is performed against: the
 * cushion draining and `LossUnrealized` moving is the visual payload of the whole demo.
 * Every number here is read from the ledger on each close; nothing is computed from a
 * transaction we submitted, because the point is what the ledger says happened.
 *
 * The three charts are small multiples on a shared x — never one plot with two y-axes,
 * which would imply a relationship between share price, loss and cover that the data does
 * not contain. Every value a chart shows is also on screen as text in the same panel, so
 * nothing is reachable only by hovering.
 */
export function Dashboard() {
  const { state, error } = useAppState()
  const { ledgerTime } = useLedger()
  const { data, error: rpcError } = useDashboard(state)
  const { data: protection } = useProtection(state)
  const { pending, error: txError, clearError, log, send } = useWalletSubmit()
  const { account } = useWallet()
  const history = useHistory()

  // Sampled here rather than inside `useDashboard` so the accumulator stays a view concern:
  // nothing about reading the ledger changes because a chart wants a time series.
  useEffect(() => {
    recordSample(data)
  }, [data])

  const view: DashboardData = data ?? { vault: null, broker: null, loans: { A: null, B: null } }
  const address = account?.address ?? null
  const vaultId = state?.vault?.vaultId
  const shareMptId = state?.vault?.shareMptId
  const issuanceId = state?.mptIssuanceId
  const loanBrokerId = state?.loanBrokerId
  const busy = pending !== null

  const deposit = (eurAmount: string) => {
    if (!address || !vaultId || !issuanceId) return
    const value = eurToBaseUnits(eurAmount)
    if (!value) return
    void send(
      {
        TransactionType: 'VaultDeposit',
        Account: address,
        VaultID: vaultId,
        Amount: { mpt_issuance_id: issuanceId, value },
      } as SubmittableTransaction,
      `deposit ${eurAmount} EUR`,
    )
  }

  const withdrawAll = (redeemableBaseUnits: string) => {
    if (!address || !vaultId || !issuanceId || redeemableBaseUnits === '0') return
    void send(
      {
        TransactionType: 'VaultWithdraw',
        Account: address,
        VaultID: vaultId,
        Amount: { mpt_issuance_id: issuanceId, value: redeemableBaseUnits },
      } as SubmittableTransaction,
      'withdraw everything redeemable',
    )
  }

  const repay = (loan: LoanView) => {
    if (!address || !issuanceId) return
    void send(
      {
        TransactionType: 'LoanPay',
        Account: address,
        LoanID: loan.loanId,
        Amount: { mpt_issuance_id: issuanceId, value: loan.periodicPayment },
      } as SubmittableTransaction,
      `repay loan ${loan.loanId.slice(0, 8)}…`,
    )
  }

  const postCover = (eurAmount: string) => {
    if (!address || !loanBrokerId || !issuanceId) return
    const value = eurToBaseUnits(eurAmount)
    if (!value) return
    void send(
      {
        TransactionType: 'LoanBrokerCoverDeposit',
        Account: address,
        LoanBrokerID: loanBrokerId,
        Amount: { mpt_issuance_id: issuanceId, value },
      } as SubmittableTransaction,
      `post ${eurAmount} EUR cover`,
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading sub="Read live from the Custom Hackathon Devnet on every ledger close">
        The reserve, right now
      </SectionHeading>

      <StateNotice state={state} error={error} />
      {rpcError && (
        <p className="text-muted-foreground text-[13px]">
          Last ledger read failed: {rpcError} — showing the most recent values that came back.
        </p>
      )}

      {/* The error sits directly under the heading rather than between two panels, so an
          action that fails does not shove the numbers down the page mid-demo. */}
      {txError && (
        <Alert className="border-err/40" role="alert" aria-live="polite">
          <AlertTitle className="text-err">Last action</AlertTitle>
          <AlertDescription>
            <p className="wrap-anywhere">{txError}</p>
            <Button type="button" variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ReservePanel vault={view.vault} history={history} />
        <ProtectionPanel protection={protection} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LossPanel vault={view.vault} loans={view.loans} history={history} />
        <CushionPanel broker={view.broker} history={history} onPostCover={postCover} busy={busy} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LoanCard slot="A" loan={view.loans.A} ledgerTime={ledgerTime} onRepay={repay} busy={busy} />
        <LoanCard slot="B" loan={view.loans.B} ledgerTime={ledgerTime} onRepay={repay} busy={busy} />
      </div>

      <WalletPanel
        vaultId={vaultId}
        shareMptId={shareMptId}
        issuanceId={issuanceId}
        onDeposit={deposit}
        onWithdrawAll={withdrawAll}
        busy={busy}
      />

      <SubmittedPanel log={log} />
      <EventFeed />
    </div>
  )
}
