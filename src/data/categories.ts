import { Category, CategoryGroup } from "@/types";

export const INITIAL_GROUPS: CategoryGroup[] = [
  // Income
  { id: 'g_inc_1', name: 'Income', type: 'income' },
  
  // Transfer
  { id: 'g_trans_1', name: 'Transfer', type: 'transfer' },

  // Expense
  { id: 'g_food', name: 'Food', type: 'expense' },
  { id: 'g_transport', name: 'Transport', type: 'expense' },
  { id: 'g_utilities', name: 'Utilities', type: 'expense' },
  { id: 'g_shopping', name: 'Shopping', type: 'expense' },
  { id: 'g_entertainment', name: 'Entertainment', type: 'expense' },
  { id: 'g_health', name: 'Health', type: 'expense' },
  { id: 'g_housing', name: 'Housing', type: 'expense' },
  { id: 'g_education', name: 'Education', type: 'expense' },
  { id: 'g_invest', name: 'Investment', type: 'expense' },
];

export const INITIAL_CATEGORIES: Category[] = [
  // Income
  { id: 'c_salary', name: 'Salary', groupId: 'g_inc_1' },
  { id: 'c_bonus', name: 'Bonus', groupId: 'g_inc_1' },
  { id: 'c_interest', name: 'Interest', groupId: 'g_inc_1' },

  // Transfer
  { id: 'c_transfer', name: 'Transfer', groupId: 'g_trans_1' },
  { id: 'c_savings', name: 'Savings', groupId: 'g_trans_1' },

  // Expense - Food
  { id: 'c_groceries', name: 'Groceries', groupId: 'g_food' },
  { id: 'c_restaurant', name: 'Restaurant', groupId: 'g_food' },
  { id: 'c_coffee', name: 'Coffee', groupId: 'g_food' },
  
  // Expense - Transport
  { id: 'c_fuel', name: 'Fuel', groupId: 'g_transport' },
  { id: 'c_public_transport', name: 'Public Transport', groupId: 'g_transport' },
  { id: 'c_maintenance', name: 'Maintenance', groupId: 'g_transport' },
  
  // Expense - Utilities
  { id: 'c_electric', name: 'Electricity', groupId: 'g_utilities' },
  { id: 'c_water', name: 'Water', groupId: 'g_utilities' },
  { id: 'c_internet', name: 'Internet/Phone', groupId: 'g_utilities' },

  // Expense - Shopping
  { id: 'c_clothing', name: 'Clothing', groupId: 'g_shopping' },
  { id: 'c_electronics', name: 'Electronics', groupId: 'g_shopping' },

  // Expense - Entertainment
  { id: 'c_movies', name: 'Movies', groupId: 'g_entertainment' },
  { id: 'c_games', name: 'Games', groupId: 'g_entertainment' },
  
  // Expense - Housing
  { id: 'c_rent', name: 'Rent', groupId: 'g_housing' },
  { id: 'c_repair', name: 'Repairs', groupId: 'g_housing' },

  // Expense - Health
  { id: 'c_doctor', name: 'Doctor', groupId: 'g_health' },
  { id: 'c_pharmacy', name: 'Pharmacy', groupId: 'g_health' },
];
