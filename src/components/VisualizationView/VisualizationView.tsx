import { useFinance } from "@/context/FinanceContext";
import { Transaction } from "@/types";
import { useMemo, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import styles from "./VisualizationView.module.css";
import { formatMoney } from "@/components/Money/Money";

interface VisualizationViewProps {
    transactions: Transaction[];
}

const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE', '#FF3B30', '#8E8E93'];

const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function VisualizationView({ transactions }: VisualizationViewProps) {
    const { categories, groups, budgets } = useFinance();
    const [timeScale, setTimeScale] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [groupBy, setGroupBy] = useState<'category' | 'group'>('group');

    // 1. Timeline Bar Chart
    const timelineData = useMemo(() => {
        const map = new Map<string, { date: string, income: number, expense: number, label: string }>();

        transactions.forEach(tx => {
            const date = new Date(tx.date);
            let key = '';
            let label = '';

            if (timeScale === 'daily') {
                key = tx.date.split('T')[0];
                const d = new Date(key);
                label = `${d.getDate()} ${thaiMonths[d.getMonth()]}`;
            } else if (timeScale === 'weekly') {
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(date.setDate(diff));
                key = monday.toISOString().split('T')[0];
                label = `สัปดาห์ ${monday.getDate()} ${thaiMonths[monday.getMonth()]}`;
            } else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                label = `${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
            }

            if (!map.has(key)) {
                map.set(key, { date: key, income: 0, expense: 0, label });
            }

            const entry = map.get(key)!;

            if (tx.type === 'income') {
                entry.income += Number(tx.amount);
            } else if (tx.type === 'expense') {
                entry.expense += Math.abs(Number(tx.amount));
                if (tx.fee) entry.expense += Number(tx.fee);
            }
        });

        return Array.from(map.values())
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [transactions, timeScale]);

    // 2. Pie Chart (Category/Group)
    const pieData = useMemo(() => {
        const map = new Map<string, number>();

        transactions
            .filter(tx => tx.type === 'expense')
            .forEach(tx => {
                let name = 'ไม่มีหมวดหมู่';

                if (groupBy === 'group') {
                    if (tx.categoryGroup && tx.categoryGroup !== 'Unknown') {
                        name = tx.categoryGroup;
                    } else {
                        const catObj = categories.find(c =>
                            (tx.categoryId && c.id === tx.categoryId) || c.name === tx.category
                        );
                        if (catObj) {
                            const groupObj = groups.find(g => g.id === catObj.groupId);
                            if (groupObj) name = groupObj.name;
                        }
                    }
                } else {
                    name = tx.category || 'ไม่มีหมวดหมู่';
                }

                const amount = Math.abs(Number(tx.amount)) + (Number(tx.fee) || 0);
                map.set(name, (map.get(name) || 0) + amount);
            });

        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, categories, groups, groupBy]);

    // 3. Budget Progress
    const budgetProgress = useMemo(() => {
        if (!budgets || budgets.length === 0) return [];

        return budgets.map(budget => {
            const totalPlanned = budget.items
                .filter(i => i.status !== 'cancelled')
                .reduce((sum, i) => sum + i.plannedAmount, 0);
            const totalActual = budget.items
                .filter(i => i.status === 'done')
                .reduce((sum, i) => sum + (i.actualAmount || i.plannedAmount), 0);
            const pct = budget.limit > 0 ? Math.min((totalActual / budget.limit) * 100, 100) : 0;

            return {
                id: budget.id,
                title: budget.title,
                used: totalActual,
                limit: budget.limit,
                planned: totalPlanned,
                pct,
            };
        });
    }, [budgets]);

    // 4. Monthly Trend (last 6 months)
    const trendData = useMemo(() => {
        const map = new Map<string, { month: string, income: number, expense: number, label: string }>();
        const now = new Date();

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            map.set(key, {
                month: key,
                income: 0,
                expense: 0,
                label: `${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`,
            });
        }

        transactions.forEach(tx => {
            const date = new Date(tx.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const entry = map.get(key);
            if (!entry) return;

            if (tx.type === 'income') {
                entry.income += Number(tx.amount);
            } else if (tx.type === 'expense') {
                entry.expense += Math.abs(Number(tx.amount));
                if (tx.fee) entry.expense += Number(tx.fee);
            }
        });

        return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    }, [transactions]);

    return (
        <div className={styles.container}>
            {/* Timeline Section */}
            <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.chartTitle}>รายรับ vs รายจ่าย</h3>
                    <div className={styles.toggleGroup}>
                        <button
                            className={`${styles.toggleBtn} ${timeScale === 'daily' ? styles.active : ''}`}
                            onClick={() => setTimeScale('daily')}
                        >
                            รายวัน
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${timeScale === 'weekly' ? styles.active : ''}`}
                            onClick={() => setTimeScale('weekly')}
                        >
                            รายสัปดาห์
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${timeScale === 'monthly' ? styles.active : ''}`}
                            onClick={() => setTimeScale('monthly')}
                        >
                            รายเดือน
                        </button>
                    </div>
                </div>
                <div className={styles.chartWrapper}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timelineData}>
                             <defs>
                                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34C759" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#34C759" stopOpacity={0.3}/>
                                </linearGradient>
                                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FF3B30" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#FF3B30" stopOpacity={0.3}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="label" fontSize={11} tickMargin={5} minTickGap={30} />
                            <YAxis hide={true} />
                            <Tooltip
                                labelStyle={{ fontSize: 13, fontWeight: 600, color: '#666', marginBottom: 4 }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                itemStyle={{ fontSize: 13 }}
                                formatter={(value: number | undefined) => [`฿${formatMoney(value)}`]}
                            />
                            <CartesianGrid vertical={false} stroke="#eee" strokeDasharray="5 5" />
                            <Bar dataKey="income" fill="url(#colorIncome)" radius={[4, 4, 0, 0]} name="รายรับ" />
                            <Bar dataKey="expense" fill="url(#colorExpense)" radius={[4, 4, 0, 0]} name="รายจ่าย" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Monthly Trend */}
            <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>แนวโน้ม 6 เดือน</h3>
                <div className={styles.trendWrapper}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData}>
                            <XAxis dataKey="label" fontSize={11} tickMargin={5} />
                            <YAxis hide={true} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                formatter={(value: number | undefined) => [`฿${formatMoney(value)}`]}
                            />
                            <CartesianGrid vertical={false} stroke="#eee" strokeDasharray="5 5" />
                            <Line type="monotone" dataKey="income" stroke="#34C759" strokeWidth={2} dot={{ r: 3 }} name="รายรับ" />
                            <Line type="monotone" dataKey="expense" stroke="#FF3B30" strokeWidth={2} dot={{ r: 3 }} name="รายจ่าย" />
                            <Legend fontSize={12} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Pie Chart Section */}
            <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.chartTitle}>สัดส่วนรายจ่าย</h3>
                    <div className={styles.toggleGroup}>
                         <button
                            className={`${styles.toggleBtn} ${groupBy === 'group' ? styles.active : ''}`}
                            onClick={() => setGroupBy('group')}
                        >
                            ตามกลุ่ม
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${groupBy === 'category' ? styles.active : ''}`}
                            onClick={() => setGroupBy('category')}
                        >
                            ตามหมวด
                        </button>
                    </div>
                </div>
                <div className={styles.pieWrapper}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                 <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={60}
                                    fill="#8884d8"
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number | undefined) => `฿${formatMoney(value)}`}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className={styles.legend}>
                        {pieData.map((entry, index) => (
                            <div key={entry.name} className={styles.legendItem}>
                                <span className={styles.legendDot} style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                <span className={styles.legendLabel}>{entry.name}</span>
                            </div>
                        ))}
                    </div>
            </div>

            {/* Budget Progress */}
            {budgetProgress.length > 0 && (
                <div className={styles.chartCard}>
                    <h3 className={styles.chartTitle}>ความคืบหน้างบประมาณ</h3>
                    <div className={styles.budgetList}>
                        {budgetProgress.map(b => {
                            const overBudget = b.pct >= 100;
                            const barColor = overBudget
                                ? 'var(--danger)'
                                : 'var(--primary)';
                            return (
                                <div key={b.id} className={styles.budgetItem}>
                                    <div className={styles.budgetItemHeader}>
                                        <span className={styles.budgetItemTitle}>{b.title}</span>
                                        <span className={styles.budgetItemAmount}>
                                            ฿{formatMoney(b.used)} / ฿{formatMoney(b.limit)}
                                        </span>
                                    </div>
                                    <div className={styles.budgetBar}>
                                        <div
                                            className={styles.budgetBarFill}
                                            style={{
                                                width: `${b.pct}%`,
                                                background: barColor,
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}