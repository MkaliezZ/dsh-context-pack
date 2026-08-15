declare module '@deepseek-ai/cordis' {
  export interface Context {
    commands?: {
      register(definition: {
        name: string
        description: string
        input?: { hint: string }
        recordInput?: boolean
        handler(invocation: { agent: any; rawInput: string; signal: AbortSignal }): Promise<{ kind: 'success' | 'error'; text?: string }> | { kind: 'success' | 'error'; text?: string }
      }): () => void
    }
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-agent' {
  export interface Agent {}
}
