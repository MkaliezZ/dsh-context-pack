import assert from 'node:assert/strict'
import test from 'node:test'
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
