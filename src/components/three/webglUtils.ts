import * as THREE from 'three';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createStudioRenderer(
  container: HTMLElement,
  isSoftwareGl: boolean,
  alpha = false
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    alpha,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 300, container.clientHeight || 300);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.04,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAzimuthDialTexture(
  accentHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.fillStyle = '#0B1017';
    ctx.fillRect(0, 0, size, size);

    // Subtle radial ambient pool
    const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, size * 0.48);
    bgGrad.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
    bgGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0.35)');
    bgGrad.addColorStop(1, 'rgba(9, 12, 16, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.49, 0, Math.PI * 2);
    ctx.fill();

    // Concentric precision security rings
    const radii = [130, 210, 300, 395, 458];
    radii.forEach((r, idx) => {
      ctx.strokeStyle = idx === 2 ? accentHex : 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = idx === 2 ? 2.5 : 1.5;
      if (idx === 1 || idx === 3) {
        ctx.setLineDash([8, 10]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Degree tick marks around outer perimeter
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const major = deg % 30 === 0;
      const innerR = major ? 426 : 440;
      const outerR = 456;
      ctx.strokeStyle = major ? accentHex : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = major ? 2.5 : 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * innerR, cy + Math.sin(rad) * innerR);
      ctx.lineTo(cx + Math.cos(rad) * outerR, cy + Math.sin(rad) * outerR);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}
