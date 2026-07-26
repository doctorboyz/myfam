'use client';

import { useState } from 'react';
import { Download, Smartphone, ExternalLink, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import s from './PwaInstallButton.module.css';

const APP_URL = 'https://myfam.doctorboyz.com';

export function PwaInstallButton() {
  const { isInstalled, canInstall, isIos, isLineBrowser, install } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
    } else if (canInstall) {
      await install();
    }
  };

  return (
    <>
      {(canInstall || isIos) && (
        <button className={s.installBtn} onClick={handleClick}>
          <Smartphone size={16} />
          <span>ติดตั้งแอป</span>
          <Download size={14} />
        </button>
      )}

      {isLineBrowser && (
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={s.browserLink}
        >
          <ExternalLink size={16} />
          <span>เปิดในเบราว์เซอร์</span>
        </a>
      )}

      {isLineBrowser && (
        <p className={s.browserHint}>
          LINE ในตัวไม่รองรับการติดตั้ง PWA — เปิดลิงก์ด้านบนใน Chrome/Safari เพื่อติดตั้งแอป
        </p>
      )}

      {showIosGuide && (
        <div className={s.overlay} onClick={() => setShowIosGuide(false)}>
          <div className={s.guide} onClick={(e) => e.stopPropagation()}>
            <button className={s.closeBtn} onClick={() => setShowIosGuide(false)}>
              <X size={20} />
            </button>
            <h3 className={s.guideTitle}>ติดตั้ง MyFam บน iPhone/iPad</h3>
            <ol className={s.steps}>
              <li>แตะปุ่ม <strong>แชร์</strong> <span className={s.iconHint}>↗</span> ใน Safari ด้านล่าง</li>
              <li>เลื่อนแล้วเลือก <strong>เพิ่มไปยังหน้าจอโฮม</strong></li>
              <li>แตะ <strong>เพิ่ม</strong> ที่มุมขวาบน</li>
            </ol>
            <div className={s.arrowHint}>↖ แตะปุ่มแชร์ด้านล่าง</div>
          </div>
        </div>
      )}
    </>
  );
}