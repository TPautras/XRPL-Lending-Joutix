/** `five-bells-condition` ships no types. Minimal shim for the one class used here. */
declare module 'five-bells-condition' {
  export class PreimageSha256 {
    constructor()
    setPreimage(preimage: Buffer): void
    getConditionBinary(): Buffer
    serializeBinary(): Buffer
  }
}
