import { Check, Copy } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className || "")?.[1] || "code";
  const text = String(children).replace(/\n$/, "");

  async function copyCode() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="my-4 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
      <div className="flex items-center justify-between bg-slate-900 px-3 py-2 text-xs text-slate-300">
        <span>{language}</span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-slate-200 hover:bg-slate-800"
          title="Copy code"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm text-slate-100">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function MessageBubble({ message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  async function copyMessage() {
    await navigator.clipboard.writeText(message.content || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[860px] ${isUser ? "w-fit" : "w-full"}`}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>{isUser ? "You" : "Assistant"}</span>
          {!isUser && message.model && <span className="normal-case text-slate-400">{message.model}</span>}
          {!isUser && (
            <button
              type="button"
              onClick={copyMessage}
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition hover:bg-slate-100 hover:text-slate-800 group-hover:opacity-100"
              title="Copy message"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div
          className={
            isUser
              ? "brand-bg rounded-md px-4 py-3 text-sm leading-6 text-white shadow-soft"
              : "prose prose-slate max-w-none rounded-md border border-slate-200 bg-white px-5 py-4 text-sm leading-7 shadow-sm"
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }) {
                  if (inline) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                }
              }}
            >
              {message.content || " "}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </article>
  );
}
