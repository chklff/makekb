// /chat — Server Component that just renders the client chat component.
// The client owns all stream + state management.

import { ChatClient } from './chat-client'

export const dynamic = 'force-dynamic'

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tighter">Ask KB</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask anything about your Make scenarios. Find, understand, and reuse with confidence.
        </p>
      </header>
      <ChatClient />
    </div>
  )
}
