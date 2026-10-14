/** Menu items, ingredients and people. Models stand on y = 0 and face +Z. */
import { CatmullRomCurve3, CylinderGeometry, Group, LatheGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import { part } from '../style';

/** Solid of revolution from (radius, y) pairs, closed at both ends. */
function lathe(profile: readonly (readonly [number, number])[], segments = 12): LatheGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments);
}

/** i-latte: takeaway cup with a latte sleeve and a lid. */
export function latte(): Group {
  const g = new Group();
  const cup = part(lathe([[0, 0], [0.4, 0], [0.54, 1.25], [0, 1.25]]), 'cream');
  const sleeve = part(lathe([[0.45, 0.32], [0.48, 0.32], [0.515, 0.86], [0.485, 0.86]]), 'latte', { outline: false });
  const lid = part(lathe([[0, 1.22], [0.6, 1.22], [0.6, 1.32], [0.5, 1.42], [0, 1.42]]), 'creamDeep');
  const spout = part(new CylinderGeometry(0.1, 0.12, 0.08, 10), 'coffeeDark', { outline: false });
  spout.position.set(0.22, 1.44, 0.22);
  g.add(cup, sleeve, lid, spout);
  return g;
}

const BEAN = { rx: 0.42, ry: 0.3, rz: 0.62 };

/** One coffee bean lying on its flat side, with the S-shaped crease on top. */
function bean(): Group {
  const g = new Group();
  const body = part(new SphereGeometry(1, 12, 9).scale(BEAN.rx, BEAN.ry, BEAN.rz), 'coffee');
  body.position.y = BEAN.ry;
  const points: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const z = (t - 0.5) * 1.5 * BEAN.rz;
    const x = Math.sin(t * Math.PI * 2) * 0.07;
    const inside = 1 - (x / BEAN.rx) ** 2 - (z / BEAN.rz) ** 2;
    points.push(new Vector3(x, BEAN.ry + BEAN.ry * Math.sqrt(Math.max(inside, 0)) + 0.005, z));
  }
  const crease = part(new TubeGeometry(new CatmullRomCurve3(points), 16, 0.035, 5), 'coffeeDark', { outline: false });
  g.add(body, crease);
  return g;
}

/** i-beans: two coffee beans. */
export function beans(): Group {
  const g = new Group();
  const a = bean();
  a.position.set(-0.4, 0, 0.15);
  a.rotation.y = 0.5;
  const b = bean();
  b.position.set(0.42, 0.06, -0.2);
  b.rotation.set(0, -0.6, 0.22);
  g.add(a, b);
  return g;
}

/** i-avatar: head and shoulders in the default look (skin-1, hair-2). */
export function avatar(): Group {
  const g = new Group();
  const shirt = part(new CylinderGeometry(0.5, 0.78, 0.6, 12), 'mint');
  shirt.position.y = 0.3;
  const head = part(new SphereGeometry(0.72, 14, 10), 'skin');
  head.position.y = 1.25;
  const hair = part(new SphereGeometry(0.76, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), 'coffeeDark');
  hair.position.y = 1.27;
  hair.rotation.x = -0.25;
  g.add(shirt, head, hair);

  const onFace = (x: number, y: number, lift = 0.01) => new Vector3(x, y, Math.sqrt(Math.max(0.72 ** 2 - x * x - y * y, 0)) + lift);
  for (const x of [-0.24, 0.24]) {
    const eye = part(new SphereGeometry(0.075, 8, 6), 'ink', { outline: false });
    eye.position.copy(onFace(x, 0.02)).add(head.position);
    const cheek = part(new SphereGeometry(0.1, 8, 6).scale(1, 0.6, 0.4), 'coral', { outline: false });
    cheek.position.copy(onFace(x * 1.55, -0.17)).add(head.position);
    g.add(eye, cheek);
  }
  const smile = part(new TorusGeometry(0.13, 0.028, 4, 10, Math.PI), 'ink', { outline: false });
  smile.rotation.z = Math.PI;
  smile.position.copy(onFace(0, -0.12, 0)).add(head.position);
  g.add(smile);
  // Turn the face a little towards the camera so both eyes read at 16 px.
  g.rotation.y = 0.35;
  return g;
}
