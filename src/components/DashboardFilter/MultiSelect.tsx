"use client";

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import styles from './MultiSelect.module.css';

interface Option {
    id: string;
    label: string;
    group?: string; // Optional grouping
}

interface MultiSelectProps {
    label: string;
    options: Option[];
    selected: string[]; // Array of IDs
    onChange: (selected: string[]) => void;
    disabled?: boolean;
}

export default function MultiSelect({ label, options, selected, onChange, disabled = false }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (disabled) return null;

    const toggleOption = (id: string) => {
        const newSelected = selected.includes(id)
            ? selected.filter(s => s !== id)
            : [...selected, id];
        onChange(newSelected);
    };

    const displayText = selected.length === 0 
        ? `All ${label}` 
        : `${selected.length} ${label}${selected.length > 1 ? 's' : ''}`;

    // Group options if needed
    const groups = options.reduce((acc, opt) => {
        const group = opt.group || 'Other';
        if (!acc[group]) acc[group] = [];
        acc[group].push(opt);
        return acc;
    }, {} as Record<string, Option[]>);

    const hasGroups = Object.keys(groups).length > 1 || (Object.keys(groups).length === 1 && Object.keys(groups)[0] !== 'Other');
    const groupedOptions = Object.entries(groups);

    return (
        <div className={styles.container} ref={containerRef}>
            <div 
                className={`${styles.trigger} ${isOpen ? styles.active : ''} ${selected.length > 0 ? styles.hasSelection : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.label}>
                    <span className={styles.labelText}>{displayText}</span>
                </div>
                <ChevronDown size={14} className={styles.arrow} />
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.scrollArea}>
                    {hasGroups ? (
                        groupedOptions.map(([groupName, groupOptions]) => (
                            <div key={groupName} className={styles.group}>
                                <div className={styles.groupTitle}>{groupName}</div>
                                {groupOptions.map(opt => (
                                    <div 
                                        key={opt.id} 
                                        className={`${styles.option} ${selected.includes(opt.id) ? styles.selected : ''}`}
                                        onClick={() => toggleOption(opt.id)}
                                    >
                                        <div className={styles.checkbox}>
                                            {selected.includes(opt.id) && <Check size={10} color="white" />}
                                        </div>
                                        <span className={styles.optionLabel}>{opt.label}</span>
                                    </div>
                                ))}
                            </div>
                        ))
                    ) : (
                        options.map(opt => (
                            <div 
                                key={opt.id} 
                                className={`${styles.option} ${selected.includes(opt.id) ? styles.selected : ''}`}
                                onClick={() => toggleOption(opt.id)}
                            >
                                <div className={styles.checkbox}>
                                    {selected.includes(opt.id) && <Check size={10} color="white" />}
                                </div>
                                <span className={styles.optionLabel}>{opt.label}</span>
                            </div>
                        ))
                    )}
                    </div>
                    
                    {selected.length > 0 && (
                        <div className={styles.footer} onClick={() => onChange([])}>
                            Clear Filter
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
