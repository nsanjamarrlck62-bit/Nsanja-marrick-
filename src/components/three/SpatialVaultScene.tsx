import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Conversation, DeviceSession } from '../../types/kestrel';
import type { VaultBlobRecord } from '../DevicesVaultView';
import {
  createAzimuthDialTexture,
  createRadialShadowTexture,
  createStudioRenderer,
  detectSoftwareWebGL,
  disposeObject3D,
} from './webglUtils';

interface SpatialVaultSceneProps {
  devices: DeviceSession[];
  vaultBlobs: VaultBlobRecord[];
  conversations: Conversation[];
  activeConversation?: Conversation;
  onRotateKeyEpoch: (conversationId: string) => Promise<void>;
  onForceSync: () => void;
}

type MaterialFinishId = 'emerald' | 'titanium' | 'sapphire' | 'amber';
type CameraPresetId = 'overview' | 'core' | 'devices' | 'top';

interface SelectedNodeInfo {
  kind: 'core' | 'device' | 'blob';
  title: string;
  subtitle: string;
  meta: string;
}

const FINISH_THEMES: Record<
  MaterialFinishId,
  {
    label: string;
    swatch: string;
    coreHex: number;
    accentCss: string;
    metalHex: number;
    metalRoughness: number;
    attenuationHex: number;
  }
> = {
  emerald: {
    label: 'Obsidian Emerald',
    swatch: '#10B981',
    coreHex: 0x10b981,
    accentCss: '#10B981',
    metalHex: 0x334155,
    metalRoughness: 0.24,
    attenuationHex: 0x10b981,
  },
  titanium: {
    label: 'Brushed Titanium',
    swatch: '#94A3B8',
    coreHex: 0xe2e8f0,
    accentCss: '#CBD5E1',
    metalHex: 0x94a3b8,
    metalRoughness: 0.16,
    attenuationHex: 0x64748b,
  },
  sapphire: {
    label: 'Sapphire Crystal',
    swatch: '#38BDF8',
    coreHex: 0x38bdf8,
    accentCss: '#38BDF8',
    metalHex: 0x1e3a5f,
    metalRoughness: 0.2,
    attenuationHex: 0x0284c7,
  },
  amber: {
    label: 'Amber Gold',
    swatch: '#F59E0B',
    coreHex: 0xf59e0b,
    accentCss: '#F59E0B',
    metalHex: 0x78552b,
    metalRoughness: 0.22,
    attenuationHex: 0xd97706,
  },
};

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: 'Overview', pos: [0, 5.2, 10.6], target: [0, 1.3, 0] },
  core: { label: 'Core Inspect', pos: [2.8, 2.3, 4.1], target: [0, 1.55, 0] },
  devices: { label: 'Device Ring', pos: [-6.8, 3.8, 7.6], target: [0, 1.35, 0] },
  top: { label: 'Topology Map', pos: [0, 12.2, 0.01], target: [0, 0.8, 0] },
};

// Pre-allocated math objects for zero GC inside the render loop
const _vec3 = new THREE.Vector3();
const _packetPos = new THREE.Vector3();
const _packetMatrix = new THREE.Matrix4();
const _packetQuat = new THREE.Quaternion();
const _packetScale = new THREE.Vector3(1, 1, 1);

