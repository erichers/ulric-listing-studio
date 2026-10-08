import { Component, input, signal } from '@angular/core';
import { fact, money, sqft } from '../core/format';
import { Listing } from '../core/models';

@Component({
  selector: 'app-hero',
  templateUrl: './hero.html',
  host: {
    '(window:scroll)': 'onScroll()',
  },
})
export class Hero {
  readonly listing = input.required<Listing>();
  readonly compact = input(false);
  readonly money = money;
  readonly fact = fact;
  readonly sqft = sqft;
  readonly shown = signal(false);
  readonly shift = signal(0);
  private readonly reduce =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  cover() {
    return this.listing().photos[0] ?? null;
  }

  onScroll(): void {
    if (this.compact() || this.reduce) {
      return;
    }
    const next = Math.max(-24, Math.min(72, window.scrollY * 0.16));
    if (next !== this.shift()) {
      this.shift.set(next);
    }
  }
}
