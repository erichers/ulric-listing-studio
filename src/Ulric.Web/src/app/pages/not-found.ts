import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <section class="wrap section">
      <p class="eyebrow">Missing page</p>
      <h1>That page is not in the studio.</h1>
      <p><a routerLink="/">Back to Ulric studio</a></p>
    </section>
  `,
})
export class NotFoundPage implements OnInit {
  private readonly title = inject(Title);

  ngOnInit(): void {
    this.title.setTitle('Not found | Ulric studio');
  }
}
