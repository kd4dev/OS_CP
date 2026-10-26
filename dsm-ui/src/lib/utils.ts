import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(addr: number | string): string {
  if (typeof addr === 'string') {
    if (addr.startsWith('0x')) return addr.toUpperCase();
    return `0x${parseInt(addr, 10).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return `0x${addr.toString(16).toUpperCase().padStart(4, '0')}`;
}
