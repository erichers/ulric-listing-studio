import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ApiService } from '../core/api.service';
import { fact, money, sqft } from '../core/format';
import { ListingSummary } from '../core/models';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
})
export class HomePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly title = inject(Title);
  readonly listings = signal<ListingSummary[] | null>(null);
  readonly error = signal<string | null>(null);
  readonly money = money;
  readonly fact = fact;
  readonly sqft = sqft;

  ngOnInit(): void {
    this.title.setTitle('Ulric studio');
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.listings.set(await this.api.listings());
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
      this.listings.set([]);
    }
  }
}
