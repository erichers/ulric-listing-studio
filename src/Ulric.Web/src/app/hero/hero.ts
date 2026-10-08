import { Component, input } from '@angular/core';
import { fact, money, sqft } from '../core/format';
import { Listing } from '../core/models';

@Component({
  selector: 'app-hero',
  templateUrl: './hero.html',
})
export class Hero {
  readonly listing = input.required<Listing>();
  readonly compact = input(false);
  readonly money = money;
  readonly fact = fact;
  readonly sqft = sqft;

  cover() {
    return this.listing().photos[0] ?? null;
  }
}
