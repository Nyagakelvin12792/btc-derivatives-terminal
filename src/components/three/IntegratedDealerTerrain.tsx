'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Info, Maximize2, RotateCcw, Play, Pause, Eye, Check, Target, Compass } from 'lucide-react';
import {
    TerrainDataContractV2,
    TerrainSurfaceCell,
    VannaContourPrimitive,
    CharmPressureGlyph,
    ConfluenceFloorCell,
    TerrainScales,
    TerrainKeyLevels,
    DealerBehaviorZone,
} from '@/lib/terrain/types';
import { formatUsd, formatGex } from '@/lib/dashboard/adapters';

interface IntegratedDealerTerrainProps {
    data: TerrainDataContractV2;
    selectedStrike?: number | null;
    selectedDte?: number | null;
    onSelectStrike?: (strike: number) => void;
    onSelectPoint?: (cell: TerrainSurfaceCell) => void;
}

export default function IntegratedDealerTerrain({
    data,
    selectedStrike,
    selectedDte,
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
    const [showFloor, setShowFloor] = useState(true);
    const [showSpot, setShowSpot] = useState(true);
    const [showDealerLevels, setShowDealerLevels] = useState(true);
    const [showZeroPlane, setShowZeroPlane] = useState(true);
    const [showWireframe, setShowWireframe] = useState(true);
    const [isRotating, setIsRotating] = useState(false);
    const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');

    // Hover tooltip state
    const [hoveredCell, setHoveredCell] = useState<TerrainSurfaceCell | null>(null);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

    // Groups for selective rendering
    const gexGroupRef = useRef<THREE.Group>(new THREE.Group());
    const vannaGroupRef = useRef<THREE.Group>(new THREE.Group());
    const charmGroupRef = useRef<THREE.Group>(new THREE.Group());
    const floorGroupRef = useRef<THREE.Group>(new THREE.Group());
    const spotGroupRef = useRef<THREE.Group>(new THREE.Group());
    const levelsGroupRef = useRef<THREE.Group>(new THREE.Group());
    const zeroPlaneGroupRef = useRef<THREE.Group>(new THREE.Group());
    const selectionGroupRef = useRef<THREE.Group>(new THREE.Group());

    // Sync visibility toggles
    useEffect(() => { gexGroupRef.current.visible = showGex; }, [showGex]);
    useEffect(() => { vannaGroupRef.current.visible = showVanna; }, [showVanna]);
    useEffect(() => { charmGroupRef.current.visible = showCharm; }, [showCharm]);
    useEffect(() => { floorGroupRef.current.visible = showFloor; }, [showFloor]);
    useEffect(() => { spotGroupRef.current.visible = showSpot; }, [showSpot]);
    useEffect(() => { levelsGroupRef.current.visible = showDealerLevels; }, [showDealerLevels]);
    useEffect(() => { zeroPlaneGroupRef.current.visible = showZeroPlane; }, [showZeroPlane]);

    // Dimensions in Three.js world coordinates
    const WORLD_WIDTH = 26;
    const WORLD_DEPTH = 18;
    const MAX_HEIGHT = 7.2;
    const FLOOR_Y = -MAX_HEIGHT - 1.2;

    const {
        surfaceGrid,
        strikes,
        dtes,
        scales,
        keyLevels,
        vannaContours,
        charmGlyphs,
        confluenceFloor,
        spotPrice,
        dataMode,
    } = data;

    const gexScaleBound = (scales as any)?.gex?.robustAbsMax || (scales as any)?.gex?.max || (scales as any)?.gexMax || 1e9;
    const vannaScaleBound = (scales as any)?.vanna?.robustAbsMax || (scales as any)?.vanna?.max || (scales as any)?.vannaMax || 1e8;
    const charmScaleBound = (scales as any)?.charm?.robustAbsMax || (scales as any)?.charm?.max || (scales as any)?.charmMax || 1e8;

    const gexUnit = (scales as any)?.gex?.unit || (scales as any)?.gexUnit || 'USD / 1% BTC move';
    const vannaUnit = (scales as any)?.vanna?.unit || (scales as any)?.vannaUnit || 'USD / 1 vol point';
    const charmUnit = (scales as any)?.charm?.unit || (scales as any)?.charmUnit || 'USD / day decay';

    const minStrike = strikes[0] || 50000;
    const maxStrike = strikes[strikes.length - 1] || 80000;
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
        scene.fog = new THREE.FogExp2(0x060a12, 0.008);

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
        controls.maxPolarAngle = Math.PI / 2 + 0.15;
        controls.target.set(0, -1, 0);
        controlsRef.current = controls;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x00e676, 1.8);
        dirLight1.position.set(15, 30, 15);
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xff1744, 1.5);
        dirLight2.position.set(-15, -15, -15);
        scene.add(dirLight2);

        const topLight = new THREE.PointLight(0x38bdf8, 1.3, 90);
        topLight.position.set(0, 22, 0);
        scene.add(topLight);

        // Root Group
        const rootGroup = new THREE.Group();
        scene.add(rootGroup);
        rootGroupRef.current = rootGroup;

        rootGroup.add(floorGroupRef.current);
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
                const normX = (point.x + WORLD_WIDTH / 2) / WORLD_WIDTH;
                const normZ = (point.z + WORLD_DEPTH / 2) / WORLD_DEPTH;
                const strikeEstimate = minStrike + normX * (maxStrike - minStrike);
                const dteEstimate = minDte + normZ * (maxDte - minDte);

                let closest: TerrainSurfaceCell | null = null;
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

    // Build 3D Terrain Meshes from Contract V2 Data
    useEffect(() => {
        if (!surfaceGrid || surfaceGrid.length === 0) return;

        const gexGroup = gexGroupRef.current;
        const vannaGroup = vannaGroupRef.current;
        const charmGroup = charmGroupRef.current;
        const floorGroup = floorGroupRef.current;
        const spotGroup = spotGroupRef.current;
        const levelsGroup = levelsGroupRef.current;
        const zeroPlaneGroup = zeroPlaneGroupRef.current;
        const selectionGroup = selectionGroupRef.current;

        // Clean previous meshes
        [gexGroup, vannaGroup, charmGroup, floorGroup, spotGroup, levelsGroup, zeroPlaneGroup, selectionGroup].forEach((grp) => {
            while (grp.children.length > 0) {
                const child = grp.children[0];
                grp.remove(child);
                if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
            }
        });

        const numRows = surfaceGrid.length; // DTEs
        const numCols = surfaceGrid[0].length; // Strikes

        // 1. CONFLUENCE PRESSURE FLOOR (Rendered below GEX surface)
        if (confluenceFloor && confluenceFloor.length > 0) {
            const fRows = confluenceFloor.length;
            const fCols = confluenceFloor[0].length;

            const floorGeo = new THREE.PlaneGeometry(
                WORLD_WIDTH,
                WORLD_DEPTH,
                fCols - 1,
                fRows - 1
            );
            floorGeo.rotateX(-Math.PI / 2);

            const fColors: number[] = [];
            for (let i = 0; i < fRows; i++) {
                for (let j = 0; j < fCols; j++) {
                    const cCell = confluenceFloor[i][j];
                    const score = cCell.confluenceScore || 0;
                    const normScore = Math.min(1, Math.max(0, score / 100));

                    const color = new THREE.Color();
                    if (normScore < 0.4) {
                        color.setRGB(0.04 + normScore * 0.1, 0.08 + normScore * 0.15, 0.14 + normScore * 0.2);
                    } else if (normScore < 0.75) {
                        color.setRGB(0.0, 0.6 + normScore * 0.3, 0.7 + normScore * 0.25);
                    } else {
                        color.setRGB(0.95, 0.82, 0.25); // Extreme Hotspot Glow
                    }
                    fColors.push(color.r, color.g, color.b);
                }
            }

            floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(fColors, 3));
            const floorMat = new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 0.5,
                metalness: 0.2,
                side: THREE.DoubleSide,
            });

            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.position.y = FLOOR_Y;
            floorGroup.add(floorMesh);

            const floorEdgeGeo = new THREE.EdgesGeometry(floorGeo);
            const floorEdgeMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.4 });
            const floorEdges = new THREE.LineSegments(floorEdgeGeo, floorEdgeMat);
            floorEdges.position.y = FLOOR_Y;
            floorGroup.add(floorEdges);
        }

        // 2. GEX PHYSICAL TERRAIN (Elevation determined by GEX Exposure normalized by robustAbsMax)
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
                const cell = surfaceGrid[i][j];
                const gexExp = cell.gexExposure ?? cell.gex ?? 0;

                // Normalized Y elevation
                const heightY = (gexExp / gexScaleBound) * MAX_HEIGHT;
                positions.setY(vertexIndex, heightY);

                // Green Mountain (+GEX) vs Red Canyon (-GEX)
                const color = new THREE.Color();
                if (gexExp >= 0) {
                    const t = Math.min(1, gexExp / gexScaleBound);
                    color.setRGB(0.03 + 0.05 * (1 - t), 0.72 + 0.28 * t, 0.32 + 0.4 * t);
                } else {
                    const t = Math.min(1, Math.abs(gexExp) / gexScaleBound);
                    color.setRGB(0.85 + 0.15 * t, 0.06, 0.20 + 0.06 * (1 - t));
                }
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const surfaceMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.32,
            metalness: 0.28,
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
                opacity: 0.26,
            });
            const wireframeMesh = new THREE.Mesh(geometry.clone(), wireframeMat);
            wireframeMesh.position.y += 0.02;
            gexGroup.add(wireframeMesh);
        }

        // 3. TRUE VANNA CONTOURS (Projected from Codex vannaContours)
        if (vannaContours && vannaContours.length > 0) {
            vannaContours.forEach((contour) => {
                if (!contour.points || contour.points.length < 2) return;

                const pts: THREE.Vector3[] = contour.points.map((pt) => {
                    const x = strikeToX(pt.strike);
                    const z = dteToZ(pt.dte);

                    // Find corresponding GEX height
                    const normStrike = (pt.strike - minStrike) / (maxStrike - minStrike || 1);
                    const normDte = (pt.dte - minDte) / (maxDte - minDte || 1);
                    const cIdx = Math.min(numCols - 1, Math.max(0, Math.round(normStrike * (numCols - 1))));
                    const rIdx = Math.min(numRows - 1, Math.max(0, Math.round(normDte * (numRows - 1))));
                    const cell = surfaceGrid[rIdx]?.[cIdx];
                    const gexExp = cell?.gexExposure ?? 0;
                    const y = (gexExp / gexScaleBound) * MAX_HEIGHT + 0.06;

                    return new THREE.Vector3(x, y, z);
                });

                const contourGeo = new THREE.BufferGeometry().setFromPoints(pts);
                const isPositive = contour.sign === 'POSITIVE' || contour.threshold > 0;
                const isZero = contour.sign === 'ZERO' || contour.threshold === 0;

                const contourColor = isPositive ? 0xd946ef : isZero ? 0xa855f7 : 0x6366f1;
                const opacity = Math.min(0.9, Math.max(0.35, (contour.intensity || 50) / 100));

                const contourMat = new THREE.LineBasicMaterial({
                    color: contourColor,
                    transparent: true,
                    opacity,
                    linewidth: isPositive ? 2.5 : 1.5,
                });

                const line = new THREE.Line(contourGeo, contourMat);
                vannaGroup.add(line);
            });
        }

        // 4. TRUE CHARM HEDGE PRESSURE GLYPHS (Directional from Codex charmGlyphs)
        if (charmGlyphs && charmGlyphs.length > 0) {
            // Filter to emphasize higher intensity glyphs to prevent arrow clutter
            const filteredGlyphs = charmGlyphs.filter((g) => g.intensity >= 30 || Math.abs(g.charmExposure) > charmScaleBound * 0.25);

            filteredGlyphs.forEach((glyph) => {
                const x = strikeToX(glyph.strike);
                const z = dteToZ(glyph.dte);

                // Height lookup
                const normStrike = (glyph.strike - minStrike) / (maxStrike - minStrike || 1);
                const normDte = (glyph.dte - minDte) / (maxDte - minDte || 1);
                const cIdx = Math.min(numCols - 1, Math.max(0, Math.round(normStrike * (numCols - 1))));
                const rIdx = Math.min(numRows - 1, Math.max(0, Math.round(normDte * (numRows - 1))));
                const cell = surfaceGrid[rIdx]?.[cIdx];
                const gexExp = cell?.gexExposure ?? 0;
                const y = (gexExp / gexScaleBound) * MAX_HEIGHT + 0.18;

                // Direction strictly determined by hedgeDirection
                const isBuyHedge = glyph.hedgeDirection === 'BUY_HEDGE';
                const dirX = isBuyHedge ? 1.0 : -1.0;
                const dirZ = -0.35;
                const dir = new THREE.Vector3(dirX, 0, dirZ).normalize();

                const arrowLength = Math.min(1.4, Math.max(0.5, (glyph.intensity / 100) * 1.4));
                const arrowColor = isBuyHedge ? 0xf59e0b : 0xf97316;

                const arrowHelper = new THREE.ArrowHelper(
                    dir,
                    new THREE.Vector3(x, y, z),
                    arrowLength,
                    arrowColor,
                    0.35,
                    0.22
                );
                charmGroup.add(arrowHelper);
            });
        }

        // 5. ZERO PLANE & BORDER
        const zeroPlaneGeo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH);
        zeroPlaneGeo.rotateX(-Math.PI / 2);
        const zeroPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x0f172a,
            transparent: true,
            opacity: 0.45,
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

        // 6. SPOT PRICE VERTICAL BEACON
        const spotX = strikeToX(spotPrice);
        const spotPoints = [
            new THREE.Vector3(spotX, FLOOR_Y, -WORLD_DEPTH / 2 - 0.5),
            new THREE.Vector3(spotX, MAX_HEIGHT + 2.2, -WORLD_DEPTH / 2 - 0.5),
            new THREE.Vector3(spotX, MAX_HEIGHT + 2.2, WORLD_DEPTH / 2 + 0.5),
            new THREE.Vector3(spotX, FLOOR_Y, WORLD_DEPTH / 2 + 0.5),
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

        const spotSphereGeo = new THREE.SphereGeometry(0.38, 16, 16);
        const spotSphereMat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
        const spotSphere = new THREE.Mesh(spotSphereGeo, spotSphereMat);
        spotSphere.position.set(spotX, MAX_HEIGHT + 2.2, 0);
        spotGroup.add(spotSphere);

        // 7. DEALER LEVEL MARKER PLANES
        const addLevelPlane = (strike: number, colorHex: number) => {
            if (strike < minStrike || strike > maxStrike) return; // Handled by edge banners
            const x = strikeToX(strike);
            const pts = [
                new THREE.Vector3(x, FLOOR_Y, -WORLD_DEPTH / 2),
                new THREE.Vector3(x, MAX_HEIGHT + 1.6, -WORLD_DEPTH / 2),
                new THREE.Vector3(x, MAX_HEIGHT + 1.6, WORLD_DEPTH / 2),
                new THREE.Vector3(x, FLOOR_Y, WORLD_DEPTH / 2),
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

        if (keyLevels?.callWall?.strike) addLevelPlane(keyLevels.callWall.strike, 0x00e676);
        if (keyLevels?.putWall?.strike) addLevelPlane(keyLevels.putWall.strike, 0xff1744);
        if (keyLevels?.gammaFlip?.strike) addLevelPlane(keyLevels.gammaFlip.strike, 0x00e5ff);
        if (keyLevels?.primaryMaxPain?.strike) addLevelPlane(keyLevels.primaryMaxPain.strike, 0xff9100);

        // 8. SELECTED STRIKE HIGHLIGHT
        if (selectedStrike) {
            const selX = strikeToX(selectedStrike);
            const selPts = [
                new THREE.Vector3(selX, FLOOR_Y - 0.2, -WORLD_DEPTH / 2 - 0.3),
                new THREE.Vector3(selX, MAX_HEIGHT + 1.8, -WORLD_DEPTH / 2 - 0.3),
                new THREE.Vector3(selX, MAX_HEIGHT + 1.8, WORLD_DEPTH / 2 + 0.3),
                new THREE.Vector3(selX, FLOOR_Y - 0.2, WORLD_DEPTH / 2 + 0.3),
            ];
            const selGeo = new THREE.BufferGeometry().setFromPoints(selPts);
            const selMat = new THREE.LineBasicMaterial({
                color: 0x00e5ff,
                linewidth: 3,
            });
            const selLine = new THREE.LineLoop(selGeo, selMat);
            selectionGroup.add(selLine);
        }

    }, [surfaceGrid, strikes, dtes, scales, keyLevels, vannaContours, charmGlyphs, confluenceFloor, spotPrice, selectedStrike, showWireframe, strikeToX, dteToZ]);

    const handleSetView = (mode: '3d' | '2d') => {
        setViewMode(mode);
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;

        setIsRotating(false);

        if (mode === '2d') {
            camera.position.set(0, 38, 0.01);
            controls.target.set(0, -1, 0);
        } else {
            camera.position.set(22, 17, 30);
            controls.target.set(0, -1, 0);
        }
        camera.lookAt(0, -1, 0);
        controls.update();
    };

    const handleResetCamera = () => {
        handleSetView('3d');
        if (rootGroupRef.current) {
            rootGroupRef.current.rotation.set(0, 0, 0);
        }
    };

    // Calculate smart non-overlapping banner positions
    const callWallStrike = keyLevels?.callWall?.strike || 72000;
    const putWallStrike = keyLevels?.putWall?.strike || 62000;
    const gammaFlipStrike = keyLevels?.gammaFlip?.strike || 65250;
    const maxPainStrike = keyLevels?.primaryMaxPain?.strike || 68500;

    const isCallWallOffSurface = callWallStrike > maxStrike;
    const isPutWallOffSurface = putWallStrike < minStrike;
    const isFlipOffSurface = gammaFlipStrike < minStrike || gammaFlipStrike > maxStrike;

    return (
        <div className="relative w-full h-[540px] rounded-xl bg-[#080d16] border border-[#151f30] overflow-hidden flex flex-col select-none shadow-2xl">
            {/* 3D WebGL Canvas Viewport */}
            <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

            {/* Top Viewport Header Bar */}
            <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none z-10">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                        DEALER PRESSURE TERRAIN (3D)
                    </h2>
                    {dataMode === 'DEMO' && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-500/40 text-[9px] font-mono font-bold">
                            DEMO CANONICAL MODEL
                        </span>
                    )}
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
            <div className="absolute top-12 left-4 flex flex-col gap-2 pointer-events-none z-10">
                {/* Layer Checkboxes */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto space-y-1.5 text-[10px] font-mono">
                    <div className="text-zinc-400 font-bold uppercase tracking-wider mb-1">TERRAIN LAYERS</div>

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
                            <span className="text-zinc-200">GEX Mountains</span>
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
                            <span className="text-zinc-200">Vanna Contours</span>
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
                            <span className="text-zinc-200">Charm Pressure</span>
                        </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer hover:text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={showFloor}
                            onChange={(e) => setShowFloor(e.target.checked)}
                            className="hidden"
                        />
                        <span className={`w-3 h-3 rounded-[3px] border flex items-center justify-center ${
                            showFloor ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'border-zinc-700'
                        }`}>
                            {showFloor && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-1.5 rounded-xs bg-cyan-400" />
                            <span className="text-zinc-200">Confluence Floor</span>
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

                {/* THREE PERSISTENT INDEPENDENT EXPOSURE SCALES */}
                <div className="bg-[#0c1422]/90 backdrop-blur-md px-3 py-2.5 rounded-lg border border-[#1a273b] shadow-lg pointer-events-auto space-y-2.5 text-[9px] font-mono">
                    {/* Scale 1: GEX EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between font-bold text-emerald-400">
                            <span>GEX EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{gexUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-10 rounded-full bg-gradient-to-b from-[#00e676] via-[#1a2638] to-[#ff1744]" />
                            <div className="flex flex-col justify-between h-10 text-[8px] font-bold">
                                <span className="text-emerald-400">+{formatGex(gexScaleBound)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-rose-400">-{formatGex(gexScaleBound)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-[1px] bg-zinc-800" />

                    {/* Scale 2: VANNA EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between font-bold text-purple-400">
                            <span>VANNA EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{vannaUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-8 rounded-full bg-gradient-to-b from-[#c084fc] via-[#1a2638] to-[#6366f1]" />
                            <div className="flex flex-col justify-between h-8 text-[8px] font-bold">
                                <span className="text-purple-400">+{formatGex(vannaScaleBound)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-indigo-400">-{formatGex(vannaScaleBound)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="w-full h-[1px] bg-zinc-800" />

                    {/* Scale 3: CHARM EXPOSURE */}
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between font-bold text-amber-400">
                            <span>CHARM EXPOSURE</span>
                            <span className="text-zinc-400 text-[8px]">{charmUnit}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-8 rounded-full bg-gradient-to-b from-[#ff9100] via-[#1a2638] to-[#d97706]" />
                            <div className="flex flex-col justify-between h-8 text-[8px] font-bold">
                                <span className="text-amber-400">+{formatGex(charmScaleBound)}</span>
                                <span className="text-zinc-400">0</span>
                                <span className="text-amber-600">-{formatGex(charmScaleBound)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Persistent Non-Overlapping Landmark Banners */}
            <div className="absolute inset-0 pointer-events-none z-10">
                {/* PUT WALL Banner */}
                <div className="absolute top-[8%] left-[29%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(putWallStrike)}
                        className="px-2.5 py-1 rounded bg-[#1a080c] border border-rose-500/80 shadow-lg shadow-rose-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-rose-400 tracking-wider">
                            {isPutWallOffSurface ? '← PUT WALL (FULL-CHAIN)' : 'PUT WALL'}
                        </span>
                        <span className="text-[11px] font-mono font-black text-rose-200">
                            ${putWallStrike.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-rose-500 to-transparent" />
                </div>

                {/* GAMMA FLIP Banner */}
                <div className="absolute top-[8%] left-[40%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(gammaFlipStrike)}
                        className="px-2.5 py-1 rounded bg-[#08121a] border border-cyan-500/80 shadow-lg shadow-cyan-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider">GAMMA FLIP</span>
                        <span className="text-[11px] font-mono font-black text-cyan-200">
                            ${gammaFlipStrike.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-cyan-500 to-transparent" />
                </div>

                {/* SPOT PRICE Dominant Center Banner */}
                <div className="absolute top-[6%] left-[49%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(spotPrice)}
                        className="px-3 py-1.5 rounded-lg bg-[#0e1626] border-2 border-white shadow-xl shadow-cyan-500/20 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-zinc-300 tracking-widest uppercase">SPOT PRICE</span>
                        <span className="text-xs font-mono font-black text-white tracking-tight">
                            ${spotPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                    </button>
                    <div className="w-[1px] h-6 bg-gradient-to-b from-white to-transparent" />
                </div>

                {/* MAX PAIN Banner */}
                <div className="absolute top-[8%] left-[58%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(maxPainStrike)}
                        className="px-2.5 py-1 rounded bg-[#1a1408] border border-amber-500/80 shadow-lg shadow-amber-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-amber-400 tracking-wider">MAX PAIN</span>
                        <span className="text-[11px] font-mono font-black text-amber-200">
                            ${maxPainStrike.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-amber-500 to-transparent" />
                </div>

                {/* CALL WALL Banner */}
                <div className="absolute top-[8%] left-[68%] -translate-x-1/2 flex flex-col items-center">
                    <button
                        onClick={() => onSelectStrike?.(callWallStrike)}
                        className="px-2.5 py-1 rounded bg-[#081a10] border border-emerald-500/80 shadow-lg shadow-emerald-950/60 flex flex-col items-center pointer-events-auto cursor-pointer hover:scale-105 transition-transform"
                    >
                        <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider">
                            {isCallWallOffSurface ? 'CALL WALL (FULL-CHAIN) →' : 'CALL WALL'}
                        </span>
                        <span className="text-[11px] font-mono font-black text-emerald-200">
                            ${callWallStrike.toLocaleString()}
                        </span>
                    </button>
                    <div className="w-[1px] h-4 bg-gradient-to-b from-emerald-500 to-transparent" />
                </div>

                {/* 3D Axis Labels */}
                <div className="absolute top-[32%] left-[19%] -rotate-90 origin-left text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    DEALER EXPOSURE (GEX HEIGHT)
                </div>
                <div className="absolute bottom-[8%] left-[48%] -translate-x-1/2 text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    STRIKE PRICE AXIS (USD)
                </div>
                <div className="absolute bottom-[16%] right-[14%] rotate-30 origin-right text-[9px] font-mono font-bold text-zinc-400 tracking-wider">
                    EXPIRATION DTE HORIZON
                </div>
            </div>

            {/* Interactive Raycast Tooltip */}
            {hoveredCell && mousePos && (
                <div
                    className="absolute pointer-events-none z-30 bg-[#060a12]/95 backdrop-blur-md p-2.5 rounded-lg border border-cyan-500/60 shadow-2xl text-[10px] font-mono space-y-1 transform -translate-x-1/2 -translate-y-full -mt-2"
                    style={{ left: mousePos.x, top: mousePos.y }}
                >
                    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-1">
                        <span className="font-bold text-white">${hoveredCell.strike.toLocaleString()}</span>
                        <span className="text-zinc-400">{hoveredCell.dte}d ({hoveredCell.expiry})</span>
                    </div>

                    {hoveredCell.observed ? (
                        <div className="space-y-0.5 text-[9px]">
                            <div className="flex justify-between gap-4">
                                <span className="text-zinc-400">GEX Exposure:</span>
                                <span className={`font-bold ${hoveredCell.gexExposure >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatGex(hoveredCell.gexExposure)} ({hoveredCell.gexBand || 'MED'})
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-zinc-400">Vanna Exposure:</span>
                                <span className="font-bold text-purple-400">
                                    {formatGex(hoveredCell.vannaExposure)} ({hoveredCell.vannaBand || 'MED'})
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-zinc-400">Charm Exposure:</span>
                                <span className="font-bold text-amber-400">
                                    {formatGex(hoveredCell.charmExposure)}/day
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-zinc-400">Confluence:</span>
                                <span className="font-bold text-cyan-400">{hoveredCell.confluenceScore}/100</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-zinc-400">Open Interest:</span>
                                <span className="text-white">{hoveredCell.openInterestBtc?.toLocaleString()} BTC</span>
                            </div>
                            {hoveredCell.iv && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-zinc-400">IV / Delta:</span>
                                    <span className="text-zinc-300">{hoveredCell.iv.toFixed(1)}% | Δ {(hoveredCell.rawDelta ?? 0).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800">
                                <span className="text-zinc-400">Behavior Zone:</span>
                                <span className="font-bold text-cyan-300">{hoveredCell.behaviorZone?.replace('_', ' ')}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-[9px] text-amber-400 font-semibold py-1">
                            NO DIRECT CONTRACT OBSERVATION
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
