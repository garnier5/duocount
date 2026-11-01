import type { IconName } from '../ui/icons';

export interface SuggestedCategory {
  key: string;
  name: string;
  icon: IconName;
  color: string;
  on: boolean;
}

export const SUGGESTED_CATEGORIES: SuggestedCategory[] = [
  { key: 'groceries', name: 'Groceries', icon: 'cart', color: '#2E9457', on: true },
  { key: 'rent', name: 'Rent', icon: 'home', color: '#5856D6', on: true },
  { key: 'energy', name: 'Energy', icon: 'bolt', color: '#B87A00', on: true },
  { key: 'internet', name: 'Internet / Phone', icon: 'wifi', color: '#2F7FD0', on: true },
  { key: 'insurance', name: 'Insurance', icon: 'shield', color: '#6E7380', on: true },
  { key: 'transport', name: 'Transport', icon: 'car', color: '#D9622B', on: true },
  { key: 'leisure', name: 'Leisure', icon: 'star', color: '#CF4A86', on: true },
  { key: 'kids', name: 'Kids', icon: 'kid', color: '#8E5BD0', on: true },
  { key: 'health', name: 'Health', icon: 'heart', color: '#D63F3F', on: true },
  { key: 'subscriptions', name: 'Subscriptions', icon: 'refresh', color: '#0E7C9E', on: false },
  { key: 'clothing', name: 'Clothing', icon: 'shirt', color: '#9A6230', on: false },
  { key: 'pets', name: 'Pets', icon: 'paw', color: '#6F7F22', on: true }
];

export const CATEGORY_COLORS: [string, string][] = [
  ['#2E9457', 'Green'],
  ['#5856D6', 'Indigo'],
  ['#B87A00', 'Amber'],
  ['#2F7FD0', 'Blue'],
  ['#6E7380', 'Slate'],
  ['#D9622B', 'Orange'],
  ['#CF4A86', 'Pink'],
  ['#8E5BD0', 'Purple'],
  ['#D63F3F', 'Red'],
  ['#0E7C9E', 'Teal blue'],
  ['#9A6230', 'Brown'],
  ['#6F7F22', 'Olive']
];

export const MEMBER_COLORS: [string, string][] = [
  ['#B4459A', 'Magenta'],
  ['#3E6FD8', 'Blue'],
  ['#2E9457', 'Green'],
  ['#D9622B', 'Orange'],
  ['#8E5BD0', 'Purple'],
  ['#0B7A75', 'Teal']
];

export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'US dollar ($)' },
  { code: 'GBP', label: 'Pound sterling (£)' },
  { code: 'CHF', label: 'Swiss franc (CHF)' },
  { code: 'CAD', label: 'Canadian dollar (CA$)' }
];

/** Neutral color for things that are not tied to a category. */
export const NEUTRAL = '#6E7380';
