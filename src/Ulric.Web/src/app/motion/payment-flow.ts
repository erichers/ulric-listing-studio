import { Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';

@Component({
  selector: 'app-payment-flow',
  templateUrl: './payment-flow.html',
})
export class PaymentFlow {
  readonly drawn = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.drawn.set(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.drawn.set(true);
            io.disconnect();
          }
        },
        { threshold: 0.45 },
      );
      io.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => io.disconnect());
    });
  }
}
