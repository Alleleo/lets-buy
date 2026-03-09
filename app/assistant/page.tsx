'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import BottomNav from '@/components/BottomNav'

type AssistantApiResponse = {
  intent?: string
  itemName?: string | null
  answer?: string
  matchedCount?: number
  suggestions?: string[]
  error?: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  suggestions?: string[]
  intent?: string
  matchedCount?: number
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function Bubble({
  message,
  onSuggestionClick,
}: {
  message: ChatMessage
  onSuggestionClick: (value: string) => void
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-[22px] px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-zinc-900 text-white'
            : 'border border-zinc-200 bg-white text-zinc-900'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>

        {!isUser && typeof message.matchedCount === 'number' ? (
          <p className="mt-2 text-xs text-zinc-500">
            {message.matchedCount > 0
              ? `Matched ${message.matchedCount} record${message.matchedCount === 1 ? '' : 's'}`
              : 'No exact records matched'}
          </p>
        ) : null}

        {!isUser && message.suggestions && message.suggestions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.suggestions.map((suggestion) => (
              <button
                key={`${message.id}-${suggestion}`}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function AssistantPage() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createId(),
      role: 'assistant',
      text: 'Welcome to Assistant, how can I help you?',
    },
  ])

  const inputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(rawMessage?: string) {
    const message = (rawMessage ?? input).trim()
    if (!message || loading) return

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      text: message,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const accessToken = session?.access_token

      if (!accessToken) {
        throw new Error('You must be logged in to use the assistant.')
      }

      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message }),
      })

      const data = (await response.json()) as AssistantApiResponse

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get assistant reply.')
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        text: data.answer || 'I could not generate a reply.',
        suggestions: data.suggestions || [],
        intent: data.intent,
        matchedCount: typeof data.matchedCount === 'number' ? data.matchedCount : 0,
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Something went wrong while contacting the assistant.'

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          text: `Sorry, I ran into a problem: ${messageText}`,
          matchedCount: 0,
        },
      ])
    } finally {
      setLoading(false)

      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function handleSuggestionClick(value: string) {
    setInput(value)
    void sendMessage(value)
  }

  return (
    <>
      <div className="fixed inset-0 bg-zinc-50 text-zinc-900">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
          <header className="shrink-0 border-b border-zinc-200 bg-white/95 px-4 pb-4 pt-4 backdrop-blur">
            <div className="mx-auto w-full">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                LETS BUY
              </p>

              <div className="mt-2 flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-zinc-900">Assistant</h1>
                  <p className="mt-1 text-sm text-zinc-500">
                    Welcome to Assistant, how can I help you?
                  </p>
                </div>

                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600">
                  Smart data chat
                </div>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-6">
              {messages.map((message) => (
                <Bubble
                  key={message.id}
                  message={message}
                  onSuggestionClick={handleSuggestionClick}
                />
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">
                    Thinking...
                  </div>
                </div>
              ) : null}

              <div ref={messagesEndRef} />
            </div>
          </main>

          <footer className="shrink-0 border-t border-zinc-200 bg-white/95 px-4 pb-[7rem] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-4xl">
              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <div className="flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask anything about your shopping data..."
                    className="w-full rounded-[22px] border border-zinc-300 bg-white px-4 py-3.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900"
                    autoComplete="off"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSend}
                  className="shrink-0 rounded-[22px] bg-zinc-900 px-5 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  Send
                </button>
              </form>

              <p className="mt-2 text-xs text-zinc-500">
                Uses your household purchase history to answer questions.
              </p>
            </div>
          </footer>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </>
  )
}