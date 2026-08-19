declare module 'node:fs' {
  export const promises: any
}
declare module 'node:path' {
  const path: any
  export default path
}
declare module 'node:crypto' {
  export function createHash(name: string): { update(value: string | Uint8Array): any; digest(encoding: 'hex'): string }
  export function randomUUID(): string
}
declare module 'node:test' { const test: any; export default test }
declare module 'node:assert/strict' { const assert: any; export default assert }
declare const Buffer: { byteLength(value: string, encoding?: string): number }

declare const process: { cwd(): string }
