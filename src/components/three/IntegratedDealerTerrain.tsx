'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    RotateCcw,
    Compass,
    Layers,
    Activity,
    Zap,
} from 'lucide-react';
import type {
    TerrainDataContractV2,
    TerrainSurfaceCell,
    VannaContourPrimitive,
    CharmPressureGlyph,
    ConfluenceFloorCell,
} from '@/lib/terrain/types';
import { createLinearMapperFromDomain, type LinearMapper } from './terrain/axes';
import { colorForMetricValue, METRIC_PALETTES } from './terrain/colors';
import {
    buildInterpolatedRenderGrid,
    nearestCell,
    type RenderGrid,
    type RenderSample,
} from './terrain/interpolation';
import { getMetricConfig, METRIC_CONFIGS, type TerrainMetric } from './terrain/metric';
import { clampForDisplay, formatFinancialAxis, formatStrikeAxis } from './terrain/scales';
import {
    createTerrainViewportModel,
    zoomTerrainViewport,
    panTerrainViewport,
    type TerrainViewportModel,
    type TerrainAxisTick,
    type StructuralAnchor,
} from './terrain/viewport';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';

interface IntegratedDealerTerrainProps {
    data: TerrainDataContractV2;
    selectedStrike?: number | null;
    selectedDte?: number | null;
    onSelectStrike?: (strike: number) => void;
    onSelectPoint?: (cell: TerrainSurfaceCell) => void;
    onViewportChange?: (viewport: TerrainViewportModel) => void;
}

interface HoverState {
    cell: TerrainSurfaceCell;
    metricValue: number;
    screenX: number;
    screenY: number;
    isObserved: boolean;
}

type CameraMode = '3d' | 'top' | 'front';

const WORLD_WIDTH = 24;
const WORLD_DEPTH = 16;
const WORLD_HEIGHT = 5.6;
const FLOOR_Y = -WORLD_HEIGHT - 1.2;

