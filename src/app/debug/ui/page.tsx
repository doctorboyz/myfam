'use client';

import { useState } from 'react';
import s from './page.module.css';

const FONT_SIZES = [9, 10, 11, 12, 13, 14];

export default function DebugUiPage() {
  const [selectedSize, setSelectedSize] = useState<number | null>(null);

  return (
    <div className={s.page}>
      <h1 className={s.title}>UI Font Size Debug</h1>
      <p className={s.subtitle}>เลือกขนาดตัวอักษรที่สวยที่สุดสำหรับแต่ละ element</p>

      {/* Bottom Nav Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Bottom Nav Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <button
              key={`nav-${size}`}
              className={`${s.sample} ${selectedSize === size ? s.selected : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              <span style={{ fontSize: size }}>หน้าหลัก</span>
              <span className={s.sizeTag}>{size}px</span>
            </button>
          ))}
        </div>
      </section>

      {/* Tab Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Tab Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <button
              key={`tab-${size}`}
              className={`${s.sample} ${selectedSize === size ? s.selected : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              <span style={{ fontSize: size }}>รายการทั้งหมด</span>
              <span className={s.sizeTag}>{size}px</span>
            </button>
          ))}
        </div>
      </section>

      {/* Card Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Card / Container Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <div key={`card-${size}`} className={`${s.cardSample} ${selectedSize === size ? s.selected : ''}`}>
              <span style={{ fontSize: size }}>ยอดคงเหลือ</span>
              <span className={s.sizeTag}>{size}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* Button Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Button Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <button
              key={`btn-${size}`}
              className={`${s.btnSample} ${selectedSize === size ? s.selected : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              <span style={{ fontSize: size }}>เพิ่มรายการ</span>
              <span className={s.sizeTag}>{size}px</span>
            </button>
          ))}
        </div>
      </section>

      {/* Dropdown Trigger Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Dropdown Trigger Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <button
              key={`dd-${size}`}
              className={`${s.dropdownSample} ${selectedSize === size ? s.selected : ''}`}
              onClick={() => setSelectedSize(size)}
            >
              <span style={{ fontSize: size }}>สมาชิกทั้งหมด</span>
              <span className={s.sizeTag}>{size}px</span>
            </button>
          ))}
        </div>
      </section>

      {/* Dropdown Option Labels */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>Dropdown Option Labels</h2>
        <div className={s.row}>
          {FONT_SIZES.map((size) => (
            <div key={`opt-${size}`} className={`${s.optionSample} ${selectedSize === size ? s.selected : ''}`}>
              <span style={{ fontSize: size }}>งบประมาณทั้งหมด</span>
              <span className={s.sizeTag}>{size}px</span>
            </div>
          ))}
        </div>
      </section>

      {/* Combined Preview */}
      {selectedSize && (
        <section className={`${s.section} ${s.preview}`}>
          <h2 className={s.sectionTitle}>Preview @ {selectedSize}px</h2>
          <div className={s.previewContent}>
            <nav className={s.previewNav}>
              {['หน้าหลัก', 'รายการ', 'บัญชี', 'งบประมาณ', 'โปรไฟล์'].map((l) => (
                <span key={l} style={{ fontSize: selectedSize }}>{l}</span>
              ))}
            </nav>
            <button className={s.previewBtn} style={{ fontSize: selectedSize }}>
              เพิ่มรายการ
            </button>
            <div className={s.previewCard}>
              <span style={{ fontSize: selectedSize }}>ยอดคงเหลือ</span>
            </div>
            <button className={s.previewDropdown} style={{ fontSize: selectedSize }}>
              สมาชิกทั้งหมด
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
