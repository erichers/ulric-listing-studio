import { Component, ElementRef, effect, inject, input, signal } from '@angular/core';
import { money } from '../core/format';

@Component({
  selector: 'app-count',
  template: `
    <span class="count">
      <span class="count-sizer">{{ final() }}</span>
      <span class="count-value">{{ label() }}</span>
    </span>
  `,
})
export class CountUp {
  readonly value = input(0);
  readonly cents = input(false);
  readonly label = signal('0');

  private readonly host = inject(ElementRef<HTMLElement>);
  private displayed = 0;
  private frame = 0;

  readonly final = () => this.format(this.value());

  constructor() {
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    effect((onCleanup) => {
      const target = this.value();
      if (reduced()) {
        this.displayed = target;
        this.label.set(this.format(target));
        return;
      }
      const el = this.host.nativeElement;
      let started = false;
      const io = new IntersectionObserver(
        (entries) => {
          if (started || !entries.some((entry) => entry.isIntersecting)) {
            return;
          }
          started = true;
          io.disconnect();
          const from = this.displayed;
          const began = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - began) / 520);
            const eased = 1 - (1 - t) ** 3;
            this.displayed = from + (target - from) * eased;
            this.label.set(this.format(this.displayed));
            if (t < 1) {
              this.frame = requestAnimationFrame(tick);
            }
          };
          this.frame = requestAnimationFrame(tick);
        },
        { threshold: 0.35 },
      );
      io.observe(el);
      onCleanup(() => {
        io.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });
  }

  private format(value: number): string {
    if (this.cents()) {
      return money(value, true);
    }
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
  }
}
