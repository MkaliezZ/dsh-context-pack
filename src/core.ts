import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface ContextPackOptions {
  readonly maxFiles?: number
  readonly maxTotalBytes?: number
  readonly maxFileBytes?: number
}

export interface ContextEntry {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  readonly content: string
}

export interface ContextExclusion {
  readonly path: string
  readonly reason: 'ignored_directory' | 'sensitive_path' | 'unsupported_extension' | 'too_large' | 'budget_exceeded' | 'binary'
}

export interface ContextPack {
  readonly root: string
  readonly files: readonly ContextEntry[]
  readonly excluded: readonly ContextExclusion[]
  readonly totalBytes: number
  readonly digest: string
  readonly detectedStack: readonly string[]
  readonly markdown: string
}

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', 'target', 'vendor', '.cache'])
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.py', '.rs', '.go', '.java', '.kt', '.swift', '.toml', '.yaml', '.yml', '.css', '.html', '.sql', '.sh'])
const sensitivePattern = /(^|\/)(?:\.env(?:\.|$)|id_rsa(?:\.|$)|id_ed25519(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|\.npmrc$|\.pypirc$)/i

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/')
}

function isProbablyBinary(value: string): boolean {
  return value.includes('\u0000')
}

async function walk(root: string, current: string, files: string[], excluded: ContextExclusion[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true })
  entries.sort((a: any, b: any) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    const rel = normalizeRelative(root, absolute)
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        excluded.push({ path: `${rel}/`, reason: 'ignored_directory' })
        continue
      }
      await walk(root, absolute, files, excluded)
      continue
    }
    if (!entry.isFile()) continue
    files.push(absolute)
  }
}

function detectStack(paths: readonly string[]): string[] {
  const set = new Set(paths)
  const result: string[] = []
  if (set.has('package.json')) result.push('Node.js')
  if (paths.some((p) => p.endsWith('.ts') || p.endsWith('.tsx'))) result.push('TypeScript')
  if (set.has('pyproject.toml') || set.has('requirements.txt')) result.push('Python')
  if (set.has('Cargo.toml')) result.push('Rust')
  if (set.has('go.mod')) result.push('Go')
  return result
}

function renderMarkdown(root: string, entries: readonly ContextEntry[], detectedStack: readonly string[], digest: string): string {
  const lines = [
    '# DSH Context Pack',
    '',
    `Root: ${path.basename(root) || root}`,
    `Files: ${entries.length}`,
    `Digest: ${digest}`,
    `Detected stack: ${detectedStack.length > 0 ? detectedStack.join(', ') : 'unknown'}`,
    '',
    '## Files',
    '',
  ]
  for (const entry of entries) {
    lines.push(`### ${entry.path}`, '', '```text', entry.content, '```', '')
  }
  return lines.join('\n')
}

export async function buildContextPack(inputRoot: string, options: ContextPackOptions = {}): Promise<ContextPack> {
  const root = await fs.realpath(inputRoot)
  const maxFiles = options.maxFiles ?? 80
  const maxTotalBytes = options.maxTotalBytes ?? 200_000
  const maxFileBytes = options.maxFileBytes ?? 40_000
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) throw new Error('maxFiles must be a positive integer')
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes <= 0) throw new Error('maxTotalBytes must be a positive integer')
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) throw new Error('maxFileBytes must be a positive integer')

  const candidates: string[] = []
  const excluded: ContextExclusion[] = []
  await walk(root, root, candidates, excluded)
  candidates.sort((a, b) => normalizeRelative(root, a).localeCompare(normalizeRelative(root, b)))

  const files: ContextEntry[] = []
  let totalBytes = 0
  for (const absolute of candidates) {
    const rel = normalizeRelative(root, absolute)
    if (sensitivePattern.test(rel)) {
      excluded.push({ path: rel, reason: 'sensitive_path' })
      continue
    }
    const ext = path.extname(rel).toLowerCase()
    const basename = path.basename(rel)
    if (!textExtensions.has(ext) && !['Dockerfile', 'Makefile', 'LICENSE'].includes(basename)) {
      excluded.push({ path: rel, reason: 'unsupported_extension' })
      continue
    }
    const stat = await fs.stat(absolute)
    if (stat.size > maxFileBytes) {
      excluded.push({ path: rel, reason: 'too_large' })
      continue
    }
    const content = await fs.readFile(absolute, 'utf8')
    if (isProbablyBinary(content)) {
      excluded.push({ path: rel, reason: 'binary' })
      continue
    }
    const bytes = Buffer.byteLength(content, 'utf8')
    if (files.length >= maxFiles || totalBytes + bytes > maxTotalBytes) {
      excluded.push({ path: rel, reason: 'budget_exceeded' })
      continue
    }
    files.push({ path: rel, bytes, sha256: sha256(content), content })
    totalBytes += bytes
  }

  const identity = files.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}`).join('\n')
  const digest = sha256(identity)
  const detectedStack = detectStack(files.map((entry) => entry.path))
  const markdown = renderMarkdown(root, files, detectedStack, digest)
  return { root, files, excluded, totalBytes, digest, detectedStack, markdown }
}
