import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('light');
  private remembered = false;

  constructor() {
    const saved = localStorage.getItem('ulric-theme');
    if (saved === 'light' || saved === 'dark') {
      this.remembered = true;
      this.apply(saved);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.apply(prefersDark ? 'dark' : 'light');
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (!this.remembered) {
        this.apply(event.matches ? 'dark' : 'light');
      }
    });
  }

  toggle(): void {
    this.remembered = true;
    const next: ThemeMode = this.mode() === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ulric-theme', next);
    this.apply(next);
  }

  private apply(mode: ThemeMode): void {
    this.mode.set(mode);
    document.documentElement.dataset['theme'] = mode;
    document.documentElement.style.colorScheme = mode;
  }
}
