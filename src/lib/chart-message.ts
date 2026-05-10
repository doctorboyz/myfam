/**
 * LINE Flex Message builders for MyFam Bot.
 *
 * Templates:
 * 1. Monthly Summary — income/expense/balance + top categories
 * 2. Budget Progress — horizontal bars per budget
 */

interface SummaryData {
  monthName: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  topCategories: { name: string; amount: number }[];
}

interface BudgetData {
  title: string;
  used: number;
  limit: number;
}

const fmt = new Intl.NumberFormat('th-TH');

/**
 * Build a Flex Message for monthly summary.
 */
export function buildMonthlySummaryFlex(data: SummaryData) {
  const categoryLines = data.topCategories.slice(0, 3).map((c) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: c.name, size: 'sm', color: '#8e8e93', flex: 1 },
      { type: 'text', text: `฿${fmt.format(c.amount)}`, size: 'sm', align: 'end', weight: 'bold' },
    ],
  }));

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: `📊 สรุปยอด${data.monthName}`, weight: 'bold', size: 'lg' },
        { type: 'separator', margin: 'md' },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🟢 รายรับ', size: 'sm', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.totalIncome)}`, size: 'sm', align: 'end', weight: 'bold', color: '#34c759' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '🔴 รายจ่าย', size: 'sm', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.totalExpense)}`, size: 'sm', align: 'end', weight: 'bold', color: '#ff3b30' },
              ],
            },
            { type: 'separator', margin: 'sm' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'sm',
              contents: [
                { type: 'text', text: '💰 คงเหลือ', size: 'sm', weight: 'bold', flex: 1 },
                { type: 'text', text: `฿${fmt.format(data.balance)}`, size: 'sm', align: 'end', weight: 'bold' },
              ],
            },
          ],
        },
        ...(categoryLines.length > 0
          ? [
              { type: 'separator', margin: 'md' } as const,
              { type: 'text', text: '🔝 รายจ่ายหลัก', size: 'sm', weight: 'bold', margin: 'md' } as const,
              ...categoryLines,
            ]
          : []),
      ],
    },
  };
}

/**
 * Build a Flex Message for budget progress.
 */
export function buildBudgetProgressFlex(budgets: BudgetData[]) {
  if (budgets.length === 0) {
    return {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '📈 งบประมาณ', weight: 'bold', size: 'lg' },
          { type: 'text', text: 'ยังไม่มีงบประมาณ', size: 'sm', color: '#8e8e93', margin: 'md' },
        ],
      },
    };
  }

  const budgetRows = budgets.map((b) => {
    const pct = b.limit > 0 ? Math.min(Math.round((b.used / b.limit) * 100), 100) : 0;
    const overBudget = pct >= 100;
    const barColor = overBudget ? '#ff3b30' : '#06c755';

    return {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: b.title, size: 'sm', weight: 'bold', flex: 1 },
            { type: 'text', text: `${pct}%`, size: 'xs', color: '#8e8e93', align: 'end' },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `฿${fmt.format(b.used)} / ฿${fmt.format(b.limit)}`, size: 'xs', color: '#8e8e93' },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          height: '8px',
          margin: 'xs',
          style: 'background-color: #e5e5ea; border-radius: 4px;',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              width: `${pct}%`,
              style: `background-color: ${barColor}; border-radius: 4px;`,
              contents: [],
            },
          ],
        },
      ],
    };
  });

  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '📈 งบประมาณ', weight: 'bold', size: 'lg' },
        { type: 'separator', margin: 'md' },
        ...budgetRows,
      ],
    },
  };
}