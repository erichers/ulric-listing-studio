import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Hero } from '../hero/hero';
import { ApiService } from '../core/api.service';
import { stamp } from '../core/format';
import { emptyListing, Listing, ThemeName, toWrite, uid } from '../core/models';

@Component({
  selector: 'app-builder',
  imports: [Hero, RouterLink],
  templateUrl: './builder.html',
})
export class BuilderPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps = ['Place', 'Facts', 'Story', 'Photos', 'Visits', 'Agent', 'Theme'] as const;
  readonly themes: Array<{ id: ThemeName; name: string; note: string }> = [
    { id: 'alder', name: 'Alder', note: 'Type over the photograph' },
    { id: 'hearth', name: 'Hearth', note: 'A split page, words then photo' },
    { id: 'linen', name: 'Linen', note: 'Title first, then a wide photo' },
  ];

  readonly draft = signal<Listing>(emptyListing());
  readonly step = signal(0);
  readonly showPreview = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly featureText = signal('');
  readonly photoUrl = signal('');
  readonly photoCaption = signal('');
  readonly photoCredit = signal('');
  readonly stamp = stamp;

  ngOnInit(): void {
    this.title.setTitle('Builder | Ulric studio');
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.load(params.get('id'));
    });
  }

  async load(id: string | null): Promise<void> {
    if (!id || this.draft().id === id) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.draft.set(await this.api.listing(id));
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  text(key: TextKey, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  number(key: NumberKey, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw === '' ? 0 : Number(raw);
    this.draft.update((draft) => ({ ...draft, [key]: Number.isFinite(value) ? value : 0 }));
  }

  setTheme(theme: ThemeName): void {
    this.draft.update((draft) => ({ ...draft, theme }));
  }

  addFeature(): void {
    const value = this.featureText().trim();
    if (!value) {
      return;
    }
    this.draft.update((draft) => ({ ...draft, features: [...draft.features, value] }));
    this.featureText.set('');
  }

  removeFeature(index: number): void {
    this.draft.update((draft) => ({ ...draft, features: draft.features.filter((_, item) => item !== index) }));
  }

  addPhoto(): void {
    const url = this.photoUrl().trim();
    if (!url) {
      return;
    }
    this.draft.update((draft) => ({
      ...draft,
      photos: [
        ...draft.photos,
        {
          id: uid(),
          url,
          caption: this.photoCaption().trim(),
          creditName: this.photoCredit().trim(),
          creditUrl: '',
          sortOrder: draft.photos.length,
        },
      ],
    }));
    this.photoUrl.set('');
    this.photoCaption.set('');
    this.photoCredit.set('');
  }

  async uploadPhoto(event: Event, headshot = false): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.uploading.set(true);
    this.error.set(null);
    try {
      const uploaded = await this.api.upload(file);
      if (headshot) {
        this.draft.update((draft) => ({ ...draft, agentHeadshotUrl: uploaded.url, agentHeadshotCredit: null }));
      } else {
        this.draft.update((draft) => ({
          ...draft,
          photos: [
            ...draft.photos,
            { id: uid(), url: uploaded.url, caption: '', creditName: '', creditUrl: '', sortOrder: draft.photos.length },
          ],
        }));
      }
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  patchPhoto(index: number, key: 'caption' | 'creditName' | 'creditUrl', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({
      ...draft,
      photos: draft.photos.map((photo, item) => (item === index ? { ...photo, [key]: value } : photo)),
    }));
  }

  movePhoto(index: number, direction: -1 | 1): void {
    this.draft.update((draft) => {
      const next = index + direction;
      if (next < 0 || next >= draft.photos.length) {
        return draft;
      }
      const photos = [...draft.photos];
      const [photo] = photos.splice(index, 1);
      photos.splice(next, 0, photo);
      return { ...draft, photos: photos.map((item, order) => ({ ...item, sortOrder: order })) };
    });
  }

  removePhoto(index: number): void {
    this.draft.update((draft) => ({ ...draft, photos: draft.photos.filter((_, item) => item !== index) }));
  }

  addVisit(): void {
    this.draft.update((draft) => ({
      ...draft,
      openHouses: [...draft.openHouses, { id: uid(), startsAt: '', endsAt: '', notes: '' }],
    }));
  }

  patchVisit(index: number, key: 'startsAt' | 'endsAt' | 'notes', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({
      ...draft,
      openHouses: draft.openHouses.map((visit, item) => (item === index ? { ...visit, [key]: value } : visit)),
    }));
  }

  removeVisit(index: number): void {
    this.draft.update((draft) => ({ ...draft, openHouses: draft.openHouses.filter((_, item) => item !== index) }));
  }

  addWindow(): void {
    this.draft.update((draft) => ({
      ...draft,
      showingWindows: [...draft.showingWindows, { id: uid(), startsAt: '', endsAt: '', slotMinutes: 30 }],
    }));
  }

  patchWindow(index: number, key: 'startsAt' | 'endsAt' | 'slotMinutes', event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = key === 'slotMinutes' ? Number(raw) || 30 : raw;
    this.draft.update((draft) => ({
      ...draft,
      showingWindows: draft.showingWindows.map((window, item) => (item === index ? { ...window, [key]: value } : window)),
    }));
  }

  removeWindow(index: number): void {
    this.draft.update((draft) => ({
      ...draft,
      showingWindows: draft.showingWindows.filter((_, item) => item !== index),
    }));
  }

  async save(status: 'draft' | 'published'): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const body = toWrite(this.draft(), status);
      const id = this.draft().id;
      const saved = id ? await this.api.updateListing(id, body) : await this.api.createListing(body);
      this.draft.set(saved);
      this.notice.set(status === 'published' ? 'Published.' : 'Draft saved.');
      if (this.route.snapshot.paramMap.get('id') !== saved.id) {
        await this.router.navigate(['/builder', saved.id], { replaceUrl: true });
      }
    } catch (error) {
      this.error.set(this.api.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }
}

type TextKey =
  | 'street'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'headline'
  | 'description'
  | 'neighborhood'
  | 'agentName'
  | 'agentEmail'
  | 'agentPhone'
  | 'agentBrokerage'
  | 'agentBio'
  | 'agentHeadshotUrl';

type NumberKey = 'price' | 'beds' | 'baths' | 'squareFeet' | 'lotAcres' | 'yearBuilt';
