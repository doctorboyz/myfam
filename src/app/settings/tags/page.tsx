"use client";

import { useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { Tag } from "@/types";
import { Trash2, Pencil, Check, X, Plus, Tag as TagIcon } from "lucide-react";
import s from "./tags.module.css";

export default function SettingsTagsPage() {
  const { tags, addTag, updateTag, deleteTag } = useFinance();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateTag(editingId, { name: editName.trim(), color: editColor.trim() || null });
    cancelEdit();
  };

  const handleDelete = (tag: Tag) => {
    setDeleteTarget(tag);
  };

  const confirmDelete = () => {
    if (deleteTarget && deleteConfirmInput === 'ลบ') {
      deleteTag(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteConfirmInput('');
    }
  };

  const handleCreate = async () => {
    const name = newTagName.trim();
    if (!name) return;
    await addTag(name, newTagColor.trim() || undefined);
    setNewTagName("");
    setNewTagColor("");
  };

  return (
    <div className={s.page}>
      <h1 className={s.title}>จัดการแท็ก</h1>
      <p className={s.subtitle}>แท็กช่วยจัดกลุ่มรายการตามที่คุณต้องการ</p>

      {/* Add new tag */}
      <div className={s.addRow}>
        <TagIcon size={18} className={s.addIcon} />
        <input
          className={s.addInput}
          type="text"
          placeholder="ชื่อแท็กใหม่..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          maxLength={30}
        />
        <input
          className={s.colorInput}
          type="color"
          value={newTagColor || "#06C755"}
          onChange={(e) => setNewTagColor(e.target.value)}
          title="เลือกสี"
        />
        <button
          className={s.addBtn}
          onClick={handleCreate}
          disabled={!newTagName.trim()}
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Tag list */}
      <div className={s.tagList}>
        {tags.length === 0 ? (
          <div className={s.empty}>ยังไม่มีแท็ก สร้างแท็กใหม่ด้านบน</div>
        ) : (
          tags.map((tag) => (
            <div key={tag.id} className={s.tagItem}>
              {editingId === tag.id ? (
                <div className={s.editRow}>
                  <input
                    className={s.editInput}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    maxLength={30}
                  />
                  <input
                    className={s.colorInput}
                    type="color"
                    value={editColor || "#06C755"}
                    onChange={(e) => setEditColor(e.target.value)}
                  />
                  <button className={s.iconBtn} onClick={saveEdit} aria-label="บันทึก">
                    <Check size={16} />
                  </button>
                  <button className={s.iconBtnCancel} onClick={cancelEdit} aria-label="ยกเลิก">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className={s.tagInfo}>
                    <span
                      className={s.tagDot}
                      style={tag.color ? { backgroundColor: tag.color } : undefined}
                    />
                    <span className={s.tagName}>{tag.name}</span>
                  </div>
                  <div className={s.tagActions}>
                    <button className={s.iconBtn} onClick={() => startEdit(tag)} aria-label="แก้ไข">
                      <Pencil size={14} />
                    </button>
                    <button className={s.iconBtnDanger} onClick={() => handleDelete(tag)} aria-label="ลบ">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete confirmation overlay */}
      {deleteTarget && (
        <div className={s.overlay} onClick={() => { setDeleteTarget(null); setDeleteConfirmInput(''); }}>
          <div className={s.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={s.confirmTitle}>ลบแท็ก</h3>
            <p className={s.confirmText}>
              คุณแน่ใจหรือไม่ที่จะลบแท็ก <strong>{deleteTarget.name}</strong>?
            </p>
            <p className={s.confirmWarning}>
              รายการธุรกรรมที่ใช้แท็กนี้จะไม่ถูกลบ แต่แท็กจะถูกนำออก
            </p>
            <p className={s.confirmHint}>พิมพ์ <strong>ลบ</strong> เพื่อยืนยัน</p>
            <input
              className={s.confirmInput}
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder="ลบ"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') confirmDelete(); }}
            />
            <div className={s.confirmActions}>
              <button className={s.cancelBtn} onClick={() => { setDeleteTarget(null); setDeleteConfirmInput(''); }}>
                ยกเลิก
              </button>
              <button className={s.dangerBtn} disabled={deleteConfirmInput !== 'ลบ'} onClick={confirmDelete}>
                ลบถาวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}