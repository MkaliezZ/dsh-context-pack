# dsh-context-pack

Deterministic, privacy-aware repository context packs for DeepSeek Harness (DSH).

The DSH-native `/context-pack [repository path]` command performs an explicit, read-only scan, builds a bounded pack, then queues that pack through `agent.inject()` for the **next** model step. It does not wake an idle agent, modify source files, or silently include files that exceed privacy/size rules.

## Why

DSH makes model-visible context part of the agent/session lifecycle. A repository context plugin should therefore be bounded and inspectable rather than silently dumping an entire repository into every prompt.

## v0.1 behavior

- human-initiated `/context-pack` command; no model-directed autonomous scan;
- deterministic path ordering;
- fixed noisy-directory exclusions;
- fail-closed sensitive-path exclusions (`.env`, common credential/secret names, SSH private-key names);
- text-extension allowlist;
- per-file, total-byte, file-count, and final injection budgets;
- full-file inclusion only — no silent truncation;
- SHA-256 per-file identity and whole-pack digest;
- lightweight stack detection;
- no network and no source mutation;
- context is queued via the documented DSH `agent.inject()` seam and is therefore consumed at a later admitted model step.

## Bundle config

```yaml
- id: dsh-context-pack
  name: '@mkaliezz/dsh-context-pack'
  config:
    maxFiles: 60
    maxTotalBytes: 120000
    maxFileBytes: 30000
    maxInjectedBytes: 120000
```

Run:

```text
/context-pack .
```

The command returns only a compact receipt (pack digest, included-file count, source bytes, exclusion count). The model-visible pack is injected separately through DSH rather than echoed into the command result.

## Core API

```ts
const pack = await buildContextPack('/path/to/repo', {
  maxFiles: 60,
  maxTotalBytes: 120_000,
  maxFileBytes: 30_000,
})
```

## Non-claims

- not a secret scanner or DLP system;
- not a sandbox;
- no complete `.gitignore` compatibility yet;
- no semantic relevance ranking;
- no guarantee that every sensitive filename pattern is covered;
- v0.1 does not persist a standalone context-pack lifecycle record beyond DSH's own command/inbox/session facts.

## Development

```bash
npm test
```

Because DSH is Developer Preview, compatibility should be proven against a pinned DSH revision before each compatibility claim.

## License

MIT
