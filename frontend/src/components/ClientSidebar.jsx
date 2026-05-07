import { CreditCard, LogOut, MessageSquare, Plus } from "lucide-react";

export default function ClientSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onLogout,
  billingStatus,
  onOpenBilling
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
      <div className="brand-bg border-b border-red-900/20 p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="brand-logo h-10 w-10 border border-white/20">
            <img src="/duong-minh-logo.jpg" alt="Duong Minh Logistics" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">Internal AI Chat</h2>
            <p className="text-xs text-white/80">Lich su hoi dap</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={onOpenBilling}
          className="mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          <CreditCard className="h-4 w-4" />
          {billingStatus?.subscription?.planName || "Gói dịch vụ"}
        </button>
        <button
          type="button"
          onClick={onNewChat}
          className="brand-bg brand-hover flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Chat moi
        </button>
      </div>

      <nav className="chat-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {conversations.map((conversation) => {
          const active = conversation.id === activeConversationId;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onSelectConversation(conversation.id)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                active ? "brand-bg text-white" : "text-slate-700 hover:bg-red-50"
              }`}
              title={conversation.title}
            >
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">{conversation.title}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
