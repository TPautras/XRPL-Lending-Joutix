/**
 * Registers `<xrpl-wallet-connector>`, the custom element shipped by xrpl-connect,
 * with the JSX type checker.
 *
 * This must live in its own file with a top-level import: `declare module 'react'`
 * inside a .d.ts that is not itself a module is an ambient *declaration*, which
 * replaces @types/react wholesale instead of augmenting it (every React export then
 * resolves to nothing). The import below makes this file a module, so the block is
 * treated as an augmentation. React 19 scopes the JSX namespace inside the `react`
 * module rather than exposing a global one, which is why the augmentation targets it.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'xrpl-wallet-connector': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          'primary-wallet'?: string
          wallets?: string
        },
        HTMLElement
      >
    }
  }
}
