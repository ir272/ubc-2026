// Free the GPU resources under an Object3D: geometries, materials (and their depth/distance
// variants) and, unless told otherwise, the textures those materials own. Shared textures (the
// course texture set) are kept with { textures: false } or by listing them in `keep`.
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap',
  'envMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'displacementMap', 'specularMap'];

export function disposeMaterial(m, { textures = true, keep = null } = {}) {
  if (!m) return;
  if (textures) {
    for (const k of TEX_KEYS) {
      const t = m[k];
      if (t && t.isTexture && !(keep && keep.has(t))) t.dispose();
    }
    if (m.uniforms) {
      for (const u of Object.values(m.uniforms)) {
        const t = u && u.value;
        if (t && t.isTexture && !(keep && keep.has(t))) t.dispose();
      }
    }
  }
  m.dispose();
}

export function disposeTree(root, opts = {}) {
  if (!root) return;
  const geos = new Set(), mats = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) mats.add(m);
    if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
    if (o.customDistanceMaterial) mats.add(o.customDistanceMaterial);
    if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
    if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
  });
  for (const g of geos) g.dispose();
  for (const m of mats) disposeMaterial(m, opts);
}
