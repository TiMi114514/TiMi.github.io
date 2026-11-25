'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  BookOpen,
  Maximize2,
  Minimize2,
  RotateCcw,
  Square,
  Sparkles,
} from 'lucide-react';
import {
  getRagflowConfig,
  prettyCitation,
  ragflowChat,
  retrieveCitations,
  type ChatMessage,
} from '@/lib/ragflow';
import { useT } from '@/lib/i18n';

type UiMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
};

const STOPPED = 'Stopped.';

export function ChatPanel({
  chatId,
  datasetIds,
}: {
  chatId?: string;
  datasetIds?: string[];
}) {
  const t = useT();
  const opening = useMemo<UiMessage>(
    () => ({ role: 'assistant', content: t('chat.opening') }),
    [t],
  );
  const [conversation, setMessages] = useState<UiMessage[]>([]);
  const messages = useMemo(() => [opening, ...conversation], [opening, conversation]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(Boolean(chatId || getRagflowConfig().chatId));
  }, [chatId]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await panelRef.current?.requestFullscreen();
      }
    } catch {
      /* fullscreen may be blocked by the browser */
    }
  }

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
      const baseConfig = getRagflowConfig();
      const config = {
        ...baseConfig,
        chatId: chatId || baseConfig.chatId,
        mode: 'openai' as const,
      };
      const activeDatasets = datasetIds?.length
        ? datasetIds
        : baseConfig.datasetId
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

      const result = await ragflowChat(config, nextHistory, {
        signal: controller.signal,
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

      let citations = result.citations;
      if (citations.length === 0) {
        citations = await retrieveCitations(baseConfig, question, activeDatasets);
      }

      const finalContent = result.content || answer || t('chat.noAnswer');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: finalContent,
            citations,
          };
        }
        return copy;
      });
      setHistory([...nextHistory, { role: 'assistant', content: finalContent }]);
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === 'AbortError'
          ? STOPPED
          : caught instanceof Error
            ? caught.message
            : t('chat.error');
      if (message !== STOPPED) setError(message);
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          copy[copy.length - 1] = {
            role: 'assistant',
            content:
              message === STOPPED
                ? `_${t('chat.stopped')}_`
                : `**${t('chat.failed')}** ${message}`,
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
    setMessages([]);
    setError(null);
    setInput('');
  }

  return (
    <div ref={panelRef} className="chat-panel card flex h-[560px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line/80 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="font-display text-[17px]">{t('chat.title')}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#3f7d5a]' : 'bg-[#b4543f]'}`}
            />
            {connected ? t('chat.connected') : t('chat.unavailable')}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="text-muted transition-colors hover:text-ink"
            aria-label={fullscreen ? t('chat.exitFullscreen') : t('chat.fullscreen')}
            title={fullscreen ? t('chat.exitFullscreen') : t('chat.fullscreen')}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-muted transition-colors hover:text-ink"
            aria-label={t('chat.new')}
            title={t('chat.new')}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="chat-scroll scroll-slim min-h-0 flex-1 space-y-4 overflow-y-auto bg-paper px-5 py-5">
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
                    {t('chat.reading')}
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
          placeholder={busy ? t('chat.answering') : t('chat.followUp')}
          className="input border-transparent bg-transparent focus:ring-0"
          disabled={busy}
          aria-label={t('chat.yourQuestion')}
        />
        {busy ? (
          <button type="button" onClick={stop} className="btn-outline px-3 py-2">
            <Square className="h-3.5 w-3.5" aria-hidden />
            {t('chat.stop')}
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="btn-dark h-10 w-10 shrink-0 p-0"
            aria-label={t('chat.send')}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
}
