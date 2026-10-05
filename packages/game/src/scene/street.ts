import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
  type Scene,
  type Texture,
} from 'three';

/**
 * The greybox street, built in code. Dusk, buildings both sides, a garage
 * door behind one street goal, two washing lines (for Laundry Lane).
 *
 * These sizes are a greybox, not rules. The goal and the pitch are
 * level-designer's (STREET.md §9 question 9), and once P1 needs them to decide
 * a goal they move into packages/domain with a test.
 */
export const PITCH = { width: 18, length: 30 } as const;
export const GOAL = { width: 3.6, height: 2.2, depth: 1.1, post: 0.055 } as const;

const halfW = PITCH.width / 2;
const halfL = PITCH.length / 2;
const goalZ = -halfL;
const wallX = halfW + 1.2;
const wallBackZ = goalZ - 2.4;
const wallFrontZ = halfL + 1.2;

export interface Street {
  readonly root: Group;
  /** Per-frame cosmetic motion (the washing). */
  update(time: number): void;
}

export function buildStreet(scene: Scene): Street {
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const root = new Group();
  root.name = 'Street';
  scene.add(root);

  scene.background = canvasTexture(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1f2350');
    gr.addColorStop(0.45, '#6b4a78');
    gr.addColorStop(0.75, '#d9826a');
    gr.addColorStop(1, '#f5c389');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  scene.fog = new Fog(new Color(0x7d5e78), 30, 90);

  // Physical light units (three r155+): the prototype's legacy values times pi.
  root.add(new HemisphereLight(0xb8c4ff, 0x47343a, 1.95));
  const sun = new DirectionalLight(0xffc48a, 5.3);
  sun.name = 'Sun';
  sun.position.set(-12, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 24, bottom: -24, near: 1, far: 60 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  root.add(sun);

  // Ground
  const asphalt = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#3a3940';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const v = 40 + Math.floor(rnd() * 50);
      g.fillStyle = `rgba(${v},${v},${v + 6},${(0.35 + rnd() * 0.4).toFixed(3)})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.strokeStyle = 'rgba(18,18,22,.6)';
    g.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      let x = rnd() * w;
      let y = rnd() * h;
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += (rnd() - 0.5) * 60;
        y += (rnd() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, true);
  asphalt.repeat.set(12, 12);
  const ground = new Mesh(new PlaneGeometry(80, 80), new MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  ground.name = 'Ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // Chalk lines
  const chalk = new MeshBasicMaterial({ color: 0xefe6d2, transparent: true, opacity: 0.72, depthWrite: false });
  const stripe = (x1: number, z1: number, x2: number, z2: number, wd = 0.08): void => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const grp = new Group();
    grp.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
    grp.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    const m = new Mesh(new PlaneGeometry(wd, len + wd), chalk);
    m.rotation.x = -Math.PI / 2;
    grp.add(m);
    root.add(grp);
  };
  stripe(-halfW, -halfL, halfW, -halfL);
  stripe(-halfW, halfL, halfW, halfL);
  stripe(-halfW, -halfL, -halfW, halfL);
  stripe(halfW, -halfL, halfW, halfL);
  stripe(-3.5, goalZ, -3.5, goalZ + 4);
  stripe(3.5, goalZ, 3.5, goalZ + 4);
  stripe(-3.5, goalZ + 4, 3.5, goalZ + 4);
  const spot = new Mesh(new CircleGeometry(0.13, 20), chalk);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.006, goalZ + 9);
  root.add(spot);

  // Buildings
  const facadeColors = ['#b5654a', '#c8a27a', '#8a9a8c', '#a85d5d', '#d0b58c', '#7d8aa6', '#b98b5e'];
  let colorIdx = 0;
  const facade = (base: string, repX: number, repY: number): MeshStandardMaterial => {
    const lit: boolean[] = [];
    for (let i = 0; i < 16; i++) lit.push(rnd() < 0.3);
    const draw = (emissive: boolean) => (g: CanvasRenderingContext2D, w: number, h: number): void => {
      g.fillStyle = emissive ? '#000' : base;
      g.fillRect(0, 0, w, h);
      if (!emissive) {
        for (let i = 0; i < 1400; i++) {
          g.fillStyle = `rgba(0,0,0,${(rnd() * 0.07).toFixed(3)})`;
          g.fillRect(rnd() * w, rnd() * h, 2, 2);
        }
      }
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const x = c * 64 + 18;
          const y = r * 64 + 14;
          const on = lit[r * 4 + c];
          if (!emissive) {
            g.fillStyle = 'rgba(0,0,0,.25)';
            g.fillRect(x - 3, y - 3, 34, 46);
            g.fillStyle = on ? '#ffcf7a' : '#2b3346';
            g.fillRect(x, y, 28, 38);
            g.fillStyle = 'rgba(255,255,255,.12)';
            g.fillRect(x, y, 28, 3);
            g.fillStyle = 'rgba(0,0,0,.35)';
            g.fillRect(x + 13, y, 2, 38);
          } else if (on) {
            g.fillStyle = '#ffb25a';
            g.fillRect(x, y, 28, 38);
          }
        }
      }
    };
    const map = canvasTexture(256, 256, draw(false), true);
    const emissiveMap = canvasTexture(256, 256, draw(true), true);
    map.repeat.set(repX, repY);
    emissiveMap.repeat.set(repX, repY);
    return new MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.92 });
  };
  const building = (cx: number, cz: number, sx: number, sz: number, h: number, faceAlongZ: boolean): void => {
    const faceLen = faceAlongZ ? sz : sx;
    const m = new Mesh(new BoxGeometry(sx, h, sz), facade(facadeColors[colorIdx++ % facadeColors.length] ?? '#b5654a', faceLen / 8, h / 12));
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  };
  for (const s of [-1, 1]) {
    let z = -24;
    while (z < 26) {
      const len = 5 + rnd() * 4;
      building(s * (wallX + 4), z + len / 2, 8, len, 7 + rnd() * 9, true);
      z += len;
    }
  }
  building(0, wallBackZ - 4, 30, 8, 11, false);
  building(-6, wallFrontZ + 12, 14, 8, 13, false);
  building(8, wallFrontZ + 12, 12, 8, 9, false);

  const door = new Mesh(
    new PlaneGeometry(5.4, 3.2),
    new MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.3,
      map: canvasTexture(256, 160, (g, w, h) => {
        g.fillStyle = '#5f7a6e';
        g.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 10) {
          g.fillStyle = 'rgba(0,0,0,.22)';
          g.fillRect(0, y, w, 2);
          g.fillStyle = 'rgba(255,255,255,.08)';
          g.fillRect(0, y + 2, w, 1);
        }
        g.strokeStyle = 'rgba(240,230,210,.55)';
        g.lineWidth = 4;
        g.strokeRect(48, 30, 160, 112);
      }),
    }),
  );
  door.position.set(0, 1.6, wallBackZ + 0.02);
  door.receiveShadow = true;
  root.add(door);

  const lowWall = new Mesh(new BoxGeometry(2 * wallX, 1.3, 0.4), new MeshStandardMaterial({ color: 0x8c8378, roughness: 0.95 }));
  lowWall.position.set(0, 0.65, wallFrontZ + 0.2);
  lowWall.castShadow = lowWall.receiveShadow = true;
  root.add(lowWall);

  // Street lamps
  const postMat = new MeshStandardMaterial({ color: 0x2c2b30, roughness: 0.6, metalness: 0.4 });
  for (const [s, z] of [[-1, -8], [1, -2], [-1, 6], [1, 12]] as const) {
    const x = s * (wallX - 0.25);
    const post = new Mesh(new CylinderGeometry(0.07, 0.09, 5.4, 8), postMat);
    post.position.set(x, 2.7, z);
    post.castShadow = true;
    root.add(post);
    const arm = new Mesh(new BoxGeometry(1.1, 0.08, 0.08), postMat);
    arm.position.set(x - s * 0.5, 5.35, z);
    root.add(arm);
    const bulb = new Mesh(new SphereGeometry(0.16, 12, 8), new MeshBasicMaterial({ color: 0xffd28a }));
    bulb.position.set(x - s * 1.0, 5.2, z);
    root.add(bulb);
    const light = new PointLight(0xffa64d, 25, 14, 2);
    light.position.copy(bulb.position);
    root.add(light);
  }

  // Washing lines
  const cloths: { pivot: Group; phase: number }[] = [];
  const clothColors = [0xe9e4d6, 0xd65a4a, 0x4d79c7, 0xf0c64a, 0x6fb38a, 0xffffff];
  const sag = (t: number): number => 6.4 - Math.sin(t * Math.PI) * 0.5;
  for (const z of [-5, 9]) {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 20; i++) pts.push(new Vector3(-wallX + 2 * wallX * (i / 20), sag(i / 20), z));
    root.add(new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: 0x222222 })));
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + i * 0.1 + rnd() * 0.04;
      const pivot = new Group();
      pivot.position.set(-wallX + 2 * wallX * t, sag(t), z);
      root.add(pivot);
      const w = 0.5 + rnd() * 0.4;
      const h = 0.5 + rnd() * 0.5;
      const cloth = new Mesh(
        new PlaneGeometry(w, h),
        new MeshStandardMaterial({ color: clothColors[i % clothColors.length], side: DoubleSide, roughness: 1 }),
      );
      cloth.position.y = -h / 2;
      cloth.castShadow = true;
      pivot.add(cloth);
      cloths.push({ pivot, phase: rnd() * 6 });
    }
  }

  root.add(buildGoal());

  return {
    root,
    update(time: number): void {
      for (const c of cloths) c.pivot.rotation.x = Math.sin(time * 1.6 + c.phase) * 0.18;
    },
  };
}

function buildGoal(): Group {
  const goal = new Group();
  goal.name = 'Goal';
  const { width, height, depth, post } = GOAL;
  const gx = width / 2;
  const backZ = goalZ - depth;
  const frame = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4, metalness: 0.3 });
  const bar = (a: Vector3, b: Vector3, r: number): void => {
    const d = new Vector3().subVectors(b, a);
    const m = new Mesh(new CylinderGeometry(r, r, d.length(), 12), frame);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
    m.castShadow = true;
    goal.add(m);
  };
  bar(new Vector3(-gx, 0, goalZ), new Vector3(-gx, height, goalZ), post);
  bar(new Vector3(gx, 0, goalZ), new Vector3(gx, height, goalZ), post);
  bar(new Vector3(-gx - post, height, goalZ), new Vector3(gx + post, height, goalZ), post);
  for (const sx of [-gx, gx]) {
    bar(new Vector3(sx, 0, backZ), new Vector3(sx, height, backZ), 0.03);
    bar(new Vector3(sx, height, goalZ), new Vector3(sx, height, backZ), 0.03);
    bar(new Vector3(sx, 0.02, goalZ), new Vector3(sx, 0.02, backZ), 0.03);
  }
  bar(new Vector3(-gx, height, backZ), new Vector3(gx, height, backZ), 0.03);
  bar(new Vector3(-gx, 0.02, backZ), new Vector3(gx, 0.02, backZ), 0.03);

  const p: number[] = [];
  const step = 0.18;
  const e = 1e-6;
  for (let x = -gx; x <= gx + e; x += step) p.push(x, 0, backZ, x, height, backZ, x, height, goalZ, x, height, backZ);
  for (let y = 0; y <= height + e; y += step) p.push(-gx, y, backZ, gx, y, backZ);
  for (let z = backZ; z <= goalZ + e; z += step) p.push(-gx, height, z, gx, height, z);
  for (const sx of [-gx, gx]) {
    for (let z = backZ; z <= goalZ + e; z += step) p.push(sx, 0, z, sx, height, z);
    for (let y = 0; y <= height + e; y += step) p.push(sx, y, goalZ, sx, y, backZ);
  }
  const net = new BufferGeometry();
  net.setAttribute('position', new Float32BufferAttribute(p, 3));
  const lines = new LineSegments(net, new LineBasicMaterial({ color: 0xe8e4da, transparent: true, opacity: 0.45 }));
  lines.name = 'Net';
  goal.add(lines);
  return goal;
}

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat = false,
): Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  draw(g, w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
