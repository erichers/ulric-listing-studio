declare module 'three' {
  export class Scene {
    add(...objects: object[]): void;
  }
  export class WebGLRenderer {
    constructor(options?: object);
    domElement: HTMLCanvasElement;
    shadowMap: { enabled: boolean; type: number };
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle: boolean): void;
    setClearColor(color: string, alpha: number): void;
    render(scene: object, camera: object): void;
    dispose(): void;
  }
  export class PerspectiveCamera {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    position: { set(x: number, y: number, z: number): void };
    lookAt(x: number, y: number, z: number): void;
    updateProjectionMatrix(): void;
  }
  export class HemisphereLight {
    constructor(sky: string, ground: string, intensity: number);
    color: { set(color: string): void };
    groundColor: { set(color: string): void };
  }
  export class DirectionalLight {
    constructor(color: string, intensity: number);
    castShadow: boolean;
    color: { set(color: string): void };
    position: { set(x: number, y: number, z: number): void };
    shadow: {
      mapSize: { set(width: number, height: number): void };
      camera: { near: number; far: number; left: number; right: number; top: number; bottom: number };
    };
  }
  export class MeshStandardMaterial {
    constructor(options?: object);
    color: { set(color: string): void };
    dispose(): void;
  }
  export class PlaneGeometry {
    constructor(width: number, height: number);
    dispose(): void;
  }
  export class BoxGeometry {
    constructor(width: number, height: number, depth: number);
    dispose(): void;
  }
  export class ConeGeometry {
    constructor(radius: number, height: number, segments: number);
    dispose(): void;
  }
  export class Mesh {
    constructor(geometry: { dispose(): void }, material: MeshStandardMaterial);
    rotation: { x: number; y: number };
    position: { y: number };
    castShadow: boolean;
    receiveShadow: boolean;
    geometry: { dispose(): void };
  }
  export const PCFSoftShadowMap: number;
}
