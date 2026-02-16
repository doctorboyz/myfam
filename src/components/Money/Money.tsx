
import React from 'react';

interface MoneyProps {
  amount: number | string | null | undefined;
  currency?: string;
  colored?: boolean;
  decimalScale?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const formatMoney = (amount: number | string | null | undefined, decimalScale = 2) => {
  const num = Number(amount || 0);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimalScale,
    maximumFractionDigits: decimalScale,
  });
};

export default function Money({ 
    amount, 
    currency = '฿', 
    colored = true, 
    decimalScale = 2,
    className,
    style
}: MoneyProps) {
  const num = Number(amount || 0);
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formatted = absNum.toLocaleString('en-US', {
    minimumFractionDigits: decimalScale,
    maximumFractionDigits: decimalScale,
  });

  const finalStyle: React.CSSProperties = {
      ...(colored && isNegative ? { color: '#FF3B30' } : {}),
      ...style
  };

  return (
    <span className={className} style={finalStyle}>
      {isNegative ? '-' : ''}{currency}{formatted}
    </span>
  );
}
