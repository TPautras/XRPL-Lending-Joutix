/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_XAMAN_API_KEY?: string
  readonly VITE_LOAN_SIGNER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
