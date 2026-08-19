import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { buildContextPack, type ContextPackOptions } from './core.js'

export const name = 'dsh-context-pack'
export const inject = ['commands']

export interface Config extends ContextPackOptions {
  /** Use this root when /context-pack is invoked without an explicit path. */
  readonly defaultRoot?: string
  /** Refuse to inject packs larger than this many UTF-8 bytes. */
  readonly maxInjectedBytes?: number
}

function parseRoot(rawInput: string, fallback: string): string {
  const value = rawInput.trim()
  return value.length > 0 ? value : fallback
}

export function apply(ctx: Context, config: Config = {}): void {
  if (!ctx.commands?.register) return
  ctx.commands.register({
    name: 'context-pack',
    description: 'Build and inject a bounded, privacy-aware repository context pack into the next DSH model step.',
    input: { hint: '[repository path]' },
    recordInput: true,
    async handler(invocation) {
      const root = parseRoot(invocation.rawInput, config.defaultRoot ?? process.cwd())
      try {
        if (invocation.signal.aborted) return { kind: 'error', text: 'Context-pack request was cancelled before scanning.' }
        const pack = await buildContextPack(root, config)
        if (invocation.signal.aborted) return { kind: 'error', text: 'Context-pack request was cancelled before injection.' }
        const maxInjectedBytes = config.maxInjectedBytes ?? 120_000
        const injectedBytes = Buffer.byteLength(pack.markdown, 'utf8')
        if (injectedBytes > maxInjectedBytes) {
          return { kind: 'error', text: `Context pack is ${injectedBytes} bytes, exceeding maxInjectedBytes=${maxInjectedBytes}; nothing was injected.` }
        }

        invocation.agent.inject({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: pack.markdown }],
          source: { kind: 'plugin', plugin: name },
        })
        return {
          kind: 'success',
          text: `Queued context pack ${pack.digest} for the next model step (${pack.files.length} files, ${pack.totalBytes} source bytes, ${pack.excluded.length} exclusions).`,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { kind: 'error', text: `Context pack failed: ${message}` }
      }
    },
  })
}

export * from './core.js'
