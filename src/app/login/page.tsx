"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import styles from "./page.module.css";
import Image from "next/image";
import { useFinance } from "@/context/FinanceContext";

// Minimal shape of what telegram-web-app.js injects.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
      };
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { refreshData } = useFinance();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true once we know whether Telegram auto-login applies. Inside Telegram
  // the password form stays hidden until the check finishes, so the user
  // never sees a flash of a form they shouldn't need.
  const [tgChecked, setTgChecked] = useState(false);

  // If already authenticated, go to dashboard
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

  // Telegram Mini App auto-login: the page is usually opened from the bot's
  // "เปิด MyFam" button, so WebApp.initData is signed proof of who opened it.
  // The script loads async — poll briefly for it before giving up and
  // falling back to the password form.
  useEffect(() => {
    let cancelled = false;

    const attemptLogin = (initData: string) => {
      fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      })
        .then(async (res) => {
          if (cancelled) return;
          if (res.ok) {
            // Pull fresh data before navigating — same reason as the
            // password flow below (the provider never re-runs its mount effect).
            await refreshData();
            router.replace("/dashboard");
          } else {
            // Not in Telegram / link missing / signature bad — show the form.
            setTgChecked(true);
          }
        })
        .catch(() => {
          if (!cancelled) setTgChecked(true);
        });
    };

    const waitForWebApp = (retries: number) => {
      if (cancelled) return;
      const initData = window.Telegram?.WebApp?.initData;
      if (initData) {
        attemptLogin(initData);
        return;
      }
      if (retries > 0) {
        setTimeout(() => waitForWebApp(retries - 1), 100);
      } else {
        setTgChecked(true);
      }
    };

    waitForWebApp(20);

    return () => {
      cancelled = true;
    };
  }, [router, refreshData]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "เข้าสู่ระบบไม่สำเร็จ");
        setLoading(false);
        return;
      }
      // The provider survives client-side navigation and never re-ran its
      // mount effect — pull fresh data *before* navigating so /dashboard
      // doesn't render with a stale (null) user.
      await refreshData();
      router.replace("/dashboard");
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* Telegram's SDK — provides WebApp.initData when opened from the bot */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />

      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/favicon.png" alt="My Fam" width={80} height={80} className={styles.logoIcon} />
          <h1 className={styles.title}>My Fam</h1>
          <p className={styles.subtitle}>จัดการการเงินครอบครัว</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} hidden={!tgChecked}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="username">ชื่อผู้ใช้</label>
            <input
              id="username"
              className={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        {!tgChecked && <p className={styles.hint}>กำลังเข้าสู่ระบบผ่าน Telegram...</p>}

        <p className={styles.hint} hidden={!tgChecked}>สำหรับสมาชิกในครอบครัวเท่านั้น</p>
      </div>
    </div>
  );
}