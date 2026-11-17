'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, BookOpen, RotateCcw, Square, Sparkles } from 'lucide-react';
import {
  getRagflowConfig,
  prettyCitation,
  ragflowChat,
  type ChatMessage,
} from '@/lib/ragflow';

type UiMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
};

const opening: UiMessage = {
  role: 'assistant',
  content:
    'Ask me anything from your course material — a past paper question, a definition you want unpacked, or a full worked solution. I answer from the knowledge base and list the sources I used.',
};

export function ChatPanel() {
  const [messages, setMessages] = useState<UiMessage[]>([opening]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(Boolean(getRagflowConfig().chatId));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send() {
    const question = input.trim();
    if (!question || busy) return;

    setError(null);
    setInput('');
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: question }];
    setHistory(nextHistory);
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let answer = '';

    try {
      const result = await ragflowChat(getRagflowConfig(), nextHistory, {
        signal: controller.signal,
        sessionId,
        onSessionId: setSessionId,
        onDelta: (delta) => {
          answer += delta;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: answer };
            }
            return copy;
          });
        },
      });

      const finalContent = result.content || answer || 'I could not produce an answer this time.';
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: finalContent,
            citations: result.citations,
          };
        }
        return copy;
      });
      setHistory([...nextHistory, { role: 'assistant', content: finalContent }]);
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === 'AbortError'
          ? 'Stopped.'
          : caught instanceof Error
            ? caught.message
            : 'Something went wrong talking to RAGFlow.';
      if (message !== 'Stopped.') setError(message);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: message === 'Stopped.' ? '_Stopped._' : `**Request failed.** ${message}`,
          };
        }
        return copy;
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    setHistory([]);
    setMessages([opening]);
    setError(null);
    setInput('');
    setSessionId(null);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line/80 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="font-display text-[17px]">Tutor session</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#3f7d5a]' : 'bg-[#b4543f]'}`}
            />
            {connected ? 'knowledge base connected' : 'tutor unavailable'}
          </span>
          <button
            type="button"
            onClick={reset}
            className="text-muted transition-colors hover:text-ink"
            aria-label="New conversation"
            title="New conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scroll-slim h-[460px] space-y-4 overflow-y-auto bg-paper px-5 py-5">
        {messages.map((message, index) =>
          message.role === 'user' ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-3 text-[14px] leading-relaxed text-cream">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={index} className="animate-fade-up">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-cream/50 px-4 py-3">
                {message.content ? (
                  <div className="prose-pw">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                    Reading your course material…
                  </span>
                )}
                {message.citations && message.citations.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3">
                    <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden />
                    {message.citations.map((citation) => (
                      <span
                        key={citation}
                        className="max-w-[260px] truncate rounded-md border border-line bg-paper px-2 py-1 text-[11px] text-muted"
                        title={citation}
                      >
                        {prettyCitation(citation)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <div className="border-t border-[#e7c9c1] bg-[#fbeeea] px-5 py-2.5 text-[12.5px] text-[#8a3b2a]">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-center gap-2 border-t border-line/80 bg-paper px-3 py-3"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={busy ? 'Answering…' : 'Ask a follow-up…'}
          className="input border-transparent bg-transparent focus:ring-0"
          disabled={busy}
          aria-label="Your question"
        />
        {busy ? (
          <button type="button" onClick={stop} className="btn-outline px-3 py-2">
            <Square className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-dark h-10 w-10 shrink-0 p-0"
            aria-label="Send question"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
}
