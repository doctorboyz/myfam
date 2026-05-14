"use client";

import { useLiff } from "@/context/LiffContext";
import styles from "./page.module.css";
import Image from "next/image";

export default function LoginPage() {
  const { liffLogin, isLiffReady } = useLiff();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <Image src="/favicon.png" alt="My Fam" width={80} height={80} className={styles.logoIcon} />
          <h1 className={styles.title}>My Fam</h1>
          <p className={styles.subtitle}>จัดการการเงินครอบครัว</p>
        </div>

        <button
          className={styles.lineButton}
          onClick={() => liffLogin()}
          disabled={!isLiffReady}
        >
          เข้าสู่ระบบด้วย LINE
        </button>

        <p className={styles.hint}>
          กรุณาเปิดแอปผ่าน LINE เพื่อใช้งาน
        </p>
      </div>
    </div>
  );
}