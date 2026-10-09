// Types for study.js (plain ES module so the three.js scene code stays framework-free).
export type SeasonKey = 'summer' | 'autumn' | 'winter';
export interface Season { label: string; doy: number; tz: number }
export interface DayWindow { rise: number; set: number; noon: number; peak: number }
export interface SunState {
  season: SeasonKey;
  hour: number;
  hourT: number;
  lo: number;
  hi: number;
  elevation: number;
  azimuth: number;
  porchSun: boolean;
  playing: boolean;
  win: DayWindow;
}
export type ViewMode = 'solid' | 'xray' | 'cutaway' | 'wire';
export interface ViewState { mode: ViewMode; walking: boolean; interactive: boolean; locked: boolean }
export interface DaylightOptions {
  model?: 'bungalow' | 'massing';
  squareFeet?: number;
  season?: SeasonKey;
  hour?: number;
  theme?: 'light' | 'dark';
  reduced?: boolean;
  still?: boolean;
  loop?: boolean;
  onState?: (state: SunState) => void;
  onView?: (view: ViewState) => void;
  /** Element the room labels are drawn into (x-ray and cutaway). */
  labels?: HTMLElement;
  /** 3D lifecycle for data-3d: wire -> (morph) -> settled; 'loading' when reduced motion skips the morph. */
  onPhase?: (phase: string) => void;
  /** WebGL context lost: show the fallback still. */
  onLost?: () => void;
}
export interface DaylightController {
  stats(): { calls: number; tris: number; meshes: number; textures: number; furniture: number; quality: number; dpr: number; ao: boolean; lights: number; env: boolean };
  /** Resolves once the requested CC0 assets are applied; pass true to also load the interior. */
  ready(interior?: boolean): Promise<void>;
  setQuality(level: number, lock?: boolean): void;
  readonly phase: string;
  memory(): { texturesMB: number; geometryMB: number; totalMB: number; maxTexture: number; count: number; shadowMap: number; phone: boolean };
  collide(): Promise<unknown>;
  interpen(): Promise<unknown>;
  perfRun(o?: { walkMs?: number; orbitMs?: number; adaptive?: boolean }): Promise<Record<string, unknown>>;
  walkPos(): { x: number; z: number; y: number; on: boolean };
  bench(frames?: number): { frames: number; msPerFrame: number; fps: number; quality: number; dpr: number; ao: boolean; css: number[]; px: number[]; tris: number; renderer: string };
  setHour(hour: number): void;
  setSeason(season: SeasonKey): void;
  play(): void;
  pause(): void;
  setTheme(mode: string): void;
  setMode(mode: ViewMode): void;
  setInteractive(on: boolean): void;
  setWalk(on: boolean, room?: string): void;
  goTo(room: string): void;
  setMove(x: number, y: number): void;
  setPose(pose: { walk?: number[]; orbit?: number[] }): void;
  resetView(): void;
  resize(): void;
  rooms(): { key: string; label: string }[];
  readonly view: ViewState;
  renderNow(): void;
  dispose(): void;
}
export const SITE: { lat: number; lon: number; front: number };
export const SEASONS: Record<SeasonKey, Season>;
export function sunAt(doy: number, hours: number, tz: number, lat?: number, lon?: number): { elevation: number; azimuth: number };
export function dayWindow(season: SeasonKey): DayWindow;
export function compass(azimuth: number): string;
export function clock(hours: number): string;
export function mountDaylight(canvas: HTMLCanvasElement, opts?: DaylightOptions): Promise<DaylightController>;
