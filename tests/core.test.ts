import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildContextPack } from '../src/index.js'
const fixture = path.resolve('tests/fixtures/sample')
test('build is deterministic and sorted', async () => {
  const a = await buildContextPack(fixture)
  const b = await buildContextPack(fixture)
  assert.equal(a.digest, b.digest)
  assert.deepEqual(a.files.map((f) => f.path), ['package.json', 'src/index.ts'])
})
test('sensitive paths and noisy directories are excluded', async () => {
  const pack = await buildContextPack(fixture)
  assert.equal(pack.files.some((f) => f.path === '.env'), false)
  assert.equal(pack.excluded.some((e) => e.path === '.env' && e.reason === 'sensitive_path'), true)
  assert.equal(pack.excluded.some((e) => e.path === 'node_modules/' && e.reason === 'ignored_directory'), true)
})
test('stack detection sees node and typescript', async () => {
  const pack = await buildContextPack(fixture)
  assert.deepEqual(pack.detectedStack, ['Node.js', 'TypeScript'])
})
test('file budget fails closed by exclusion instead of truncating content', async () => {
  const pack = await buildContextPack(fixture, { maxFiles: 1 })
  assert.equal(pack.files.length, 1)
  assert.equal(pack.excluded.some((e) => e.reason === 'budget_exceeded'), true)
})
test('markdown carries digest and never includes excluded secret value', async () => {
  const pack = await buildContextPack(fixture)
  assert.match(pack.markdown, new RegExp(pack.digest))
  assert.equal(pack.markdown.includes('do-not-include'), false)
})
test('context-pack injects a message with a durable id', async () => {
  const dir = await fs.mkdtemp(path.join(process.cwd(), '.context-pack-test-'))
  try {
    await fs.writeFile(path.join(dir, 'README.md'), '# hi\n', 'utf8')
    let injected: { id?: string; content?: { type: string; text: string }[] } | undefined
    const agent = { inject: (message: never) => { injected = message as typeof injected } }
    const commands: Record<string, (invocation: { rawInput?: string }) => Promise<{ kind: string; text: string }>> = {}
    const { apply } = await import('../src/index.js')
    apply({ commands: { register: (d: { name: string; handler: unknown }) => { commands[d.name] = d.handler as never } } } as never, {})
    const handler = commands['context-pack']!
    const result = await handler({ rawInput: dir, agent, signal: { aborted: false } } as never)
    assert.equal(result.kind, 'success')
    assert.ok(injected)
    assert.equal(typeof injected!.id, 'string')
    assert.ok((injected!.id as string).length > 0)
    assert.equal(injected!.content?.[0]?.type, 'text')
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})