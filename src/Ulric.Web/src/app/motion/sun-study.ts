import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ThemeService } from '../core/theme.service';
import type { DaylightController, SeasonKey, SunState, ViewMode, ViewState } from './daylight/study.js';

type DaylightModule = typeof import('./daylight/study.js');

interface Dial {
  path: string;
  lot: string;
  sun: { x: number; y: number } | null;
}

const MODES: { key: ViewMode; label: string; title: string }[] = [
  { key: 'solid', label: 'Solid', title: 'Solid model' },
  { key: 'xray', label: 'X-ray', title: 'See-through walls and roof' },
  { key: 'cutaway', label: 'Cutaway', title: 'Roof and outside walls removed' },
  { key: 'wire', label: 'Wire', title: 'Wireframe' },
];

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const SEASONS: { key: SeasonKey; label: string }[] = [
  { key: 'summer', label: 'Jun 21' },
  { key: 'autumn', label: 'Sep 22' },
  { key: 'winter', label: 'Dec 21' },
];

/** Polar sun-path projection: centre = overhead, ring = horizon. North is up. */
function polar(azimuth: number, elevation: number, radius = 40): { x: number; y: number } {
  const d = (Math.max(0, 90 - elevation) / 90) * radius;
  const a = (azimuth * Math.PI) / 180;
  return { x: Math.sin(a) * d, y: -Math.cos(a) * d };
}

/** CC0 assets used by the 3D model (textures, furniture, sky). Generated from the asset pipeline's credits list. */
const MODEL_SOURCES: ReadonlyArray<{ name: string; by: string; url: string; lic: string; src: string }> = [
  {
    "name": "Wood Floor",
    "by": "Dimitrios Savva",
    "url": "https://polyhaven.com/a/wood_floor",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Painted Plaster Wall",
    "by": "Amal Kumar",
    "url": "https://polyhaven.com/a/painted_plaster_wall",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Poly Wool Herringbone",
    "by": "colormass, Rico Cilliers",
    "url": "https://polyhaven.com/a/poly_wool_herringbone",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Cotton Jersey",
    "by": "colormass, Rico Cilliers",
    "url": "https://polyhaven.com/a/cotton_jersey",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Rough Linen",
    "by": "colormass, Rico Cilliers",
    "url": "https://polyhaven.com/a/rough_linen",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Brown Leather",
    "by": "Rob Tuytel",
    "url": "https://polyhaven.com/a/brown_leather",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Grey Roof 01",
    "by": "Rob Tuytel",
    "url": "https://polyhaven.com/a/grey_roof_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Weathered Plank Siding",
    "by": "Dimitrios Savva",
    "url": "https://polyhaven.com/a/weathered_plank_siding",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Red Brick 03",
    "by": "Rob Tuytel",
    "url": "https://polyhaven.com/a/red_brick_03",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Concrete Floor 02",
    "by": "Rob Tuytel",
    "url": "https://polyhaven.com/a/concrete_floor_02",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Leafy Grass",
    "by": "Charlotte Baglioni",
    "url": "https://polyhaven.com/a/leafy_grass",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Brick Pavement 02",
    "by": "Charlotte Baglioni",
    "url": "https://polyhaven.com/a/brick_pavement_02",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Black Walnut Veneer 01",
    "by": "Jenelle van Heerden",
    "url": "https://polyhaven.com/a/black_walnut_veneer_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Oak Veneer 01",
    "by": "Jenelle van Heerden",
    "url": "https://polyhaven.com/a/oak_veneer_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Asphalt 02",
    "by": "Rob Tuytel",
    "url": "https://polyhaven.com/a/asphalt_02",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Wood Floor Deck",
    "by": "Dimitrios Savva",
    "url": "https://polyhaven.com/a/wood_floor_deck",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Tiles 038",
    "by": "Lennart Demes (ambientCG)",
    "url": "https://ambientcg.com/view?id=Tiles038",
    "lic": "CC0",
    "src": "ambientCG"
  },
  {
    "name": "Kloofendal 48d Partly Cloudy (Pure Sky)",
    "by": "Greg Zaal, Jarod Guest",
    "url": "https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Ottoman 01",
    "by": "Caspian Fortune",
    "url": "https://polyhaven.com/a/Ottoman_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Modern Arm Chair 01",
    "by": "Vibrant Nordic",
    "url": "https://polyhaven.com/a/modern_arm_chair_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Wooden Table 01",
    "by": "Ethan Place",
    "url": "https://polyhaven.com/a/WoodenTable_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Throw Pillows 01",
    "by": "Serhii Khromov",
    "url": "https://polyhaven.com/a/throw_pillows_01",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Potted Plant 04",
    "by": "James Ray Cock",
    "url": "https://polyhaven.com/a/potted_plant_04",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Potted Plant 02",
    "by": "Rico Cilliers",
    "url": "https://polyhaven.com/a/potted_plant_02",
    "lic": "CC0",
    "src": "Poly Haven"
  },
  {
    "name": "Classic Nightstand 01",
    "by": "Kirill Sannikov",
    "url": "https://polyhaven.com/a/ClassicNightstand_01",
    "lic": "CC0",
    "src": "Poly Haven"
  }
];

