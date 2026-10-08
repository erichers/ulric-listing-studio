import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ApiService } from '../core/api.service';
import { fact, money, sqft, when } from '../core/format';
import { Dashboard, LeadStatus } from '../core/models';

interface CalendarCell {
  day: number;
  key: string;
  count: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
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

  readonly barMax = computed(() => Math.max(1, ...(this.data()?.leadsByDay.map((day) => day.count) ?? [1])));

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

  bar(count: number): number {
    if (count <= 0) {
      return 8;
    }
    return Math.max(18, Math.round((count / this.barMax()) * 100));
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
