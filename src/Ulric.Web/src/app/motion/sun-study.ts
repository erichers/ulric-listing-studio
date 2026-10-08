import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, signal, viewChild } from '@angular/core';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'app-sun-study',
  templateUrl: './sun-study.html',
})
export class SunStudy {
  readonly squareFeet = input(1600);
  readonly live = signal(false);
  readonly reduced =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('view');
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private applyTheme: ((mode: string) => void) | null = null;

  constructor() {
    effect(() => {
      const mode = this.theme.mode();
      this.applyTheme?.(mode);
    });

    if (this.reduced) {
      return;
    }

    afterNextRender(() => {
      const canvas = this.canvas()?.nativeElement;
      if (!canvas || this.live()) {
        return;
      }
      void this.mount(canvas).catch(() => this.live.set(false));
    });
  }

  private async mount(canvas: HTMLCanvasElement): Promise<void> {
    const THREE = await import('three');
    if (!canvas.isConnected) {
      return;
    }

    const area = Math.max(700, this.squareFeet() || 1600);
    const stories = area > 2200 ? 2 : 1;
    const span = Math.sqrt(area / stories) * 0.055;
    const width = Math.min(4.2, Math.max(2.2, span));
    const depth = width * 0.72;
    const wallH = stories === 2 ? 2.15 : 1.35;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(7.2, 4.4, 7.6);

    const hemi = new THREE.HemisphereLight('#f4efe6', '#c4b8a8', 0.55);
    const sun = new THREE.DirectionalLight('#fff6ea', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 24;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(hemi, sun);

    const groundMat = new THREE.MeshStandardMaterial({ color: '#e4dcd0', roughness: 1 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.86 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#8d4b34', roughness: 0.72 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), wallMat);
    walls.position.y = wallH / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.62, 0.95, 4), roofMat);
    roof.position.y = wallH + 0.42;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    scene.add(ground, walls, roof);
    camera.lookAt(0, wallH * 0.45, 0);

    const paint = (mode: string) => {
      const dark = mode === 'dark';
      renderer.setClearColor(dark ? '#1a1917' : '#faf9f5', 1);
      groundMat.color.set(dark ? '#2a2723' : '#e4dcd0');
      wallMat.color.set(dark ? '#3c362f' : '#f4efe6');
      roofMat.color.set(dark ? '#c48468' : '#8d4b34');
      hemi.color.set(dark ? '#3a342c' : '#f4efe6');
      hemi.groundColor.set(dark ? '#1a1917' : '#c4b8a8');
      sun.color.set(dark ? '#f0d7c4' : '#fff6ea');
    };
    this.applyTheme = paint;
    paint(document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light');

    const resize = () => {
      const w = canvas.clientWidth || 640;
      const h = canvas.clientHeight || 320;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const observed = new ResizeObserver(resize);
    observed.observe(canvas);

    let onscreen = true;
    const io = new IntersectionObserver(
      (entries) => {
        onscreen = entries.some((entry) => entry.isIntersecting);
        poke();
      },
      { threshold: 0.15 },
    );
    io.observe(canvas);

    let raf = 0;
    let running = false;
    const loop = (now: number) => {
      if (!running) {
        return;
      }
      raf = requestAnimationFrame(loop);
      const arc = ((now / 1000) * 0.28) % Math.PI;
      const angle = 0.25 + arc * 0.85;
      sun.position.set(Math.cos(angle) * 8, 1.4 + Math.sin(angle) * 6.2, 2.4);
      renderer.render(scene, camera);
    };
    const poke = () => {
      const go = onscreen && document.visibilityState !== 'hidden';
      if (go && !running) {
        running = true;
        raf = requestAnimationFrame(loop);
      } else if (!go && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener('visibilitychange', poke);
    poke();
    renderer.render(scene, camera);
    this.live.set(true);

    this.destroyRef.onDestroy(() => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', poke);
      io.disconnect();
      observed.disconnect();
      this.applyTheme = null;
      renderer.dispose();
      ground.geometry.dispose();
      walls.geometry.dispose();
      roof.geometry.dispose();
      groundMat.dispose();
      wallMat.dispose();
      roofMat.dispose();
    });
  }
}