@Component({
  selector: 'app-sun-study',
  templateUrl: './sun-study.html',
})
export class SunStudy {
  protected readonly sources = MODEL_SOURCES;
  /** Detailed model of the demo house; other listings get a massing sized from square feet. */
  readonly detailed = input(false);
  readonly squareFeet = input(1600);

  readonly live = signal(false);
  /** data-3d on the figure: wire -> settled (MOTION.md 3.8). */
  readonly phase = signal('');
  /** Reduced motion: the R6 still stays up and no canvas mounts until "Open 3D view" (MOTION 3.8, 4). */
  readonly held = signal(false);
  /** WebGL lost or unavailable: the fallback still (rendered from this scene) stays up. */
  readonly lost = signal(false);
  readonly stillTheme = computed(() => (this.theme.mode() === 'dark' ? 'dark' : 'light'));
  readonly state = signal<SunState | null>(null);
  readonly dial = signal<Dial | null>(null);
  readonly seasons = SEASONS;
  readonly modes = MODES;
  readonly reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  // explore controls
  readonly mode = signal<ViewMode>('solid');
  readonly walking = signal(false);
  readonly interactive = signal(false);
  readonly locked = signal(false);
  readonly full = signal(false);
  readonly rooms = signal<{ key: string; label: string }[]>([]);
  readonly room = signal('living');
  readonly joy = signal<{ x: number; y: number } | null>(null);
  private pseudo = false;

  readonly position = computed(() => {
    const s = this.state();
    return s ? Math.round(((s.hourT - s.lo) / Math.max(0.01, s.hi - s.lo)) * 1000) : 500;
  });
  readonly timeLabel = computed(() => {
    const s = this.state();
    return s && this.mod ? this.mod.clock(s.hour) : '';
  });
  readonly ticks = computed(() => {
    const s = this.state();
    const m = this.mod;
    return s && m ? { lo: m.clock(s.lo), noon: m.clock(s.win.noon), hi: m.clock(s.hi) } : null;
  });
  readonly seasonLabel = computed(() => SEASONS.find((x) => x.key === this.state()?.season)?.label ?? '');
  readonly reading = computed(() => {
    const s = this.state();
    if (!s || !this.mod) {
      return null;
    }
    if (s.elevation <= 0) {
      return { text: 'The sun is down.', warm: '' };
    }
    const front = this.detailed() ? 'front entry' : 'front of the house';
    return {
      text: `Sun ${Math.round(s.elevation)}° up, from the ${this.mod.compass(s.azimuth)}.`,
      warm: s.porchSun ? `The ${front} is in sun.` : '',
      shade: s.porchSun ? '' : `The ${front} is in shade.`,
    };
  });

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('view');
  private readonly figure = viewChild<ElementRef<HTMLElement>>('fig');
  private readonly labels = viewChild<ElementRef<HTMLElement>>('labels');
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private ctl: DaylightController | null = null;
  private mod: DaylightModule | null = null;
  private pathCache = new Map<SeasonKey, string>();
  private io?: IntersectionObserver;

