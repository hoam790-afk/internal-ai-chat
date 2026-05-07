import { FileText, Image, Loader2, LogOut, Menu, Paperclip, Send, Settings, Square, Table, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble.jsx";
import ModelSelector from "./ModelSelector.jsx";

export default function ChatWindow({
  messages,
  model,
  models,
  onModelChange,
  systemInstruction,
  onSystemInstructionChange,
  onSend,
  loading,
  onStop,
  onOpenSettings,
  onOpenMobileSidebar,
  onUploadFiles,
  isAdmin = true,
  onLogout,
  billingStatus,
  onOpenBilling
}) {
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && attachments.length === 0) || loading || uploading) return;
    setDraft("");
    const filesToSend = attachments;
    setAttachments([]);
    onSend(text || "Phân tích file đính kèm.", filesToSend);
  }

  async function uploadSelectedFiles(files) {
    if (!files.length) return;

    setUploading(true);
    try {
      const uploaded = await onUploadFiles(files);
      setAttachments((items) => [...items, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    await uploadSelectedFiles(files);
  }

  async function handlePaste(event) {
    const clipboardFiles = Array.from(event.clipboardData?.files || []);
    const imageFiles = clipboardFiles.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    event.preventDefault();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const namedImages = imageFiles.map((file, index) => {
      const extension = file.type.split("/")[1] || "png";
      return new File([file], `pasted-screenshot-${timestamp}-${index + 1}.${extension}`, {
        type: file.type,
        lastModified: Date.now()
      });
    });
    await uploadSelectedFiles(namedImages);
  }

  function removeAttachment(id) {
    setAttachments((items) => items.filter((item) => item.id !== id));
  }

  function attachmentIcon(kind) {
    if (kind === "image") return <Image className="h-4 w-4" />;
    if (kind === "spreadsheet") return <Table className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  }

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-50">
      <header className="flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4">
        {isAdmin && (
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-100 md:hidden"
            title="Open conversations"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-950">AI Assistant</h1>
          <p className="truncate text-xs text-slate-500">{isAdmin ? (model || "Chưa chọn model") : "Client chat"}</p>
        </div>
        {isAdmin && <div className="hidden w-[340px] lg:block">
          <ModelSelector models={models} value={model} onChange={onModelChange} compact />
        </div>}
        {isAdmin && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        )}
        {!isAdmin && (
          <button
            type="button"
            onClick={onOpenBilling}
            className="hidden rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 sm:inline-flex"
            title="Gói dịch vụ"
          >
            {billingStatus?.subscription?.planName || "Gói dịch vụ"}
            {billingStatus?.usage?.limitToday != null && (
              <span className="ml-1 text-red-500">
                {billingStatus.usage.remainingToday}/{billingStatus.usage.limitToday}
              </span>
            )}
          </button>
        )}
        {!isAdmin && (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        )}
      </header>

      {isAdmin && <section className="border-b border-slate-200 bg-white px-4 py-3">
        <label className="mx-auto block max-w-5xl">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">System Instruction</span>
          <textarea
            value={systemInstruction}
            onChange={(event) => onSystemInstructionChange(event.target.value)}
            rows={2}
            placeholder="Ví dụ: You are a concise assistant for internal company support."
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
          />
        </label>
      </section>}

      <section className="chat-scrollbar min-h-0 flex-1 overflow-y-scroll px-4 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          {!isAdmin && billingStatus?.usage?.limitToday != null && billingStatus.usage.remainingToday <= 1 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Bạn còn {billingStatus.usage.remainingToday} câu hỏi miễn phí hôm nay.
              <button type="button" onClick={onOpenBilling} className="ml-2 font-bold text-red-700 underline">
                Nâng cấp Pro/VIP
              </button>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="flex min-h-[42vh] flex-col items-center justify-center text-center">
              <div className="brand-bg mb-4 flex h-14 w-14 items-center justify-center rounded-md text-white">
                <Send className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-950">Bắt đầu cuộc hội thoại mới</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">
                {isAdmin
                  ? "Chọn model OpenRouter, đặt system instruction, rồi nhập câu hỏi cho AI nội bộ."
                  : "Nhập câu hỏi để bắt đầu trao đổi với AI nội bộ."}
              </p>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Assistant is generating
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white p-4">
        <form onSubmit={submit} className="mx-auto max-w-5xl">
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                  title={attachment.warning || attachment.name}
                >
                  {attachmentIcon(attachment.kind)}
                  <span className="max-w-[220px] truncate font-medium">{attachment.name}</span>
                  {attachment.warning && <span className="text-amber-600">!</span>}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-slate-200"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              title="Attach PDF, image, Word, Excel, screenshot"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            </button>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) submit(event);
              }}
              rows={1}
              placeholder="Message AI..."
              className="max-h-40 min-h-12 flex-1 resize-y rounded-md border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
            />
            {loading ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-red-500 text-white hover:bg-red-600"
                title="Stop generating"
              >
                <Square className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!model || uploading}
                className="brand-bg brand-hover inline-flex h-12 w-12 items-center justify-center rounded-md text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            )}
          </div>
        </form>
      </footer>
    </main>
  );
}
