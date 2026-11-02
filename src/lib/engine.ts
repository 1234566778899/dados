import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  faceCorrection,
  loadThrows,
  samplePose,
  yawRotation,
  type ImpactEvent,
  type Take,
  type ThrowsData,
} from "./throws";

const MAX_DICE = 6;
const FOV = 24;
const TILT = (15 * Math.PI) / 180;
const FIT_HALF = 4.85; // mitad del lado de bandeja + margen
const GHOST_MS = 150;
// Las tomas empiezan muy fuera de cuadro; se salta ese tramo para que la
// respuesta a la pulsacion sea inmediata.
const LEAD_IN = 0.3;

type Playback = {
  take: Take;
  corrections: Quaternion[];
  yaw: Quaternion;
  count: number;
  startedAt: number;
  onSettled: () => void;
};

export type ThrowInfo = { events: ImpactEvent[] };

/** Escena 3D. Solo pinta cuando algo cambia: en reposo no gasta bateria. */
export class DiceEngine {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 120);
  private dice: Object3D[] = [];
  private ghosts: Object3D[] = [];
  private data: ThrowsData | null = null;
  private playback: Playback | null = null;
  private ghostUntil = 0;
  private frameRequest = 0;
  private observer: ResizeObserver | null = null;
  private lastTakeIndex = new Map<number, number>();
  private ground: ShadowMaterial | null = null;
  private portrait = false;
  private position = new Vector3();
  private rotation = new Quaternion();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  async load() {
    const [gltf, data] = await Promise.all([new GLTFLoader().loadAsync("/models/scene.glb"), loadThrows()]);
    this.data = data;

    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    const key = new DirectionalLight(0xffe7c4, 2.7);
    key.position.set(-6, 18, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    const shadowCamera = key.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -14;
    shadowCamera.right = shadowCamera.top = 14;
    shadowCamera.near = 1;
    shadowCamera.far = 50;
    this.scene.add(key);
    this.scene.add(new HemisphereLight(0xffffff, 0x3a332c, 0.35));

    // Sombra de la bandeja sobre la pagina: el canvas es transparente.
    this.ground = new ShadowMaterial({ opacity: 0.55 });
    const plane = new Mesh(new PlaneGeometry(80, 80), this.ground);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.36;
    plane.receiveShadow = true;
    this.scene.add(plane);

    const tray = gltf.scene.getObjectByName("Tray");
    const die = gltf.scene.getObjectByName("Die");
    const felt = gltf.scene.getObjectByName("Felt");
    if (!tray || !die || !felt) throw new Error("scene.glb incompleto");
    felt.traverse((node) => {
      if (node instanceof Mesh) node.receiveShadow = true;
    });
    tray.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    die.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Barniz discreto: con mas, el reflejo del entorno lava el rojo.
        if (node.material instanceof MeshPhysicalMaterial) node.material.clearcoat = Math.min(node.material.clearcoat, 0.4);
      }
    });
    this.scene.add(tray, felt);

    const holder = new Group();
    this.scene.add(holder);
    for (let i = 0; i < MAX_DICE; i++) {
      const copy = die.clone();
      copy.visible = false;
      holder.add(copy);
      this.dice.push(copy);
      const ghost = die.clone();
      ghost.visible = false;
      holder.add(ghost);
      this.ghosts.push(ghost);
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas.parentElement ?? this.canvas);
    this.resize();
  }

  /** Coloca dados en reposo, sin animacion, sin resultado. */
  showRest(count: number) {
    if (!this.data) return;
    this.cancel();
    const takes = this.data.manifest.takes[count];
    const yaw = yawRotation(0);
    const identity = new Quaternion();
    const take = this.mostCentered(takes, count);
    this.dice.forEach((die, index) => {
      die.visible = index < count;
      die.scale.setScalar(1);
      if (index < count) {
        samplePose(this.data!, take, index, 1e3, identity, yaw, die.position, die.quaternion);
      }
    });
    this.requestFrame();
  }

  /** Vacia la bandeja (por ejemplo, todos los dados guardados). */
  clear() {
    this.cancel();
    this.snapshotGhosts();
    this.dice.forEach((die) => (die.visible = false));
    this.requestFrame();
  }

  /**
   * Reproduce un lanzamiento que termina mostrando exactamente `values`.
   * Devuelve la toma elegida para sincronizar el sonido.
   */
  throwDice(values: number[], options: { reducedMotion: boolean; onSettled: () => void }): ThrowInfo | null {
    const data = this.data;
    if (!data || values.length === 0) return null;
    this.cancel();

    const count = values.length;
    const take = this.pickTake(count);
    const corrections = values.map((value, die) => faceCorrection(data.manifest, value, take.up[die]));
    // Los dados entran por el lado corto de la vista, siempre fuera de cuadro.
    const side = Math.random() < 0.5 ? 0 : Math.PI;
    const yaw = yawRotation(this.portrait ? side + Math.PI / 2 : side);

    if (options.reducedMotion) {
      this.dice.forEach((die, index) => {
        die.visible = index < count;
        if (index < count) {
          die.scale.setScalar(1);
          samplePose(data, take, index, 1e3, corrections[index], yaw, die.position, die.quaternion);
        }
      });
      this.requestFrame();
      options.onSettled();
      return { events: [] };
    }

    this.snapshotGhosts();
    this.dice.forEach((die, index) => {
      die.visible = index < count;
      die.scale.setScalar(1);
    });
    this.playback = {
      take,
      corrections,
      yaw,
      count,
      startedAt: performance.now(),
      onSettled: options.onSettled,
    };
    this.requestFrame();
    const events = take.events
      .filter((event) => event.t >= LEAD_IN)
      .map((event) => ({ ...event, t: event.t - LEAD_IN }));
    return { events };
  }

  dispose() {
    this.cancel();
    cancelAnimationFrame(this.frameRequest);
    this.observer?.disconnect();
    this.renderer.dispose();
  }

  private cancel() {
    this.playback = null;
  }

  /** Para el reposo inicial: la toma cuyos dados quedan mas cerca del centro. */
  private mostCentered(takes: Take[], count: number): Take {
    const identity = new Quaternion();
    const yaw = yawRotation(0);
    let best = takes[0];
    let bestScore = Infinity;
    for (const take of takes) {
      let score = 0;
      for (let die = 0; die < count; die++) {
        samplePose(this.data!, take, die, 1e3, identity, yaw, this.position, this.rotation);
        score = Math.max(score, Math.hypot(this.position.x, this.position.z));
      }
      if (score < bestScore) {
        bestScore = score;
        best = take;
      }
    }
    return best;
  }

  private pickTake(count: number): Take {
    const takes = this.data!.manifest.takes[count];
    const last = this.lastTakeIndex.get(count) ?? -1;
    let index = Math.floor(Math.random() * takes.length);
    if (index === last) index = (index + 1) % takes.length;
    this.lastTakeIndex.set(count, index);
    return takes[index];
  }

  /** Los dados anteriores se encogen en su sitio mientras llegan los nuevos. */
  private snapshotGhosts() {
    this.dice.forEach((die, index) => {
      const ghost = this.ghosts[index];
      ghost.visible = die.visible;
      ghost.position.copy(die.position);
      ghost.quaternion.copy(die.quaternion);
      ghost.scale.setScalar(1);
    });
    this.ghostUntil = performance.now() + GHOST_MS;
  }

  private resize() {
    const parent = this.canvas.parentElement ?? this.canvas;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.portrait = aspect < 1;
    this.camera.aspect = aspect;
    const distance = FIT_HALF / Math.tan((FOV * Math.PI) / 360) / Math.min(1, aspect);
    this.camera.position.set(0, Math.cos(TILT) * distance, Math.sin(TILT) * distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.renderNow();
  }

  private requestFrame() {
    if (this.frameRequest) return;
    this.frameRequest = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.frameRequest = 0;
    let keepGoing = false;

    if (this.ghostUntil > 0) {
      const left = (this.ghostUntil - now) / GHOST_MS;
      if (left <= 0) {
        this.ghosts.forEach((ghost) => (ghost.visible = false));
        this.ghostUntil = 0;
      } else {
        const scale = left * left;
        this.ghosts.forEach((ghost) => ghost.scale.setScalar(scale));
        keepGoing = true;
      }
    }

    const playback = this.playback;
    if (playback) {
      const elapsed = Math.max(0, (now - playback.startedAt) / 1000) + LEAD_IN;
      for (let i = 0; i < playback.count; i++) {
        samplePose(
          this.data!,
          playback.take,
          i,
          elapsed,
          playback.corrections[i],
          playback.yaw,
          this.position,
          this.rotation,
        );
        this.dice[i].position.copy(this.position);
        this.dice[i].quaternion.copy(this.rotation);
      }
      if (elapsed >= playback.take.rest) {
        this.playback = null;
        playback.onSettled();
      } else {
        keepGoing = true;
      }
    }

    this.renderNow();
    if (keepGoing) this.requestFrame();
  };

  private renderNow() {
    this.renderer.render(this.scene, this.camera);
  }
}