  constructor() {
    effect(() => {
      const mode = this.theme.mode();
      this.ctl?.setTheme(mode);
    });

    afterNextRender(() => {
      if (this.reduced && this.detailed() && !/[?&]qa3d\b/.test(location.search)) {
        this.held.set(true);
        this.phase.set('still');
        return;
      }
      const canvas = this.canvas()?.nativeElement;
      if (!canvas) {
        return;
      }
      // Lazy: the three.js chunk only loads when the section comes near the viewport.
      this.io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.io?.disconnect();
            void this.mount(canvas).catch(() => { this.live.set(false); this.lost.set(true); });
          }
        },
        { rootMargin: '320px 0px' },
      );
      this.io.observe(canvas);
    });

    const doc = document as FsDoc;
    const onFs = () => {
      const el = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      const mine = !!el && el === this.figure()?.nativeElement;
      if (!this.pseudo && mine !== this.full()) this.setFull(mine);
    };
    const onDocDown = (e: PointerEvent) => {
      // clicking anywhere outside the viewer hands the mouse/wheel back to the page
      if (this.interactive() && !this.full() && !this.figure()?.nativeElement.contains(e.target as Node)) this.ctl?.setInteractive(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || this.locked()) return;
      if (this.full() && this.pseudo) this.exitFull();
      else if (this.interactive() && !this.full()) this.ctl?.setInteractive(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onEsc);

    this.destroyRef.onDestroy(() => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onEsc);
      document.documentElement.classList.remove('sun-lock');
      this.io?.disconnect();
      this.ctl?.dispose();
      this.ctl = null;
    });
  }

  /** Reduced motion: mount the live 3D on request (no intro morph; reduced still applies). */
  async open3d(): Promise<void> {
    if (!this.held()) return;
    this.held.set(false);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = this.canvas()?.nativeElement;
    if (canvas) await this.mount(canvas).catch(() => { this.live.set(false); this.lost.set(true); });
  }

  play(): void {
    if (this.state()?.playing) {
      this.ctl?.pause();
    } else {
      this.ctl?.play();
    }
  }

  scrub(event: Event): void {
    const s = this.state();
    if (!s) {
      return;
    }
    const value = Number((event.target as HTMLInputElement).value) / 1000;
    this.ctl?.setHour(s.lo + value * (s.hi - s.lo));
  }

  pick(season: SeasonKey): void {
    this.ctl?.setSeason(season);
  }

  setMode(mode: ViewMode): void {
    this.mode.set(mode);
    this.ctl?.setMode(mode);
  }

  /** Click on the inline canvas (mouse): take over drag + wheel until the user clicks away or presses Esc. */
  engage(): void {
    if (!this.live() || this.interactive() || this.coarse) return;
    this.ctl?.setInteractive(true);
  }

  async toggleWalk(): Promise<void> {
    if (this.held()) await this.open3d();
    if (this.walking()) {
      this.ctl?.setWalk(false);
      return;
    }
    if (this.coarse && !this.full()) await this.enterFull();
    this.ctl?.setInteractive(true);
    this.ctl?.setWalk(true, this.room());
  }

  goRoom(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.room.set(key);
    this.ctl?.goTo(key);
  }

  reset(): void {
    this.ctl?.resetView();
  }

  async toggleFull(): Promise<void> {
    if (this.held()) await this.open3d();
    if (this.full()) this.exitFull();
    else await this.enterFull();
  }

  private async enterFull(): Promise<void> {
    const el = this.figure()?.nativeElement as FsEl | undefined;
    if (!el) return;
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (req) {
      try {
        this.pseudo = false;
        await req.call(el);
        this.setFull(true);
        return;
      } catch {
        /* iPhone Safari has no element fullscreen: fall back to a fixed full-viewport layer */
      }
    }
    this.pseudo = true;
    this.setFull(true);
  }

  private exitFull(): void {
    const doc = document as FsDoc;
    if (!this.pseudo && (doc.fullscreenElement ?? doc.webkitFullscreenElement)) {
      void (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    }
    this.pseudo = false;
    this.setFull(false);
  }

  private setFull(on: boolean): void {
    this.full.set(on);
    document.documentElement.classList.toggle('sun-lock', on);
    // html.sun-lock hides the page behind the 3D layer (both native and fixed-layer full screen)
    this.ctl?.setInteractive(on);
    // the canvas changes size with the layout; re-measure once it has settled (exit is async)
    requestAnimationFrame(() => requestAnimationFrame(() => this.ctl?.resize()));
    setTimeout(() => this.ctl?.resize(), 400);
  }

  joyDown(event: PointerEvent): void {
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    this.joyMove(event);
  }

  joyMove(event: PointerEvent): void {
    if (event.type === 'pointermove' && !this.joy()) return;
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const rad = r.width / 2;
    let x = (event.clientX - r.left - rad) / rad, y = (event.clientY - r.top - rad) / rad;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.joy.set({ x, y });
    this.ctl?.setMove(x, -y);
  }

  joyUp(): void {
    this.joy.set(null);
    this.ctl?.setMove(0, 0);
  }

  private async mount(canvas: HTMLCanvasElement): Promise<void> {
    const mod = await import('./daylight/study.js');
    if (!canvas.isConnected) {
      return;
    }
    this.mod = mod;
    this.ctl = await mod.mountDaylight(canvas, {
      model: this.detailed() ? 'bungalow' : 'massing',
      squareFeet: this.squareFeet(),
      reduced: this.reduced,
      theme: this.theme.mode(),
      labels: this.labels()?.nativeElement,
      onPhase: (p: string) => {
        this.phase.set(p);
        if (p === 'settled') this.figure()?.nativeElement.dispatchEvent(new CustomEvent('model-settled', { bubbles: true }));
      },
      onLost: () => this.lost.set(true),
      onView: (v: ViewState) => {
        this.walking.set(v.walking);
        this.interactive.set(v.interactive);
        this.locked.set(v.locked);
      },
      onState: (s) => {
        this.state.set({ ...s });
        this.dial.set(this.drawDial(s));
      },
    });
    this.rooms.set(this.ctl.rooms());
    this.live.set(true);
    // QA hook for scripted captures (?qa3d in the URL); inert otherwise
    if (typeof location !== 'undefined' && /[?&]qa3d\b/.test(location.search)) {
      (window as unknown as { __daylight?: DaylightController }).__daylight = this.ctl;
    }
  }

  private drawDial(s: SunState): Dial {
    const m = this.mod!;
    let path = this.pathCache.get(s.season);
    if (!path) {
      const season = m.SEASONS[s.season];
      const pts: string[] = [];
      for (let h = s.win.rise; h <= s.win.set; h += 0.1) {
        const p = m.sunAt(season.doy, h, season.tz);
        const q = polar(p.azimuth, Math.max(0, p.elevation));
        pts.push(`${q.x.toFixed(1)} ${q.y.toFixed(1)}`);
      }
      path = 'M' + pts.join('L');
      this.pathCache.set(s.season, path);
    }
    // house footprint, front edge facing SITE.front
    const t = ((m.SITE.front - 180) * Math.PI) / 180;
    const lot = [[-7, 5], [7, 5], [7, -5], [-7, -5]]
      .map(([u, v]) => `${((u * Math.cos(t) - v * Math.sin(t)) * 0.62).toFixed(1)},${((u * Math.sin(t) + v * Math.cos(t)) * 0.62).toFixed(1)}`)
      .join(' ');
    return { path, lot, sun: s.elevation > 0 ? polar(s.azimuth, s.elevation) : null };
  }
}
