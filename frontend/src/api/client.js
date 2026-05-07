import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 20000
});

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

const savedToken = localStorage.getItem("authToken");
if (savedToken) setAuthToken(savedToken);

export async function fetchModels() {
  const { data } = await api.get("/models");
  return data.data;
}

export async function fetchConversations() {
  const { data } = await api.get("/conversations");
  return data.data;
}

export async function createConversation(payload = {}) {
  const { data } = await api.post("/conversations", payload);
  return data.data;
}

export async function updateConversation(id, payload) {
  const { data } = await api.patch(`/conversations/${id}`, payload);
  return data.data;
}

export async function deleteConversation(id) {
  await api.delete(`/conversations/${id}`);
}

export async function fetchMessages(conversationId) {
  const { data } = await api.get(`/conversations/${conversationId}/messages`);
  return data.data;
}

export async function fetchSettings() {
  const { data } = await api.get("/conversations/settings");
  return data.data;
}

export async function saveSettings(payload) {
  const { data } = await api.put("/conversations/settings", payload);
  return data.data;
}

export async function fetchAuthConfig() {
  const { data } = await api.get("/auth/config");
  return data.data;
}

export async function adminLogin(password) {
  const { data } = await api.post("/auth/admin/login", { password });
  return data.data;
}

export async function googleLogin(credential) {
  const { data } = await api.post("/auth/google", { credential });
  return data.data;
}

export async function clientDemoLogin() {
  const { data } = await api.post("/auth/client/demo");
  return data.data;
}

export async function clientEmailLogin(email) {
  const { data } = await api.post("/auth/client/email", { email });
  return data.data;
}

export async function fetchAdminQa() {
  const { data } = await api.get("/admin/qa");
  return data.data;
}

export async function fetchSavedAnswers() {
  const { data } = await api.get("/admin/answers");
  return data.data;
}

export async function saveAnswer(payload, id) {
  const method = id ? "put" : "post";
  const url = id ? `/admin/answers/${id}` : "/admin/answers";
  const { data } = await api[method](url, payload);
  return data.data;
}

export async function sendChat(payload) {
  const { data } = await api.post("/chat", payload, { timeout: 180000 });
  return data.data;
}

export async function uploadFiles(files) {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("files", file));
  const { data } = await api.post("/uploads", formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    },
    timeout: 120000
  });
  return data.data;
}

export async function streamChat(payload, { signal, onMeta, onToken, onDone }) {
  const token = localStorage.getItem("authToken");
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ ...payload, stream: true }),
    signal
  });

  if (!response.ok || !response.body) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.error || "Không thể stream phản hồi từ AI.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    events.forEach((eventBlock) => {
      const event = eventBlock.match(/^event:\s*(.+)$/m)?.[1];
      const dataLine = eventBlock.match(/^data:\s*(.+)$/m)?.[1];
      if (!event || !dataLine) return;

      const data = JSON.parse(dataLine);
      if (event === "meta") onMeta?.(data);
      if (event === "token") onToken?.(data.token);
      if (event === "done") onDone?.(data);
    });
  }
}
