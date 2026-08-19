'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Layers, RotateCcw, Play, Pause, Eye, Compass, Activity, Zap } from 'lucide-react';

export interface GridCell {
    strike: number;
    dte: number;
    expiry: string;
    gex: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    iv: number;
}

interface SurfaceMeshProps {
    surfaceGrid: GridCell[][];
    spotPrice: number;
    strikes: number[];
    expirations: string[];
    selectedMetric?: 'gex' | 'openInterest' | 'iv' | 'gamma';
    onHoverPoint?: (point: GridCell | null) => void;
}

export default function SurfaceMesh({
    surfaceGrid,
    spotPrice,
    strikes,
    expirations,
    selectedMetric = 'gex',
    onHoverPoint,
}: SurfaceMeshProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshGroupRef = useRef<THREE.Group | null>(null);
    const spotMarkerRef = useRef<THREE.Group | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);

    const [metric, setMetric] = useState<'gex' | 'openInterest' | 'iv' | 'gamma'>(selectedMetric);
    const [isRotating, setIsRotating] = useState(true);
    const [showWireframe, setShowWireframe] = useState(true);
    const [viewMode, setViewMode] = useState<'3d' | 'top' | 'side'>('3d');
    const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);

    // Sync metric prop changes
    useEffect(() => {
        setMetric(selectedMetric);
    }, [selectedMetric]);

    // Format helper
    const formatDollar = (val: number) => {
        if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}k`;
        return `$${val.toFixed(0)}`;
    };

    // Color gradient mapping
    const getVertexColor = useMemo(() => {
        return (val: number, min: number, max: number, metricType: string) => {
            const color = new THREE.Color();
            if (metricType === 'gex') {
                if (val >= 0) {
                    // Positive GEX: Dealers long gamma (Emerald green / Cyan glow)
                    const t = max > 0 ? Math.min(1, Math.max(0, val / max)) : 0;
                    color.setRGB(
                        0.05 + 0.1 * (1 - t),
                        0.5 + 0.5 * t,
                        0.4 + 0.6 * t
                    );
                } else {
                    // Negative GEX: Dealers short gamma (Ruby Red / Neon Crimson)
                    const t = min < 0 ? Math.min(1, Math.max(0, val / min)) : 0;
                    color.setRGB(
                        0.7 + 0.3 * t,
                        0.1 + 0.1 * (1 - t),
                        0.25 + 0.1 * (1 - t)
                    );
                }
            } else if (metricType === 'iv') {
                // IV: Violet to Amber gradient
                const t = Math.min(1, Math.max(0, (val - min) / (max - min || 1)));
                color.setHSL(0.75 - 0.65 * t, 0.9, 0.55);
            } else {
                // Open Interest / Gamma: Electric Blue to Bright Gold
                const t = Math.min(1, Math.max(0, (val - min) / (max - min || 1)));
                color.setHSL(0.6 - 0.5 * t, 0.95, 0.55);
            }
            return color;
        };
    }, []);

    // Setup Three.js Scene
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // 1. Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x06090e); // Deep space terminal dark
        scene.fog = new THREE.FogExp2(0x06090e, 0.012);

        // 2. Camera
        const camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            1000
        );
        camera.position.set(24, 18, 26);
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
        renderer.toneMappingExposure = 1.2;
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 4. Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxDistance = 100;
        controls.minDistance = 5;
        controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't flip below horizon
        controlsRef.current = controls;

        // 5. Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 1.8);
        dirLight1.position.set(20, 30, 20);
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xec4899, 1.2);
        dirLight2.position.set(-20, -10, -20);
        scene.add(dirLight2);

        const pointLight = new THREE.PointLight(0x10b981, 2, 50);
        pointLight.position.set(0, 15, 0);
        scene.add(pointLight);

        // 6. Floor Grid Helper
        const gridHelper = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
        gridHelper.position.y = -4;
        scene.add(gridHelper);

        // Group for holding dynamic meshes
        const meshGroup = new THREE.Group();
        scene.add(meshGroup);
        meshGroupRef.current = meshGroup;

        // Raycasting for cell interaction
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handleMouseMove = (event: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        };

        renderer.domElement.addEventListener('mousemove', handleMouseMove);

        // Render Loop
        const animate = () => {
            animationFrameIdRef.current = requestAnimationFrame(animate);

            if (isRotating && controlsRef.current) {
                meshGroup.rotation.y += 0.0025;
            }

            controls.update();
            renderer.render(scene, camera);
        };

        animate();

        // Resize Listener
        const handleResize = () => {
            if (!container || !renderer || !camera) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.domElement.removeEventListener('mousemove', handleMouseMove);
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
            }
            renderer.dispose();
        };
    }, []);

    // Update Auto-rotation state
    useEffect(() => {
        // Handled in render loop reading state ref or directly
    }, [isRotating]);

    // Build the 3D Surface Mesh Geometry when surfaceGrid or metric changes
    useEffect(() => {
        const meshGroup = meshGroupRef.current;
        if (!meshGroup || !surfaceGrid || surfaceGrid.length === 0) return;

        // Clear existing mesh group children
        while (meshGroup.children.length > 0) {
            const obj = meshGroup.children[0];
            meshGroup.remove(obj);
            if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        }

        const numExpiries = surfaceGrid.length;
        const numStrikes = surfaceGrid[0].length;
        if (numExpiries < 2 || numStrikes < 2) return;

        // Find value range for normalization
        let minVal = Infinity;
        let maxVal = -Infinity;

        for (let i = 0; i < numExpiries; i++) {
            for (let j = 0; j < numStrikes; j++) {
                const cell = surfaceGrid[i][j];
                let val = cell.gex;
                if (metric === 'openInterest') val = cell.openInterest;
                else if (metric === 'iv') val = cell.iv;
                else if (metric === 'gamma') val = cell.gamma;

                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
        }

        if (minVal === maxVal) {
            maxVal = minVal + 1;
        }

        // Geometry dimensions in Three.js world units
        const width = 22;  // Strike axis (X)
        const depth = 16;  // Expiration/DTE axis (Z)
        const maxHeight = 7; // Amplitude (Y)

        const geometry = new THREE.PlaneGeometry(
            width,
            depth,
            numStrikes - 1,
            numExpiries - 1
        );
        geometry.rotateX(-Math.PI / 2); // Orient horizontally

        const positions = geometry.attributes.position;
        const colors: number[] = [];

        // Apply vertex heights and colors
        for (let i = 0; i < numExpiries; i++) {
            for (let j = 0; j < numStrikes; j++) {
                const vertexIndex = i * numStrikes + j;
                const cell = surfaceGrid[i][j];

                let val = cell.gex;
                if (metric === 'openInterest') val = cell.openInterest;
                else if (metric === 'iv') val = cell.iv;
                else if (metric === 'gamma') val = cell.gamma;

                // Calculate Y height
                let height = 0;
                if (metric === 'gex') {
                    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal)) || 1;
                    height = (val / absMax) * maxHeight;
                } else {
                    height = ((val - minVal) / (maxVal - minVal)) * maxHeight - maxHeight * 0.5;
                }

                positions.setY(vertexIndex, height);

                const c = getVertexColor(val, minVal, maxVal, metric);
                colors.push(c.r, c.g, c.b);
            }
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        // 1. Solid Surface Material with Vertex Colors
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.25,
            metalness: 0.45,
            side: THREE.DoubleSide,
            flatShading: false,
        });

        const surfaceMesh = new THREE.Mesh(geometry, material);
        meshGroup.add(surfaceMesh);

        // 2. Wireframe Overlay
        if (showWireframe) {
            const wireframeMat = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                wireframe: true,
                transparent: true,
                opacity: 0.22,
            });
            const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMat);
            wireframeMesh.position.y += 0.02; // slight bias to prevent z-fighting
            meshGroup.add(wireframeMesh);
        }

        // 3. Current Spot Price Slicing Indicator
        if (spotPrice && strikes.length > 0) {
            const minStrike = strikes[0];
            const maxStrike = strikes[strikes.length - 1];
            if (spotPrice >= minStrike && spotPrice <= maxStrike) {
                const strikeNorm = (spotPrice - minStrike) / (maxStrike - minStrike);
                const spotX = -width / 2 + strikeNorm * width;

                // Spot marker line along DTE axis
                const spotLineGeo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(spotX, -maxHeight, -depth / 2),
                    new THREE.Vector3(spotX, maxHeight + 1, -depth / 2),
                    new THREE.Vector3(spotX, maxHeight + 1, depth / 2),
                    new THREE.Vector3(spotX, -maxHeight, depth / 2),
                ]);
                const spotLineMat = new THREE.LineBasicMaterial({
                    color: 0xfacc15, // Golden yellow beacon
                    linewidth: 2,
                    transparent: true,
                    opacity: 0.85,
                });
                const spotLine = new THREE.LineLoop(spotLineGeo, spotLineMat);
                meshGroup.add(spotLine);

                // Glowing Beacon Point at top
                const beaconGeo = new THREE.SphereGeometry(0.3, 16, 16);
                const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
                const beacon = new THREE.Mesh(beaconGeo, beaconMat);
                beacon.position.set(spotX, maxHeight + 1.2, 0);
                meshGroup.add(beacon);
            }
        }

        // 4. Zero Level Ground Plane Reference
        const zeroPlaneGeo = new THREE.PlaneGeometry(width, depth);
        zeroPlaneGeo.rotateX(-Math.PI / 2);
        const zeroPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x1e293b,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
        });
        const zeroPlane = new THREE.Mesh(zeroPlaneGeo, zeroPlaneMat);
        zeroPlane.position.y = 0;
        meshGroup.add(zeroPlane);

    }, [surfaceGrid, metric, showWireframe, spotPrice, strikes, getVertexColor]);

    // View Angle Switcher
    const handleSetView = (mode: '3d' | 'top' | 'side') => {
        setViewMode(mode);
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;

        setIsRotating(false);

        if (mode === 'top') {
            camera.position.set(0, 32, 0.01);
            controls.target.set(0, 0, 0);
        } else if (mode === 'side') {
            camera.position.set(32, 2, 0);
            controls.target.set(0, 0, 0);
        } else {
            camera.position.set(24, 18, 26);
            controls.target.set(0, 0, 0);
        }
        camera.lookAt(0, 0, 0);
        controls.update();
    };

    const handleResetCamera = () => {
        handleSetView('3d');
        if (meshGroupRef.current) {
            meshGroupRef.current.rotation.set(0, 0, 0);
        }
    };

    return (
        <div className="relative w-full h-[520px] rounded-2xl overflow-hidden bg-gradient-to-b from-[#06090e] to-[#0b1118] border border-cyan-500/20 shadow-2xl shadow-cyan-950/20 flex flex-col">
            {/* 3D WebGL Canvas Viewport */}
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Top HUD Floating Control Bar */}
            <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
                {/* Metric Selector Pill */}
                <div className="flex items-center bg-[#0d1520]/80 backdrop-blur-md p-1 rounded-xl border border-cyan-500/30 pointer-events-auto shadow-lg">
                    <button
                        onClick={() => setMetric('gex')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                            metric === 'gex'
                                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-black shadow-md shadow-emerald-500/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Net GEX ($)
                    </button>
                    <button
                        onClick={() => setMetric('openInterest')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                            metric === 'openInterest'
                                ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Open Interest
                    </button>
                    <button
                        onClick={() => setMetric('iv')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                            metric === 'iv'
                                ? 'bg-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Activity className="w-3.5 h-3.5" />
                        Implied Vol (IV)
                    </button>
                    <button
                        onClick={() => setMetric('gamma')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                            metric === 'gamma'
                                ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        <Compass className="w-3.5 h-3.5" />
                        Raw Gamma
                    </button>
                </div>

                {/* View Mode & Camera Action Tools */}
                <div className="flex items-center gap-2 bg-[#0d1520]/80 backdrop-blur-md p-1 rounded-xl border border-cyan-500/30 pointer-events-auto shadow-lg">
                    {/* Perspective Views */}
                    <button
                        onClick={() => handleSetView('3d')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            viewMode === '3d' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/40' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="3D Iso View"
                    >
                        3D
                    </button>
                    <button
                        onClick={() => handleSetView('top')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            viewMode === 'top' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/40' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Top-Down Heatmap View"
                    >
                        Top
                    </button>
                    <button
                        onClick={() => handleSetView('side')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            viewMode === 'side' ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-500/40' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Side Expiry View"
                    >
                        Side
                    </button>

                    <div className="w-[1px] h-4 bg-zinc-700 mx-1" />

                    {/* Auto-rotation Toggle */}
                    <button
                        onClick={() => setIsRotating(!isRotating)}
                        className={`p-1.5 rounded-lg transition-colors ${
                            isRotating ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title={isRotating ? 'Pause Rotation' : 'Auto Rotate'}
                    >
                        {isRotating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    {/* Wireframe Toggle */}
                    <button
                        onClick={() => setShowWireframe(!showWireframe)}
                        className={`p-1.5 rounded-lg transition-colors ${
                            showWireframe ? 'text-cyan-400 bg-cyan-950/60' : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Toggle Wireframe Grid"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </button>

                    {/* Reset Camera */}
                    <button
                        onClick={handleResetCamera}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
                        title="Reset Camera View"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Bottom Surface Legend & Coordinate Indicators */}
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
                {/* Dynamic Terrain Gradient Legend */}
                <div className="bg-[#0d1520]/85 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-cyan-500/30 shadow-lg pointer-events-auto">
                    <div className="text-[10px] font-mono uppercase text-zinc-400 mb-1.5 tracking-wider flex items-center justify-between gap-4">
                        <span>Terrain Elevation & Dealer Gamma</span>
                        <span className="text-yellow-400 font-bold">Spot: ${spotPrice?.toLocaleString()}</span>
                    </div>
                    {metric === 'gex' ? (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-rose-400 font-semibold">-Short Gamma (Put Wall)</span>
                            <div className="w-28 h-2 rounded-full bg-gradient-to-r from-rose-600 via-zinc-800 to-emerald-400" />
                            <span className="text-[11px] font-mono text-emerald-400 font-semibold">+Long Gamma (Call Mountain)</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-indigo-400 font-semibold">Low</span>
                            <div className="w-28 h-2 rounded-full bg-gradient-to-r from-indigo-600 via-cyan-400 to-amber-300" />
                            <span className="text-[11px] font-mono text-amber-300 font-semibold">High</span>
                        </div>
                    )}
                </div>

                {/* Real-time 3D Axes HUD */}
                <div className="hidden sm:flex items-center gap-3 bg-[#0d1520]/85 backdrop-blur-md px-3 py-2 rounded-xl border border-cyan-500/30 text-[11px] font-mono text-zinc-400 shadow-lg">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" /> X: Strike ($)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-400" /> Z: Expiry (DTE)
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" /> Y: Net GEX ($)
                    </span>
                </div>
            </div>
        </div>
    );
}
