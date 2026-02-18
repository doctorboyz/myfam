"use client";

import { useState, useEffect } from "react";
import Modal from "../Modal/Modal";
import { Account, AccountType } from "@/types";
import styles from "./AccountFormModal.module.css";
import {
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  UtensilsCrossed,
  Dumbbell,
  ShoppingCart,
  Gamepad2,
  Gift,
  Home,
  Car,
  Zap,
  Droplet,
  Heart,
  Music,
  Book,
  Map,
  DollarSign,
} from "lucide-react";

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: Omit<Account, "id" | "balance" | "owner">) => void;
  initialData?: Account;
}

const COLORS = ["#007AFF", "#34C759", "#FF3B30", "#5856D6", "#FF9500", "#5AC8FA", "#FF2D55", "#8E8E93"];

const ICON_OPTIONS: Array<{ name: string; label: string; icon: React.ReactNode }> = [
  { name: "Wallet", label: "กระเป๋า", icon: <Wallet size={24} /> },
  { name: "CreditCard", label: "บัตรเครดิต", icon: <CreditCard size={24} /> },
  { name: "PiggyBank", label: "ออมเงิน", icon: <PiggyBank size={24} /> },
  { name: "TrendingUp", label: "ลงทุน", icon: <TrendingUp size={24} /> },
  { name: "UtensilsCrossed", label: "อาหาร", icon: <UtensilsCrossed size={24} /> },
  { name: "Dumbbell", label: "ออกกำลังกาย", icon: <Dumbbell size={24} /> },
  { name: "ShoppingCart", label: "ช้อปปิ้ง", icon: <ShoppingCart size={24} /> },
  { name: "Gamepad2", label: "เกม", icon: <Gamepad2 size={24} /> },
  { name: "Gift", label: "ของขวัญ", icon: <Gift size={24} /> },
  { name: "Home", label: "บ้าน", icon: <Home size={24} /> },
  { name: "Car", label: "รถ", icon: <Car size={24} /> },
  { name: "Zap", label: "ไฟฟ้า", icon: <Zap size={24} /> },
  { name: "Droplet", label: "น้ำ", icon: <Droplet size={24} /> },
  { name: "Heart", label: "สุขภาพ", icon: <Heart size={24} /> },
  { name: "Music", label: "เพลง", icon: <Music size={24} /> },
  { name: "Book", label: "การศึกษา", icon: <Book size={24} /> },
  { name: "Map", label: "เดินทาง", icon: <Map size={24} /> },
  { name: "DollarSign", label: "เงิน", icon: <DollarSign size={24} /> },
];

const getDefaultIcon = (type: AccountType): string => {
  const iconMap: Record<AccountType, string> = {
    bank: "Wallet",
    cash: "DollarSign",
    credit: "CreditCard",
    wallet: "Wallet",
    loan: "TrendingUp",
    invest: "TrendingUp",
  };
  return iconMap[type];
};

export default function AccountFormModal({ isOpen, onClose, onSave, initialData }: AccountFormModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "bank" as AccountType,
    balance: 0,
    color: COLORS[0],
    icon: getDefaultIcon("bank"),
    accountNo: "",
    alias: "",
  });

  useEffect(() => {
    if (isOpen) {
        if (initialData) {
        setFormData({
            name: initialData.name,
            type: initialData.type,
            balance: initialData.balance,
            color: initialData.color,
            icon: initialData.icon || getDefaultIcon(initialData.type),
            accountNo: initialData.accountNo || "",
            alias: initialData.alias || "",
        });
        } else {
        setFormData({ // Reset form for new entry
            name: "",
            type: "bank",
            balance: 0,
            color: COLORS[0],
            icon: getDefaultIcon("bank"),
            accountNo: "",
            alias: "",
        });
        }
    }
  }, [isOpen, initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return; // Simple validation
    onSave({ ...formData, status: initialData?.status || 'active' });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edit Account" : "New Account"}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label>Description (Name)</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Main Bank"
            required
            className={styles.input}
          />
        </div>

        {/* Removed Owner Field */}

        <div className={styles.field}>
            <label>Type</label>
            <select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as AccountType;
                  setFormData({
                    ...formData,
                    type: newType,
                    icon: getDefaultIcon(newType)
                  });
                }}
                className={styles.select}
            >
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="credit">Credit Card</option>
                <option value="wallet">Digitial Wallet</option>
                <option value="loan">Loan</option>
                <option value="invest">Investment</option>
            </select>
        </div>

        <div className={styles.field}>
          <label>Icon</label>
          <div className={styles.selectedIconDisplay}>
            {ICON_OPTIONS.find(o => o.name === formData.icon)?.icon}
            <span>{ICON_OPTIONS.find(o => o.name === formData.icon)?.label}</span>
          </div>
          <div className={styles.iconGrid}>
            {ICON_OPTIONS.map((opt) => (
              <button
                key={opt.name}
                type="button"
                className={`${styles.iconButton} ${formData.icon === opt.name ? styles.selectedIcon : ""}`}
                onClick={() => setFormData({ ...formData, icon: opt.name })}
                title={opt.label}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Account No. (Optional)</label>
          <input
            type="text"
            value={formData.accountNo}
            onChange={(e) => setFormData({ ...formData, accountNo: e.target.value })}
            placeholder="e.g. 123-xxx-xxx"
            className={styles.input}
          />
        </div>

        {!initialData && (
             <div className={styles.field}>
              <label>Starting Balance</label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) })}
                className={styles.input}
              />
            </div>
        )}

        <div className={styles.field}>
          <label>Color</label>
          <div className={styles.colors}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorSwatch} ${formData.color === c ? styles.selectedColor : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => setFormData({ ...formData, color: c })}
              />
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label>Alias (Optional)</label>
          <input
            type="text"
            value={formData.alias}
            onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
            placeholder="Short name"
            className={styles.input}
          />
        </div>

        <div className={styles.actions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Save
            </button>
        </div>
      </form>
    </Modal>
  );
}