export const SpatialVaultScene: React.FC<SpatialVaultSceneProps> = ({
  devices,
  vaultBlobs,
  conversations,
  activeConversation,
  onRotateKeyEpoch,
  onForceSync,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [finishId, setFinishId] = useState<MaterialFinishId>('emerald');
  const [activePreset, setActivePreset] = useState<CameraPresetId>('overview');
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [syncPulseNonce, setSyncPulseNonce] = useState(0);

  const explodeTargetRef = useRef(0);
  explodeTargetRef.current = explodeAmount / 100;

  const finishRef = useRef(finishId);
  finishRef.current = finishId;

  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const vaultBlobsRef = useRef(vaultBlobs);
  vaultBlobsRef.current = vaultBlobs;

  const keyEpochRef = useRef(activeConversation?.keyEpoch || 1);
  keyEpochRef.current = activeConversation?.keyEpoch || 1;

  const sceneTopologyKey = useMemo(
    () =>
      `${devices.map((d) => `${d.id}:${d.isOnline ? '1' : '0'}`).join('|')}__${vaultBlobs
        .slice(0, 12)
        .map((b) => b.cid)
        .join('|')}__${activeConversation?.keyEpoch || 1}__${conversations.length}`,
    [devices, vaultBlobs, activeConversation?.keyEpoch, conversations.length]
  );

  const cameraTransitionRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(...CAMERA_PRESETS.overview.pos),
    target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
  });

  const pulseBoostRef = useRef(0);
  const selectCallbackRef = useRef<(info: SelectedNodeInfo | null) => void>(setSelectedNode);
  selectCallbackRef.current = setSelectedNode;

  // Toggle bottom dock with H key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const totalVaultBytes = useMemo(
    () => vaultBlobs.reduce((sum, b) => sum + (b.sizeBytes || 0), 0),
    [vaultBlobs]
  );

  // Build & manage Three.js scene
  const finishMaterialsRef = useRef<{
    coreMat: THREE.MeshStandardMaterial | null;
    crystalMat: THREE.MeshPhysicalMaterial | null;
    gimbalOuterMat: THREE.MeshPhysicalMaterial | null;
    beaconMat: THREE.MeshStandardMaterial | null;
    packetMat: THREE.MeshStandardMaterial | null;
    conduitMats: THREE.MeshStandardMaterial[];
  }>({
    coreMat: null,
    crystalMat: null,
    gimbalOuterMat: null,
    beaconMat: null,
    packetMat: null,
    conduitMats: [],
  });

  useEffect(() => {
    const theme = FINISH_THEMES[finishId];
    const mats = finishMaterialsRef.current;
    if (mats.coreMat) {
      mats.coreMat.color.setHex(theme.coreHex);
      mats.coreMat.emissive.setHex(theme.coreHex);
    }
    if (mats.crystalMat) {
      mats.crystalMat.attenuationColor.setHex(theme.attenuationHex);
    }
    if (mats.gimbalOuterMat) {
      mats.gimbalOuterMat.color.setHex(theme.metalHex);
      mats.gimbalOuterMat.roughness = theme.metalRoughness;
    }
    if (mats.beaconMat) {
      mats.beaconMat.color.setHex(theme.coreHex);
      mats.beaconMat.emissive.setHex(theme.coreHex);
    }
    if (mats.packetMat) {
      mats.packetMat.color.setHex(theme.coreHex);
      mats.packetMat.emissive.setHex(theme.coreHex);
    }
    mats.conduitMats.forEach((m) => {
      m.emissive.setHex(theme.coreHex);
    });
  }, [finishId]);

  useEffect(() => {
    if (syncPulseNonce > 0) {
      pulseBoostRef.current = 1.6;
    }
  }, [syncPulseNonce]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createStudioRenderer(container, isSoftwareGl, false);
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090c10);
    scene.fog = new THREE.FogExp2(0x090c10, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 640;
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.minDistance = 3.2;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.addEventListener('start', () => {
      cameraTransitionRef.current.active = false;
    });

    // Studio 3-point warm/cool lighting rig
    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x0b1018, 0.7);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(6, 9, 6);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 28;
      const d = 8.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x34d399, 1.35);
    rimLight.position.set(-7, 4, -6);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xe2e8f0, 3.2, 6, 2.2);
      softbox.position.set(0, 6.2, 4.5);
      softbox.lookAt(0, 1.4, 0);
      scene.add(softbox);
    }

    const theme = FINISH_THEMES[finishRef.current];

    // 1. Studio Floor + Procedural Azimuth Dial + Contact Shadow (grounded at Y = 0)
    const floorGroup = new THREE.Group();
    scene.add(floorGroup);

    const floorGeo = new THREE.CircleGeometry(14, 72);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f16,
      roughness: 0.78,
      metalness: 0.18,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorGroup.add(floorMesh);

    const dialTex = createAzimuthDialTexture(
      theme.accentCss,
      renderer.capabilities.getMaxAnisotropy()
    );
    const dialPlateGeo = new THREE.CircleGeometry(6.6, 72);
    const dialPlateMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      roughness: 0.55,
      metalness: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const dialPlate = new THREE.Mesh(dialPlateGeo, dialPlateMat);
    dialPlate.rotation.x = -Math.PI / 2;
    dialPlate.position.y = 0.02;
    dialPlate.receiveShadow = true;
    floorGroup.add(dialPlate);

    // 36 Instanced metallic chapter markers around the perimeter ring
    const tickCount = 36;
    const tickGeo = new THREE.BoxGeometry(0.06, 0.04, 0.26);
    const tickMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const tickInstanced = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < tickCount; i++) {
      const ang = (i / tickCount) * Math.PI * 2;
      const r = 6.18;
      dummy.position.set(Math.cos(ang) * r, 0.04, Math.sin(ang) * r);
      dummy.rotation.set(0, -ang + Math.PI / 2, 0);
      dummy.scale.set(1, i % 3 === 0 ? 1.8 : 1, i % 3 === 0 ? 1.4 : 1);
      dummy.updateMatrix();
      tickInstanced.setMatrixAt(i, dummy.matrix);
    }
    tickInstanced.instanceMatrix.needsUpdate = true;
    tickInstanced.computeBoundingSphere();
    floorGroup.add(tickInstanced);

    // Soft radial contact shadow directly beneath central pedestal
    const contactTex = createRadialShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.5,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.03;
    floorGroup.add(contactShadow);

    // 2. Central Chiat-Ratchet Vault Core (Composite 8-Part Assembly, grounded at Y = 0)
    const clickableMeshes: THREE.Object3D[] = [];
    const vaultCoreGroup = new THREE.Group();
    scene.add(vaultCoreGroup);

    // Part A: Machined Pedestal Base (LatheGeometry, flush at Y = 0)
    const pedestalProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.45, 0.0),
      new THREE.Vector2(1.42, 0.14),
      new THREE.Vector2(1.22, 0.24),
      new THREE.Vector2(1.08, 0.42),
      new THREE.Vector2(0.76, 0.48),
      new THREE.Vector2(0.68, 0.62),
      new THREE.Vector2(0.0, 0.62),
    ];
    const pedestalGeo = new THREE.LatheGeometry(pedestalProfile, 48);
    pedestalGeo.computeTangents();
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x161f2b,
      metalness: 0.78,
      roughness: 0.48,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.castShadow = true;
    pedestalMesh.receiveShadow = true;
    vaultCoreGroup.add(pedestalMesh);

    // Part B: 4 Radial Beveled Support Ribs (ExtrudeGeometry)
    const ribShape = new THREE.Shape();
    ribShape.moveTo(0.65, 0.22);
    ribShape.lineTo(1.28, 0.16);
    ribShape.lineTo(1.18, 0.44);
    ribShape.lineTo(0.72, 0.78);
    ribShape.lineTo(0.65, 0.78);
    ribShape.closePath();
    const ribGeo = new THREE.ExtrudeGeometry(ribShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    ribGeo.translate(0, 0, -0.04);
    ribGeo.computeTangents();
    const ribMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.9,
      roughness: 0.22,
    });
    const ribAnchors: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      holder.rotation.y = (i * Math.PI) / 2;
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.castShadow = true;
      holder.add(rib);
      vaultCoreGroup.add(holder);
      ribAnchors.push(holder);
    }

    // Explodable core sub-layers centered around Y = 1.65
    const baseCoreY = 1.65;

    // Part C: Anisotropic Brushed Outer Gimbal Ring
    const gimbalOuterGroup = new THREE.Group();
    gimbalOuterGroup.position.y = baseCoreY;
    vaultCoreGroup.add(gimbalOuterGroup);

    const gimbalOuterGeo = new THREE.TorusGeometry(1.12, 0.068, 24, 72);
    const gimbalOuterMat = new THREE.MeshPhysicalMaterial({
      color: theme.metalHex,
      metalness: 0.95,
      roughness: theme.metalRoughness,
      anisotropy: 0.85,
      clearcoat: 0.45,
    });
    const gimbalOuterMesh = new THREE.Mesh(gimbalOuterGeo, gimbalOuterMat);
    gimbalOuterMesh.castShadow = true;
    gimbalOuterGroup.add(gimbalOuterMesh);

    // Part D: Orthogonal Satin Inner Gimbal Ring
    const gimbalInnerGroup = new THREE.Group();
    gimbalInnerGroup.position.y = baseCoreY;
    vaultCoreGroup.add(gimbalInnerGroup);

    const gimbalInnerGeo = new THREE.TorusGeometry(0.9, 0.048, 20, 64);
    const gimbalInnerMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.72,
      roughness: 0.45,
    });
    const gimbalInnerMesh = new THREE.Mesh(gimbalInnerGeo, gimbalInnerMat);
    gimbalInnerMesh.rotation.x = Math.PI / 3;
    gimbalInnerMesh.castShadow = true;
    gimbalInnerGroup.add(gimbalInnerMesh);

    // Part E: Optical Crystal Shield (Icosahedron)
    const crystalGroup = new THREE.Group();
    crystalGroup.position.y = baseCoreY;
    vaultCoreGroup.add(crystalGroup);

    const crystalGeo = new THREE.IcosahedronGeometry(0.68, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0xdcfce7,
      metalness: 0.0,
      roughness: 0.07,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.34 : 1.0,
      ior: 1.72,
      thickness: 1.4,
      attenuationColor: new THREE.Color(theme.attenuationHex),
      attenuationDistance: 1.35,
      clearcoat: 1.0,
      depthWrite: false,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.renderOrder = 2;
    crystalMesh.userData.inspectInfo = {
      kind: 'core',
      title: 'Chiat-Ratchet Vault Core',
      subtitle: `Active Epoch #${keyEpochRef.current} · AES-256-GCM`,
      meta: `${devicesRef.current.length} linked sessions · ${vaultBlobsRef.current.length} pinned CID blobs`,
    } satisfies SelectedNodeInfo;
    clickableMeshes.push(crystalMesh);
    crystalGroup.add(crystalMesh);

    // Part F: Inner Ratchet Cage Filament
    const cageGeo = new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.75, 0));
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.55,
    });
    const cageMesh = new THREE.LineSegments(cageGeo, cageMat);
    crystalGroup.add(cageMesh);

    // Part G: Luminous Singularity Core
    const coreInnerGroup = new THREE.Group();
    coreInnerGroup.position.y = baseCoreY;
    vaultCoreGroup.add(coreInnerGroup);

    const coreGeo = new THREE.DodecahedronGeometry(0.34, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: theme.coreHex,
      emissive: theme.coreHex,
      emissiveIntensity: 0.75,
      metalness: 0.35,
      roughness: 0.18,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreInnerGroup.add(coreMesh);

    // Part H: Crown Beacon Assembly
    const crownGroup = new THREE.Group();
    crownGroup.position.y = baseCoreY + 1.08;
    vaultCoreGroup.add(crownGroup);

    const crownProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.32, 0.0),
      new THREE.Vector2(0.24, 0.12),
      new THREE.Vector2(0.14, 0.2),
      new THREE.Vector2(0.0, 0.24),
    ];
    const crownMesh = new THREE.Mesh(
      new THREE.LatheGeometry(crownProfile, 32),
      pedestalMat
    );
    crownGroup.add(crownMesh);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: theme.coreHex,
      emissive: theme.coreHex,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const beaconOrb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), beaconMat);
    beaconOrb.position.y = 0.26;
    crownGroup.add(beaconOrb);

    // 3. Orbiting Linked Device Nodes (Composite 4-part hardware models) + Encrypted Conduits
    const deviceOrbitGroup = new THREE.Group();
    scene.add(deviceOrbitGroup);

    const conduitMats: THREE.MeshStandardMaterial[] = [];
    const conduitCurves: THREE.CatmullRomCurve3[] = [];

    const effectiveDevices =
      devicesRef.current.length > 0
        ? devicesRef.current
        : [
            {
              id: 'dev_primary',
              name: 'Primary Web Session',
              platform: 'Web' as const,
              lastSyncAt: Date.now(),
              connectedAt: Date.now(),
              isOnline: true,
              fingerprint: '48291 09412 77310 55192',
            },
          ];

    const deviceChassisMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.5,
    });
    const deviceScreenMatOnline = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x10b981,
      emissiveIntensity: 0.45,
      roughness: 0.15,
      metalness: 0.2,
    });
    const deviceScreenMatOffline = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x64748b,
      emissiveIntensity: 0.2,
      roughness: 0.3,
    });

    effectiveDevices.forEach((dev, idx) => {
      const angle = (idx / effectiveDevices.length) * Math.PI * 2 + 0.35;
      const radius = 3.85;
      const elevation = 1.2 + (idx % 2) * 0.42;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(x, elevation, z);
      nodeGroup.lookAt(0, baseCoreY, 0);

      // Part 1: Hardware Chassis
      const isMobile = dev.platform === 'iOS';
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(isMobile ? 0.34 : 0.62, isMobile ? 0.62 : 0.44, 0.08),
        deviceChassisMat
      );
      chassis.castShadow = true;
      chassis.userData.inspectInfo = {
        kind: 'device',
        title: dev.name,
        subtitle: `${dev.platform} · ${dev.isOnline ? 'WebSocket Synced' : 'Standby'}`,
        meta: `Key FP: ${dev.fingerprint}`,
      } satisfies SelectedNodeInfo;
      clickableMeshes.push(chassis);
      nodeGroup.add(chassis);

      // Part 2: Illuminated Display Face
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(isMobile ? 0.28 : 0.54, isMobile ? 0.54 : 0.36, 0.02),
        dev.isOnline ? deviceScreenMatOnline : deviceScreenMatOffline
      );
      screen.position.z = 0.045;
      nodeGroup.add(screen);

      // Part 3: Dock Ring Halo
      const dockRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.018, 12, 36),
        ribMat
      );
      dockRing.rotation.x = Math.PI / 2;
      dockRing.position.y = -0.36;
      nodeGroup.add(dockRing);

      // Part 4: Relay Antenna Pin
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.022, 0.22, 10),
        ribMat
      );
      antenna.position.set(0, isMobile ? 0.4 : 0.31, 0);
      nodeGroup.add(antenna);

      deviceOrbitGroup.add(nodeGroup);

      // Encrypted Chiat-Ratchet Relay Conduit from device to Vault Core
      const midPoint = new THREE.Vector3(
        x * 0.52,
        Math.max(elevation, baseCoreY) + 0.55,
        z * 0.52
      );
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, elevation, z),
        midPoint,
        new THREE.Vector3(0, baseCoreY, 0),
      ]);
      conduitCurves.push(curve);

      const conduitGeo = new THREE.TubeGeometry(curve, 32, 0.02, 8, false);
      const conduitMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: theme.coreHex,
        emissiveIntensity: dev.isOnline ? 0.35 : 0.12,
        roughness: 0.3,
        metalness: 0.7,
      });
      conduitMats.push(conduitMat);
      const conduitMesh = new THREE.Mesh(conduitGeo, conduitMat);
      deviceOrbitGroup.add(conduitMesh);
    });

    // Instanced animated encrypted packets gliding along conduits
    const packetsPerConduit = 3;
    const totalPackets = conduitCurves.length * packetsPerConduit;
    const packetGeo = new THREE.SphereGeometry(0.055, 12, 12);
    const packetMat = new THREE.MeshStandardMaterial({
      color: theme.coreHex,
      emissive: theme.coreHex,
      emissiveIntensity: 1.2,
      roughness: 0.15,
    });
    const packetMesh = new THREE.InstancedMesh(packetGeo, packetMat, Math.max(1, totalPackets));
    packetMesh.frustumCulled = false;
    deviceOrbitGroup.add(packetMesh);

    // 4. Decentralized CID Vault Storage Pods (Outer Ring)
    const blobPodsGroup = new THREE.Group();
    scene.add(blobPodsGroup);

    const visibleBlobs = vaultBlobsRef.current.slice(0, 12);
    const podCapMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.88,
      roughness: 0.25,
    });

    visibleBlobs.forEach((blob, idx) => {
      const ang = (idx / Math.max(1, visibleBlobs.length)) * Math.PI * 2;
      const r = 5.45;
      const y = 0.78 + Math.sin(idx * 1.4) * 0.22;

      const podGroup = new THREE.Group();
      podGroup.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);

      const isImage = blob.mimeType.startsWith('image/');
      const isAudio = blob.mimeType.startsWith('audio/');
      const podColor = isImage ? 0x38bdf8 : isAudio ? 0xf59e0b : 0x10b981;

      const podCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.24, 0),
        new THREE.MeshPhysicalMaterial({
          color: podColor,
          emissive: podColor,
          emissiveIntensity: 0.28,
          metalness: 0.2,
          roughness: 0.18,
          clearcoat: 0.9,
        })
      );
      podCrystal.userData.inspectInfo = {
        kind: 'blob',
        title: blob.name,
        subtitle: `CID ${blob.cid.slice(0, 20)}...`,
        meta: `${(blob.sizeBytes / 1024).toFixed(1)} KB · ${blob.storageNodes.length} pinned nodes`,
      } satisfies SelectedNodeInfo;
      clickableMeshes.push(podCrystal);
      podGroup.add(podCrystal);

      const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.09, 8), podCapMat);
      topCap.position.y = 0.24;
      podGroup.add(topCap);

      const botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.09, 8), podCapMat);
      botCap.position.y = -0.24;
      podGroup.add(botCap);

      blobPodsGroup.add(podGroup);
    });

    finishMaterialsRef.current = {
      coreMat,
      crystalMat,
      gimbalOuterMat,
      beaconMat,
      packetMat,
      conduitMats,
    };

    // Raycasting for click inspection and hover cursor
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved > 6) return;
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const info = hit.object.userData.inspectInfo as SelectedNodeInfo | undefined;
        if (info) {
          selectCallbackRef.current(info);
          hit.object.getWorldPosition(_vec3);
          cameraTransitionRef.current.target.copy(_vec3);
          cameraTransitionRef.current.pos.set(
            _vec3.x + (_vec3.x >= 0 ? 2.4 : -2.4),
            _vec3.y + 1.45,
            _vec3.z + 3.1
          );
          cameraTransitionRef.current.active = true;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // ResizeObserver for crisp layout adaptation
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 300;
      const h = container.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let explodeCurrent = 0;
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

      // Smoothly damp exploded view separation
      explodeCurrent = THREE.MathUtils.damp(explodeCurrent, explodeTargetRef.current, 6, dt);
      gimbalOuterGroup.position.y = baseCoreY + explodeCurrent * 0.45;
      gimbalInnerGroup.position.y = baseCoreY + explodeCurrent * 0.88;
      crystalGroup.position.y = baseCoreY + explodeCurrent * 1.32;
      coreInnerGroup.position.y = baseCoreY + explodeCurrent * 1.75;
      crownGroup.position.y = baseCoreY + 1.08 + explodeCurrent * 2.18;
      ribAnchors.forEach((anchor, i) => {
        const angle = (i * Math.PI) / 2;
        anchor.position.set(
          Math.cos(angle) * explodeCurrent * 0.35,
          explodeCurrent * 0.15,
          Math.sin(angle) * explodeCurrent * 0.35
        );
      });

      // Smooth sync / epoch burst decay
      pulseBoostRef.current = THREE.MathUtils.damp(pulseBoostRef.current, 0, 3.2, dt);
      const speedMul = 1 + pulseBoostRef.current * 2.5;

      // Rotate Vault Core components smoothly
      gimbalOuterGroup.rotation.y += dt * 0.28 * speedMul * motionScale;
      gimbalOuterGroup.rotation.x = Math.sin(elapsed * 0.45) * 0.18 * motionScale;
      gimbalInnerGroup.rotation.z -= dt * 0.42 * speedMul * motionScale;
      gimbalInnerGroup.rotation.y += dt * 0.22 * speedMul * motionScale;
      crystalGroup.rotation.y += dt * 0.24 * speedMul * motionScale;
      coreInnerGroup.rotation.y -= dt * 0.65 * speedMul * motionScale;
      coreInnerGroup.rotation.x += dt * 0.3 * motionScale;

      // Gently orbit CID pods
      blobPodsGroup.rotation.y += dt * 0.08 * motionScale;

      // Update animated encrypted packets gliding along conduits
      let packetIdx = 0;
      for (let c = 0; c < conduitCurves.length; c++) {
        const curve = conduitCurves[c];
        for (let p = 0; p < packetsPerConduit; p++) {
          const t = ((elapsed * 0.34 * speedMul + p / packetsPerConduit + c * 0.17) % 1 + 1) % 1;
          curve.getPointAt(t, _packetPos);
          const s = 0.75 + Math.sin(t * Math.PI) * 0.45 + pulseBoostRef.current * 0.35;
          _packetScale.setScalar(s);
          _packetMatrix.compose(_packetPos, _packetQuat, _packetScale);
          packetMesh.setMatrixAt(packetIdx++, _packetMatrix);
        }
      }
      packetMesh.instanceMatrix.needsUpdate = true;

      // Smooth camera preset / inspection fly-to
      if (cameraTransitionRef.current.active) {
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          cameraTransitionRef.current.pos.x,
          5.2,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          cameraTransitionRef.current.pos.y,
          5.2,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          cameraTransitionRef.current.pos.z,
          5.2,
          dt
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          cameraTransitionRef.current.target.x,
          5.2,
          dt
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          cameraTransitionRef.current.target.y,
          5.2,
          dt
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          cameraTransitionRef.current.target.z,
          5.2,
          dt
        );
        if (
          camera.position.distanceToSquared(cameraTransitionRef.current.pos) < 0.002 &&
          controls.target.distanceToSquared(cameraTransitionRef.current.target) < 0.002
        ) {
          cameraTransitionRef.current.active = false;
        }
      }

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
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      disposeObject3D(scene);
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [sceneTopologyKey]);

  const applyCameraPreset = (presetId: CameraPresetId) => {
    setActivePreset(presetId);
    const p = CAMERA_PRESETS[presetId];
    cameraTransitionRef.current.pos.set(...p.pos);
    cameraTransitionRef.current.target.set(...p.target);
    cameraTransitionRef.current.active = true;
  };

  const handleTriggerRotateEpoch = async () => {
    if (!activeConversation || rotatingKey) return;
    setRotatingKey(true);
    pulseBoostRef.current = 2.0;
    try {
      await onRotateKeyEpoch(activeConversation.id);
    } finally {
      setRotatingKey(false);
    }
  };

  const handleTriggerSync = () => {
    setSyncPulseNonce((n) => n + 1);
    onForceSync();
  };

  return (
    <div className="relative flex-1 h-full min-w-0 bg-[#090C10] overflow-hidden select-none">
      {/* Dedicated isolated WebGL canvas mount */}
      {webglUnavailable ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#090C10]">
          <div className="w-16 h-16 rounded-2xl bg-[#10151C] border border-white/[0.08] flex items-center justify-center text-emerald-400 mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            3D Spatial Vault Topology
          </h2>
          <p className="text-sm text-slate-400 max-w-md mt-2">
            Hardware WebGL context is currently unavailable in this browser session. Your encrypted mesh ({devices.length} devices · {vaultBlobs.length} CID blobs) remains active.
          </p>
        </div>
      ) : (
        <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />
      )}

      {/* Top-Left Minimal Spec Readout (solid rgba backing, no backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-5 left-5 z-10 max-w-sm space-y-2.5">
        <div
          className="pointer-events-auto rounded-xl border border-white/[0.09] px-4 py-3 shadow-xl"
          style={{ backgroundColor: 'rgba(13, 17, 23, 0.92)' }}
        >
          <h1 className="font-display text-sm font-semibold text-slate-100 tracking-tight">
            3D Cryptographic Vault & Mesh
          </h1>
          <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
            {devices.length} devices · {vaultBlobs.length} CID pods ·{' '}
            {(totalVaultBytes / (1024 * 1024)).toFixed(2)} MB · Epoch #
            {activeConversation?.keyEpoch || 1}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Drag to orbit · Scroll to zoom · Click any 3D node to inspect
          </p>
        </div>

        {selectedNode && (
          <div
            className="pointer-events-auto rounded-xl border border-emerald-500/35 px-4 py-3 shadow-xl"
            style={{ backgroundColor: 'rgba(13, 17, 23, 0.95)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-300 truncate">
                  {selectedNode.title}
                </p>
                <p className="text-xs text-slate-200 mt-0.5 truncate">{selectedNode.subtitle}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-1 truncate tabular-nums">
                  {selectedNode.meta}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                aria-label="Close node readout"
                className="w-6 h-6 rounded-md hover:bg-white/[0.08] flex items-center justify-center text-slate-400 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 z-20 transition-transform duration-300 ease-out ${
          dockCollapsed ? 'bottom-0 translate-y-[calc(100%-36px)]' : 'bottom-5 translate-y-0'
        }`}
        style={{ width: 'min(940px, 94vw)' }}
      >
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="h-8 px-3.5 rounded-lg border border-white/[0.1] text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap"
            style={{ backgroundColor: 'rgba(13, 17, 23, 0.94)' }}
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hide Controls (H)</span>
              </>
            )}
          </button>
        </div>

        <div
          className="rounded-2xl border border-white/[0.1] p-3.5 shadow-2xl space-y-3"
          style={{ backgroundColor: 'rgba(13, 17, 23, 0.94)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Exploded View Slider */}
            <div className="flex items-center gap-3 min-w-[200px] flex-1">
              <label
                htmlFor="vault-explode-slider"
                className="text-xs font-medium text-slate-300 whitespace-nowrap"
              >
                Exploded Layers
              </label>
              <input
                id="vault-explode-slider"
                type="range"
                min={0}
                max={100}
                value={explodeAmount}
                onChange={(e) => setExplodeAmount(Number(e.target.value))}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-emerald-300 w-9 text-right">
                {explodeAmount}%
              </span>
            </div>

            {/* Camera Presets */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#090C10] border border-white/[0.07]">
              {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
                <button
                  key={pid}
                  type="button"
                  onClick={() => applyCameraPreset(pid)}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activePreset === pid
                      ? 'bg-[#1A222D] text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {CAMERA_PRESETS[pid].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
            {/* Material Finishes */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 mr-1">Finish:</span>
              {(Object.keys(FINISH_THEMES) as MaterialFinishId[]).map((fid) => {
                const f = FINISH_THEMES[fid];
                const isActive = finishId === fid;
                return (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => setFinishId(fid)}
                    className={`h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#1A222D] border-emerald-500/40 text-slate-100'
                        : 'bg-[#090C10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: f.swatch }}
                    />
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Real Cryptographic Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleTriggerSync}
                className="h-8 px-3 rounded-lg bg-[#161E29] hover:bg-[#1E2837] border border-white/[0.09] text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sync Pulse</span>
              </button>
              <button
                type="button"
                onClick={handleTriggerRotateEpoch}
                disabled={!activeConversation || rotatingKey}
                className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-[#05110B] text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <RotateCw className={`w-3.5 h-3.5 ${rotatingKey ? 'animate-spin' : ''}`} />
                <span>{rotatingKey ? 'Rotating...' : 'Rotate Key Epoch'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
