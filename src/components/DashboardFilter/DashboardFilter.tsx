"use client";

import { User, DashboardFilters as FilterType, TransactionType, UNCATEGORIZED_FILTER } from '@/types';
import styles from './DashboardFilter.module.css';
import { useFinance } from "@/context/FinanceContext";
import { getBangkokDateString } from '@/lib/timezone';

interface DashboardFilterProps {
  users: User[];
  currentUser: User;
  filters: FilterType;
  onFilterChange: (newFilters: FilterType) => void;
}



import MultiSelect from './MultiSelect';

export default function DashboardFilter({ users, currentUser, filters, onFilterChange }: DashboardFilterProps) {
  // Only Parents can modify the User Filter
  const canFilterUsers = currentUser.role === 'parent';

  // Fetch Context Data
  const { getCategoriesByGroup, getGroupsByType, accounts, getUserLabel } = useFinance();

  // --- Filter Options Preparation ---

  // 1. Users — filter by user ID (owner names change when edited)
  const userOptions = users.map(u => ({ id: u.id, label: getUserLabel(u.id, u.name) }));

  // 2. Types
  const typeOptions = [
    { id: 'income', label: 'รายรับ' },
    { id: 'expense', label: 'รายจ่าย' },
    { id: 'transfer', label: 'โอน' },
  ];

  // 3. Accounts
  // Filter accounts based on selected users if any, otherwise show all available (security check handled in context)
  const availableAccounts = filters.users.length > 0
    ? accounts.filter(a => filters.users.includes(a.ownerId || ''))
    : accounts;
    
  const accountOptions = availableAccounts.map(a => ({ id: a.id, label: a.name, group: getUserLabel(a.ownerId || '', a.owner) }));

  // 4. Categories
  // Based on selected types. If no type selected, show all? Or show grouped by type.
  const selectedTypes = filters.types.length > 0 ? filters.types : ['income', 'expense', 'transfer'];
  
  const categoryOptions = [
      // Pseudo-option for rows missing a category — the report-validation
      // view the family uses to find rows to fix (see UNCATEGORIZED_FILTER).
      { id: UNCATEGORIZED_FILTER, label: 'ไม่มีหมวดหมู่', group: '' },
      ...selectedTypes.flatMap(type => {
      const groups = getGroupsByType(type as TransactionType);
      return groups.flatMap(group => {
          const cats = getCategoriesByGroup(group.id);
          return cats.map(c => ({ id: c.id, label: c.name, group: group.name }));
      });
  })];

  // --- Handlers ---

  const handleUserChange = (selected: string[]) => {
      onFilterChange({ ...filters, users: selected, accounts: [] }); // Reset accounts when user changes? Maybe safer.
  };

  const handleAccountChange = (selected: string[]) => {
      onFilterChange({ ...filters, accounts: selected });
  };

  const handleTypeChange = (selected: string[]) => {
      const types = selected as TransactionType[];
      onFilterChange({ ...filters, types, categories: [] }); // Reset categories when type changes
  };

  const handleCategoryChange = (selected: string[]) => {
      onFilterChange({ ...filters, categories: selected });
  };

  const handleDateChange = (type: 'start' | 'end', val: string) => {
      const date = val ? new Date(val) : null;
      const newRange = { ...filters.dateRange, [type]: date };
      onFilterChange({ ...filters, dateRange: newRange });
  };

  const formatDateVal = (date: Date | null) => {
      if (!date) return '';
      return getBangkokDateString(date);
  };

  return (
    <div className={styles.container}>
      {/* 1. Custom Date Range (advanced) */}
      <div className={`${styles.filterItem} ${styles.dateFilter}`}>
          <label className={styles.dateLabel}>ช่วงวันที่กำหนดเอง</label>
          <div className={styles.dateInputs}>
              <input
                  type="date"
                  className={styles.dateInput}
                  value={formatDateVal(filters.dateRange.start)}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  placeholder="ตั้งแต่"
              />
              <span className={styles.dateSeparator}>-</span>
              <input
                  type="date"
                  className={styles.dateInput}
                  value={formatDateVal(filters.dateRange.end)}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  placeholder="ถึง"
              />
          </div>
      </div>

      {/* 2. User Filter (Parent Only) */}
      {canFilterUsers && (
          <div className={styles.filterItem}>
              <MultiSelect
                  label="สมาชิก"
                  options={userOptions}
                  selected={filters.users}
                  onChange={handleUserChange}
              />
          </div>
      )}

      {/* 3. Account Filter */}
      <div className={styles.filterItem}>
          <MultiSelect
              label="บัญชี"
              options={accountOptions}
              selected={filters.accounts || []}
              onChange={handleAccountChange}
          />
      </div>

      {/* 4. Type Filter */}
      <div className={styles.filterItem}>
          <MultiSelect
              label="ประเภท"
              options={typeOptions}
              selected={filters.types}
              onChange={handleTypeChange}
          />
      </div>

      {/* 5. Category Filter */}
      <div className={styles.filterItem}>
          <MultiSelect
              label="หมวดหมู่"
              options={categoryOptions}
              selected={filters.categories || []}
              onChange={handleCategoryChange}
          />
      </div>
    </div>
  );
}
