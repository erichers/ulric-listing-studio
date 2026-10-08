import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';
import { circleMarker, map as leafletMap, tileLayer, type Map as LeafletMap } from 'leaflet';
import { Hero } from '../hero/hero';
import { CountUp } from '../motion/count';
import { PaymentFlow } from '../motion/payment-flow';
import { SunStudy } from '../motion/sun-study';
import { ApiService } from '../core/api.service';
import { ThemeService } from '../core/theme.service';
import { clock, dayLabel, fact, money, sqft, when } from '../core/format';
import { Listing, MortgageResult, Showing, Slot } from '../core/models';

Chart.register(DoughnutController, ArcElement, Tooltip);

@Component({
  selector: 'app-microsite',
  imports: [Hero, RouterLink, CountUp, PaymentFlow, SunStudy],
  templateUrl: './microsite.html',
  host: {
    '(document:keydown)': 'onKey($event)',
  },
})
export class MicrositePage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listing = signal<Listing | null>(null);
  readonly slots = signal<Slot[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly lightbox = signal<number | null>(null);
  readonly lightboxFrame = signal(false);
  readonly selectedSlot = signal<Slot | null>(null);
  readonly result = signal<MortgageResult | null>(null);
  readonly calcError = signal<string | null>(null);
  readonly leadNotice = signal<string | null>(null);
  readonly leadError = signal<string | null>(null);
  readonly showNotice = signal<string | null>(null);
  readonly showError = signal<string | null>(null);
  readonly booked = signal<Showing | null>(null);
  readonly sendingLead = signal(false);
  readonly sendingShow = signal(false);

  readonly price = signal(0);
  readonly down = signal(0);
  readonly rate = signal(6.5);
  readonly term = signal(30);
  readonly tax = signal(0);
  readonly insurance = signal(1800);
  readonly hoa = signal(0);
  readonly leadName = signal('');
  readonly leadEmail = signal('');
  readonly leadPhone = signal('');
  readonly leadMessage = signal('');
  readonly preApproved = signal<boolean | null>(null);
  readonly showName = signal('');
  readonly showEmail = signal('');
  readonly showPhone = signal('');

  readonly money = money;
  readonly fact = fact;
  readonly sqft = sqft;
  readonly when = when;
  readonly clock = clock;
  readonly dayLabel = dayLabel;

  readonly groups = computed(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of this.slots()) {
      const key = slot.startsAt.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  });

  private readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chart');
  private readonly mapHost = viewChild<ElementRef<HTMLElement>>('map');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private chart?: Chart;
  private leaflet?: LeafletMap;
  private calcTimer = 0;
  private opener: HTMLElement | null = null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        void this.load(slug);
      }
    });

    effect(() => {
      const result = this.result();
      const mode = this.theme.mode();
      const canvas = this.chartCanvas()?.nativeElement;
      if (!result || !canvas) {
        return;
      }
      this.draw(canvas, result, mode);
    });

    effect(() => {
      const listing = this.listing();
      const host = this.mapHost()?.nativeElement;
      if (!listing || listing.latitude == null || listing.longitude == null || !host) {
        return;
      }
      this.drawMap(host, listing.latitude, listing.longitude, listing.street, listing.slug);
    });

    this.destroyRef.onDestroy(() => {
      window.clearTimeout(this.calcTimer);
      this.chart?.destroy();
      this.leaflet?.remove();
    });
  }

  async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.lightbox.set(null);
    try {
      const listing = await this.api.publicListing(slug);
      this.listing.set(listing);
      this.title.setTitle(`${listing.street}, ${listing.city} | Ulric studio`);
      const description = listing.headline || listing.description;
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: `${listing.street}, ${listing.city}` });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ property: 'og:type', content: 'website' });
      this.meta.updateTag({ property: 'og:url', content: window.location.href });
      if (listing.photos[0]) {
        this.meta.updateTag({ property: 'og:image', content: absoluteUrl(listing.photos[0].url) });
      }
      this.price.set(listing.price);
      this.down.set(Math.round(listing.price * 0.2));
      this.tax.set(Math.round(listing.price * 0.011));
      this.scheduleCalc();
      const seen = `ulric-view-${slug}`;
      if (!sessionStorage.getItem(seen)) {
        sessionStorage.setItem(seen, '1');
        void this.api.recordView(slug).catch(() => undefined);
      }
      this.slots.set(await this.api.slots(slug));
    } catch (error) {
      this.listing.set(null);
      this.error.set(this.api.errorMessage(error));
      this.title.setTitle('Listing not found | Ulric studio');
    } finally {
      this.loading.set(false);
    }
  }

  openLightbox(index: number, event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.lightbox.set(index);
    if (this.reducedMotion()) {
      this.lightboxFrame.set(true);
    } else {
      requestAnimationFrame(() => this.lightboxFrame.set(true));
    }
    queueMicrotask(() => this.closeButton()?.nativeElement.focus());
  }

  closeLightbox(): void {
    this.lightboxFrame.set(false);
    const finish = () => {
      this.lightbox.set(null);
      this.opener?.focus();
    };
    if (this.reducedMotion()) {
      finish();
      return;
    }
    window.setTimeout(finish, 220);
  }

  private reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  stepLightbox(delta: number): void {
    const listing = this.listing();
    const current = this.lightbox();
    if (!listing || current === null || listing.photos.length === 0) {
      return;
    }
    const next = (current + delta + listing.photos.length) % listing.photos.length;
    this.lightbox.set(next);
  }

  onKey(event: KeyboardEvent): void {
    if (this.lightbox() === null) {
      return;
    }
    if (event.key === 'Escape') {
      this.closeLightbox();
    } else if (event.key === 'ArrowRight') {
      this.stepLightbox(1);
    } else if (event.key === 'ArrowLeft') {
      this.stepLightbox(-1);
    }
  }

  number(target: 'price' | 'down' | 'rate' | 'term' | 'tax' | 'insurance' | 'hoa', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const next = Number.isFinite(value) ? value : 0;
    if (target === 'price') this.price.set(next);
    if (target === 'down') this.down.set(next);
    if (target === 'rate') this.rate.set(next);
    if (target === 'term') this.term.set(next);
    if (target === 'tax') this.tax.set(next);
    if (target === 'insurance') this.insurance.set(next);
    if (target === 'hoa') this.hoa.set(next);
    this.scheduleCalc();
  }

  scheduleCalc(): void {
    window.clearTimeout(this.calcTimer);
    this.calcTimer = window.setTimeout(() => void this.calculate(), 180);
  }

  async calculate(): Promise<void> {
    this.calcError.set(null);
    try {
      this.result.set(
        await this.api.mortgage({
          price: this.price(),
          downPayment: this.down(),
          annualInterestRatePercent: this.rate(),
          termYears: this.term(),
          annualPropertyTax: this.tax(),
          annualInsurance: this.insurance(),
          monthlyHoa: this.hoa(),
        }),
      );
    } catch (error) {
      this.result.set(null);
      this.calcError.set(this.api.errorMessage(error));
    }
  }

  async sendLead(event: Event): Promise<void> {
    event.preventDefault();
    const listing = this.listing();
    if (!listing) {
      return;
    }
    if (this.preApproved() === null) {
      this.leadError.set('Choose yes or no for pre-approval.');
      return;
    }
    this.sendingLead.set(true);
    this.leadError.set(null);
    this.leadNotice.set(null);
    try {
      await this.api.createLead(listing.slug, {
        name: this.leadName(),
        email: this.leadEmail(),
        phone: this.leadPhone(),
        message: this.leadMessage(),
        preApproved: this.preApproved() === true,
      });
      this.leadNotice.set('Message saved. The agent will see it in the studio.');
      this.leadName.set('');
      this.leadEmail.set('');
      this.leadPhone.set('');
      this.leadMessage.set('');
      this.preApproved.set(null);
    } catch (error) {
      this.leadError.set(this.api.errorMessage(error));
    } finally {
      this.sendingLead.set(false);
    }
  }

  async book(event: Event): Promise<void> {
    event.preventDefault();
    const listing = this.listing();
    const slot = this.selectedSlot();
    if (!listing || !slot) {
      this.showError.set('Pick an open time.');
      return;
    }
    this.sendingShow.set(true);
    this.showError.set(null);
    this.showNotice.set(null);
    try {
      const showing = await this.api.bookShowing(listing.slug, {
        name: this.showName(),
        email: this.showEmail(),
        phone: this.showPhone(),
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      this.booked.set(showing);
      this.showNotice.set('Booked. Download the calendar file if you want it on your phone.');
      this.slots.set(await this.api.slots(listing.slug));
      this.selectedSlot.set(null);
    } catch (error) {
      this.showError.set(this.api.errorMessage(error));
      this.slots.set(await this.api.slots(listing.slug).catch(() => this.slots()));
    } finally {
      this.sendingShow.set(false);
    }
  }

  private draw(canvas: HTMLCanvasElement, result: MortgageResult, mode: string): void {
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#d97757';
    const ink = styles.getPropertyValue('--ink').trim() || '#1f1e1d';
    const muted = styles.getPropertyValue('--muted').trim() || '#6f6a62';
    const line = styles.getPropertyValue('--line').trim() || '#e3ddd3';
    const parts = [
      { label: 'Principal and interest', value: result.monthlyPrincipalAndInterest, color: accent },
      { label: 'Property tax', value: result.monthlyTax, color: ink },
      { label: 'Insurance', value: result.monthlyInsurance, color: muted },
      { label: 'HOA', value: result.monthlyHoa, color: line },
    ].filter((part) => part.value > 0);
    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: parts.map((part) => part.label),
        datasets: [{ data: parts.map((part) => part.value), backgroundColor: parts.map((part) => part.color), borderWidth: 0 }],
      },
      options: {
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? false
          : { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.label}: ${money(Number(item.raw), true)}`,
            },
          },
        },
        cutout: '68%',
      },
    });
    void mode;
  }

  private mappedSlug = '';

  private drawMap(host: HTMLElement, latitude: number, longitude: number, street: string, slug: string): void {
    if (this.leaflet && (this.mappedSlug !== slug || this.leaflet.getContainer() !== host)) {
      this.leaflet.remove();
      this.leaflet = undefined;
    }
    this.mappedSlug = slug;
    if (!this.leaflet) {
      this.leaflet = leafletMap(host, { scrollWheelZoom: false }).setView([latitude, longitude], 14);
      tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(this.leaflet);
      circleMarker([latitude, longitude], {
        radius: 9,
        color: '#faf9f5',
        weight: 2,
        fillColor: '#d97757',
        fillOpacity: 1,
      })
        .addTo(this.leaflet)
        .bindPopup(street);
      window.setTimeout(() => this.leaflet?.invalidateSize(), 80);
      return;
    }
    this.leaflet.setView([latitude, longitude], 14);
  }
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href;
}
