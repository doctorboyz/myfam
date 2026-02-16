# Product Requirements Document: Family Finance Tracker (FamMee)

## 1. Overview

A simple web application for tracking family income and expenses, designed for use by multiple family members.

## 2. User Authentication

- **Login**: Simple username and password.
- **Users**: Family members.

## 3. Account Management

Users can create and manage financial accounts.

- **Fields**:
  - `Description`: Name/Details of the account.
  - `Owner`: Who owns the account.
  - `Account No.`: Bank account or card number.
  - `Reconcile Balance`: Starting or current confirmed balance.
  - `Color`: Color code for UI distinction.
  - `Alias`: Short name for quick reference.

## 4. Transaction Management

Core functionality to record financial activities.

- **Types**:
  - **Income**: Money coming in.
  - **Expense**: Money going out.
  - **Transfer**: Moving money between accounts.
- **Fields**:
  - `Date/Time`: When the transaction occurred.
  - `Amount`: Transaction value.
```markdown
  - `Fee`: Transaction fee (if any).
    - **Income**: Balance increases by `Amount`.
    - **Expense**: Balance decreases by `Amount` + `Fee`.
    - **Transfer**: `From Account` decreases by `Amount` + `Fee`; `To Account` increases by `Amount`.
```
 
```markdown
  - `Category`: Hierarchical structure (Category Group -> Category).
    - **Separation**: Distinct categories for Income, Expense, and Transfer.
    - **Customization**: Users can create and manage their own Categories and Groups.
```
  - `Account`: The account(s) involved in the transaction (Source/Destination).
  - `Note`: Detailed description or remarks for the transaction.```
  - `Tags`: Flexible labeling for filtering/searching.
  - `Slip/Evidence`: Ability to upload multiple images per transaction.
  - `Status`:
    - **Pending**: Recorded but not yet finalized.
    - **Done**: Completed/Cleared.
    - **Void**: Soft deleted record (excluded from calculations).

## 5. Budgeting

- **Concept**: Transactions can be planned ahead or tracked against a budget.
- **Structure**:
  - **Plan Amount**: Expected/Budgeted value.
  - **Actual Amount**: Realized value.
  - _Note_: A budget item is essentially a transaction with a "Plan" amount.

## 6. Dashboard & Reports (Summary Page)

A unified view of financial status and history.

- **Filters**:
  - `Account`: Filter by specific bank/cash accounts.
  - `Owner`: Filter by family member.
  - `Date Range`: Select specific period.
- **Visualizations**:
  - **Balance Card**: Displays current total balance (filtered).
  - **Income vs Expense Graph**: Visual comparison of cash flow over time.
  - **Category Pie Chart**: Breakdown of expenses by Category and Category Group.
