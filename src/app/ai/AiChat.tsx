"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import BandejaLogo from "@/components/BandejaLogo";
import Link from "next/link";

const G = { fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif" };
const I = { fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" };

type Message = { role: "user" | "assistant"; content: string };

const PROMPT_CHIPS = [
  "How is my rating calculated?",
  "What are Bars?",
  "Show my match stats",
  "Find open matches near me",
  "How does Rivals Pass work?",
  "What's my current streak?",
];

function SparkleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z" fill="#8CF702" />
      <path d="M19 2L19.75 5.25L23 6L19.75 6.75L19 10L18.25 6.75L15 6L18.25 5.25L19 2Z" fill="#8CF702" opacity="0.6" />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-green/60"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}

export default function AiChat({ playerName, playerRating }: { playerName: string; playerRating: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsStreaming(true);

    // Placeholder for streaming response
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              accumulated += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 pb-16" style={{ minHeight: 0 }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <SparkleIcon size={18} />
          <div>
            <p className="text-brand-green text-[11px] tracking-widest uppercase leading-none" style={G}>BANDEJA AI</p>
            <p className="text-white/30 text-[9px] leading-none mt-0.5" style={I}>Phase 1 · Read-only</p>
          </div>
        </div>
        <Link href="/profile" className="text-white/30 hover:text-white/60 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Link>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {isEmpty ? (
          <div className="flex flex-col items-center pt-8 pb-4 gap-6">
            {/* Greeting */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full border-2 border-brand-green/30 flex items-center justify-center mx-auto bg-brand-green/5">
                <SparkleIcon size={24} />
              </div>
              <p className="text-white text-lg tracking-widest uppercase" style={G}>
                Hey, {playerName.split(" ")[0]}
              </p>
              <p className="text-white/40 text-sm max-w-xs text-center" style={I}>
                I&apos;m your BANDEJA AI. Ask me anything about your stats, the rating system, Bars, or finding matches.
              </p>
              <p className="text-brand-green/60 text-xs tracking-widest uppercase" style={G}>
                {playerRating} pts
              </p>
            </div>

            {/* Prompt chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-xs">
              {PROMPT_CHIPS.map((chip) => (
                <button key={chip} onClick={() => sendMessage(chip)}
                  className="text-[10px] tracking-wide px-3 py-1.5 border border-white/15 text-white/50 hover:border-brand-green/50 hover:text-brand-green transition-colors"
                  style={I}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-full border border-brand-green/30 flex items-center justify-center mr-2 mt-0.5 shrink-0 bg-brand-green/5">
                  <SparkleIcon size={12} />
                </div>
              )}
              <div className={`max-w-[82%] rounded-sm px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-brand-green/10 border border-brand-green/20 text-white"
                  : "bg-white/5 border border-white/10 text-white/90"
              }`}>
                {msg.role === "assistant" && msg.content === "" && isStreaming ? (
                  <TypingDots />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={I}>
                    {msg.content}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3 bg-brand-dark">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-white/5 border border-white/15 text-white placeholder-white/25 px-4 py-2.5 text-sm outline-none focus:border-brand-green/50 transition-colors resize-none leading-snug disabled:opacity-40"
            style={{ ...I, maxHeight: "6rem", overflowY: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 96)}px`;
            }}
          />
          {isStreaming ? (
            <button onClick={handleStop}
              className="w-10 h-10 flex items-center justify-center border border-white/20 text-white/50 hover:border-white/40 hover:text-white/80 transition-colors shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" />
              </svg>
            </button>
          ) : (
            <button onClick={() => sendMessage(input)} disabled={!input.trim()}
              className="w-10 h-10 flex items-center justify-center bg-brand-green disabled:bg-brand-green/20 transition-colors shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#000" : "#666"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-white/15 text-[9px] text-center mt-2 tracking-wide" style={I}>
          Powered by DeepSeek · Phase 1: read-only
        </p>
      </div>
    </div>
  );
}
