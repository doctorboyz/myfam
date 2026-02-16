"use client";

import { User, DashboardFilters as FilterType, TransactionType } from '@/types';
import styles from './DashboardFilter.module.css';
import { useFinance } from "@/context/FinanceContext";

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
  const { getCategoriesByGroup, getGroupsByType, accounts } = useFinance();

  // --- Filter Options Preparation ---

  // 1. Users
  const userOptions = users.map(u => ({ id: u.name, label: u.name })); // Using name as ID for now based on context

  // 2. Types
  const typeOptions = [
    { id: 'income', label: 'Income' },
    { id: 'expense', label: 'Expense' },
    { id: 'transfer', label: 'Transfer' },
  ];

  // 3. Accounts
  // Filter accounts based on selected users if any, otherwise show all available (security check handled in context)
  const availableAccounts = filters.users.length > 0
    ? accounts.filter(a => filters.users.includes(a.owner))
    : accounts;
    
  const accountOptions = availableAccounts.map(a => ({ id: a.id, label: a.name, group: a.owner }));

  // 4. Categories
  // Based on selected types. If no type selected, show all? Or show grouped by type.
  const selectedTypes = filters.types.length > 0 ? filters.types : ['income', 'expense', 'transfer'];
  
  const categoryOptions = selectedTypes.flatMap(type => {
      const groups = getGroupsByType(type as TransactionType);
      return groups.flatMap(group => {
          const cats = getCategoriesByGroup(group.id);
          return cats.map(c => ({ id: c.id, label: c.name, group: group.name }));
      });
  });

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

  // Date Logic
  const handlePresetDate = (preset: 'this_month' | 'last_month' | 'this_year' | 'all') => {
      const now = new Date();
      let start: Date | null = null;
      let end: Date | null = null;

      if (preset === 'this_month') {
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (preset === 'last_month') {
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          end = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (preset === 'this_year') {
          start = new Date(now.getFullYear(), 0, 1);
          end = new Date(now.getFullYear(), 11, 31);
      }

      onFilterChange({ ...filters, dateRange: { start, end } });
  };

  const handleDateChange = (type: 'start' | 'end', val: string) => {
      const date = val ? new Date(val) : null;
      const newRange = { ...filters.dateRange, [type]: date };
      onFilterChange({ ...filters, dateRange: newRange });
  };

  const formatDateVal = (date: Date | null) => {
      if (!date) return '';
      return date.toISOString().split('T')[0];
  };

  return (
    <div className={styles.container}>
      {/* 1. User Filter (Parent Only) */}
      {canFilterUsers && (
          <div className={styles.filterItem}>
              <MultiSelect 
                  label="User" 
                  options={userOptions} 
                  selected={filters.users} 
                  onChange={handleUserChange} 
              />
          </div>
      )}

      {/* 2. Account Filter */}
      <div className={styles.filterItem}>
          <MultiSelect 
              label="Account" 
              options={accountOptions} 
              selected={filters.accounts || []} 
              onChange={handleAccountChange} 
          />
      </div>

      {/* 3. Type Filter */}
      <div className={styles.filterItem}>
          <MultiSelect 
              label="Type" 
              options={typeOptions} 
              selected={filters.types} 
              onChange={handleTypeChange} 
          />
      </div>

      {/* 4. Category Filter */}
      <div className={styles.filterItem}>
          <MultiSelect 
              label="Category" 
              options={categoryOptions} 
              selected={filters.categories || []} 
              onChange={handleCategoryChange} 
          />
      </div>

      {/* 5. Date Filter */}
      <div className={`${styles.filterItem} ${styles.dateFilter}`}>
          <div className={styles.datePresets}>
              <button onClick={() => handlePresetDate('this_month')} className={styles.presetBtn}>This Month</button>
              <button onClick={() => handlePresetDate('last_month')} className={styles.presetBtn}>Last Month</button>
              <button onClick={() => handlePresetDate('this_year')} className={styles.presetBtn}>This Year</button>
              <button onClick={() => handlePresetDate('all')} className={styles.presetBtn}>All</button>
          </div>
          <div className={styles.dateInputs}>
              <input 
                  type="date" 
                  className={styles.dateInput}
                  value={formatDateVal(filters.dateRange.start)}
                  onChange={(e) => handleDateChange('start', e.target.value)}
              />
              <span className={styles.dateSeparator}>-</span>
              <input 
                  type="date" 
                  className={styles.dateInput}
                  value={formatDateVal(filters.dateRange.end)}
                  onChange={(e) => handleDateChange('end', e.target.value)}
              />
          </div>
      </div>
    </div>
  );
}
