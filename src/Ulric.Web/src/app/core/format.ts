export function money(value: number | null | undefined, cents = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents ? 2 : 0,
    minimumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

export function fact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0';
  }
  return Number.isInteger(value) ? String(value) : String(value);
}

export function sqft(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

export function when(value: string): string {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function clock(value: string): string {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function dayLabel(value: string): string {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
}

export function stamp(value: string): string {
  return value ? value.slice(0, 16) : '';
}

export function place(street: string, city: string, state: string): string {
  return [street, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
}
