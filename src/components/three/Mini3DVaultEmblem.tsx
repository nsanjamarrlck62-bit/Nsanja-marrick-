import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ShieldCheck } from 'lucide-react';
import {
  createRadialShadowTexture,
  createStudioRenderer,
  detectSoftwareWebGL,
  disposeObject3D,
} from './webglUtils';

interface Mini3DVaultEmblemProps {
  size?: number;
  epochNumber?: number;
  locked?: boolean;
  accentColor?: 'emerald' | 'sky' | 'amber' | 'violet';
  className?: string;
}

const ACCENT_HEX: Record<NonNullable<Mini3DVaultEmblemProps['accentColor']>, number> = {
  emerald: 0x10b981,
  sky: 0x38bdf8,
  amber: 0xf59e0b,
  violet: 0xa78bfa,
};

export const Mini3DVaultEmblem: React.FC<Mini3DVaultEmblemProps> = ({
  size = 180,
  epochNumber = 1,
  locked = false,
  accentColor = 'emerald',
  className = '',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const spinBurstRef = useRef(0);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const accentRef = useRef(ACCENT_HEX[accentColor]);
  accentRef.current = ACCENT_HEX[accentColor];

  const coreMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const crystalMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  useEffect(() => {
    spinBurstRef.current = 1.8;
  }, [epochNumber]);

  useEffect(() => {
    const hex = locked ? 0xf59e0b : ACCENT_HEX[accentColor];
    if (coreMatRef.current) {
      coreMatRef.current.color.setHex(hex);
      coreMatRef.current.emissive.setHex(hex);
    }
    if (crystalMatRef.current) {
      crystalMatRef.current.attenuationColor.setHex(hex);
    }
  }, [accentColor, locked]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createStudioRenderer(container, isSoftwareGl, true);
    } catch {
      setContextLost(true);
      return;
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    camera.position.set(0, 0.65, 4.1);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.72;

    // 3-point warm/cool studio lighting
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(3.5, 4.5, 4.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x34d399, 1.4);
    rimLight.position.set(-4.0, 2.0, -3.5);
    scene.add(rimLight);

    const initialHex = lockedRef.current ? 0xf59e0b : accentRef.current;

    // Composite 6-part 3D Security Emblem Group
    const emblemGroup = new THREE.Group();
    scene.add(emblemGroup);

    // 1. Machined outer bezel (LatheGeometry)
    const bezelProfile = [
      new THREE.Vector2(0.95, -0.14),
      new THREE.Vector2(1.16, -0.11),
      new THREE.Vector2(1.2, 0.0),
      new THREE.Vector2(1.14, 0.11),
      new THREE.Vector2(0.95, 0.14),
      new THREE.Vector2(0.92, 0.0),
      new THREE.Vector2(0.95, -0.14),
    ];
    const bezelGeo = new THREE.LatheGeometry(bezelProfile, 48);
    bezelGeo.rotateX(Math.PI / 2);
    bezelGeo.computeTangents();
    const bezelMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.94,
      roughness: 0.22,
      anisotropy: 0.75,
      clearcoat: 0.4,
    });
    const outerBezel = new THREE.Mesh(bezelGeo, bezelMat);
    emblemGroup.add(outerBezel);

    // 2. Brushed titanium outer gimbal
    const gimbalOuterGeo = new THREE.TorusGeometry(0.84, 0.055, 20, 64);
    const gimbalOuterMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.96,
      roughness: 0.18,
      anisotropy: 0.85,
    });
    const gimbalOuter = new THREE.Mesh(gimbalOuterGeo, gimbalOuterMat);
    emblemGroup.add(gimbalOuter);

    // 3. Satin inner gimbal
    const gimbalInnerGeo = new THREE.TorusGeometry(0.68, 0.04, 18, 56);
    const gimbalInnerMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.68,
      roughness: 0.45,
    });
    const gimbalInner = new THREE.Mesh(gimbalInnerGeo, gimbalInnerMat);
    gimbalInner.rotation.x = Math.PI / 3;
    emblemGroup.add(gimbalInner);

    // 4. Optical faceted crystal shield
    const crystalGeo = new THREE.IcosahedronGeometry(0.49, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xd1fae5,
      metalness: 0.0,
      roughness: 0.08,
      transmission: isSoftwareGl ? 0 : 0.86,
      transparent: true,
      opacity: isSoftwareGl ? 0.36 : 1.0,
      ior: 1.68,
      thickness: 1.1,
      attenuationColor: new THREE.Color(initialHex),
      attenuationDistance: 1.2,
      clearcoat: 1.0,
      depthWrite: false,
    });
    crystalMatRef.current = crystalMat;
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.renderOrder = 2;
    emblemGroup.add(crystalMesh);

    // 5. Inner ratchet wireframe lattice
    const cageGeo = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.56, 0));
    const cageMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.55,
    });
    const cageMesh = new THREE.LineSegments(cageGeo, cageMat);
    emblemGroup.add(cageMesh);

    // 6. Luminous central key core
    const coreGeo = new THREE.OctahedronGeometry(0.24, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: initialHex,
      emissive: initialHex,
      emissiveIntensity: 0.7,
      metalness: 0.35,
      roughness: 0.2,
    });
    coreMatRef.current = coreMat;
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    emblemGroup.add(coreMesh);

    // Ground contact shadow plane
    const shadowTex = createRadialShadowTexture();
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.45,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.32;
    scene.add(shadowPlane);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || !gl.fenceSync) {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } catch {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      const motionScale = prefersReducedMotion ? 0 : 1;
      spinBurstRef.current = THREE.MathUtils.damp(spinBurstRef.current, 0, 4.5, dt);
      const speedBoost = 1 + spinBurstRef.current * 4.2;

      gimbalOuter.rotation.y += dt * 0.48 * speedBoost * motionScale;
      gimbalOuter.rotation.x = Math.sin(elapsed * 0.6) * 0.24 * motionScale;

      gimbalInner.rotation.z -= dt * 0.65 * speedBoost * motionScale;
      gimbalInner.rotation.y += dt * 0.35 * speedBoost * motionScale;

      crystalMesh.rotation.y += dt * 0.35 * speedBoost * motionScale;
      coreMesh.rotation.y -= dt * 0.9 * speedBoost * motionScale;
      coreMesh.rotation.x += dt * 0.5 * motionScale;
      cageMesh.rotation.y += dt * 0.25 * speedBoost * motionScale;

      emblemGroup.position.y = Math.sin(elapsed * 1.4) * 0.04 * motionScale;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      disposeObject3D(scene);
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (contextLost) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-[#10151C] border border-white/[0.08] flex flex-col items-center justify-center gap-2 ${className}`}
      >
        <ShieldCheck className="w-8 h-8 text-emerald-400" />
        <span className="text-[11px] font-mono text-slate-400">Epoch #{epochNumber}</span>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      style={{ width: size, height: size }}
      aria-label="Interactive 3D Cryptographic Vault Emblem"
      className={`relative select-none cursor-grab active:cursor-grabbing ${className}`}
    />
  );
};
