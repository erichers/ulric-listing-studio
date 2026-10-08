import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Dashboard,
  Lead,
  Listing,
  ListingSummary,
  ListingWrite,
  MortgageResult,
  Showing,
  Slot,
} from './models';

export function appUrl(path: string): string {
  const relative = path.replace(/^\/+/, '');
  if (typeof document === 'undefined') {
    return relative;
  }
  return new URL(relative, document.baseURI).href;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  listings(): Promise<ListingSummary[]> {
    return firstValueFrom(this.http.get<ListingSummary[]>(appUrl('api/listings')));
  }

  listing(id: string): Promise<Listing> {
    return firstValueFrom(this.http.get<Listing>(appUrl(`api/listings/${id}`)));
  }

  createListing(body: ListingWrite): Promise<Listing> {
    return firstValueFrom(this.http.post<Listing>(appUrl('api/listings'), body));
  }

  updateListing(id: string, body: ListingWrite): Promise<Listing> {
    return firstValueFrom(this.http.put<Listing>(appUrl(`api/listings/${id}`), body));
  }

  deleteListing(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(appUrl(`api/listings/${id}`)));
  }

  publicListing(slug: string): Promise<Listing> {
    return firstValueFrom(this.http.get<Listing>(appUrl(`api/public/listings/${slug}`)));
  }

  recordView(slug: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(appUrl(`api/public/listings/${slug}/views`), {}));
  }

  slots(slug: string): Promise<Slot[]> {
    return firstValueFrom(this.http.get<Slot[]>(appUrl(`api/public/listings/${slug}/slots`)));
  }

  createLead(
    slug: string,
    body: { name: string; email: string; phone: string; message: string; preApproved: boolean },
  ): Promise<Lead> {
    return firstValueFrom(this.http.post<Lead>(appUrl(`api/public/listings/${slug}/leads`), body));
  }

  bookShowing(
    slug: string,
    body: { name: string; email: string; phone: string; startsAt: string; endsAt: string },
  ): Promise<Showing> {
    return firstValueFrom(this.http.post<Showing>(appUrl(`api/public/listings/${slug}/showings`), body));
  }

  dashboard(): Promise<Dashboard> {
    return firstValueFrom(this.http.get<Dashboard>(appUrl('api/dashboard')));
  }

  updateLead(id: string, status: string): Promise<Lead> {
    return firstValueFrom(this.http.patch<Lead>(appUrl(`api/leads/${id}`), { status }));
  }

  updateShowing(id: string, status: string): Promise<Showing> {
    return firstValueFrom(this.http.patch<Showing>(appUrl(`api/showings/${id}`), { status }));
  }

  mortgage(body: {
    price: number;
    downPayment: number;
    annualInterestRatePercent: number;
    termYears: number;
    annualPropertyTax: number;
    annualInsurance: number;
    monthlyHoa: number;
  }): Promise<MortgageResult> {
    return firstValueFrom(this.http.post<MortgageResult>(appUrl('api/mortgage'), body));
  }

  upload(file: File): Promise<{ url: string }> {
    const data = new FormData();
    data.append('file', file);
    return firstValueFrom(this.http.post<{ url: string }>(appUrl('api/uploads'), data));
  }

  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (body && typeof body === 'object' && 'detail' in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim()) {
          return detail;
        }
      }
    }
    return 'The studio could not complete that request.';
  }
}
