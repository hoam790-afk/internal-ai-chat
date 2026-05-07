import { Database, LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";
import ModelSelector from "./ModelSelector.jsx";

export default function Sidebar({
  collapsed,
  onToggle,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  models,
  selectedModel,
  onModelChange,
  onOpenAdmin,
  onOpenChat,
  currentView,
  onLogout
}) {
  return (
    <aside className={`${collapsed ? "w-[76px]" : "w-[320px]"} brand-bg hidden shrink-0 border-r border-red-900/20 text-white transition-all duration-200 md:flex md:flex-col`}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-3">
            <span className="brand-logo h-10 w-10 border border-white/20">
              <img src="/duong-minh-logo.jpg" alt="Duong Minh Logistics" />
            </span>
            <strong className="truncate text-sm uppercase tracking-wide">Internal AI Chat</strong>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-white/10"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <div className="space-y-4 p-3">
        {!collapsed && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenChat}
              className={`h-9 rounded-md text-xs font-semibold ${currentView === "chat" ? "bg-white text-red-700" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className={`inline-flex h-9 items-center justify-center gap-1 rounded-md text-xs font-semibold ${currentView === "admin" ? "bg-white text-red-700" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              <Database className="h-3.5 w-3.5" />
              Admin
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onNewChat}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white text-sm font-semibold text-red-700 hover:bg-red-50"
          title="New chat"
        >
          <Plus className="h-5 w-5" />
          {!collapsed && <span>New chat</span>}
        </button>

        {!collapsed && (
          <div className="rounded-md bg-white p-3 text-slate-900">
            <ModelSelector models={models} value={selectedModel} onChange={onModelChange} compact />
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {conversations.map((conversation) => {
          const active = conversation.id === activeConversationId;
          return (
            <div
              key={conversation.id}
              className={`group flex items-center gap-2 rounded-md px-3 py-2 ${active ? "bg-white/15" : "hover:bg-white/10"}`}
            >
              <button
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={conversation.title}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-slate-300" />
                {!collapsed && <span className="truncate text-sm text-slate-100">{conversation.title}</span>}
              </button>
              {!collapsed && (
                <div className="flex opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onRenameConversation(conversation)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-white/10"
                    title="Rename"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conversation.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 hover:bg-red-500/20 hover:text-red-100"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md text-sm text-slate-300 hover:bg-white/10"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
