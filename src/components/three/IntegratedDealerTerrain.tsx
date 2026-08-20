'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Info, Maximize2, RotateCcw, Play, Pause, Eye, Check } from 'lucide-react';
import { TerrainGridCell, DealerEnvironmentSummaryData } from '@/lib/dashboard/types';

interface IntegratedDealerTerrainProps {
    surfaceGrid: TerrainGridCell[][];
    summary: DealerEnvironmentSummaryData;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    onHoverCell?: (cell: TerrainGridCell | null) => void;
    onClickCell?: (cell: TerrainGridCell) => void;
}

export default function IntegratedDealerTerrain({
    surfaceGrid,
    summary,
    strikes,
    expirations,
    dtes,
    onHoverCell,
    onClickCell,
}: IntegratedDealerTerrainProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const rootGroupRef = useRef<THREE.Group | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Layer Visibility States
    const [showGex, setShowGex] = useState(true);
    const [showVanna, setShowVanna] = useState(true);
    const [showCharm, setShowCharm] = useState(true);
    const [showSpot, setShowSpot] = useState(true);
    const [showDealerLevels, setShowDealerLevels] = useState(true);
    const [showZeroPlane, setShowZeroPlane] = useState(true);
    const [showWireframe, setShowWireframe] = useState(true);
    const [isRotating, setIsRotating] = useState(false);
    const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
    const [hoveredData, setHoveredData] = useState<TerrainGridCell | null>(null);

    // Three.js object group references for selective toggles
    const gexGroupRef = useRef<THREE.Group>(new THREE.Group());
    const vannaGroupRef = useRef<THREE.Group>(new THREE.Group());
    const charmGroupRef = useRef<THREE.Group>(new THREE.Group());
    const spotGroupRef = useRef<THREE.Group>(new THREE.Group());
    const levelsGroupRef = useRef<THREE.Group>(new THREE.Group());
    const zeroPlaneGroupRef = useRef<THREE.Group>(new THREE.Group());

    // Sync visibility toggles to Three groups
    useEffect(() => {
        gexGroupRef.current.visible = showGex;
    }, [showGex]);

    useEffect(() => {
        vannaGroupRef.current.visible = showVanna;
    }, [showVanna]);

    useEffect(() => {
        charmGroupRef.current.visible = showCharm;
    }, [showCharm]);

    useEffect(() => {
        spotGroupRef.current.visible = showSpot;
    }, [showSpot]);

    useEffect(() => {
        levelsGroupRef.current.visible = showDealerLevels;
    }, [showDealerLevels]);

    useEffect(() => {
        zeroPlaneGroupRef.current.visible = showZeroPlane;
    }, [showZeroPlane]);

    // Dimensions in Three.js world coordinates
    const WORLD_WIDTH = 26;   // Strike axis (X)
    const WORLD_DEPTH = 18;   // Expiry/DTE axis (Z)
    const MAX_HEIGHT = 7.5;   // GEX amplitude (Y)
    const GEX_SCALE_MAX = 8e9; // 8B baseline

    // Map Strike to World X
    const strikeToX = (strike: number) => {
        if (!strikes || strikes.length === 0) return 0;
        const minS = strikes[0];
        const maxS = strikes[strikes.length - 1];
        const norm = (strike - minS) / (maxS - minS || 1);
        return -WORLD_WIDTH / 2 + norm * WORLD_WIDTH;
    };

    // Map DTE to World Z
    const dteToZ = (dte: number) => {
        if (!dtes || dtes.length === 0) return 0;
        const minD = dtes[0];
        const maxD = dtes[dtes.length - 1];
        const norm = (dte - minD) / (maxD - minD || 1);
        return -WORLD_DEPTH / 2 + norm * WORLD_DEPTH;
    };

    // Initialize Three.js Scene
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // 1. Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x060a12);
        scene.fog = new THREE.FogExp2(0x060a12, 0.01);

        // 2. Camera: Positioned precisely like the reference 3D angled perspective
        const camera = new THREE.PerspectiveCamera(
            38,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        camera.position.set(22, 17, 30);
        cameraRef.current = camera;

        // 3. Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.3;
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 4. Orbit Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.maxDistance = 120;
        controls.minDistance = 8;
        controls.maxPolarAngle = Math.PI / 2 + 0.1;
        controls.target.set(0, 0, 0);
        controlsRef.current = controls;

        // 5. Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x00e676, 1.8);
        dirLight1.position.set(15, 30, 15);
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xff1744, 1.5);
        dirLight2.position.set(-15, -15, -15);
        scene.add(dirLight2);

        const topLight = new THREE.PointLight(0x38bdf8, 1.2, 80);
        topLight.position.set(0, 20, 0);
        scene.add(topLight);

        // 6. Master Groups
        const rootGroup = new THREE.Group();
        scene.add(rootGroup);
        rootGroupRef.current = rootGroup;

        rootGroup.add(gexGroupRef.current);
        rootGroup.add(vannaGroupRef.current);
        rootGroup.add(charmGroupRef.current);
        rootGroup.add(spotGroupRef.current);
        rootGroup.add(levelsGroupRef.current);
        rootGroup.add(zeroPlaneGroupRef.current);

        // 7. Render Loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);

            if (isRotating && rootGroupRef.current) {
                rootGroupRef.current.rotation.y += 0.002;
            }

            controls.update();
            renderer.render(scene, camera);
        };

        animate();

        // 8. Resize Listener
        const handleResize = () => {
            if (!container || !renderer || !camera) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            renderer.dispose();
        };
    }, []);

    // Rebuild 3D Meshes when data changes
    useEffect(() => {
        if (!surfaceGrid || surfaceGrid.length === 0 || strikes.length === 0 || dtes.length === 0) return;

        const gexGroup = gexGroupRef.current;
        const vannaGroup = vannaGroupRef.current;
        const charmGroup = charmGroupRef.current;
        const spotGroup = spotGroupRef.current;
        const levelsGroup = levelsGroupRef.current;
        const zeroPlaneGroup = zeroPlaneGroupRef.current;

        // Clear all existing children
        [gexGroup, vannaGroup, charmGroup, spotGroup, levelsGroup, zeroPlaneGroup].forEach((grp) => {
            while (grp.children.length > 0) {
                const child = grp.children[0];
                grp.remove(child);
                if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
            }
        });

        const numDtes = surfaceGrid.length;
        const numStrikes = surfaceGrid[0].length;

        // ==========================================
        // 1. GEX TERRAIN MESH (Solid + Shaded + Wireframe)
        // ==========================================
        const geometry = new THREE.PlaneGeometry(
            WORLD_WIDTH,
            WORLD_DEPTH,
            numStrikes - 1,
            numDtes - 1
        );
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position;
        const colors: number[] = [];

        // Build vertex heights and colors
        for (let i = 0; i < numDtes; i++) {
            for (let j = 0; j < numStrikes; j++) {
                const vertexIndex = i * numStrikes + j;
                const cell = surfaceGrid[i][j];
                const gex = cell.gex;

                // Height Y
                const heightY = (gex / GEX_SCALE_MAX) * MAX_HEIGHT;
                positions.setY(vertexIndex, heightY);

                // Vertex Color (Emerald green for positive, Ruby crimson for negative)
                const color = new THREE.Color();
                if (gex >= 0) {
                    const t = Math.min(1, gex / GEX_SCALE_MAX);
                    // Glowing emerald green / cyan
                    color.setRGB(0.02 + 0.1 * (1 - t), 0.7 + 0.3 * t, 0.35 + 0.5 * t);
                } else {
                    const t = Math.min(1, Math.abs(gex) / GEX_SCALE_MAX);
                    // Glowing crimson red
                    color.setRGB(0.85 + 0.15 * t, 0.08, 0.22 + 0.1 * (1 - t));
                }
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // Shaded Standard Material
        const surfaceMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.3,
            metalness: 0.35,
            side: THREE.DoubleSide,
            flatShading: false,
        });

        const surfaceMesh = new THREE.Mesh(geometry, surfaceMat);
        gexGroup.add(surfaceMesh);

        // Neon Wireframe Grid Overlay
        if (showWireframe) {
            const wireframeMat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                wireframe: true,
                transparent: true,
                opacity: 0.35,
            });
            const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMat);
            wireframeMesh.position.y += 0.015;
            gexGroup.add(wireframeMesh);
        }

        // ==========================================
        // 2. VANNA CONTOURS (Glowing Purple Lines)
        // ==========================================
        for (let i = 0; i < numDtes; i++) {
            const linePoints: THREE.Vector3[] = [];
            for (let j = 0; j < numStrikes; j++) {
                const cell = surfaceGrid[i][j];
                const x = strikeToX(cell.strike);
                const z = dteToZ(cell.dte);
                const y = (cell.gex / GEX_SCALE_MAX) * MAX_HEIGHT + 0.06;
                linePoints.push(new THREE.Vector3(x, y, z));
            }

            const contourGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const contourMat = new THREE.LineBasicMaterial({
                color: 0xc084fc, // Soft purple / magenta
                transparent: true,
                opacity: 0.75,
                linewidth: 2,
            });
            const contourLine = new THREE.Line(contourGeo, contourMat);
            vannaGroup.add(contourLine);
        }

        // Cross Vanna Isobars along strikes
        for (let j = 0; j < numStrikes; j += 2) {
            const linePoints: THREE.Vector3[] = [];
            for (let i = 0; i < numDtes; i++) {
                const cell = surfaceGrid[i][j];
                const x = strikeToX(cell.strike);
                const z = dteToZ(cell.dte);
                const y = (cell.gex / GEX_SCALE_MAX) * MAX_HEIGHT + 0.06;
                linePoints.push(new THREE.Vector3(x, y, z));
            }
            const contourGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const contourMat = new THREE.LineBasicMaterial({
                color: 0xa855f7,
                transparent: true,
                opacity: 0.45,
            });
            const contourLine = new THREE.Line(contourGeo, contourMat);
            vannaGroup.add(contourLine);
        }

        // ==========================================
        // 3. CHARM FLOW VECTORS (Directional Orange Flow Arrows)
        // ==========================================
        const arrowStep = 2;
        for (let i = 0; i < numDtes; i += arrowStep) {
            for (let j = 0; j < numStrikes; j += arrowStep) {
                const cell = surfaceGrid[i][j];
                const x = strikeToX(cell.strike);
                const z = dteToZ(cell.dte);
                const y = (cell.gex / GEX_SCALE_MAX) * MAX_HEIGHT + 0.15;

                // Charm vector direction (time decay flow towards spot / lower DTE)
                const dirX = cell.strike > summary.spotPrice ? -0.8 : 0.8;
                const dirZ = -0.5; // Flowing towards expiration
                const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();

                const arrowLength = 0.9;
                const arrowHelper = new THREE.ArrowHelper(
                    dir,
                    new THREE.Vector3(x, y, z),
                    arrowLength,
                    0xff9100, // Vibrant glowing amber/orange
                    0.35,
                    0.2
                );
                charmGroup.add(arrowHelper);
            }
        }

        // ==========================================
        // 4. ZERO PLANE & AXES GRID
        // ==========================================
        const zeroPlaneGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
        zeroPlaneGeo.rotateX(-Math.PI / 2);
        const zeroPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x1a2638,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
        });
        const zeroMesh = new THREE.Mesh(zeroPlaneGeo, zeroPlaneMat);
        zeroMesh.position.y = 0;
        zeroPlaneGroup.add(zeroMesh);

        // Zero Plane Border Line
        const zeroEdgesGeo = new THREE.EdgesGeometry(zeroPlaneGeo);
        const zeroEdgesMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.6,
        });
        const zeroEdges = new THREE.LineSegments(zeroEdgesGeo, zeroEdgesMat);
        zeroEdges.position.y = 0;
        zeroPlaneGroup.add(zeroEdges);

        // ==========================================
        // 5. SPOT PRICE VERTICAL BEACON
        // ==========================================
        const spotX = strikeToX(summary.spotPrice);
        const spotPoints = [
            new THREE.Vector3(spotX, -MAX_HEIGHT - 1, -WORLD_DEPTH / 2 - 0.5),
            new THREE.Vector3(spotX, MAX_HEIGHT + 2, -WORLD_DEPTH / 2 - 0.5),
            new THREE.Vector3(spotX, MAX_HEIGHT + 2, WORLD_DEPTH / 2 + 0.5),
            new THREE.Vector3(spotX, -MAX_HEIGHT - 1, WORLD_DEPTH / 2 + 0.5),
        ];
        const spotLineGeo = new THREE.BufferGeometry().setFromPoints(spotPoints);
        const spotLineMat = new THREE.LineDashedMaterial({
            color: 0xffffff,
            dashSize: 0.5,
            gapSize: 0.3,
            linewidth: 2,
        });
        const spotLine = new THREE.LineLoop(spotLineGeo, spotLineMat);
        spotLine.computeLineDistances();
        spotGroup.add(spotLine);

        // Glowing Spot Center Beacon
        const spotSphereGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const spotSphereMat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
        const spotSphere = new THREE.Mesh(spotSphereGeo, spotSphereMat);
        spotSphere.position.set(spotX, MAX_HEIGHT + 2, 0);
        spotGroup.add(spotSphere);

        // ==========================================
        // 6. DEALER LEVEL MARKER LINES IN 3D
        // ==========================================
        const addLevelLine = (strike: number, colorHex: number) => {
            const x = strikeToX(strike);
            const pts = [
                new THREE.Vector3(x, -MAX_HEIGHT - 0.5, -WORLD_DEPTH / 2),
                new THREE.Vector3(x, MAX_HEIGHT + 1.5, -WORLD_DEPTH / 2),
                new THREE.Vector3(x, MAX_HEIGHT + 1.5, WORLD_DEPTH / 2),
                new THREE.Vector3(x, -MAX_HEIGHT - 0.5, WORLD_DEPTH / 2),
            ];
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.4,
            });
            const line = new THREE.LineLoop(geo, mat);
            levelsGroup.add(line);
        };

        addLevelLine(summary.callWall, 0x00e676); // Call Wall (Green)
        addLevelLine(summary.putWall, 0xff1744);  // Put Wall (Red)
        addLevelLine(summary.gammaFlip, 0x00e5ff); // Gamma Flip (Blue)
        addLevelLine(summary.maxPain, 0xff9100);  // Max Pain (Orange)

    }, [surfaceGrid, strikes, dtes, summary, showWireframe]);

    // View Angle Switcher
    const handleSetView = (mode: '3d' | '2d') => {
        setViewMode(mode);
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;

        setIsRotating(false);

        if (mode === '2d') {
            camera.position.set(0, 36, 0.01);
            controls.target.set(0, 0, 0);
        } else {
            camera.position.set(22, 17, 30);
            controls.target.set(0, 0, 0);
        }
        camera.lookAt(0, 0, 0);
        controls.update();
    };

    const handleResetCamera = () => {
        handleSetView('3d');
        if (rootGroupRef.current) {
            rootGroupRef.current.rotation.set(0, 0, 0);
        }
    };

    return (
        <div className="relative w-full h-[520px] rounded-xl bg-[#080d16] border border-[#151f30] overflow-hidden flex flex-col select-none shadow-2xl">
            {/* 3D WebGL Canvas Viewport */}
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Top Header Bar inside 3D Viewport */}
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                {/* Title */}
                <div className="flex items-center gap-2 pointer-events-auto">
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        INTEGRATED DEALER TERRAIN
                    </h2>
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-pointer hover:text-cyan-400 transition-colors" />
                </div>

                {/* View Switchers (3D / 2D / Fullscreen / Camera Controls) */}
                <div className="flex items-center gap-1.5 bg-[#0c1422]/90 backdrop-blur-md p-1 rounded-lg border border-[#1a273b] pointer-events-auto shadow-lg text-[11px] font-mono">
                    <button
                        onClick={() => handleSetView('3d')}
                        className={`px-2.5 py-1 rounded font-bold transition-all ${
                            viewMode === '3d'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        3D
                    </button>
                    <button
                        onClick={() => handleSetView('2d')}
                        className={`px-2.5 py-1 rounded font-bold transition-all ${
                            viewMode === '2d'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        2D
                    </button>

                    <div className="w-[1px] h-3.5 bg-zinc-800 mx-1" />

                    {/* Auto-rotation Toggle */}
                    <button
                        onClick={() => setIsRotating(!isRotating)}
                        className={`p-1 rounded transition-colors ${
                            isRotating ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title={isRotating ? 'Pause Rotation' : 'Auto Rotate'}
                    >
                        {isRotating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    {/* Wireframe Toggle */}
                    <button
                        onClick={() => setShowWireframe(!showWireframe)}
                        className={`p-1 rounded transition-colors ${
                            showWireframe ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Toggle Wireframe Grid"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Reset Camera */}
                    <button
                        onClick={handleResetCamera}
                        className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                        title="Reset Camera"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    <button className="p-1 rounded text-zinc-400 hover:text-white transition-colors" title="Expand View">
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Left Overlay: Metrics Legend & Layer Checkboxes */}
            <div className="absolute top-12 left-4 flex flex-col gap-3 pointer-events-none z-10">
                {/* Metrics Toggles */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2.5 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto space-y-1.5 text-[10px] font-mono">
                    <div className="text-zinc-400 font-bold uppercase tracking-wider mb-1">METRICS</div>

                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={showGex}
                            onChange={(e) => setShowGex(e.target.checked)}
                            className="hidden"
                        />
                        <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                            showGex ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-zinc-700'
                        }`}>
                            {showGex && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-1.5 rounded-xs bg-emerald-400" />
                            <span className="text-zinc-200">GEX (Surface)</span>
                        </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={showVanna}
                            onChange={(e) => setShowVanna(e.target.checked)}
                            className="hidden"
                        />
                        <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                            showVanna ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'border-zinc-700'
                        }`}>
                            {showVanna && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-0.5 bg-purple-400" />
                            <span className="text-zinc-200">Vanna (Contours)</span>
                        </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={showCharm}
                            onChange={(e) => setShowCharm(e.target.checked)}
                            className="hidden"
                        />
                        <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                            showCharm ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'border-zinc-700'
                        }`}>
                            {showCharm && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-amber-400 text-xs leading-none">→</span>
                            <span className="text-zinc-200">Charm (Flow)</span>
                        </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={showZeroPlane}
                            onChange={(e) => setShowZeroPlane(e.target.checked)}
                            className="hidden"
                        />
                        <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                            showZeroPlane ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'border-zinc-700'
                        }`}>
                            {showZeroPlane && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-0.5 border-b border-dashed border-zinc-400" />
                            <span className="text-zinc-200">Zero Plane</span>
                        </div>
                    </label>
                </div>

                {/* Scale (GEX) Vertical Bar */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2.5 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto text-[9px] font-mono space-y-1">
                    <div className="text-zinc-400 font-bold uppercase tracking-wider">SCALE (GEX)</div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-16 rounded-full bg-gradient-to-b from-[#00e676] via-[#1a2638] to-[#ff1744]" />
                        <div className="flex flex-col justify-between h-16 text-zinc-300 font-bold">
                            <span className="text-emerald-400">+ 8.0B</span>
                            <span className="text-zinc-400">0</span>
                            <span className="text-rose-400">- 8.0B</span>
                        </div>
                    </div>
                    <div className="text-[8px] text-zinc-400 pt-0.5">Exposure (USD)</div>
                </div>
            </div>

            {/* Persistent Floating 3D Landmark Banners (Overlay positioning) */}
            <div className="absolute inset-0 pointer-events-none z-10">
                {/* PUT WALL Banner */}
                <div className="absolute top-[8%] left-[29%] -translate-x-1/2 flex flex-col items-center">
                    <div className="px-2 py-0.5 rounded bg-[#1a080c] border border-rose-500/80 shadow-lg shadow-rose-950/60 flex flex-col items-center">
                        <span className="text-[9px] font-mono font-bold text-rose-400 tracking-wider">PUT WALL</span>
                        <span className="text-[11px] font-mono font-black text-rose-200">
                            {summary.putWall.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-rose-500 to-transparent" />
                </div>

                {/* GAMMA FLIP Banner */}
                <div className="absolute top-[8%] left-[40%] -translate-x-1/2 flex flex-col items-center">
                    <div className="px-2 py-0.5 rounded bg-[#08121a] border border-cyan-500/80 shadow-lg shadow-cyan-950/60 flex flex-col items-center">
                        <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider">GAMMA FLIP</span>
                        <span className="text-[11px] font-mono font-black text-cyan-200">
                            {summary.gammaFlip.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-cyan-500 to-transparent" />
                </div>

                {/* SPOT PRICE Center Dominant Banner */}
                <div className="absolute top-[6%] left-[49%] -translate-x-1/2 flex flex-col items-center">
                    <div className="px-3 py-1 rounded-lg bg-[#0e1626] border-2 border-white shadow-xl shadow-cyan-500/20 flex flex-col items-center">
                        <span className="text-[9px] font-mono font-bold text-zinc-300 tracking-widest uppercase">SPOT PRICE</span>
                        <span className="text-xs font-mono font-black text-white tracking-tight">
                            {summary.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                    </div>
                    <div className="w-[1px] h-6 bg-gradient-to-b from-white to-transparent" />
                </div>

                {/* MAX PAIN Banner */}
                <div className="absolute top-[8%] left-[58%] -translate-x-1/2 flex flex-col items-center">
                    <div className="px-2 py-0.5 rounded bg-[#1a1408] border border-amber-500/80 shadow-lg shadow-amber-950/60 flex flex-col items-center">
                        <span className="text-[9px] font-mono font-bold text-amber-400 tracking-wider">MAX PAIN</span>
                        <span className="text-[11px] font-mono font-black text-amber-200">
                            {summary.maxPain.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-amber-500 to-transparent" />
                </div>

                {/* CALL WALL Banner */}
                <div className="absolute top-[8%] left-[68%] -translate-x-1/2 flex flex-col items-center">
                    <div className="px-2 py-0.5 rounded bg-[#081a10] border border-emerald-500/80 shadow-lg shadow-emerald-950/60 flex flex-col items-center">
                        <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider">CALL WALL</span>
                        <span className="text-[11px] font-mono font-black text-emerald-200">
                            {summary.callWall.toLocaleString()}
                        </span>
                    </div>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-emerald-500 to-transparent" />
                </div>

                {/* 3D Axis Labels Overlay */}
                {/* Y Axis: Dealer Exposure Pressure (GEX) */}
                <div className="absolute top-[28%] left-[19%] -rotate-90 origin-left text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    DEALER EXPOSURE PRESSURE (GEX)
                </div>

                {/* X Axis: Strike Price */}
                <div className="absolute bottom-[8%] left-[48%] -translate-x-1/2 text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    STRIKE PRICE (USD)
                </div>

                {/* Z Axis: Days to Expiry */}
                <div className="absolute bottom-[24%] right-[22%] rotate-[45deg] text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    DAYS TO EXPIRY
                </div>
            </div>

            {/* Bottom Confluence Zone Legend Bar */}
            <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                <div className="flex items-center gap-4 bg-[#0c1422]/90 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full border border-emerald-400 bg-emerald-400/30" />
                        <span className="text-zinc-300">High Confluence</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full border border-amber-400 bg-amber-400/30" />
                        <span className="text-zinc-300">Dealer Support Zone</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full border border-purple-400 bg-purple-400/30" />
                        <span className="text-zinc-300">Regime Transition</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full border border-cyan-400 bg-cyan-400/30" />
                        <span className="text-zinc-300">Gamma Flip Zone</span>
                    </div>
                </div>

                <div className="hidden md:flex items-center gap-3 text-[10px] font-mono text-zinc-400 bg-[#0c1422]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#1a273b]">
                    <span>Left-click: Rotate</span>
                    <span>•</span>
                    <span>Right-click: Pan</span>
                    <span>•</span>
                    <span>Scroll: Zoom</span>
                </div>
            </div>
        </div>
    );
}
