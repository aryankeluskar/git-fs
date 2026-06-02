import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { OcMessage, OcPart } from "../hooks/useAgent";
import { ToolCard } from "./ToolCard";
import { Reasoning } from "./Reasoning";
import { CopyButton } from "./CopyButton";

interface ChatMessageProps {
  message: OcMessage;
  allMessages: OcMessage[];
  extraActions?: React.ReactNode;
}

export function messageToText(message: OcMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

function findToolResult(
  toolCallId: string,
  allMessages: OcMessage[]
): OcPart | null {
  for (const m of allMessages) {
    for (const p of m.parts) {
      if (p.type === "tool-result" && p.toolCallId === toolCallId) return p;
    }
  }
  return null;
}

export function ChatMessage({ message, allMessages, extraActions }: ChatMessageProps) {
  const { info, parts } = message;

  if (info.role === "tool") return null;

  if (info.role === "user") {
    const text = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text || "")
      .join("\n");

    return (
      <div className="group flex flex-col items-end gap-1 animate-fade-in-up">
        <div className="max-w-[85%] rounded-2xl bg-zinc-800/90 px-4 py-2.5 text-[14.5px] leading-relaxed text-zinc-50 shadow-soft shadow-inset-hair ring-1 ring-zinc-700/50">
          <div className="whitespace-pre-wrap">{text}</div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton getText={() => text} label="Copy message" />
          {extraActions}
        </div>
      </div>
    );
  }

  const thinkingParts = parts.filter(
    (p) => p.type === "reasoning" || p.type === "thinking"
  );
  const textParts = parts.filter((p) => p.type === "text");
  const toolCallParts = parts.filter((p) => p.type === "tool-call");

  const assistantText = textParts.map((p) => p.text || "").join("\n").trim();

  return (
    <div className="group animate-fade-in-up">
      <div className="flex flex-col gap-2">
        {thinkingParts.map((p, i) => (
          <Reasoning
            key={`think-${i}`}
            thinking={p.thinking || p.text || ""}
          />
        ))}

        {toolCallParts.map((p, i) => {
          const toolResult = p.toolCallId
            ? findToolResult(p.toolCallId, allMessages)
            : null;

          const isError = toolResult
            ? Boolean(
                (toolResult as Record<string, unknown>).isError ||
                (toolResult.result as Record<string, unknown>)?.exitCode
              )
            : false;

          return (
            <ToolCard
              key={`tool-${p.toolCallId || i}`}
              toolName={p.toolName || "tool"}
              args={p.args}
              result={toolResult?.result}
              isRunning={!toolResult}
              isError={isError}
            />
          );
        })}

        {textParts.map((p, i) => (
          <div key={`text-${i}`} className="md-body">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {p.text || ""}
            </ReactMarkdown>
          </div>
        ))}

        {(assistantText || extraActions) && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {assistantText && (
              <CopyButton getText={() => assistantText} label="Copy response" />
            )}
            {extraActions}
          </div>
        )}
      </div>
    </div>
  );
}
