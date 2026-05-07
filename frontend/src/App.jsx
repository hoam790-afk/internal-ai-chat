import { useEffect, useMemo, useRef, useState } from "react";
import {
  createConversation,
  deleteConversation,
  fetchConversations,
  fetchMessages,
  fetchModels,
  fetchSettings,
  fetchAuthConfig,
  adminLogin,
  clientEmailLogin,
  googleLogin,
  clientDemoLogin,
  saveSettings,
  setAuthToken,
  sendChat,
  uploadFiles,
  updateConversation
} from "./api/client.js";
import ChatWindow from "./components/ChatWindow.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import ClientSidebar from "./components/ClientSidebar.jsx";

const DEFAULT_SETTINGS = {
  defaultModel: "openrouter/free",
  defaultSystemInstruction: "You are a helpful internal company AI assistant. Answer clearly and professionally.",
  temperature: 0.2,
  apiKeyConfigured: false,
  apiKeyPreview: null
};

function toChatMessage(role, content, extra = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra
  };
}

export default function App() {
  const [models, setModels] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_SETTINGS.defaultModel);
  const [systemInstruction, setSystemInstruction] = useState(DEFAULT_SETTINGS.defaultSystemInstruction);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [authConfig, setAuthConfig] = useState(null);
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("authUser");
    return raw ? JSON.parse(raw) : null;
  });
  const [currentView, setCurrentView] = useState("chat");
  const abortControllerRef = useRef(null);
  const isAdmin = user?.role === "admin";

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId]
  );

  useEffect(() => {
    fetchAuthConfig().then(setAuthConfig).catch(() => setAuthConfig({ googleClientId: "" }));
  }, []);

  useEffect(() => {
    if (!user) return;

    async function bootstrap() {
      try {
        const [loadedSettings, loadedModels, loadedConversations] = await Promise.all([
          fetchSettings(),
          fetchModels(),
          fetchConversations()
        ]);
        setSettings({ ...DEFAULT_SETTINGS, ...loadedSettings });
        setSelectedModel(loadedSettings.defaultModel || DEFAULT_SETTINGS.defaultModel);
        setSystemInstruction(loadedSettings.defaultSystemInstruction || DEFAULT_SETTINGS.defaultSystemInstruction);
        setModels(loadedModels);
        setConversations(loadedConversations);
      } catch (bootstrapError) {
        setError(bootstrapError.message || "Không tải được dữ liệu khởi tạo.");
      }
    }

    bootstrap();
  }, [user]);

  useEffect(() => {
    if (!activeConversationId) return;

    async function loadConversation() {
      try {
        const loadedMessages = await fetchMessages(activeConversationId);
        setMessages(loadedMessages);
      } catch (loadError) {
        setError(loadError.message || "Không tải được lịch sử chat.");
      }
    }

    loadConversation();
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversation) return;
    setSelectedModel(activeConversation.selectedModel || settings.defaultModel);
    setSystemInstruction(activeConversation.systemInstruction ?? settings.defaultSystemInstruction ?? "");
  }, [activeConversation, settings.defaultModel, settings.defaultSystemInstruction]);

  async function refreshConversations(nextActiveId) {
    const loadedConversations = await fetchConversations();
    setConversations(loadedConversations);
    if (nextActiveId) setActiveConversationId(nextActiveId);
  }

  function applyLogin({ token, user: nextUser }) {
    localStorage.setItem("authToken", token);
    localStorage.setItem("authUser", JSON.stringify(nextUser));
    setAuthToken(token);
    setUser(nextUser);
    setError("");
    setCurrentView("chat");
  }

  async function handleAdminLogin(password) {
    try {
      applyLogin(await adminLogin(password));
    } catch (loginError) {
      setError(loginError.response?.data?.error || loginError.message || "Không đăng nhập được admin.");
    }
  }

  async function handleGoogleLogin(credential) {
    try {
      applyLogin(await googleLogin(credential));
    } catch (loginError) {
      setError(loginError.response?.data?.error || loginError.message || "Không đăng nhập được Gmail.");
    }
  }

  async function handleClientDemoLogin() {
    try {
      applyLogin(await clientDemoLogin());
    } catch (loginError) {
      setError(loginError.response?.data?.error || loginError.message || "Không đăng nhập được client test.");
    }
  }

  async function handleClientEmailLogin(email) {
    try {
      applyLogin(await clientEmailLogin(email));
    } catch (loginError) {
      setError(loginError.response?.data?.error || loginError.message || "Khong dang nhap duoc bang email.");
    }
  }

  function handleLogout() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    setAuthToken(null);
    setUser(null);
    setMessages([]);
    setConversations([]);
    setActiveConversationId(null);
    setCurrentView("chat");
  }

  async function handleNewChat() {
    setActiveConversationId(null);
    setMessages([]);
    setSelectedModel(settings.defaultModel);
    setSystemInstruction(settings.defaultSystemInstruction || "");
    setMobileSidebarOpen(false);
  }

  async function handleSelectConversation(id) {
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  }

  async function handleDeleteConversation(id) {
    const confirmed = window.confirm("Xóa cuộc hội thoại này?");
    if (!confirmed) return;

    await deleteConversation(id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
    await refreshConversations();
  }

  async function handleRenameConversation(conversation) {
    const title = window.prompt("Tên cuộc hội thoại", conversation.title);
    if (!title?.trim()) return;
    const updated = await updateConversation(conversation.id, { title: title.trim() });
    setConversations((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function handleModelChange(model) {
    if (!isAdmin) return;
    setSelectedModel(model);
    if (activeConversationId) {
      const updated = await updateConversation(activeConversationId, { selectedModel: model });
      setConversations((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    }
  }

  async function handleSystemInstructionChange(value) {
    if (!isAdmin) return;
    setSystemInstruction(value);
    if (activeConversationId) {
      updateConversation(activeConversationId, { systemInstruction: value }).catch(() => {});
    }
  }

  async function handleSend(content, attachments = []) {
    if (!selectedModel || loading) return;
    setError("");
    setLoading(true);

    const attachmentList = attachments.length
      ? "\n\nFile dinh kem:\n" + attachments.map((file) => `- ${file.name}`).join("\n")
      : "";
    const displayContent = `${content}${attachmentList}`;
    const userMessage = toChatMessage("user", displayContent, {
      model: selectedModel,
      promptContent: content,
      attachments
    });
    const outgoingMessages = [...messages, userMessage];
    setMessages(outgoingMessages);

    try {
      const response = await sendChat({
        conversationId: activeConversationId || undefined,
        model: selectedModel,
        systemInstruction,
        messages: outgoingMessages.map(({ role, content: messageContent, promptContent, attachments: messageAttachments }) => ({
          role,
          content: promptContent || messageContent,
          displayContent: messageContent,
          attachments: messageAttachments || []
        })),
        temperature: settings.temperature,
        stream: false
      });
      const assistantMessage = toChatMessage("assistant", response.content || "", { model: response.model });
      setActiveConversationId(response.conversationId);
      setMessages([...outgoingMessages, assistantMessage]);
      await refreshConversations(response.conversationId);
    } catch (chatError) {
      const errorMessage = chatError.response?.data?.error || chatError.message || "Khong gui duoc tin nhan.";
      setError(errorMessage);
      setMessages([
        ...outgoingMessages,
        toChatMessage("assistant", `He thong chua lay duoc cau tra loi tu AI. ${errorMessage}`, { model: "system-error" })
      ]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }
  function handleStop() {
    abortControllerRef.current?.abort();
    setLoading(false);
  }

  async function handleSaveSettings() {
    if (!isAdmin) return;
    setSavingSettings(true);
    try {
      const saved = await saveSettings(settings);
      setSettings({ ...settings, ...saved });
      setSelectedModel(saved.defaultModel);
      setSystemInstruction(saved.defaultSystemInstruction || "");
      setSettingsOpen(false);
    } catch (saveError) {
      setError(saveError.response?.data?.error || saveError.message || "Không lưu được settings.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function createChatFromMobile() {
    const conversation = await createConversation({
      selectedModel,
      systemInstruction
    });
    await refreshConversations(conversation.id);
    setMobileSidebarOpen(false);
  }

  if (!user) {
    return (
      <LoginScreen
        onAdminLogin={handleAdminLogin}
        onClientEmailLogin={handleClientEmailLogin}
        error={error}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      {isAdmin && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          models={models}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
          currentView={currentView}
          onOpenAdmin={() => setCurrentView("admin")}
          onOpenChat={() => setCurrentView("chat")}
          onLogout={handleLogout}
        />
      )}
      {!isAdmin && (
        <ClientSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onLogout={handleLogout}
        />
      )}

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-30 bg-red-950/40 md:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="brand-bg h-full w-[86vw] max-w-[340px]" onClick={(event) => event.stopPropagation()}>
            <div className="p-3">
              <div className="mb-3 flex items-center gap-3 px-1 py-2 text-white">
                <span className="brand-logo h-10 w-10 border border-white/20">
                  <img src="/duong-minh-logo.jpg" alt="Duong Minh Logistics" />
                </span>
                <strong className="text-sm uppercase tracking-wide">Internal AI Chat</strong>
              </div>
              <button
                type="button"
                onClick={createChatFromMobile}
                className="mb-3 h-11 w-full rounded-md bg-white text-sm font-semibold text-red-700"
              >
                New chat
              </button>
              <div className="space-y-1">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => handleSelectConversation(conversation.id)}
                    className="w-full truncate rounded-md px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                  >
                    {conversation.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {currentView === "admin" && isAdmin ? (
          <AdminPanel open={currentView === "admin"} />
        ) : (
          <ChatWindow
            messages={messages}
            model={selectedModel}
            models={models}
            onModelChange={handleModelChange}
            systemInstruction={systemInstruction}
            onSystemInstructionChange={handleSystemInstructionChange}
            onSend={handleSend}
            loading={loading}
            onStop={handleStop}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onUploadFiles={uploadFiles}
            isAdmin={isAdmin}
            onLogout={handleLogout}
          />
        )}
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        models={models}
        settings={settings}
        onChange={setSettings}
        onSave={handleSaveSettings}
        saving={savingSettings}
      />
    </div>
  );
}
