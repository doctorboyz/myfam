import { useState, useEffect, useMemo } from "react";
import Modal from "../Modal/Modal";
import { Transaction, Account, TransactionType } from "@/types";
import styles from "./TransactionDetailModal.module.css";
import { Trash2, Edit2, Image } from "lucide-react";
import { useFinance } from "@/context/FinanceContext";
import TagSelector from "../TagSelector";
import CategorySelector from "../CategorySelector/CategorySelector";
import CreateCategoryModal from "../CreateCategoryModal/CreateCategoryModal";
import { compressImage } from "@/lib/compressImage";

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: Transaction | null; // null = Add Mode
  accountId?: string; // Optional: If provided, pre-selects/fixes account
  initialType?: Transaction['type'];
  isOwner: boolean;
  onSave: (transaction: Omit<Transaction, "id">) => void;
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
  const { getGroupsByType, getCategoriesByGroup, categories, groups, allAccounts, currentUser, transactions } = useFinance();
  const [isEditing, setIsEditing] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Transaction>>({
    amount: 0,
    category: "",
    categoryGroup: "",
    date: new Date().toISOString().split('T')[0],
    type: "expense",
    note: "",
    accountId: accountId || "",
    toAccountId: "",
    fee: 0,
    slipImage: "",
    tags: []
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

  // Filter From Accounts: Must be Own + Active (or currently selected)
  const fromAccounts = availableAccounts.filter(a => 
    (a.status === 'active' || a.id === formData.accountId) && 
    (a.owner === currentUser?.name)
  );

  // Filter To Accounts: Any Active (or currently selected)
  const toAccounts = allAccounts.filter(a => 
     (a.status === 'active' || a.id === formData.toAccountId)
  );

  const getAccountLabel = (acc: Account) => `${acc.name} - ${acc.owner}`;

  // Get available groups for current form type
  const currentGroups = getGroupsByType((formData.type as TransactionType) || 'expense');

  // Compute available tags from all transactions
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    transactions.forEach(tx => {
      tx.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [transactions]);

  useEffect(() => {
    if (isOpen) {
      if (transaction) {
        // View existing
        setFormData({
            ...transaction,
            toAccountId: transaction.toAccountId || "",
            fee: transaction.fee || 0,
            slipImage: transaction.slipImage || "",
            note: transaction.note || "",
            tags: transaction.tags || []
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
            note: "",
            slipImage: "",
            tags: []
        });
        setIsEditing(true);
      }
    }
  }, [isOpen, transaction, initialType, accountId, availableAccounts]); 

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    
    // Find selected category to get the group
    const selectedCatObj = categories.find(c => c.name === formData.category);
    let groupName = formData.categoryGroup || "General";
    
    if (selectedCatObj) {
        const groupObj = groups.find(g => g.id === selectedCatObj.groupId);
        if (groupObj) groupName = groupObj.name;
    }
    
    // Validation
    if (formData.type === 'transfer' && !formData.toAccountId) {
        alert("Please select a destination account.");
        return;
    }
    if (formData.type === 'transfer' && formData.accountId === formData.toAccountId) {
        alert("Source and Destination accounts must be different.");
        return;
    }
    
    onSave({
      ...formData,
      categoryGroup: groupName,
      accountId: formData.accountId || accountId, // Fallback
      fee: formData.fee ? Number(formData.fee) : 0,
      amount: Number(formData.amount),
      tags: formData.tags || []
    } as Omit<Transaction, "id">);
    
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

  // View Mode
  if (!isEditing && transaction) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Transaction Details">
        <div className={styles.viewContainer}>
          <div className={styles.viewHeader}>
            <span className={`${styles.badge} ${styles[transaction.type]}`}>
              {transaction.type.toUpperCase()}
            </span>
            <span className={styles.viewDate}>{transaction.date}</span>
          </div>

          <div className={`${styles.viewAmount} ${styles[transaction.type + 'Text']}`}>
            {transaction.type === 'expense' ? '-' : transaction.type === 'income' ? '+' : ''}
            ${Math.abs(transaction.amount).toLocaleString()}
          </div>
          
           {transaction.fee && transaction.fee > 0 && (
              <div className={styles.viewFee}>
                 Fee: -${transaction.fee.toLocaleString()}
              </div>
           )}

          <div className={styles.viewMeta}>
             <div className={styles.metaRow}>
               <span className={styles.label}>
                  {transaction.type === 'income' ? 'To Account' : 'From Account'}
               </span>
               <span className={styles.value}>
                  {availableAccounts.find(a => a.id === transaction.accountId)?.name || "Unknown"}
               </span>
             </div>
             
             {transaction.type === 'transfer' && transaction.toAccountId && (
                 <div className={styles.metaRow}>
                   <span className={styles.label}>To Account</span>
                   <span className={styles.value}>
                      {allAccounts.find(a => a.id === transaction.toAccountId)?.name || "Unknown"}
                   </span>
                 </div>
             )}
            <div className={styles.metaRow}>
              <span className={styles.label}>Category</span>
              <span className={styles.value}>{transaction.category}</span>
            </div>
            {transaction.note && (
              <div className={styles.metaRow}>
                <span className={styles.label}>Note</span>
                <span className={styles.value}>{transaction.note}</span>
              </div>
            )}
            {transaction.tags && transaction.tags.length > 0 && (
              <div className={styles.metaRow}>
                <span className={styles.label}>Tags</span>
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
                <span className={styles.label}>Slip</span>
                <a href={transaction.slipImage} target="_blank" className={styles.link}>View Image</a>
              </div>
            )}
          </div>

          {isOwner && (
            <div className={styles.actions}>
              <button onClick={handleDelete} className={styles.deleteBtn}>
                <Trash2 size={18} /> Delete
              </button>
              <button onClick={toggleEdit} className={styles.editBtn}>
                <Edit2 size={18} /> Edit
              </button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // Edit/Add Mode
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={transaction ? "Edit Transaction" : "New Transaction"}>
       <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.typeSelector}>
           {['income', 'expense', 'transfer'].map(t => (
             <button
               key={t}
               type="button"
               className={`${styles.typeBtn} ${formData.type === t ? styles.selectedType : ''} ${formData.type === t ? styles[t] : ''}`}
               onClick={() => setFormData({...formData, type: t as Transaction['type']})}
             >
               {t.charAt(0).toUpperCase() + t.slice(1)}
             </button>
           ))}
        </div>

        {/* Account Section */}
        <div className={styles.sectionHeader}>Account</div>
        <div className={styles.row}>
            <div className={styles.field}>
                <label>{formData.type === 'income' ? 'To Account' : 'From Account'}</label>
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
                    <label>To Account</label>
                    <select 
                        value={formData.toAccountId || ""} 
                        onChange={e => setFormData({...formData, toAccountId: e.target.value})}
                        className={styles.select}
                    >
                        <option value="">Select Account</option>
                        {toAccounts.filter(a => a.id !== formData.accountId).map(acc => (
                            <option key={acc.id} value={acc.id}>{getAccountLabel(acc)}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        {/* Amount & Fee Section */}
        <div className={styles.sectionHeader}>Amount</div>
        <div className={styles.row}>
            <div className={styles.field}>
              <label>Amount</label>
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
              <label>Fee</label>
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
          <label className={styles.label}>Slip Image</label>
            <label className={styles.fileLabel}>
                <Image size={18} />
                <span>{formData.slipImage ? "Change Image" : "Choose Image"}</span>
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
                    <img src={formData.slipImage} alt="Slip" className={styles.slipPreview} />
                    <button 
                        type="button" 
                        onClick={() => {
                            setFormData({...formData, slipImage: undefined});
                            setFileInputKey(Date.now());
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                        title="Remove Image"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
        <div className={styles.field}>
          <label>Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
            <TagSelector 
                selectedTags={formData.tags || []}
                onChange={(tags) => setFormData({ ...formData, tags })}
                availableTags={availableTags}
            />
        </div>

        <div className={styles.field}>
          <label>Note</label>
          <input
            type="text"
            value={formData.note || ""}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            placeholder="Add a note"
            className={styles.input}
          />
        </div>
        


        <div className={styles.formActions}>
          <button type="button" onClick={onClose} className={styles.cancelBtn}>
             Cancel
          </button>
          <button type="submit" className={styles.saveBtn}>
            Save
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
