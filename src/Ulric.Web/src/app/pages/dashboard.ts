import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ApiService, appUrl } from '../core/api.service';
import { fact, money, sqft, when } from '../core/format';
import { CountUp } from '../motion/count';
import { Dashboard, DayCount, LeadStatus } from '../core/models';

interface CalendarCell {
  day: number;
  key: string;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CountUp],
  templateUrl: './dashboard.html',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);

  readonly data = signal<Dashboard | null>(null);
  readonly error = signal<string | null>(null);
  readonly pendingDelete = signal<string | null>(null);
  readonly cursor = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly selectedDay = signal<string | null>(null);
  readonly money = money;
  readonly fact = fact;
  readonly sqft = sqft;
  readonly when = when;
  readonly statuses: LeadStatus[] = ['new', 'contacted', 'showing', 'offer'];
  readonly flyerHref = (id: string) => appUrl(`api/listings/${id}/flyer`);

  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.cursor()),
  );

  readonly cells = computed<CalendarCell[]>(() => {
    const cursor = this.cursor();
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1).getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const showings = (this.data()?.showings ?? []).filter((item) => item.status === 'booked');
    const cells: CalendarCell[] = [];
    for (let index = 0; index < first; index++) {
      cells.push({ day: 0, key: `pad-${index}`, count: 0 });
    }
    for (let day = 1; day <= count; day++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        key,
        count: showings.filter((item) => item.startsAt.slice(0, 10) === key).length,
      });
    }
    return cells;
  });

  readonly visibleShowings = computed(() => {
    const rows = (this.data()?.showings ?? []).filter((item) => item.status === 'booked');
    const day = this.selectedDay();
    const filtered = day ? rows.filter((item) => item.startsAt.slice(0, 10) === day) : rows;
    const now = Date.now();
    return filtered
      .filter((item) => (day ? true : new Date(item.endsAt).getTime() >= now))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  });

  readonly chartDrawn = signal(false);
  readonly tip = signal<DayCount | null>(null);
  readonly tipX = signal(0);
  readonly tipY = signal(0);
  private readonly leadChart = viewChild<ElementRef<HTMLElement>>('leadChart');
  readonly barMax = computed(() => Math.max(1, ...(this.data()?.leadsByDay.map((day) => day.count) ?? [1])));
  readonly leadChartLabel = computed(() => {
    const days = this.data()?.leadsByDay ?? [];
    const total = days.reduce((sum, day) => sum + day.count, 0);
    return `Leads by day for the last 14 days. ${total} in all.`;
  });

  constructor() {
    effect((onCleanup) => {
      const el = this.leadChart()?.nativeElement;
      if (!el) {
        return;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.chartDrawn.set(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.chartDrawn.set(true);
            io.disconnect();
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
      onCleanup(() => io.disconnect());
    });
  }

  ngOnInit(): void {
    this.title.setTitle('Dashboard | Ulric studio');
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.data.set(await this.api.dashboard());
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    }
  }

  leadBar(count: number): number {
    if (count <= 0) {
      return 0;
    }
    return Math.max(4, Math.round((count / this.barMax()) * 108));
  }

  showTip(day: DayCount, event: Event): void {
    const slot = event.currentTarget as HTMLElement;
    const plot = slot.parentElement;
    if (!plot) {
      return;
    }
    const slotBox = slot.getBoundingClientRect();
    const plotBox = plot.getBoundingClientRect();
    const half = 52;
    const x = Math.min(
      plotBox.width - half,
      Math.max(half, slotBox.left - plotBox.left + slotBox.width / 2),
    );
    this.tipX.set(x);
    this.tipY.set(plotBox.height - this.leadBar(day.count) - 8);
    this.tip.set(day);
  }

  hideTip(): void {
    this.tip.set(null);
  }

  shortDay(iso: string): string {
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) {
      return iso;
    }
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
  }

  shiftMonth(delta: number): void {
    const cursor = this.cursor();
    this.cursor.set(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    this.selectedDay.set(null);
  }

  async setLeadStatus(id: string, event: Event): Promise<void> {
    const status = (event.target as HTMLSelectElement).value;
    try {
      const updated = await this.api.updateLead(id, status);
      this.data.update((data) =>
        data ? { ...data, leads: data.leads.map((lead) => (lead.id === id ? updated : lead)) } : data,
      );
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    }
  }

  async cancelShowing(id: string): Promise<void> {
    try {
      const updated = await this.api.updateShowing(id, 'cancelled');
      this.data.update((data) =>
        data
          ? {
              ...data,
              showings: data.showings.map((showing) => (showing.id === id ? updated : showing)),
              upcomingShowings: Math.max(0, data.upcomingShowings - 1),
            }
          : data,
      );
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.api.deleteListing(id);
      this.pendingDelete.set(null);
      await this.load();
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    }
  }
}
