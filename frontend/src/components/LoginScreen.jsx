import { Lock, Mail } from "lucide-react";
import { useState } from "react";

export default function LoginScreen({ onAdminLogin, onClientEmailLogin, error }) {
  const [mode, setMode] = useState("client");
  const [adminPassword, setAdminPassword] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  function submitAdmin(event) {
    event.preventDefault();
    onAdminLogin(adminPassword);
  }

  function submitClientEmail(event) {
    event.preventDefault();
    if (!clientEmail.trim()) return;
    onClientEmailLogin(clientEmail.trim());
  }

  return (
    <main className="brand-bg flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-[440px] rounded-md bg-white p-6 shadow-2xl">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <span className="brand-logo h-10 w-10">
              <img src="/duong-minh-logo.jpg" alt="Duong Minh Logistics" />
            </span>
            <h1 className="text-2xl font-bold text-slate-950">Internal AI Chat</h1>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Chon kieu dang nhap de vao dung trang lam viec.
          </p>
        </div>

        {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mb-4 grid grid-cols-2 rounded-md bg-red-50 p-1">
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition ${
              mode === "admin" ? "brand-bg text-white shadow-sm" : "text-red-700 hover:bg-white/70"
            }`}
          >
            <Lock className="h-4 w-4" />
            Admin
          </button>
          <button
            type="button"
            onClick={() => setMode("client")}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition ${
              mode === "client" ? "brand-bg text-white shadow-sm" : "text-red-700 hover:bg-white/70"
            }`}
          >
            <Mail className="h-4 w-4" />
            Client Email
          </button>
        </div>

        <div className="rounded-md border border-slate-200 p-4">
          {mode === "admin" ? (
            <form onSubmit={submitAdmin} className="flex gap-2">
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Admin password"
                className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100"
              />
              <button className="brand-bg brand-hover h-11 rounded-md px-4 text-sm font-semibold text-white">
                Vao admin
              </button>
            </form>
          ) : (
            <form onSubmit={submitClientEmail} className="flex gap-2">
              <input
                type="email"
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                placeholder="Nhap email client"
                className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-red-700 focus:ring-2 focus:ring-red-100"
              />
              <button className="brand-bg brand-hover h-11 rounded-md px-4 text-sm font-semibold text-white">
                Vao chat
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
