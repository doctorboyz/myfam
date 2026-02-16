import { useFinance } from "@/context/FinanceContext";
import { Transaction } from "@/types";
import { useMemo, useState } from "react";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import styles from "./VisualizationView.module.css";
import { formatMoney } from "@/components/Money/Money";

interface VisualizationViewProps {
    transactions: Transaction[]; // Filtered transactions
}

const COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF2D55', '#5856D6', '#AF52DE', '#FF3B30', '#8E8E93'];

export default function VisualizationView({ transactions }: VisualizationViewProps) {
    const { categories, groups } = useFinance();
    const [timeScale, setTimeScale] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [groupBy, setGroupBy] = useState<'category' | 'group'>('group');

    // 1. Prepare Data for Timeline (Bar Chart)
    const timelineData = useMemo(() => {
        const map = new Map<string, { date: string, income: number, expense: number, label: string }>();
        
        transactions.forEach(tx => {
            const date = new Date(tx.date);
            let key = '';
            let label = '';

            if (timeScale === 'daily') {
                key = tx.date.split('T')[0]; // YYYY-MM-DD
                label = new Date(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } else if (timeScale === 'weekly') {
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
                const monday = new Date(date.setDate(diff));
                key = monday.toISOString().split('T')[0];
                label = `Week of ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            } else {
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
                label = new Date(date.getFullYear(), date.getMonth(), 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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
        
        // Convert to array and sort
        return Array.from(map.values())
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [transactions, timeScale]);

    // 2. Prepare Data for Pie Chart (Category/Group)
    const pieData = useMemo(() => {
        const map = new Map<string, number>();
        
        transactions
            .filter(tx => tx.type === 'expense')
            .forEach(tx => {
                let name = 'Uncategorized';
                
                if (groupBy === 'group') {
                    if (tx.categoryGroup && tx.categoryGroup !== 'Unknown') {
                        name = tx.categoryGroup;
                    } else {
                        // Fallback: look up group via categoryId or category name
                        const catObj = categories.find(c => 
                            (tx.categoryId && c.id === tx.categoryId) || c.name === tx.category
                        );
                        if (catObj) {
                            const groupObj = groups.find(g => g.id === catObj.groupId);
                            if (groupObj) name = groupObj.name;
                        }
                    }
                } else {
                    // Group by Category
                    name = tx.category || 'Uncategorized';
                }
                
                const amount = Math.abs(Number(tx.amount)) + (Number(tx.fee) || 0);
                map.set(name, (map.get(name) || 0) + amount);
            });
            
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [transactions, categories, groups, groupBy]);

    return (
        <div className={styles.container}>
            {/* Timeline Section */}
            <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.chartTitle}>Income vs Expense</h3>
                    <div className={styles.toggleGroup}>
                        <button 
                            className={`${styles.toggleBtn} ${timeScale === 'daily' ? styles.active : ''}`}
                            onClick={() => setTimeScale('daily')}
                        >
                            Daily
                        </button>
                        <button 
                            className={`${styles.toggleBtn} ${timeScale === 'weekly' ? styles.active : ''}`}
                            onClick={() => setTimeScale('weekly')}
                        >
                            Weekly
                        </button>
                        <button 
                            className={`${styles.toggleBtn} ${timeScale === 'monthly' ? styles.active : ''}`}
                            onClick={() => setTimeScale('monthly')}
                        >
                            Monthly
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
                            <Bar dataKey="income" fill="url(#colorIncome)" radius={[4, 4, 0, 0]} name="Income" />
                            <Bar dataKey="expense" fill="url(#colorExpense)" radius={[4, 4, 0, 0]} name="Expense" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Pie Chart Section */}
            <div className={styles.chartCard}>
                <div className={styles.cardHeader}>
                    <h3 className={styles.chartTitle}>Expense Structure</h3>
                    <div className={styles.toggleGroup}>
                         <button 
                            className={`${styles.toggleBtn} ${groupBy === 'group' ? styles.active : ''}`}
                            onClick={() => setGroupBy('group')}
                        >
                            By Group
                        </button>
                        <button 
                            className={`${styles.toggleBtn} ${groupBy === 'category' ? styles.active : ''}`}
                            onClick={() => setGroupBy('category')}
                        >
                            By Category
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
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                paddingAngle={5}
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
                            <Legend 
                                layout="vertical" 
                                verticalAlign="middle" 
                                align="right"
                                wrapperStyle={{ fontSize: 11 }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
