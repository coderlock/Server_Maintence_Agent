import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  MessageSquare, Send, StopCircle, Trash2,
  GraduationCap, Wrench, User, Bot, AlertTriangle, ChevronDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatStore } from '../../store/chatStore';
import { useConnectionStore } from '../../store/connectionStore';
import { useAI } from '../../hooks/useAI';
import { Button } from '../ui';
import type { ChatMessage } from '@shared/types';

// ── Subcomponents ────────────────────────────────────────────────

const ModeToggle: React.FC = () => {
  const { mode, setMode } = useChatStore();
  return (
    <div className="flex items-center gap-1 bg-[#1e1e1e] rounded p-0.5">
      <button
        onClick={() => setMode('fixer')}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
          mode === 'fixer'
            ? 'bg-vscode-accent text-white'
            : 'text-vscode-text-secondary hover:text-vscode-text'
        }`}
        title="Fixer mode — AI can execute commands"
      >
        <Wrench className="h-3 w-3" />
        Fixer
      </button>
      <button
        onClick={() => setMode('teacher')}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
          mode === 'teacher'
            ? 'bg-vscode-accent text-white'
            : 'text-vscode-text-secondary hover:text-vscode-text'
        }`}
        title="Teacher mode — AI explains without executing"
      >
        <GraduationCap className="h-3 w-3" />
        Teacher
      </button>
    </div>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-vscode-text-secondary px-3 py-1 bg-[#1e1e1e] rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 mb-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
        isUser ? 'bg-vscode-accent' : 'bg-[#2d2d2d] border border-[#3e3e3e]'
      }`}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-white" />
          : <Bot className="h-3.5 w-3.5 text-vscode-accent" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
        isUser
          ? 'bg-vscode-accent text-white rounded-tr-none'
          : 'bg-[#252526] text-vscode-text rounded-tl-none border border-[#3e3e3e]'
      }`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match;
                if (isInline) {
                  return (
                    <code
                      className="bg-[#1e1e1e] text-[#ce9178] px-1 py-0.5 rounded text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <SyntaxHighlighter
                    style={vscDarkPlus as any}
                    language={match[1]}
                    PreTag="div"
                    className="!mt-2 !mb-2 !text-xs rounded"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                );
              },
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
            }}
          >
            {message.content}
          </ReactMarkdown>
          </div>
        )}
        {/* Token usage badge on assistant messages */}
        {!isUser && message.metadata?.tokensUsed && (
          <div className="mt-1.5 text-right">
            <span className="text-[10px] text-vscode-text-secondary">
              {message.metadata.tokensUsed.toLocaleString()} tokens
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const StreamingIndicator: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex gap-2 mb-4">
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#2d2d2d] border border-[#3e3e3e] flex items-center justify-center mt-0.5">
      <Bot className="h-3.5 w-3.5 text-vscode-accent animate-pulse" />
    </div>
    <div className="max-w-[85%] bg-[#252526] rounded-lg rounded-tl-none px-3 py-2 text-sm border border-[#3e3e3e]">
      {content ? (
        <ReactMarkdown>
          {content}
        </ReactMarkdown>
      ) : (
        <div className="flex gap-1 py-1">
          <span className="w-1.5 h-1.5 bg-vscode-accent rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-vscode-accent rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-vscode-accent rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      )}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────

export const ChatPanel: React.FC = () => {
  const { messages, isLoading, streamingContent, clearMessages } = useChatStore();
  const { activeConnection } = useConnectionStore();
  const { sendMessage, cancelMessage } = useAI();

  const [inputValue, setInputValue] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isConnected = activeConnection?.status === 'connected';

  // Auto-scroll to bottom
  const scrollToBottom = useCallback((force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (force || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);
  useEffect(() => { if (streamingContent) scrollToBottom(); }, [streamingContent, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollButton(distance > 200);
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isLoading || !isConnected) return;
    setInputValue('');
    await sendMessage(text);
  }, [inputValue, isLoading, isConnected, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleClearChat = useCallback(async () => {
    if (!activeConnection?.connectionId) return;
    clearMessages();
    await window.electronAPI.session.clear(activeConnection.connectionId);
  }, [activeConnection?.connectionId, clearMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [inputValue]);

  return (
    <div className="h-full bg-vscode-panel flex flex-col relative">
      {/* Header */}
      <div className="h-9 bg-[#252526] border-b border-vscode-border flex items-center px-3 gap-2 flex-shrink-0">
        <MessageSquare className="h-4 w-4 text-vscode-text-secondary flex-shrink-0" />
        <span className="text-sm font-medium flex-1">AI Assistant</span>
        <ModeToggle />
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="p-1 hover:bg-[#3e3e3e] rounded text-vscode-text-secondary hover:text-vscode-text"
            title="Clear chat history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full text-vscode-text-secondary">
            <div className="text-center max-w-xs">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
              {isConnected ? (
                <>
                  <p className="text-sm mb-1 text-vscode-text">What can I help you with?</p>
                  <p className="text-xs opacity-70">
                    Ask about the server, run diagnostics, or say "install nginx" to get a step-by-step plan.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm mb-1">Not connected</p>
                  <p className="text-xs opacity-70">Connect to a server to start chatting.</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {isLoading && (
          <StreamingIndicator content={streamingContent} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 right-4 bg-vscode-accent rounded-full p-1.5 shadow-lg hover:bg-[#005a9e] transition-colors z-10"
        >
          <ChevronDown className="h-4 w-4 text-white" />
        </button>
      )}

      {/* API key warning */}
      {isConnected && messages.length === 0 && (
        <div className="mx-3 mb-2 flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Open <strong>Settings</strong> (gear icon ↗) to configure your Moonshot API key.</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-vscode-border p-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isConnected
                ? 'Ask the AI… (Enter to send, Shift+Enter for newline)'
                : 'Connect to a server to start chatting'
            }
            disabled={!isConnected || isLoading}
            rows={1}
            className="flex-1 bg-[#3c3c3c] text-vscode-text text-sm rounded px-3 py-2 resize-none outline-none border border-transparent
              focus:border-vscode-accent placeholder-vscode-text-secondary disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          />
          {isLoading ? (
            <Button
              variant="danger"
              size="sm"
              onClick={cancelMessage}
              title="Cancel"
              className="flex-shrink-0"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={!inputValue.trim() || !isConnected}
              title="Send (Enter)"
              className="flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