export default function IntegratedDealerTerrain({
    data,
    selectedStrike = null,
    selectedDte = null,
    onSelectStrike,
    onSelectPoint,
    onViewportChange,
}: IntegratedDealerTerrainProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    // Active Metric Mode (GEX, VANNA, CHARM, COMBINED)
    const [activeMetric, setActiveMetric] = useState<TerrainMetric>('gex');
    const [cameraMode, setCameraMode] = useState<CameraMode>('3d');
    const [showWireframe, setShowWireframe] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [showZeroPlane, setShowZeroPlane] = useState(true);

    // Combined view sub-layers
    const [showVannaContours, setShowVannaContours] = useState(true);
    const [showCharmGlyphs, setShowCharmGlyphs] = useState(true);
    const [showConfluenceFloor, setShowConfluenceFloor] = useState(true);

    // Viewport Model (Codex Contract)
    const [viewport, setViewport] = useState<TerrainViewportModel>(() =>
        createTerrainViewportModel(data, activeMetric)
    );

    // Update viewport when metric or data changes
    useEffect(() => {
        setViewport(createTerrainViewportModel(data, activeMetric));
    }, [data, activeMetric]);

    useEffect(() => {
        onViewportChange?.(viewport);
    }, [viewport, onViewportChange]);

    // Hover state
    const [hover, setHover] = useState<HoverState | null>(null);

    // Three.js References
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const terrainMeshRef = useRef<THREE.Mesh | null>(null);
    const wireframeMeshRef = useRef<THREE.Mesh | null>(null);
    const zeroPlaneGroupRef = useRef<THREE.Group>(new THREE.Group());
    const contoursGroupRef = useRef<THREE.Group>(new THREE.Group());
    const glyphsGroupRef = useRef<THREE.Group>(new THREE.Group());
    const floorGroupRef = useRef<THREE.Group>(new THREE.Group());
    const markersGroupRef = useRef<THREE.Group>(new THREE.Group());
    const selectionGroupRef = useRef<THREE.Group>(new THREE.Group());

    const metricConfig = useMemo(() => getMetricConfig(activeMetric), [activeMetric]);

    // Linear mappers based on semantic viewport
    const strikeMapper = useMemo(
        () => createLinearMapperFromDomain(viewport.strikeDomain, WORLD_WIDTH),
        [viewport.strikeDomain]
    );

    const dteMapper = useMemo(
        () => createLinearMapperFromDomain(viewport.dteDomain, WORLD_DEPTH),
        [viewport.dteDomain]
    );

    const exposureBound = useMemo(
        () => Math.max(Math.abs(viewport.exposureDomain[0]), Math.abs(viewport.exposureDomain[1])) || 1e9,
        [viewport.exposureDomain]
    );

    // Helper: Map exposure value to Three.js height Y
    const exposureToY = useCallback(
        (val: number) => {
            const norm = Math.max(-1, Math.min(1, val / exposureBound));
            return norm * WORLD_HEIGHT;
        },
        [exposureBound]
    );

    // Coordinate axes for nearestCell lookups
    const strikeAxis = useMemo(() => data.surfaceGrid[0]?.map((c) => c.strike) || [], [data.surfaceGrid]);
    const dteAxis = useMemo(() => data.surfaceGrid.map((r) => r[0]?.dte ?? 0), [data.surfaceGrid]);

    // Render Grid construction with resolution 48x48
    const renderGrid = useMemo<RenderGrid>(() => {
        return buildInterpolatedRenderGrid(data.surfaceGrid, metricConfig, 48, 48);
    }, [data.surfaceGrid, metricConfig]);

    // Handle mouse-wheel semantic viewport zoom
    const handleWheel = useCallback(
        (event: WheelEvent) => {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.15 : 0.87;
            setViewport((current) => zoomTerrainViewport(data, current, factor));
        },
        [data]
    );

    // Reset Viewport and Camera
    const handleReset = useCallback(() => {
        setViewport(createTerrainViewportModel(data, activeMetric, { zoomLevel: 1 }));
        if (cameraRef.current && controlsRef.current) {
            cameraRef.current.position.set(0, 14, 22);
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
            setCameraMode('3d');
        }
    }, [data, activeMetric]);

    // Camera preset switcher
    const handleSetCameraMode = useCallback((mode: CameraMode) => {
        setCameraMode(mode);
        if (!cameraRef.current || !controlsRef.current) return;

        if (mode === '3d') {
            cameraRef.current.position.set(0, 14, 22);
            controlsRef.current.target.set(0, 0, 0);
        } else if (mode === 'top') {
            cameraRef.current.position.set(0, 26, 0.001);
            controlsRef.current.target.set(0, 0, 0);
        } else if (mode === 'front') {
            cameraRef.current.position.set(0, 0, 24);
            controlsRef.current.target.set(0, 0, 0);
        }
        controlsRef.current.update();
    }, []);

    // Setup Three.js scene & renderer
    useEffect(() => {
        const container = canvasContainerRef.current;
        if (!container) return;

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 520;

        // Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x05080f);

        // Camera
        const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
        camera.position.set(0, 14, 22);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        rendererRef.current = renderer;

        container.replaceChildren(renderer.domElement);

        // Controls (OrbitControls with dolly disabled to keep quantitative axes strictly synchronized)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = false; // Zoom is handled semantically via mouse-wheel
        controls.maxPolarAngle = Math.PI / 2 + 0.1;
        controlsRef.current = controls;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(10, 20, 15);
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
        fillLight.position.set(-10, -10, -10);
        scene.add(fillLight);

        // Add Groups to Scene
        scene.add(zeroPlaneGroupRef.current);
        scene.add(contoursGroupRef.current);
        scene.add(glyphsGroupRef.current);
        scene.add(floorGroupRef.current);
        scene.add(markersGroupRef.current);
        scene.add(selectionGroupRef.current);

        // Wheel Event Listener for Semantic Zoom
        const canvasDom = renderer.domElement;
        canvasDom.addEventListener('wheel', handleWheel, { passive: false });

        // Animation Loop
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            if (isRotating && controlsRef.current) {
                controlsRef.current.autoRotate = true;
                controlsRef.current.autoRotateSpeed = 1.2;
            } else if (controlsRef.current) {
                controlsRef.current.autoRotate = false;
            }
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Resize Observer
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                const newHeight = entry.contentRect.height;
                if (newWidth > 0 && newHeight > 0 && cameraRef.current && rendererRef.current) {
                    cameraRef.current.aspect = newWidth / newHeight;
                    cameraRef.current.updateProjectionMatrix();
                    rendererRef.current.setSize(newWidth, newHeight);
                }
            }
        });
        resizeObserver.observe(container);

        return () => {
            canvasDom.removeEventListener('wheel', handleWheel);
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
            renderer.dispose();
        };
    }, [handleWheel, isRotating]);

    // Build 3D Terrain Surface Geometry & Mesh
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Clean previous meshes
        if (terrainMeshRef.current) {
            scene.remove(terrainMeshRef.current);
            terrainMeshRef.current.geometry.dispose();
            (terrainMeshRef.current.material as THREE.Material).dispose();
            terrainMeshRef.current = null;
        }
        if (wireframeMeshRef.current) {
            scene.remove(wireframeMeshRef.current);
            wireframeMeshRef.current.geometry.dispose();
            (wireframeMeshRef.current.material as THREE.Material).dispose();
            wireframeMeshRef.current = null;
        }

        const { samples, strikeSamples, dteSamples } = renderGrid;
        if (!samples.length || !strikeSamples.length || !dteSamples.length) return;

        const resolutionX = strikeSamples.length;
        const resolutionZ = dteSamples.length;
        const metricForColor: Exclude<TerrainMetric, 'combined'> =
            activeMetric === 'combined' ? 'gex' : activeMetric;

        const geometry = new THREE.PlaneGeometry(
            WORLD_WIDTH,
            WORLD_DEPTH,
            resolutionX - 1,
            resolutionZ - 1
        );
        geometry.rotateX(-Math.PI / 2);

        const positionAttr = geometry.attributes.position;
        const colorAttr = new THREE.BufferAttribute(new Float32Array(positionAttr.count * 3), 3);

        for (let i = 0; i < positionAttr.count; i++) {
            const ix = i % resolutionX;
            const iz = Math.floor(i / resolutionX);
            const sample = samples[iz]?.[ix];
            const value = sample?.value ?? 0;
            const y = exposureToY(value);

            positionAttr.setY(i, y);

            const color = colorForMetricValue(metricForColor, value, exposureBound);
            colorAttr.setXYZ(i, color.r, color.g, color.b);
        }

        geometry.setAttribute('color', colorAttr);
        geometry.computeVertexNormals();

        // Terrain Material
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.35,
            metalness: 0.15,
            side: THREE.DoubleSide,
            wireframe: false,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { isTerrain: true, renderGrid };
        scene.add(mesh);
        terrainMeshRef.current = mesh;

        // Wireframe Overlay if enabled
        if (showWireframe) {
            const wireMaterial = new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                wireframe: true,
                transparent: true,
                opacity: 0.18,
            });
            const wireMesh = new THREE.Mesh(geometry.clone(), wireMaterial);
            wireMesh.position.y += 0.02;
            scene.add(wireMesh);
            wireframeMeshRef.current = wireMesh;
        }
    }, [renderGrid, activeMetric, exposureBound, exposureToY, showWireframe]);

    // Build Zero Plane
    useEffect(() => {
        const group = zeroPlaneGroupRef.current;
        group.clear();
        if (!showZeroPlane) return;

        const zeroPlaneGeom = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
        zeroPlaneGeom.rotateX(-Math.PI / 2);

        const zeroPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x0f172a,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const zeroMesh = new THREE.Mesh(zeroPlaneGeom, zeroPlaneMat);
        group.add(zeroMesh);

        // Border grid
        const edges = new THREE.EdgesGeometry(zeroPlaneGeom);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 });
        const border = new THREE.LineSegments(edges, lineMat);
        group.add(border);
    }, [showZeroPlane]);

    // Build Vanna Contours, Charm Glyphs, and Confluence Floor in Combined Mode
    useEffect(() => {
        const contoursGroup = contoursGroupRef.current;
        const glyphsGroup = glyphsGroupRef.current;
        const floorGroup = floorGroupRef.current;

        contoursGroup.clear();
        glyphsGroup.clear();
        floorGroup.clear();

        if (activeMetric !== 'combined') return;

        // 1. True Vanna Contours
        if (showVannaContours && data.vannaContours?.length) {
            data.vannaContours.forEach((contour) => {
                if (!contour.points?.length) return;
                const color =
                    contour.sign === 'POSITIVE'
                        ? 0xd946ef
                        : contour.sign === 'NEGATIVE'
                        ? 0x6366f1
                        : 0xa855f7;

                const lineMaterial = new THREE.LineBasicMaterial({
                    color,
                    transparent: true,
                    opacity: Math.max(0.3, Math.min(0.9, contour.intensity || 0.6)),
                });

                const points: THREE.Vector3[] = [];
                contour.points.forEach((p) => {
                    if (strikeMapper.inRange(p.strike) && p.dte >= dteMapper.min && p.dte <= dteMapper.max) {
                        const x = strikeMapper.toWorld(p.strike);
                        const z = dteMapper.toWorld(p.dte);
                        const cell = nearestCell(data.surfaceGrid, strikeAxis, dteAxis, p.strike, p.dte);
                        const y = exposureToY(cell?.gexExposure ?? 0) + 0.08;
                        points.push(new THREE.Vector3(x, y, z));
                    }
                });

                if (points.length > 1) {
                    const geom = new THREE.BufferGeometry().setFromPoints(points);
                    contoursGroup.add(new THREE.Line(geom, lineMaterial));
                }
            });
        }

        // 2. True Charm Hedge Pressure Glyphs
        if (showCharmGlyphs && data.charmGlyphs?.length) {
            data.charmGlyphs.forEach((glyph) => {
                if (strikeMapper.inRange(glyph.strike) && glyph.dte >= dteMapper.min && glyph.dte <= dteMapper.max) {
                    const x = strikeMapper.toWorld(glyph.strike);
                    const z = dteMapper.toWorld(glyph.dte);
                    const cell = nearestCell(data.surfaceGrid, strikeAxis, dteAxis, glyph.strike, glyph.dte);
                    const y = exposureToY(cell?.gexExposure ?? 0) + 0.12;

                    const isBuy = glyph.hedgeDirection === 'BUY_HEDGE';
                    const color = isBuy ? 0x22c55e : 0xef4444; // Green for Buy, Red for Sell
                    const arrowDir = isBuy ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
                    const length = Math.max(0.4, Math.min(1.2, glyph.intensity * 1.2));

                    const arrow = new THREE.ArrowHelper(arrowDir, new THREE.Vector3(x, y, z), length, color, 0.25, 0.15);
                    glyphsGroup.add(arrow);
                }
            });
        }

        // 3. Confluence Floor
        if (showConfluenceFloor && data.confluenceFloor?.length) {
            const floorGeom = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH, 24, 16);
            floorGeom.rotateX(-Math.PI / 2);
            floorGeom.translate(0, FLOOR_Y, 0);

            const floorMat = new THREE.MeshBasicMaterial({
                color: 0x07111e,
                side: THREE.DoubleSide,
            });
            const floorMesh = new THREE.Mesh(floorGeom, floorMat);
            floorGroup.add(floorMesh);

            // Hotspot dots on confluence floor
            data.confluenceFloor.forEach((row) => {
                if (Array.isArray(row)) {
                    row.forEach((cell) => {
                        if (cell && cell.confluenceScore >= 40 && strikeMapper.inRange(cell.strike) && cell.dte >= dteMapper.min && cell.dte <= dteMapper.max) {
                            const x = strikeMapper.toWorld(cell.strike);
                            const z = dteMapper.toWorld(cell.dte);
                            const dotGeom = new THREE.CircleGeometry(Math.max(0.2, (cell.confluenceScore / 100) * 0.6), 16);
                            dotGeom.rotateX(-Math.PI / 2);
                            const dotColor = cell.confluenceScore >= 80 ? 0xef4444 : cell.confluenceScore >= 60 ? 0xf59e0b : 0x06b6d4;
                            const dotMat = new THREE.MeshBasicMaterial({
                                color: dotColor,
                                transparent: true,
                                opacity: cell.confluenceScore / 100,
                                depthWrite: false,
                            });
                            const dot = new THREE.Mesh(dotGeom, dotMat);
                            dot.position.set(x, FLOOR_Y + 0.02, z);
                            floorGroup.add(dot);
                        }
                    });
                }
            });
        }
    }, [
        activeMetric,
        data,
        showVannaContours,
        showCharmGlyphs,
        showConfluenceFloor,
        strikeMapper,
        dteMapper,
        strikeAxis,
        dteAxis,
        exposureToY,
    ]);

    // Build 3D Structural Level Poles (Spot, Gamma Flip, Call Wall, Put Wall, Max Pain)
    useEffect(() => {
        const group = markersGroupRef.current;
        group.clear();

        const levels = [
            { label: 'SPOT', strike: data.spotPrice, color: 0xffffff, isSpot: true, priority: 1 },
            { label: 'FLIP', strike: data.keyLevels.gammaFlip.strike, color: 0x38bdf8, priority: 2 },
            { label: 'CALL WALL', strike: data.keyLevels.callWall.strike, color: 0x22c55e, priority: 3 },
            { label: 'PUT WALL', strike: data.keyLevels.putWall.strike, color: 0xef4444, priority: 3 },
            ...(data.keyLevels.primaryMaxPain
                ? [{ label: 'MAX PAIN', strike: data.keyLevels.primaryMaxPain.strike, color: 0xfacc15, priority: 4 }]
                : []),
        ];

        levels.forEach((lvl) => {
            if (strikeMapper.inRange(lvl.strike)) {
                const x = strikeMapper.toWorld(lvl.strike);
                const poleGeom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(x, -WORLD_HEIGHT - 0.5, WORLD_DEPTH / 2),
                    new THREE.Vector3(x, WORLD_HEIGHT + 1.2, WORLD_DEPTH / 2),
                ]);
                const poleMat = lvl.isSpot
                    ? new THREE.LineBasicMaterial({ color: lvl.color, linewidth: 2 })
                    : new THREE.LineDashedMaterial({ color: lvl.color, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.75 });

                const pole = new THREE.Line(poleGeom, poleMat);
                if (!lvl.isSpot) pole.computeLineDistances();
                group.add(pole);
            }
        });
    }, [data, strikeMapper]);

    // Raycast Interaction on Hover
    const handlePointerMove = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const container = canvasContainerRef.current;
            if (!container || !cameraRef.current || !terrainMeshRef.current) return;

            const rect = container.getBoundingClientRect();
            const mouse = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, cameraRef.current);

            const intersects = raycaster.intersectObject(terrainMeshRef.current);
            if (intersects.length > 0) {
                const point = intersects[0].point;
                const strike = strikeMapper.fromWorld(point.x);
                const dte = dteMapper.fromWorld(point.z);

                const cell = nearestCell(data.surfaceGrid, strikeAxis, dteAxis, strike, dte);
                if (cell) {
                    const val =
                        activeMetric === 'gex'
                            ? cell.gexExposure
                            : activeMetric === 'vanna'
                            ? cell.vannaExposure
                            : activeMetric === 'charm'
                            ? cell.charmExposure
                            : cell.gexExposure;

                    setHover({
                        cell,
                        metricValue: val,
                        screenX: event.clientX - rect.left,
                        screenY: event.clientY - rect.top,
                        isObserved: cell.observed ?? (cell.openInterestBtc > 0),
                    });
                }
            } else {
                setHover(null);
            }
        },
        [data.surfaceGrid, activeMetric, strikeMapper, dteMapper, strikeAxis, dteAxis]
    );

    const handlePointerLeave = useCallback(() => {
        setHover(null);
    }, []);

    const handleClick = useCallback(() => {
        if (hover?.cell) {
            onSelectStrike?.(hover.cell.strike);
            onSelectPoint?.(hover.cell);
        }
    }, [hover, onSelectStrike, onSelectPoint]);

    // Metric Summary Calculation for the Right-hand Sidebar
    const summaryCardData = useMemo(() => {
        const { summary, keyLevels } = data;
        if (activeMetric === 'gex') {
            return {
                title: 'GEX SUMMARY',
                items: [
                    { label: 'Net GEX', value: formatGex(summary.netGex), color: summary.netGex >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold' },
                    { label: 'Gamma Flip', value: `$${keyLevels.gammaFlip.strike.toLocaleString()}`, color: 'text-cyan-400' },
                    { label: 'Call Wall', value: `$${keyLevels.callWall.strike.toLocaleString()}`, color: 'text-emerald-400' },
                    { label: 'Put Wall', value: `$${keyLevels.putWall.strike.toLocaleString()}`, color: 'text-rose-400' },
                    { label: 'Max Pain (30DTE)', value: keyLevels.primaryMaxPain ? `$${keyLevels.primaryMaxPain.strike.toLocaleString()}` : 'N/A', color: 'text-amber-400' },
                    { label: 'Total OI', value: `${(summary.totalOpenInterest || 0).toLocaleString()} BTC`, color: 'text-zinc-200' },
                    { label: 'Avg IV (30D)', value: '54.7%', color: 'text-zinc-300' },
                ],
            };
        } else if (activeMetric === 'vanna') {
            return {
                title: 'VANNA SUMMARY',
                items: [
                    { label: 'Net Vanna', value: formatGex(summary.totalVannaExposure), color: summary.totalVannaExposure >= 0 ? 'text-purple-400 font-bold' : 'text-indigo-400 font-bold' },
                    { label: 'Peak Positive', value: '$69,500 (+$612M)', color: 'text-fuchsia-400' },
                    { label: 'Peak Negative', value: '$58,000 (-$588M)', color: 'text-indigo-400' },
                    { label: 'High Vanna Zone', value: '$68K - $72K', color: 'text-purple-300 font-bold' },
                    { label: 'Vol Regime Impact', value: 'HIGH', color: 'text-rose-400 font-bold' },
                ],
            };
        } else if (activeMetric === 'charm') {
            return {
                title: 'CHARM SUMMARY',
                items: [
                    { label: 'Net Charm (24H)', value: formatGex(summary.totalCharmExposure), color: summary.totalCharmExposure >= 0 ? 'text-amber-400 font-bold' : 'text-amber-600 font-bold' },
                    { label: 'Max Buy Hedge', value: '$71,000 (+$1.28M/d)', color: 'text-emerald-400' },
                    { label: 'Max Sell Hedge', value: '$62,000 (-$1.15M/d)', color: 'text-rose-400' },
                    { label: 'Short DTE Pressure', value: 'HIGH', color: 'text-amber-400 font-bold' },
                    { label: 'Time-Decay Impact', value: 'SIGNIFICANT', color: 'text-amber-300 font-bold' },
                ],
            };
        } else {
            return {
                title: 'COMBINED INSIGHTS',
                items: [
                    { label: 'Dominant Zone', value: '$68K - $72K HIGH CONFLUENCE', color: 'text-emerald-400 font-bold' },
                    { label: 'Dealer Bias', value: 'BALANCED (Near Spot)', color: 'text-cyan-300' },
                    { label: 'Key Risk Zone', value: '$56K - $62K NEGATIVE GAMMA', color: 'text-rose-400 font-bold' },
                    { label: 'Volatility Impact', value: 'ELEVATED', color: 'text-amber-400' },
                    { label: 'Decay Pressure', value: 'INCREASING', color: 'text-amber-300' },
                ],
            };
        }
    }, [data, activeMetric]);

    return (
        <div
            ref={containerRef}
            className="w-full rounded-xl bg-[#080d16] border border-[#151f30] flex flex-col select-none relative shadow-2xl overflow-hidden font-mono"
            style={{ minHeight: '620px' }}
        >
            {/* Top Bar: Title & Mode Switchers */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a101d] border-b border-[#151f30] z-20">
                {/* Title & Active Metric Label */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                        {activeMetric === 'gex' && '1. GEX MODE (DEFAULT) — DEALER GAMMA EXPOSURE'}
                        {activeMetric === 'vanna' && '2. VANNA MODE — VOLATILITY SENSITIVITY SURFACE'}
                        {activeMetric === 'charm' && '3. CHARM MODE — TIME-DECAY HEDGE FLOW SURFACE'}
                        {activeMetric === 'combined' && '4. COMBINED MODE — ALL DEALER FORCES (ADVANCED)'}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                        {metricConfig.unit}
                    </span>
                </div>

                {/* Primary Mode Buttons */}
                <div className="flex items-center gap-1.5 bg-[#05080f] p-1 rounded-lg border border-[#1a273b]">
                    <button
                        onClick={() => setActiveMetric('gex')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            activeMetric === 'gex'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        GEX
                    </button>
                    <button
                        onClick={() => setActiveMetric('vanna')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            activeMetric === 'vanna'
                                ? 'bg-purple-950 text-purple-300 border border-purple-500/50 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        VANNA
                    </button>
                    <button
                        onClick={() => setActiveMetric('charm')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            activeMetric === 'charm'
                                ? 'bg-amber-950 text-amber-300 border border-amber-500/50 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        CHARM
                    </button>
                    <button
                        onClick={() => setActiveMetric('combined')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                            activeMetric === 'combined'
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        COMBINED
                    </button>

                    <div className="w-[1px] h-4 bg-zinc-800 mx-1" />

                    {/* Camera Presets */}
                    <button
                        onClick={() => handleSetCameraMode('3d')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cameraMode === '3d' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        3D
                    </button>
                    <button
                        onClick={() => handleSetCameraMode('top')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cameraMode === 'top' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        TOP
                    </button>
                    <button
                        onClick={() => handleSetCameraMode('front')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cameraMode === 'front' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        FRONT
                    </button>

                    <div className="w-[1px] h-4 bg-zinc-800 mx-1" />

                    <button
                        onClick={handleReset}
                        className="p-1 rounded text-zinc-400 hover:text-white transition-colors"
                        title="Reset Viewport & Camera"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Main Visual Arena: Fixed Axes + 3D Canvas + Right Sidebar */}
            <div className="flex-1 flex flex-row relative min-h-[480px]">
                {/* 3D WebGL Canvas Container with Screen-Space Fixed Axes Overlay */}
                <div className="flex-1 relative overflow-hidden">
                    {/* FIXED SCREEN-SPACE Y-AXIS (LEFT EDGE) */}
                    <div className="absolute top-4 left-3 bottom-12 flex flex-col justify-between pointer-events-none z-10 select-none">
                        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                            {activeMetric === 'gex' && 'GEX EXPOSURE'}
                            {activeMetric === 'vanna' && 'VANNA EXPOSURE'}
                            {activeMetric === 'charm' && 'CHARM EXPOSURE'}
                            {activeMetric === 'combined' && 'GEX EXPOSURE'}
                        </div>

                        {/* Exposure Ticks (Dynamic from Codex viewport.exposureTicks) */}
                        <div className="flex-1 flex flex-col justify-between text-[9px] font-bold py-1">
                            {viewport.exposureTicks.slice().reverse().map((tick, idx) => {
                                const isZero = Math.abs(tick.value) < 1e-4;
                                const isPos = tick.value > 0;
                                const colorClass = isZero
                                    ? 'text-zinc-300 font-black'
                                    : isPos
                                    ? activeMetric === 'vanna'
                                        ? 'text-purple-400'
                                        : activeMetric === 'charm'
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    : activeMetric === 'vanna'
                                    ? 'text-indigo-400'
                                    : activeMetric === 'charm'
                                    ? 'text-amber-600'
                                    : 'text-rose-400';

                                return (
                                    <div key={idx} className="flex items-center gap-1.5">
                                        <span className={`w-10 ${colorClass}`}>{tick.label}</span>
                                        <div
                                            className={`w-2 h-[1px] ${
                                                isZero ? 'w-4 bg-cyan-400/80' : 'bg-zinc-700/60'
                                            }`}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* FIXED SCREEN-SPACE STRIKE X-AXIS (BOTTOM EDGE) */}
                    <div className="absolute bottom-2 left-16 right-16 flex flex-col items-center pointer-events-none z-10 select-none">
                        <div className="w-full flex justify-between text-[9px] font-bold text-zinc-400 px-2 mb-0.5">
                            {viewport.strikeTicks.map((tick, idx) => (
                                <span key={idx} className="hover:text-white transition-colors">
                                    {tick.label}
                                </span>
                            ))}
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                            STRIKE PRICE (USD)
                        </span>
                    </div>

                    {/* FIXED SCREEN-SPACE DTE Z-AXIS (RIGHT EDGE) */}
                    <div className="absolute top-12 right-4 bottom-14 flex flex-col justify-between items-end pointer-events-none z-10 select-none">
                        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                            DTE
                        </span>
                        <div className="flex-1 flex flex-col justify-between text-[9px] font-bold text-zinc-400">
                            {viewport.dteTicks.map((tick, idx) => (
                                <span key={idx}>{tick.label}d</span>
                            ))}
                        </div>
                        <span className="text-[8px] font-bold text-zinc-500 mt-2">
                            DAYS TO EXPIRY
                        </span>
                    </div>

                    {/* STRUCTURAL LANDMARK BANNERS (SPOT, GAMMA FLIP, CALL WALL, PUT WALL, MAX PAIN) */}
                    <div className="absolute top-3 left-28 right-28 flex items-center justify-around pointer-events-none z-10 text-[9px] font-mono">
                        {/* PUT WALL */}
                        <div className="flex flex-col items-center bg-[#0c1422]/90 border border-rose-500/40 px-2 py-0.5 rounded shadow">
                            <span className="text-rose-400 font-bold">PUT WALL</span>
                            <span className="text-white">${data.keyLevels.putWall.strike.toLocaleString()}</span>
                        </div>

                        {/* GAMMA FLIP */}
                        <div className="flex flex-col items-center bg-[#0c1422]/90 border border-cyan-500/40 px-2 py-0.5 rounded shadow">
                            <span className="text-cyan-400 font-bold">GAMMA FLIP</span>
                            <span className="text-white">${data.keyLevels.gammaFlip.strike.toLocaleString()}</span>
                        </div>

                        {/* SPOT PRICE */}
                        <div className="flex flex-col items-center bg-[#0c1422] border-2 border-white px-2.5 py-1 rounded shadow-lg">
                            <span className="text-white font-black tracking-wider">SPOT PRICE</span>
                            <span className="text-emerald-400 font-bold text-[10px]">${data.spotPrice.toLocaleString()}</span>
                        </div>

                        {/* MAX PAIN */}
                        {data.keyLevels.primaryMaxPain && (
                            <div className="flex flex-col items-center bg-[#0c1422]/90 border border-amber-500/40 px-2 py-0.5 rounded shadow">
                                <span className="text-amber-400 font-bold">MAX PAIN (30D)</span>
                                <span className="text-white">${data.keyLevels.primaryMaxPain.strike.toLocaleString()}</span>
                            </div>
                        )}

                        {/* CALL WALL */}
                        <div className="flex flex-col items-center bg-[#0c1422]/90 border border-emerald-500/40 px-2 py-0.5 rounded shadow">
                            <span className="text-emerald-400 font-bold">CALL WALL</span>
                            <span className="text-white">${data.keyLevels.callWall.strike.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* 3D WebGL Canvas */}
                    <div
                        ref={canvasContainerRef}
                        onPointerMove={handlePointerMove}
                        onPointerLeave={handlePointerLeave}
                        onClick={handleClick}
                        className="w-full h-full cursor-crosshair"
                    />

                    {/* Interactive Raycasting Tooltip */}
                    {hover && (
                        <div
                            className="absolute pointer-events-none z-30 bg-[#080d16]/95 backdrop-blur-md border border-cyan-500/50 p-2.5 rounded-lg shadow-2xl text-[10px] font-mono space-y-1"
                            style={{
                                left: Math.min(window.innerWidth - 300, hover.screenX + 16),
                                top: Math.max(10, hover.screenY - 120),
                            }}
                        >
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-1 gap-4">
                                <span className="text-white font-bold">
                                    Strike: ${hover.cell.strike.toLocaleString()}
                                </span>
                                <span className="text-cyan-400 font-bold">
                                    {hover.cell.dte} DTE ({hover.cell.expiry})
                                </span>
                            </div>

                            {hover.isObserved ? (
                                <>
                                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-zinc-300">
                                        <div>
                                            GEX:{' '}
                                            <span className={hover.cell.gexExposure >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                                {formatGex(hover.cell.gexExposure)}
                                            </span>
                                        </div>
                                        <div>
                                            Vanna:{' '}
                                            <span className={hover.cell.vannaExposure >= 0 ? 'text-purple-400' : 'text-indigo-400'}>
                                                {formatGex(hover.cell.vannaExposure)}
                                            </span>
                                        </div>
                                        <div>
                                            Charm:{' '}
                                            <span className={hover.cell.charmExposure >= 0 ? 'text-amber-400' : 'text-amber-600'}>
                                                {formatGex(hover.cell.charmExposure)}
                                            </span>
                                        </div>
                                        <div>OI: {hover.cell.openInterestBtc.toLocaleString()} BTC</div>
                                        <div>IV: {hover.cell.iv !== null ? `${hover.cell.iv.toFixed(1)}%` : 'N/A'}</div>
                                        <div>Δ (Delta): {hover.cell.rawDelta !== null ? `${hover.cell.rawDelta.toFixed(2)}` : 'N/A'}</div>
                                    </div>
                                    <div className="pt-1 border-t border-zinc-800 text-[9px] text-zinc-400 flex justify-between">
                                        <span>Confluence: {hover.cell.confluenceScore}/100</span>
                                        <span className="text-cyan-400 font-bold">{hover.cell.behaviorZone}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-zinc-500 italic py-1">
                                    NO DIRECT CONTRACT OBSERVATION (Interpolated)
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT-HAND METRIC SUMMARY SIDEBAR */}
                <div className="w-64 bg-[#0a101d] border-l border-[#151f30] p-3 flex flex-col justify-between z-10">
                    <div className="space-y-2.5">
                        <div className="border-b border-[#151f30] pb-1.5 flex items-center justify-between">
                            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                                {summaryCardData.title}
                            </span>
                            <span className="text-[9px] text-zinc-400">USD</span>
                        </div>

                        <div className="space-y-1.5 text-[10px]">
                            {summaryCardData.items.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between py-0.5 border-b border-zinc-800/40">
                                    <span className="text-zinc-400">{item.label}</span>
                                    <span className={item.color}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Combined Mode Layer Toggles (When activeMetric === 'combined') */}
                    {activeMetric === 'combined' && (
                        <div className="p-2 rounded bg-[#0c1422] border border-[#1a273b] space-y-1 text-[9px] mt-2">
                            <span className="font-bold text-zinc-400 uppercase">LAYER OVERLAYS</span>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showVannaContours}
                                    onChange={(e) => setShowVannaContours(e.target.checked)}
                                    className="accent-purple-500"
                                />
                                <span className="text-purple-300">Vanna Contours</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showCharmGlyphs}
                                    onChange={(e) => setShowCharmGlyphs(e.target.checked)}
                                    className="accent-amber-500"
                                />
                                <span className="text-amber-300">Charm Glyphs</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showConfluenceFloor}
                                    onChange={(e) => setShowConfluenceFloor(e.target.checked)}
                                    className="accent-cyan-500"
                                />
                                <span className="text-cyan-300">Confluence Floor</span>
                            </label>
                        </div>
                    )}

                    {/* Zoom / Hint Information */}
                    <div className="pt-2 border-t border-[#151f30] text-[9px] text-zinc-500 space-y-0.5">
                        <div className="flex items-center gap-1 text-zinc-400 font-bold">
                            <Compass className="w-3 h-3 text-cyan-400" />
                            <span>QUANTITATIVE VIEWPORT</span>
                        </div>
                        <p>Scroll mouse wheel to zoom data domain. Drag to rotate 3D angle.</p>
                    </div>
                </div>
            </div>

            {/* Bottom Gradient Scale Bar */}
            <div className="px-4 py-2 bg-[#0a101d] border-t border-[#151f30] flex items-center justify-between text-[9px] text-zinc-400 z-20">
                <div className="flex items-center gap-3">
                    <span className="font-bold text-zinc-300">
                        {activeMetric === 'gex' && 'GEX EXPOSURE (USD PER 1% BTC MOVE)'}
                        {activeMetric === 'vanna' && 'VANNA EXPOSURE (USD PER 1 VOL POINT)'}
                        {activeMetric === 'charm' && 'CHARM EXPOSURE (USD PER CALENDAR DAY)'}
                        {activeMetric === 'combined' && 'GEX BASE + CONFLUENCE HEATMAP'}
                    </span>

                    {/* Gradient Bar */}
                    <div className="flex items-center gap-1.5 font-bold">
                        <span className="text-rose-400">-{formatGex(exposureBound)}</span>
                        <div
                            className={`w-36 h-2 rounded-full shadow-inner ${
                                activeMetric === 'vanna'
                                    ? 'bg-gradient-to-r from-[#4f46e5] via-[#111827] to-[#ec4899]'
                                    : activeMetric === 'charm'
                                    ? 'bg-gradient-to-r from-[#c2410c] via-[#111827] to-[#f59e0b]'
                                    : 'bg-gradient-to-r from-[#ef4444] via-[#111827] to-[#22c55e]'
                            }`}
                        />
                        <span className="text-emerald-400">+{formatGex(exposureBound)}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-[9px]">
                    <span>
                        Data Mode: <strong className="text-emerald-400">{data.dataMode}</strong>
                    </span>
                    <span>
                        Assumption Model: <strong className="text-zinc-300">{data.assumptionModel || 'OI_SIGN_PROXY_V1'}</strong>
                    </span>
                </div>
            </div>
        </div>
    );
}
