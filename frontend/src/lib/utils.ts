import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a numeric value into standard Indian numbering format (e.g., ₹1,23,456).
 */
export function formatINR(val: number | string | undefined | null, showDecimals = false): string {
  if (val === undefined || val === null || val === '') return '₹0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(num);
}

/**
 * Formats large amounts into Indian numbering denominations (Lakh / Crore).
 */
export function formatLakhCrore(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '₹0';
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return '₹0';
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  }
  return formatINR(num);
}
