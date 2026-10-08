export type ThemeName = 'alder' | 'hearth' | 'linen';
export type ListingStatus = 'draft' | 'published';
export type LeadStatus = 'new' | 'contacted' | 'showing' | 'offer';

export interface Photo {
  id: string;
  url: string;
  caption: string;
  creditName: string;
  creditUrl: string;
  sortOrder: number;
}

export interface Visit {
  id: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

export interface ShowingWindow {
  id: string;
  startsAt: string;
  endsAt: string;
  slotMinutes: number;
}

export interface Listing {
  id: string;
  slug: string;
  status: ListingStatus;
  theme: ThemeName;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  price: number;
  beds: number;
  baths: number;
  squareFeet: number;
  lotAcres: number;
  yearBuilt: number;
  headline: string;
  description: string;
  neighborhood: string;
  features: string[];
  agentName: string;
  agentEmail: string;
  agentPhone: string;
  agentBrokerage: string;
  agentBio: string;
  agentHeadshotUrl: string;
  agentHeadshotCredit: string | null;
  agentHeadshotCreditUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  viewCount: number;
  photos: Photo[];
  openHouses: Visit[];
  showingWindows: ShowingWindow[];
  createdAt: string;
  updatedAt: string;
}

export interface ListingWrite {
  status: ListingStatus;
  theme: ThemeName;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  price: number;
  beds: number;
  baths: number;
  squareFeet: number;
  lotAcres: number;
  yearBuilt: number;
  headline: string;
  description: string;
  neighborhood: string;
  features: string[];
  agentName: string;
  agentEmail: string;
  agentPhone: string;
  agentBrokerage: string;
  agentBio: string;
  agentHeadshotUrl: string;
  agentHeadshotCredit: string | null;
  agentHeadshotCreditUrl: string | null;
  photos: Array<Pick<Photo, 'url' | 'caption' | 'creditName' | 'creditUrl'>>;
  openHouses: Array<Pick<Visit, 'startsAt' | 'endsAt' | 'notes'>>;
  showingWindows: Array<Pick<ShowingWindow, 'startsAt' | 'endsAt' | 'slotMinutes'>>;
}

export interface ListingSummary {
  id: string;
  slug: string;
  status: ListingStatus;
  theme: ThemeName;
  street: string;
  city: string;
  state: string;
  price: number;
  headline: string;
  photoUrl: string | null;
  viewCount: number;
  leadCount: number;
  beds: number;
  baths: number;
  squareFeet: number;
}

export interface Lead {
  id: string;
  listingId: string;
  listingStreet: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  preApproved: boolean;
  status: LeadStatus;
  createdAt: string;
}

export interface Showing {
  id: string;
  listingId: string;
  listingStreet: string;
  startsAt: string;
  endsAt: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  status: 'booked' | 'cancelled';
  icsUrl: string;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface Dashboard {
  listingCount: number;
  publishedCount: number;
  viewCount: number;
  leadCount: number;
  newLeadCount: number;
  upcomingShowings: number;
  leadsByDay: DayCount[];
  listings: ListingSummary[];
  leads: Lead[];
  showings: Showing[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

export interface MortgageResult {
  loanAmount: number;
  monthlyPrincipalAndInterest: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  totalMonthly: number;
}

export function emptyListing(): Listing {
  return {
    id: '',
    slug: '',
    status: 'draft',
    theme: 'alder',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
    price: 0,
    beds: 0,
    baths: 0,
    squareFeet: 0,
    lotAcres: 0,
    yearBuilt: 0,
    headline: '',
    description: '',
    neighborhood: '',
    features: [],
    agentName: '',
    agentEmail: '',
    agentPhone: '',
    agentBrokerage: '',
    agentBio: '',
    agentHeadshotUrl: '',
    agentHeadshotCredit: null,
    agentHeadshotCreditUrl: null,
    latitude: null,
    longitude: null,
    viewCount: 0,
    photos: [],
    openHouses: [],
    showingWindows: [],
    createdAt: '',
    updatedAt: '',
  };
}

export function toWrite(listing: Listing, status: ListingStatus): ListingWrite {
  return {
    status,
    theme: listing.theme,
    street: listing.street,
    city: listing.city,
    state: listing.state,
    postalCode: listing.postalCode,
    country: listing.country,
    price: Number(listing.price) || 0,
    beds: Number(listing.beds) || 0,
    baths: Number(listing.baths) || 0,
    squareFeet: Number(listing.squareFeet) || 0,
    lotAcres: Number(listing.lotAcres) || 0,
    yearBuilt: Number(listing.yearBuilt) || 0,
    headline: listing.headline,
    description: listing.description,
    neighborhood: listing.neighborhood,
    features: listing.features,
    agentName: listing.agentName,
    agentEmail: listing.agentEmail,
    agentPhone: listing.agentPhone,
    agentBrokerage: listing.agentBrokerage,
    agentBio: listing.agentBio,
    agentHeadshotUrl: listing.agentHeadshotUrl,
    agentHeadshotCredit: listing.agentHeadshotCredit,
    agentHeadshotCreditUrl: listing.agentHeadshotCreditUrl,
    photos: listing.photos
      .filter((photo) => photo.url.trim())
      .map((photo) => ({
        url: photo.url.trim(),
        caption: photo.caption,
        creditName: photo.creditName,
        creditUrl: photo.creditUrl,
      })),
    openHouses: listing.openHouses.filter((visit) => visit.startsAt && visit.endsAt),
    showingWindows: listing.showingWindows.filter((window) => window.startsAt && window.endsAt),
  };
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
