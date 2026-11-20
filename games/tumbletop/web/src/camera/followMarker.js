// Followed-bot marker: a small rounded pip (white face, sunny-yellow core, dark plum rim)
// pointing down at the watched Gumble, plus a thin sunny-yellow outline around the watched
// Gumble's jelly body so its silhouette stays its own even when it is pressed against a
// neighbour of the same colour.
//
// The pip is a camera-facing sprite drawn over everything (it still marks the subject inside a
// crowd; no fog or tone mapping, so it stays crisp on any floor). The outline is an inverted
// hull: the body's own lathe geometry, inflated by a constant ~3 px on screen and drawn back
// faces only, with its depth pulled a little toward the lens so a touching neighbour does not
// swallow it while the subject's own front still covers it. It rides as a child of the pip, so
// it shows exactly when the pip does, and it places itself from the body's instance matrix (the
// one the character module already wrote this frame): one extra draw call, no
// allocations per frame.
import * as THREE from 'three';

export const MARKER_SIZE = 0.6; // metres across

// Must match the jelly body's per-species build in characters/gumble.js (BODY_H = 0.92).
const INV_BODY_H = (1 / 0.92).toFixed(6);
const OUTLINE_PX = 3.0;       // outline width on a 720 px tall frame
const OUTLINE_PULL = 0.38;    // metres the outline's depth is pulled toward the lens
const OUTLINE_COLOR = 0xffd84a; // the pip's sunny-yellow core

function drawPip() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const tri = () => {
    g.beginPath();
    g.moveTo(26, 34); g.lineTo(102, 34); g.lineTo(64, 98); g.closePath();
  };
  g.lineJoin = 'round';
  // dark plum rim (reads on the bright candy floors) with a soft drop shadow
  g.save();
  g.shadowColor = 'rgba(30, 12, 50, 0.5)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  tri(); g.lineWidth = 30; g.strokeStyle = '#3b2257'; g.stroke();
  g.restore();
  // white face (reads on the dark rim and on shadowed wood)
  tri(); g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.fill();
  // a sunny-yellow core: our own touch, and it ties to the HUD's watched-bot colour
  g.beginPath(); g.moveTo(46, 44); g.lineTo(82, 44); g.lineTo(64, 76); g.closePath();
  g.lineWidth = 6; g.strokeStyle = '#ffd23a'; g.stroke(); g.fillStyle = '#ffd23a'; g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function outlineMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uShape: { value: new THREE.Vector3(1, 1, 0) },
      uWidth: { value: 0 },
      uPull: { value: OUTLINE_PULL },
      uColor: { value: new THREE.Color(OUTLINE_COLOR) },
    },
    vertexShader: /* glsl */`
      uniform vec3 uShape; uniform float uWidth; uniform float uPull;
      void main() {
        // the same per-species build the body shader applies (width, height, taper)
        float gk = 1.0 + uShape.z * (0.45 - position.y * ${INV_BODY_H});
        float gkp = -uShape.z * ${INV_BODY_H};
        vec3 p = vec3(position.x * uShape.x * gk, position.y * uShape.y, position.z * uShape.x * gk);
        vec3 n = normalize(vec3(uShape.y * normal.x,
          uShape.x * (gk * normal.y - gkp * (position.x * normal.x + position.z * normal.z)),
          uShape.y * normal.z));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 vn = normalize(normalMatrix * n);
        // constant on-screen width: push out in view space in proportion to depth
        mv.xy += vn.xy * uWidth * -mv.z;
        vec4 c = projectionMatrix * mv;
        vec4 c2 = projectionMatrix * vec4(mv.xy, mv.z + uPull, 1.0);
        c.z = c2.z / c2.w * c.w;
        gl_Position = c;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
  });
}

// squared ground distance from instance i's origin to (px, pz)
function gap(arr, i, px, pz) {
  const dx = arr[i * 16 + 12] - px, dz = arr[i * 16 + 14] - pz;
  return dx * dx + dz * dz;
}

export function createFollowMarker() {
  const mat = new THREE.SpriteMaterial({
    map: drawPip(), depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, 0.17); // anchor at the pip's tip
  sprite.scale.set(MARKER_SIZE, MARKER_SIZE, 1);
  sprite.renderOrder = 20;
  sprite.frustumCulled = false;
  sprite.visible = false;

  // ---- body outline (bound to the jelly body mesh among the pip's siblings)
  const om = outlineMaterial();
  const hull = new THREE.Mesh(new THREE.BufferGeometry(), om);
  hull.matrixAutoUpdate = false;
  hull.matrixWorldAutoUpdate = false;
  hull.frustumCulled = false;
  hull.castShadow = false; hull.receiveShadow = false;
  hull.renderOrder = 1;
  sprite.add(hull);
  let body = null, last = -1;
  const mInst = new THREE.Matrix4();
  // Bind to the body mesh as soon as the pip joins the Gumbles' group (the geometry has to be in
  // place before the first frame that draws the hull, not set during it).
  const bind = () => {
    if (body || !sprite.parent) return;
    for (const ch of sprite.parent.children) {
      if (ch.isInstancedMesh && ch.geometry.attributes.aShape && ch.geometry.attributes.aFace) { body = ch; break; }
    }
    if (body) hull.geometry = body.geometry;
  };
  sprite.addEventListener('added', bind);
  hull.onBeforeRender = (renderer, scene, camera) => {
    if (!body) bind();
    if (!body) { om.uniforms.uWidth.value = 0; return; }
    // the watched Gumble is the body instance right under the pip (bodies never overlap)
    const arr = body.instanceMatrix.array, n = body.count;
    const px = sprite.position.x, pz = sprite.position.z;
    if (last < 0 || last >= n || gap(arr, last, px, pz) > 0.2) {
      let best = Infinity;
      for (let i = 0; i < n; i++) { const d = gap(arr, i, px, pz); if (d < best) { best = d; last = i; } }
    }
    mInst.fromArray(arr, last * 16);
    hull.matrixWorld.multiplyMatrices(body.matrixWorld, mInst);
    const sh = body.geometry.attributes.aShape;
    om.uniforms.uShape.value.set(sh.getX(last), sh.getY(last), sh.getZ(last));
    // OUTLINE_PX on a 720 px frame, whatever the lens: view-space width per metre of depth
    om.uniforms.uWidth.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 55) / 2) * OUTLINE_PX / 720;
  };
  return sprite;
}
