import { useState, useEffect, useMemo } from "react";
import Modal from "../Modal/Modal";
import { Transaction, Account, TransactionType, User } from "@/types";
import styles from "./TransactionDetailModal.module.css";
import { Trash2, Edit2, Image, Users, X } from "lucide-react";
import { formatBangkokShortDate, formatBangkokTime } from "@/lib/timezone";
import { useFinance } from "@/context/FinanceContext";
import TagSelector from "../TagSelector";
import CategorySelector from "../CategorySelector/CategorySelector";
import CreateCategoryModal from "../CreateCategoryModal/CreateCategoryModal";
import { compressImage } from "@/lib/compressImage";
import { parseTransaction } from "@/lib/transaction-parser";

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: Transaction | null; // null = Add Mode
  accountId?: string; // Optional: If provided, pre-selects/fixes account
  initialType?: Transaction['type'];
  isOwner: boolean;
  onSave: (transaction: Omit<Transaction, "id">, createdById?: string) => void;
  onDelete?: (id: string) => void;
  availableAccounts?: Account[]; // For selecting account
}

export default function TransactionDetailModal({
  isOpen,
  onClose,
  transaction,
  accountId,
  initialType,
  isOwner,
  onSave,
  onDelete,
  availableAccounts = []
}: TransactionDetailModalProps) {
  const { getGroupsByType, getCategoriesByGroup, categories, groups, allAccounts, currentUser, transactions, users, tags } = useFinance();

  // Member selector: only show when family has >1 member
  const showMemberSelector = users.length > 1;
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentUser?.id || '');

  // Derived: selected member name (for filtering accounts)
  const selectedMemberName = useMemo(() => {
    const member = users.find(u => u.id === selectedMemberId);
    return member?.name || currentUser?.name || '';
  }, [users, selectedMemberId, currentUser]);
  const [isEditing, setIsEditing] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [quickParseText, setQuickParseText] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);
  const [formData, setFormData] = useState<Partial<Transaction>>({
    amount: 0,
    category: "",
    categoryGroup: "",
    date: new Date().toISOString().split('T')[0],
    type: "expense",
    description: "",
    accountId: accountId || "",
    toAccountId: "",
    fee: 0,
    slipImage: "",
    tagIds: []
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.6 });
                setFormData(prev => ({ ...prev, slipImage: compressed }));
            } catch (err) {
                console.error('Image compression failed', err);
                // Fallback: use original if compression fails
                const reader = new FileReader();
                reader.onloadend = () => {
                    setFormData(prev => ({ ...prev, slipImage: reader.result as string }));
                };
                reader.readAsDataURL(file);
            }
        }
  };

  // Filter From Accounts: Must be selected member's + Active (or currently selected)
  const fromAccounts = availableAccounts.filter(a =>
    (a.status === 'active' || a.id === formData.accountId) &&
    (a.owner === selectedMemberName)
  );

  // Filter To Accounts: Any Active (or currently selected)
  const toAccounts = allAccounts.filter(a =>
     (a.status === 'active' || a.id === formData.toAccountId)
  );

  const getAccountLabel = (acc: Account) => `${acc.name} - ${acc.owner}`;

  useEffect(() => {
    if (isOpen) {
      // Reset member selector to current user when opening
      setSelectedMemberId(currentUser?.id || '');

      if (transaction) {
        // View existing
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
            ...transaction,
            toAccountId: transaction.toAccountId || "",
            fee: transaction.fee || 0,
            slipImage: transaction.slipImage || "",
            description: transaction.description || "",
            tagIds: transaction.tagIds || [],
        });
        setIsEditing(false);
      } else {
        // Add new
        const initialGroups = getGroupsByType(initialType || "expense");
        const firstGroup = initialGroups[0];
        const firstCats = firstGroup ? getCategoriesByGroup(firstGroup.id) : [];
        
        setFormData({
            accountId: accountId || (availableAccounts.length > 0 ? availableAccounts[0].id : ""),
            toAccountId: "",
            amount: 0,
            fee: 0,
            category: firstCats[0]?.name || "",
            categoryGroup: firstGroup?.name || "",
            date: new Date().toISOString().split('T')[0],
            type: initialType || "expense",
            description: "",
            slipImage: "",
            tagIds: []
        });
        setIsEditing(true);
      }
    }
  }, [isOpen, transaction, initialType, accountId, availableAccounts, getGroupsByType, getCategoriesByGroup]); 

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    
    // Find selected category to get the group
    const selectedCatObj = categories.find(c => c.name === formData.category);
    let groupName = formData.categoryGroup || "ทั่วไป";
    
    if (selectedCatObj) {
        const groupObj = groups.find(g => g.id === selectedCatObj.groupId);
        if (groupObj) groupName = groupObj.name;
    }
    
    // Validation
    if (formData.type === 'transfer' && !formData.toAccountId) {
        alert("กรุณาเลือกบัญชีปลายทาง");
        return;
    }
    if (formData.type === 'transfer' && formData.accountId === formData.toAccountId) {
        alert("บัญชีต้นทางและปลายทางต้องไม่เหมือนกัน");
        return;
    }
    
    onSave({
      ...formData,
      categoryGroup: groupName,
      accountId: formData.accountId || accountId, // Fallback
      fee: formData.fee ? Number(formData.fee) : 0,
      amount: Number(formData.amount),
      tagIds: formData.tagIds || [],
      tags: formData.tagIds ? tags.filter(t => formData.tagIds!.includes(t.id)).map(t => t.name) : [],
    } as Omit<Transaction, "id">, selectedMemberId);

    onClose();
  };

  const handleDelete = () => {
    if (transaction?.id && onDelete) {
      onDelete(transaction.id);
      onClose();
    }
  };

  const toggleEdit = () => {
    if (isOwner) setIsEditing(!isEditing);
  };

  const handleQuickParse = (text: string) => {
    setQuickParseText(text);
    if (!text.trim()) return;

    const parsed = parseTransaction(text, allAccounts);
    if (!parsed || parsed.confidence < 0.5) return;

    const updates: Partial<Transaction> = {
      type: parsed.type,
      amount: parsed.amount,
    };

    if (parsed.fromAccount) {
      updates.accountId = parsed.fromAccount.id;
    }
    if (parsed.toAccount) {
      updates.toAccountId = parsed.toAccount.id;
    }

    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // View Mode
  if (!isEditing && transaction) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="รายละเอียดรายการ">
        <div className={styles.viewContainer}>
          <div className={styles.viewHeader}>
            <span className={`${styles.badge} ${styles[transaction.type]}`}>
              {transaction.type === 'income' ? 'รายรับ' : transaction.type === 'expense' ? 'รายจ่าย' : 'โอน'}
            </span>
            <span className={styles.viewDate}>{formatBangkokShortDate(transaction.date)} {formatBangkokTime(transaction.date)}</span>
          </div>

          <div className={`${styles.viewAmount} ${styles[transaction.type + 'Text']}`}>
            {transaction.type === 'expense' ? '-' : transaction.type === 'income' ? '+' : ''}
            ฿{Math.abs(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

           {transaction.fee && transaction.fee > 0 && (
              <div className={styles.viewFee}>
                 ค่าธรรมเนียม: -฿{transaction.fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
           )}

          <div className={styles.viewMeta}>
             <div className={styles.metaRow}>
               <span className={styles.label}>
                  {transaction.type === 'income' ? 'บัญชีปลายทาง' : 'บัญชีต้นทาง'}
               </span>
               <span className={styles.value}>
                  {availableAccounts.find(a => a.id === transaction.accountId)?.name || "ไม่ทราบ"}
               </span>
             </div>
             
             {transaction.type === 'transfer' && transaction.toAccountId && (
                 <div className={styles.metaRow}>
                   <span className={styles.label}>บัญชีปลายทาง</span>
                   <span className={styles.value}>
                      {allAccounts.find(a => a.id === transaction.toAccountId)?.name || "ไม่ทราบ"}
                   </span>
                 </div>
             )}
            <div className={styles.metaRow}>
              <span className={styles.label}>หมวดหมู่</span>
              <span className={styles.value}>{transaction.category}</span>
            </div>
            {transaction.description && (
              <div className={styles.metaRow}>
                <span className={styles.label}>หมายเหตุ</span>
                <span className={styles.value}>{transaction.description}</span>
              </div>
            )}
            {transaction.tags && transaction.tags.length > 0 && (
              <div className={styles.metaRow}>
                <span className={styles.label}>แท็ก</span>
                <div className="flex flex-wrap gap-1">
                  {transaction.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
             {transaction.slipImage && (
              <div className={styles.metaRow}>
                <span className={styles.label}>สลิป</span>
                <img
                  src={transaction.slipImage}
                  alt="สลิป"
                  className={styles.slipThumb}
                  onClick={() => setShowLightbox(true)}
                />
              </div>
            )}
          </div>

          {isOwner && (
            <div className={styles.actions}>
              <button onClick={handleDelete} className={styles.deleteBtn}>
                <Trash2 size={18} /> ลบ
              </button>
              <button onClick={toggleEdit} className={styles.editBtn}>
                <Edit2 size={18} /> แก้ไข
              </button>
            </div>
          )}
        </div>

        {/* Image lightbox */}
        {showLightbox && transaction.slipImage && (
          <div className={styles.lightbox} onClick={() => setShowLightbox(false)}>
            <img src={transaction.slipImage} alt="สลิป" className={styles.lightboxImg} />
            <button className={styles.lightboxClose} onClick={() => setShowLightbox(false)} aria-label="ปิด">
              <X size={24} />
            </button>
          </div>
        )}
      </Modal>
    );
  }

  // Edit/Add Mode
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={transaction ? "แก้ไขรายการ" : "รายการใหม่"}>
       <form onSubmit={handleSubmit} className={styles.form}>
        {!transaction && (
          <div className={styles.quickParse}>
            <div className={styles.quickParseLabel}>พิมพ์เร็ว</div>
            <input
              type="text"
              className={styles.quickParseInput}
              value={quickParseText}
              onChange={(e) => handleQuickParse(e.target.value)}
              placeholder='เช่น "โอน 5000 จากกรุงไทยไปกสิกร"'
            />
            <div className={styles.quickParseHint}>
              พิมพ์ข้อความ → กรอกฟอร์มอัตโนมัติ
            </div>
          </div>
        )}
        <div className={styles.typeSelector}>
           {['income', 'expense', 'transfer'].map(t => (
             <button
               key={t}
               type="button"
               className={`${styles.typeBtn} ${formData.type === t ? styles.selectedType : ''} ${formData.type === t ? styles[t] : ''}`}
               onClick={() => setFormData({...formData, type: t as Transaction['type']})}
             >
               {t === 'income' ? 'รายรับ' : t === 'expense' ? 'รายจ่าย' : 'โอน'}
             </button>
           ))}
        </div>

        {/* Member selector: only when family has >1 member */}
        {showMemberSelector && (
          <div className={styles.memberSelector}>
            <label className={styles.memberLabel}>
              <Users size={16} />
              สมาชิก
            </label>
            <div className={styles.memberList}>
              {users.map(user => (
                <button
                  key={user.id}
                  type="button"
                  className={`${styles.memberBtn} ${selectedMemberId === user.id ? styles.memberBtnActive : ''}`}
                  onClick={() => setSelectedMemberId(user.id)}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className={styles.memberAvatar} />
                  ) : (
                    <span className={styles.memberInitial}>{user.name.charAt(0)}</span>
                  )}
                  <span>{user.name}</span>
                  {user.role === 'parent' && <span className={styles.memberBadge}>ผู้ปกครอง</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Account Section */}
        <div className={styles.sectionHeader}>บัญชี</div>
        <div className={styles.row}>
            <div className={styles.field}>
                <label>{formData.type === 'income' ? 'บัญชีปลายทาง' : 'บัญชีต้นทาง'}</label>
                <select 
                    value={formData.accountId} 
                    onChange={e => setFormData({...formData, accountId: e.target.value})}
                    className={styles.select}
                    disabled={!!transaction && fromAccounts.length <= 1} 
                >
                    {fromAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{getAccountLabel(acc)}</option>
                    ))}
                </select>
            </div>
            
            {formData.type === 'transfer' && (
                <div className={styles.field}>
                    <label>บัญชีปลายทาง</label>
                    <select 
                        value={formData.toAccountId || ""} 
                        onChange={e => setFormData({...formData, toAccountId: e.target.value})}
                        className={styles.select}
                    >
                        <option value="">เลือกบัญชี</option>
                        {toAccounts.filter(a => a.id !== formData.accountId).map(acc => (
                            <option key={acc.id} value={acc.id}>{getAccountLabel(acc)}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        {/* Amount & Fee Section */}
        <div className={styles.sectionHeader}>จำนวนเงิน</div>
        <div className={styles.row}>
            <div className={styles.field}>
              <label>จำนวนเงิน</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
                className={styles.inputLarge}
                autoFocus={!transaction}
              />
            </div>
            <div className={styles.field}>
              <label>ค่าธรรมเนียม</label>
              <input
                type="number"
                step="0.01"
                value={formData.fee}
                onChange={(e) => setFormData({ ...formData, fee: parseFloat(e.target.value) })}
                className={styles.input}
                placeholder="0.00"
              />
            </div>
        </div>

        <CategorySelector
          value={formData.category as string}
          onChange={(categoryName) => setFormData({ ...formData, category: categoryName })}
          onAddNew={() => setIsCreateCategoryOpen(true)}
          categories={categories}
          groups={groups}
          transactionType={formData.type as TransactionType}
        />

        <div className={styles.fileInputContainer}>
          <label className={styles.label}>รูปสลิป</label>
            <label className={styles.fileLabel}>
                <Image size={18} />
                <span>{formData.slipImage ? "เปลี่ยนรูป" : "เลือกรูป"}</span>
                <input 
                    type="file" 
                    key={fileInputKey}
                    onChange={handleFileChange} 
                    className={styles.hiddenInput}
                    accept="image/*"
                />
            </label>
            {formData.slipImage && (
                <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={formData.slipImage} alt="สลิป" className={styles.slipPreview} />
                    <button 
                        type="button" 
                        onClick={() => {
                            setFormData({...formData, slipImage: undefined});
                            setFileInputKey(Date.now());
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                        title="ลบรูป"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
        <div className={styles.field}>
          <label>วันที่</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
            <TagSelector
                selectedTagIds={formData.tagIds || []}
                onChange={(tagIds) => setFormData({ ...formData, tagIds })}
            />
        </div>

        <div className={styles.field}>
          <label>หมายเหตุ</label>
          <input
            type="text"
            value={formData.description || ""}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="เพิ่มหมายเหตุ"
            className={styles.input}
          />
        </div>
        


        <div className={styles.formActions}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
             ยกเลิก
          </button>
          <button type="submit" className={styles.saveBtn}>
            บันทึก
          </button>
        </div>
       </form>

       <CreateCategoryModal
        isOpen={isCreateCategoryOpen}
        onClose={() => setIsCreateCategoryOpen(false)}
        onSuccess={(categoryName) => {
          setFormData({ ...formData, category: categoryName });
        }}
        transactionType={formData.type as TransactionType}
       />
    </Modal>
  );
}
