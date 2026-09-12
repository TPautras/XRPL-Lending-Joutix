import { ArrowRight, KeyRound, PenLine, Search } from 'lucide-react'
import { AccountPanel } from '../components/AccountPanel'
import { WalletConnectNotice } from '../components/WalletConnectNotice'
import { Chip, SectionHeading } from '../components/Panel'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { hrefFor } from '../lib/router'

const ROLES = [
  {
    role: 'Investor',
    does: 'Deposits into the shared reserve and receives a share of it',
    primitive: 'VaultDeposit · vault shares (MPT)',
  },
  {
    role: 'Manager (broker)',
    does: 'Picks which invoices to fund — and posts their own money first-loss before any loan',
    primitive: 'LoanBrokerSet · LoanBrokerCoverDeposit',
  },
  {
    role: 'SME (borrower)',
    does: 'Borrows against an invoice today, repays on schedule',
    primitive: 'LoanSet (dual-signed) · LoanPay',
  },
  {
    role: 'Insurer',
    does: 'Sells default protection on one specific loan, locks the covered amount, keeps the premium if the loan performs',
    primitive: 'EscrowCreate · EscrowFinish / EscrowCancel',
  },
  {
    role: 'Authority',
    does: 'Issues the compliance credential that the reserve requires',
    primitive: 'CredentialCreate · PermissionedDomainSet',
  },
]

const PRIMITIVES = [
  'Single Asset Vault (XLS-65)',
  'Lending Protocol (XLS-66)',
  'MPT',
  'Credentials',
  'Permissioned Domain',
  'TokenEscrow',
]

/**
 * What a connected wallet can and cannot do here — stated on the opening screen rather than
 * discovered when a button is missing. The dividing line is not a policy we chose: it is how
 * many signatures each transaction needs, and who holds them.
 */
const SIGNING = [
  {
    icon: PenLine,
    title: 'Your own signature is enough',
    body: (
      <>
        <code>VaultDeposit</code>, <code>VaultWithdraw</code>, <code>LoanPay</code>,{' '}
        <code>LoanBrokerCoverDeposit</code>, <code>CredentialAccept</code> and the escrows behind a protection policy.
        Connect a wallet and the Dashboard, The Gate and the Market submit them from your account.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: 'Two signatures, or a key we never ask you for',
    body: (
      <>
        <code>LoanSet</code> is dual-signed by borrower <em>and</em> broker — no single wallet holds both keys, so it
        stays scripted in <code>src/protocol/</code>. So do the authority’s <code>CredentialCreate</code> and the
        manager’s <code>LoanBrokerSet</code>, <code>LoanManage</code> and <code>VaultCreate</code>.
      </>
    ),
  },
  {
    icon: Search,
    title: 'A refusal is a result, not a bug',
    body: (
      <>
        Deposit from a wallet with no accepted <code>Credential</code> and the private reserve answers{' '}
        <code>tecNO_AUTH</code>. That is the gate doing its job, and this app shows you the engine code rather than
        hiding it behind “something went wrong”.
      </>
    ),
  },
]

/**
 * Pitch 0:00–1:00. Deliberately static — no RPC, no state.json — so it renders even if the
 * devnet is down or has reset mid-pitch. It is the safe screen to open on.
 */
export function Home() {
  return (
    <div className="flex flex-col gap-5">
      <section
        className="border-border rounded-2xl border px-8 py-8"
        style={{
          background:
            'radial-gradient(120% 160% at 0% 0%, rgba(79, 140, 255, 0.12), transparent 60%), var(--card)',
        }}
      >
        <p className="text-primary m-0 mb-3 text-xs tracking-[0.09em] uppercase">
          Invoice factoring + credit insurance on the XRP Ledger
        </p>
        <h1 className="m-0 max-w-[30ch] text-[34px] leading-[1.18] font-bold tracking-tight">
          An SME ships, invoices, and waits <span className="text-warn">90 days</span> to get paid.
        </h1>
        <p className="mt-4 max-w-[66ch] text-base">
          TrustFlow pays the invoice immediately. Investors pool capital in a shared reserve, a manager selects which
          invoices to fund by putting their own money in first-loss, and an insurer covers the default risk on a given
          loan.
        </p>
        <p className="text-muted-foreground mt-3.5 mb-5 max-w-[66ch] text-sm">
          Every step — deposit, loan, repayment, default, payout — is native XLS-65 and XLS-66, coupled with
          Credentials, a Permissioned Domain and TokenEscrow.{' '}
          <strong className="text-foreground">No custom contracts.</strong>
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button asChild>
            <a href={hrefFor('/dashboard')}>
              Open the live reserve <ArrowRight />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={hrefFor('/findings')}>What we found</a>
          </Button>
        </div>
        <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0">
          {PRIMITIVES.map((primitive) => (
            <li key={primitive}>
              <Chip>{primitive}</Chip>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeading sub="Who puts money in, and whose money is at risk first">The four roles</SectionHeading>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Does</TableHead>
                <TableHead className="whitespace-normal">On-ledger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLES.map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="font-semibold">{row.role}</TableCell>
                  <TableCell className="whitespace-normal">{row.does}</TableCell>
                  {/* shadcn's TableCell is `whitespace-nowrap` by default, which clipped this
                      column off the right edge behind a scrollbar — and nobody scrolls a table
                      that is being projected. */}
                  <TableCell className="whitespace-normal">
                    <code>{row.primitive}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-[13px]">
          Share value rises mechanically as the reserve collects interest — there is no distribution transaction, the
          appreciation is in the share price itself (<code>AssetsTotal</code> growth).
        </p>
      </section>

      <section>
        <SectionHeading sub="The line is drawn by how many signatures a transaction needs — not by what we felt like wiring up">
          What this app signs, and what it cannot
        </SectionHeading>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {SIGNING.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card border-border rounded-xl border px-5 py-4">
              <p className="m-0 mb-2 flex items-center gap-2 text-sm font-semibold">
                <Icon className="text-primary size-4" aria-hidden /> {title}
              </p>
              <p className="text-muted-foreground m-0 text-[13px]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <AccountPanel />
        <WalletConnectNotice />
      </section>
    </div>
  )
}
