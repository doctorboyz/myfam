"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import Image from "next/image";
import { useFinance } from "@/context/FinanceContext";

export default function LoginPage() {
  const router = useRouter();
  const { refreshData } = useFinance();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already authenticated, go to dashboard
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) router.replace("/dashboard");
      })
      .catch(() => {});
  }, [router]);

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
      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/favicon.png" alt="My Fam" width={80} height={80} className={styles.logoIcon} />
          <h1 className={styles.title}>My Fam</h1>
          <p className={styles.subtitle}>จัดการการเงินครอบครัว</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
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

        <p className={styles.hint}>สำหรับสมาชิกในครอบครัวเท่านั้น</p>
      </div>
    </div>
  );
}