'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Info, Maximize2, RotateCcw, Play, Pause, Eye, Check, Target } from 'lucide-react';
import { TerrainGridCell, DealerEnvironmentSummaryData, ExposureScales, SelectedAnalyticalState } from '@/lib/dashboard/types';
import { formatUsd, formatGex } from '@/lib/dashboard/adapters';

interface IntegratedDealerTerrainProps {
    surfaceGrid: TerrainGridCell[][];
    interpolatedGrid?: TerrainGridCell[][];
    summary: DealerEnvironmentSummaryData;
    scales: ExposureScales;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    selectedState?: SelectedAnalyticalState;
    onSelectStrike?: (strike: number) => void;
    onSelectPoint?: (cell: TerrainGridCell) => void;
}

export default function IntegratedDealerTerrain({
    surfaceGrid,
    interpolatedGrid,
    summary,
    scales,
    strikes,
    expirations,
    dtes,
    selectedState,
    onSelectStrike,
    onSelectPoint,
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

    // Hover tooltip state
    const [hoveredCell, setHoveredCell] = useState<TerrainGridCell | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    // Groups for selective rendering
    const gexGroupRef = useRef<THREE.Group>(new THREE.Group());
    const vannaGroupRef = useRef<THREE.Group>(new THREE.Group());
    const charmGroupRef = useRef<THREE.Group>(new THREE.Group());
    const spotGroupRef = useRef<THREE.Group>(new THREE.Group());
    const levelsGroupRef = useRef<THREE.Group>(new THREE.Group());
    const zeroPlaneGroupRef = useRef<THREE.Group>(new THREE.Group());
    const selectionGroupRef = useRef<THREE.Group>(new THREE.Group());

    // Sync visibility toggles
    useEffect(() => { gexGroupRef.current.visible = showGex; }, [showGex]);
    useEffect(() => { vannaGroupRef.current.visible = showVanna; }, [showVanna]);
    useEffect(() => { charmGroupRef.current.visible = showCharm; }, [showCharm]);
    useEffect(() => { spotGroupRef.current.visible = showSpot; }, [showSpot]);
    useEffect(() => { levelsGroupRef.current.visible = showDealerLevels; }, [showDealerLevels]);
    useEffect(() => { zeroPlaneGroupRef.current.visible = showZeroPlane; }, [showZeroPlane]);

    // Dimensions in Three.js world coordinates
    const WORLD_WIDTH = 26;
    const WORLD_DEPTH = 18;
    const MAX_HEIGHT = 7.2;

    const gexScaleBound = scales.gexMax || 8e9;
    const vannaScaleBound = scales.vannaMax || 1e9;
    const charmScaleBound = scales.charmMax || 5e8;

    const minStrike = strikes[0] || 58000;
    const maxStrike = strikes[strikes.length - 1] || 78000;
    const minDte = dtes[0] || 7;
    const maxDte = dtes[dtes.length - 1] || 270;

    const strikeToX = useCallback((s: number) => {
        const norm = (s - minStrike) / (maxStrike - minStrike || 1);
        return -WORLD_WIDTH / 2 + norm * WORLD_WIDTH;
    }, [minStrike, maxStrike]);

    const dteToZ = useCallback((d: number) => {
        const norm = (d - minDte) / (maxDte - minDte || 1);
        return -WORLD_DEPTH / 2 + norm * WORLD_DEPTH;
    }, [minDte, maxDte]);

    // Setup Three.js Scene
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x060a12);
        scene.fog = new THREE.FogExp2(0x060a12, 0.009);

        const camera = new THREE.PerspectiveCamera(
            38,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        camera.position.set(22, 17, 30);
        cameraRef.current = camera;

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

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.maxDistance = 120;
        controls.minDistance = 8;
        controls.maxPolarAngle = Math.PI / 2 + 0.1;
        controls.target.set(0, 0, 0);
        controlsRef.current = controls;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x00e676, 1.8);
        dirLight1.position.set(15, 30, 15);
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xff1744, 1.5);
        dirLight2.position.set(-15, -15, -15);
        scene.add(dirLight2);

        const topLight = new THREE.PointLight(0x38bdf8, 1.4, 80);
        topLight.position.set(0, 20, 0);
        scene.add(topLight);

        // Root Group
        const rootGroup = new THREE.Group();
        scene.add(rootGroup);
        rootGroupRef.current = rootGroup;

        rootGroup.add(gexGroupRef.current);
        rootGroup.add(vannaGroupRef.current);
        rootGroup.add(charmGroupRef.current);
        rootGroup.add(spotGroupRef.current);
        rootGroup.add(levelsGroupRef.current);
        rootGroup.add(zeroPlaneGroupRef.current);
        rootGroup.add(selectionGroupRef.current);

        // Raycasting for interactive hover and click
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handlePointerMove = (e: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            mouse.x = (x / rect.width) * 2 - 1;
            mouse.y = -(y / rect.height) * 2 + 1;

            setMousePos({ x, y });

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(gexGroupRef.current.children, true);

            if (intersects.length > 0) {
                const point = intersects[0].point;
                // Reverse map point (x, z) to strike and DTE
                const normX = (point.x + WORLD_WIDTH / 2) / WORLD_WIDTH;
                const normZ = (point.z + WORLD_DEPTH / 2) / WORLD_DEPTH;
                const strikeEstimate = minStrike + normX * (maxStrike - minStrike);
                const dteEstimate = minDte + normZ * (maxDte - minDte);

                // Find closest actual observation cell
                let closest: TerrainGridCell | null = null;
                let minDist = Infinity;

                for (const row of surfaceGrid) {
                    for (const cell of row) {
                        const dStrike = (cell.strike - strikeEstimate) / (maxStrike - minStrike);
                        const dDte = (cell.dte - dteEstimate) / (maxDte - minDte);
                        const dist = dStrike * dStrike + dDte * dDte;
                        if (dist < minDist) {
                            minDist = dist;
                            closest = cell;
                        }
                    }
                }
                setHoveredCell(closest);
            } else {
                setHoveredCell(null);
            }
        };

        const handlePointerDown = () => {
            if (hoveredCell) {
                onSelectStrike?.(hoveredCell.strike);
                onSelectPoint?.(hoveredCell);
            }
        };

        const domElement = renderer.domElement;
        domElement.addEventListener('mousemove', handlePointerMove);
        domElement.addEventListener('click', handlePointerDown);

        // Render Loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);

            if (isRotating && rootGroupRef.current) {
                rootGroupRef.current.rotation.y += 0.002;
            }

            controls.update();
            renderer.render(scene, camera);
        };

        animate();

        const handleResize = () => {
            if (!container || !renderer || !camera) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            domElement.removeEventListener('mousemove', handlePointerMove);
            domElement.removeEventListener('click', handlePointerDown);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            renderer.dispose();
        };
    }, [surfaceGrid, minStrike, maxStrike, minDte, maxDte, isRotating, onSelectStrike, onSelectPoint]);

    // Build 3D Mesh Geometry with High-Resolution Visual Interpolation
    useEffect(() => {
        const renderGrid = interpolatedGrid && interpolatedGrid.length > 0 ? interpolatedGrid : surfaceGrid;
        if (!renderGrid || renderGrid.length === 0) return;

        const gexGroup = gexGroupRef.current;
        const vannaGroup = vannaGroupRef.current;
        const charmGroup = charmGroupRef.current;
        const spotGroup = spotGroupRef.current;
        const levelsGroup = levelsGroupRef.current;
        const zeroPlaneGroup = zeroPlaneGroupRef.current;
        const selectionGroup = selectionGroupRef.current;

        // Clean previous meshes
        [gexGroup, vannaGroup, charmGroup, spotGroup, levelsGroup, zeroPlaneGroup, selectionGroup].forEach((grp) => {
            while (grp.children.length > 0) {
                const child = grp.children[0];
                grp.remove(child);
                if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
            }
        });

        const numRows = renderGrid.length; // DTEs
        const numCols = renderGrid[0].length; // Strikes

        // 1. GEX TERRAIN MESH (High-Density Smooth Geometry)
        const geometry = new THREE.PlaneGeometry(
            WORLD_WIDTH,
            WORLD_DEPTH,
            numCols - 1,
            numRows - 1
        );
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position;
        const colors: number[] = [];

        for (let i = 0; i < numRows; i++) {
            for (let j = 0; j < numCols; j++) {
                const vertexIndex = i * numCols + j;
                const cell = renderGrid[i][j];
                const gex = cell.gex;

                // Normalized Y elevation using dataset-specific gexScaleBound
                const heightY = (gex / gexScaleBound) * MAX_HEIGHT;
                positions.setY(vertexIndex, heightY);

                // Emerald Green for dealer long gamma (+GEX), Ruby Crimson for short gamma (-GEX)
                const color = new THREE.Color();
                if (gex >= 0) {
                    const t = Math.min(1, gex / gexScaleBound);
                    color.setRGB(0.02 + 0.08 * (1 - t), 0.75 + 0.25 * t, 0.35 + 0.5 * t);
                } else {
                    const t = Math.min(1, Math.abs(gex) / gexScaleBound);
                    color.setRGB(0.85 + 0.15 * t, 0.08, 0.22 + 0.08 * (1 - t));
                }
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const surfaceMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.28,
            metalness: 0.35,
            side: THREE.DoubleSide,
            flatShading: false,
        });

        const surfaceMesh = new THREE.Mesh(geometry, surfaceMat);
        gexGroup.add(surfaceMesh);

        if (showWireframe) {
            const wireframeMat = new THREE.MeshBasicMaterial({
                vertexColors: true,
                wireframe: true,
                transparent: true,
                opacity: 0.32,
            });
            const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMat);
            wireframeMesh.position.y += 0.015;
            gexGroup.add(wireframeMesh);
        }

        // 2. VANNA CONTOURS (Purple/Magenta Isobar Ring Overlay across Terrain Heights)
        const vannaStep = Math.max(1, Math.floor(numRows / 8));
        for (let i = 0; i < numRows; i += vannaStep) {
            const linePoints: THREE.Vector3[] = [];
            for (let j = 0; j < numCols; j++) {
                const cell = renderGrid[i][j];
                const x = strikeToX(cell.strike);
                const z = dteToZ(cell.dte);
                const y = (cell.gex / gexScaleBound) * MAX_HEIGHT + 0.05;
                linePoints.push(new THREE.Vector3(x, y, z));
            }

            const contourGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const contourMat = new THREE.LineBasicMaterial({
                color: 0xc084fc,
                transparent: true,
                opacity: 0.75,
                linewidth: 2,
            });
            const contourLine = new THREE.Line(contourGeo, contourMat);
            vannaGroup.add(contourLine);
        }

        // 3. CHARM FLOW VECTORS (Directional Streamline Arrows in Glowing Amber)
        const arrowStepR = Math.max(2, Math.floor(numRows / 6));
        const arrowStepC = Math.max(2, Math.floor(numCols / 9));

        for (let i = 0; i < numRows; i += arrowStepR) {
            for (let j = 0; j < numCols; j += arrowStepC) {
                const cell = renderGrid[i][j];
                const x = strikeToX(cell.strike);
                const z = dteToZ(cell.dte);
                const y = (cell.gex / gexScaleBound) * MAX_HEIGHT + 0.15;

                // Flow direction towards spot and expiry time decay
                const dirX = cell.strike > summary.spotPrice ? -0.85 : 0.85;
                const dirZ = -0.45;
                const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();

                const charmIntensity = Math.min(1.2, Math.max(0.6, (Math.abs(cell.charm) / charmScaleBound) * 1.2));

                const arrowHelper = new THREE.ArrowHelper(
                    dir,
                    new THREE.Vector3(x, y, z),
                    charmIntensity,
                    0xff9100,
                    0.35,
                    0.2
                );
                charmGroup.add(arrowHelper);
            }
        }

        // 4. ZERO PLANE & BORDER
        const zeroPlaneGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
        zeroPlaneGeo.rotateX(-Math.PI / 2);
        const zeroPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x152233,
            transparent: true,
            opacity: 0.38,
            side: THREE.DoubleSide,
        });
        const zeroMesh = new THREE.Mesh(zeroPlaneGeo, zeroPlaneMat);
        zeroMesh.position.y = 0;
        zeroPlaneGroup.add(zeroMesh);

        const zeroEdgesGeo = new THREE.EdgesGeometry(zeroPlaneGeo);
        const zeroEdgesMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.55,
        });
        const zeroEdges = new THREE.LineSegments(zeroEdgesGeo, zeroEdgesMat);
        zeroEdges.position.y = 0;
        zeroPlaneGroup.add(zeroEdges);

        // 5. SPOT PRICE VERTICAL BEACON
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

        const spotSphereGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const spotSphereMat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
        const spotSphere = new THREE.Mesh(spotSphereGeo, spotSphereMat);
        spotSphere.position.set(spotX, MAX_HEIGHT + 2, 0);
        spotGroup.add(spotSphere);

        // 6. DEALER LEVEL MARKER PLANES
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
                opacity: 0.45,
            });
            const line = new THREE.LineLoop(geo, mat);
            levelsGroup.add(line);
        };

        addLevelLine(summary.callWall, 0x00e676);
        addLevelLine(summary.putWall, 0xff1744);
        addLevelLine(summary.gammaFlip, 0x00e5ff);
        addLevelLine(summary.maxPain, 0xff9100);

        // 7. SELECTED STRIKE HIGHLIGHT (When clicked from tables or slices)
        if (selectedState?.strike) {
            const selX = strikeToX(selectedState.strike);
            const selPts = [
                new THREE.Vector3(selX, -MAX_HEIGHT - 0.8, -WORLD_DEPTH / 2 - 0.3),
                new THREE.Vector3(selX, MAX_HEIGHT + 1.8, -WORLD_DEPTH / 2 - 0.3),
                new THREE.Vector3(selX, MAX_HEIGHT + 1.8, WORLD_DEPTH / 2 + 0.3),
                new THREE.Vector3(selX, -MAX_HEIGHT - 0.8, WORLD_DEPTH / 2 + 0.3),
            ];
            const selGeo = new THREE.BufferGeometry().setFromPoints(selPts);
            const selMat = new THREE.LineBasicMaterial({
                color: 0x00e5ff,
                linewidth: 3,
            });
            const selLine = new THREE.LineLoop(selGeo, selMat);
            selectionGroup.add(selLine);
        }

    }, [interpolatedGrid, surfaceGrid, strikes, dtes, summary, scales, showWireframe, gexScaleBound, vannaScaleBound, charmScaleBound, strikeToX, dteToZ, selectedState]);

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

            {/* Top Viewport Header Bar */}
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        INTEGRATED DEALER TERRAIN
                    </h2>
                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-pointer hover:text-cyan-400 transition-colors" />
                </div>

                {/* 3D / 2D & Viewport Controls */}
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

                    <button
                        onClick={() => setIsRotating(!isRotating)}
                        className={`p-1 rounded transition-colors ${
                            isRotating ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title={isRotating ? 'Pause Rotation' : 'Auto Rotate'}
                    >
                        {isRotating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    <button
                        onClick={() => setShowWireframe(!showWireframe)}
                        className={`p-1 rounded transition-colors ${
                            showWireframe ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Toggle Wireframe Grid"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </button>

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

            {/* Left Overlay: Metrics Toggles & THREE INDEPENDENT EXPOSURE SCALES */}
            <div className="absolute top-12 left-4 flex flex-col gap-2.5 pointer-events-none z-10">
                {/* Layer Checkboxes */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto space-y-1.5 text-[10px] font-mono">
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

                {/* THREE INDEPENDENT EXPOSURE SCALES */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2.5 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto space-y-2 text-[9px] font-mono">
                    {/* Scale 1: GEX EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-zinc-400 font-bold uppercase">
                            <span>GEX EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{scales.gexUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-10 rounded-full bg-gradient-to-b from-[#00e676] via-[#1a2638] to-[#ff1744]" />
                            <div className="flex flex-col justify-between h-10 text-[8px] font-bold">
                                <span className="text-emerald-400">+{formatGex(scales.gexMax)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-rose-400">-{formatGex(scales.gexMax)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-[1px] bg-zinc-800" />

                    {/* Scale 2: VANNA EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-zinc-400 font-bold uppercase">
                            <span>VANNA EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{scales.vannaUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-8 rounded-full bg-gradient-to-b from-[#c084fc] via-[#1a2638] to-[#6366f1]" />
                            <div className="flex flex-col justify-between h-8 text-[8px] font-bold">
                                <span className="text-purple-400">+{formatGex(scales.vannaMax)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-indigo-400">-{formatGex(scales.vannaMax)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-[1px] bg-zinc-800" />

                    {/* Scale 3: CHARM EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-zinc-400 font-bold uppercase">
                            <span>CHARM EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{scales.charmUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-8 rounded-full bg-gradient-to-b from-[#ff9100] via-[#1a2638] to-[#d97706]" />
                            <div className="flex flex-col justify-between h-8 text-[8px] font-bold">
                                <span className="text-amber-400">+{formatGex(scales.charmMax)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-amber-600">-{formatGex(scales.charmMax)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Persistent 3D Landmark Banners with Pointer Arrows */}
            <div className="absolute inset-0 pointer-events-none z-10">
                {/* PUT WALL Banner */}
                <div className="absolute top-[8%] left-[29%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(summary.putWall)}
                        className="px-2 py-0.5 rounded bg-[#1a080c] border border-rose-500/80 shadow-lg shadow-rose-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-rose-400 tracking-wider">PUT WALL</span>
                        <span className="text-[11px] font-mono font-black text-rose-200">
                            {summary.putWall.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-rose-500 to-transparent" />
                </div>

                {/* GAMMA FLIP Banner */}
                <div className="absolute top-[8%] left-[40%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(summary.gammaFlip)}
                        className="px-2 py-0.5 rounded bg-[#08121a] border border-cyan-500/80 shadow-lg shadow-cyan-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider">GAMMA FLIP</span>
                        <span className="text-[11px] font-mono font-black text-cyan-200">
                            {summary.gammaFlip.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-cyan-500 to-transparent" />
                </div>

                {/* SPOT PRICE Center Dominant Banner */}
                <div className="absolute top-[6%] left-[49%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(summary.spotPrice)}
                        className="px-3 py-1 rounded-lg bg-[#0e1626] border-2 border-white shadow-xl shadow-cyan-500/20 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-zinc-300 tracking-widest uppercase">SPOT PRICE</span>
                        <span className="text-xs font-mono font-black text-white tracking-tight">
                            {summary.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                    </button>
                    <div className="w-[1px] h-6 bg-gradient-to-b from-white to-transparent" />
                </div>

                {/* MAX PAIN Banner */}
                <div className="absolute top-[8%] left-[58%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(summary.maxPain)}
                        className="px-2 py-0.5 rounded bg-[#1a1408] border border-amber-500/80 shadow-lg shadow-amber-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-amber-400 tracking-wider">MAX PAIN</span>
                        <span className="text-[11px] font-mono font-black text-amber-200">
                            {summary.maxPain.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-amber-500 to-transparent" />
                </div>

                {/* CALL WALL Banner */}
                <div className="absolute top-[8%] left-[68%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(summary.callWall)}
                        className="px-2 py-0.5 rounded bg-[#081a10] border border-emerald-500/80 shadow-lg shadow-emerald-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider">CALL WALL</span>
                        <span className="text-[11px] font-mono font-black text-emerald-200">
                            {summary.callWall.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-emerald-500 to-transparent" />
                </div>

                {/* 3D Axis Labels */}
                <div className="absolute top-[32%] left-[19%] -rotate-90 origin-left text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    DEALER EXPOSURE PRESSURE (GEX)
                </div>
                <div className="absolute bottom-[8%] left-[48%] -translate-x-1/2 text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    STRIKE PRICE (USD)
                </div>
                <div className="absolute bottom-[24%] right-[22%] rotate-[45deg] text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    DAYS TO EXPIRY
                </div>
            </div>

            {/* Interactive Raycast Hover Tooltip */}
            {hoveredCell && mousePos && (
                <div
                    className="absolute pointer-events-none z-30 p-2.5 rounded-lg bg-[#0c1422]/95 border border-cyan-500/50 shadow-2xl backdrop-blur-md text-[10px] font-mono space-y-1"
                    style={{
                        left: Math.min(mousePos.x + 14, (containerRef.current?.clientWidth || 800) - 200),
                        top: Math.max(10, mousePos.y - 120),
                    }}
                >
                    <div className="flex items-center justify-between gap-4 font-bold border-b border-zinc-800 pb-1">
                        <span className="text-white">${hoveredCell.strike.toLocaleString()}</span>
                        <span className="text-cyan-300">{hoveredCell.dte}d ({hoveredCell.expiry})</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-zinc-300">
                        <span>GEX:</span>
                        <span className={`font-bold ${hoveredCell.gex >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatGex(hoveredCell.gex)}
                        </span>
                        <span>Vanna:</span>
                        <span className={`font-bold ${hoveredCell.vanna >= 0 ? 'text-purple-400' : 'text-indigo-400'}`}>
                            {formatGex(hoveredCell.vanna)}
                        </span>
                        <span>Charm:</span>
                        <span className={`font-bold ${hoveredCell.charm >= 0 ? 'text-amber-400' : 'text-amber-500'}`}>
                            {formatGex(hoveredCell.charm)}
                        </span>
                        <span>OI:</span>
                        <span className="text-white">{hoveredCell.openInterest.toLocaleString()} BTC</span>
                        <span>IV:</span>
                        <span className="text-fuchsia-300">{hoveredCell.iv.toFixed(1)}%</span>
                        <span>Delta (Δ):</span>
                        <span className="text-zinc-200">{hoveredCell.delta.toFixed(2)}</span>
                    </div>
                </div>
            )}

            {/* Bottom Confluence Legend Bar */}
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
                    <span>Click: Select Strike</span>
                    <span>•</span>
                    <span>Drag: Rotate</span>
                    <span>•</span>
                    <span>Right-drag: Pan</span>
                </div>
            </div>
        </div>
    );
}
