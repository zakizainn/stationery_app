"use client";

import { useEffect, useRef, useState } from "react";

interface NotificationItem {
  id: number;
  pesan: string;
  dibaca: boolean;
  tanggal: string;
  requestId: number | null;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setNotifications(data.data);
          setUnreadCount(data.unreadCount);
        }
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, dibaca: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, dibaca: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full bg-white border border-slate-200/80 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-all cursor-pointer"
        aria-label="Notifikasi"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4.5 h-4.5">
          <path
            fillRule="evenodd"
            d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0 25.057 25.057 0 01-4.496 0z"
            clipRule="evenodd"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl z-50 animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
            <span className="font-bold text-slate-900 text-xs">Notifikasi</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">Belum ada notifikasi.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.dibaca && markAsRead(n.id)}
                  className={`w-full text-left px-4 py-3 text-xs transition-colors ${
                    n.dibaca ? "text-slate-500" : "bg-emerald-50/60 text-slate-800 font-medium"
                  } hover:bg-slate-50`}
                >
                  <div className="flex items-start gap-2">
                    {!n.dibaca && <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />}
                    <div>
                      <p className="leading-snug">{n.pesan}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(n.tanggal).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
