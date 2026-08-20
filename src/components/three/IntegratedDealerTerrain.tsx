'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Eye, RotateCcw } from 'lucide-react';
import type { TerrainDataContractV2, TerrainSurfaceCell } from '@/lib/terrain/types';
import { createLinearMapper, generateDteTicks, generateStrikeTicks, type LinearMapper } from './terrain/axes';
import { colorForMetricValue, METRIC_PALETTES } from './terrain/colors';
import { buildInterpolatedRenderGrid, nearestCell, type RenderGrid } from './terrain/interpolation';
import { getMetricConfig, METRIC_CONFIGS, type TerrainMetric } from './terrain/metric';
import { clampForDisplay, createSymmetricFinancialScale, formatFinancialAxis, formatStrikeAxis } from './terrain/scales';

interface IntegratedDealerTerrainProps {
    data: TerrainDataContractV2;
    selectedStrike?: number | null;
    selectedDte?: number | null;
    onSelectStrike?: (strike: number) => void;
    onSelectPoint?: (cell: TerrainSurfaceCell) => void;
}

interface HoverState {
    cell: TerrainSurfaceCell;
    metricValue: number;
    screenX: number;
    screenY: number;
    clipped: boolean;
}

type CameraMode = '3d' | 'top' | 'front';

const WORLD_WIDTH = 28;
const WORLD_DEPTH = 16;
const WORLD_HEIGHT = 5.2;
const ZERO_PLANE_OPACITY = 0.18;

export default function IntegratedDealerTerrain({
    data,
    selectedStrike = null,
    selectedDte = null,
    onSelectStrike,
    onSelectPoint,
}: IntegratedDealerTerrainProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const rootGroupRef = useRef<THREE.Group | null>(null);
    const surfaceMeshRef = useRef<THREE.Mesh | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const analyticalGridRef = useRef<readonly TerrainSurfaceCell[][]>(data.surfaceGrid);
    const hoverRef = useRef<HoverState | null>(null);
    const onSelectPointRef = useRef<typeof onSelectPoint>(onSelectPoint);
    const onSelectStrikeRef = useRef<typeof onSelectStrike>(onSelectStrike);
    const latestSceneDataRef = useRef<{
        renderGrid: RenderGrid;
        strikeMapper: LinearMapper;
        dteMapper: LinearMapper;
        metric: Exclude<TerrainMetric, 'combined'>;
        axisBound: number;
    } | null>(null);

    const [metric, setMetric] = useState<Exclude<TerrainMetric, 'combined'>>('gex');
    const [cameraMode, setCameraMode] = useState<CameraMode>('3d');
    const [showWireframe, setShowWireframe] = useState(false);
    const [hover, setHover] = useState<HoverState | null>(null);

    useEffect(() => {
        hoverRef.current = hover;
    }, [hover]);

    useEffect(() => {
        onSelectPointRef.current = onSelectPoint;
    }, [onSelectPoint]);

    useEffect(() => {
        onSelectStrikeRef.current = onSelectStrike;
    }, [onSelectStrike]);

    const metricConfig = getMetricConfig(metric);
    const metricScale = metricConfig.scale(data);
    const yScale = useMemo(() => createSymmetricFinancialScale(metricScale.robustAbsMax, 9), [metricScale.robustAbsMax]);
    const strikeMapper = useMemo(() => createLinearMapper(data.strikes, WORLD_WIDTH), [data.strikes]);
    const dteMapper = useMemo(() => createLinearMapper(data.dtes, WORLD_DEPTH), [data.dtes]);
    const renderGrid = useMemo(() => {
        const strikeSamples = clampInt(data.strikes.length * 16, 80, 120);
        const dteSamples = clampInt(data.dtes.length * 10, 40, 70);
        return buildInterpolatedRenderGrid(data.surfaceGrid, metricConfig, strikeSamples, dteSamples);
    }, [data.surfaceGrid, data.strikes.length, data.dtes.length, metricConfig]);
    const yTicks = yScale.ticks;
    const strikeTicks = useMemo(() => generateStrikeTicks(data.strikes, strikeMapper, 8), [data.strikes, strikeMapper]);
    const dteTicks = useMemo(() => generateDteTicks(data.dtes, dteMapper, 8), [data.dtes, dteMapper]);

    const applyCamera = useCallback((mode: CameraMode) => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;

        if (mode === 'top') camera.position.set(0, 28, 0.01);
        else if (mode === 'front') camera.position.set(0, 5.5, 28);
        else camera.position.set(22, 10.5, 20);

        controls.target.set(0, 0, 0);
        camera.lookAt(0, 0, 0);
        controls.update();
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x05080d);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 1000);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        container.innerHTML = '';
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = true;
        controls.minDistance = 14;
        controls.maxDistance = 48;
        controls.maxPolarAngle = Math.PI / 2 - 0.05;
        controlsRef.current = controls;

        scene.add(new THREE.AmbientLight(0xffffff, 0.82));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
        keyLight.position.set(10, 18, 12);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-12, 8, -10);
        scene.add(fillLight);

        const rootGroup = new THREE.Group();
        scene.add(rootGroup);
        rootGroupRef.current = rootGroup;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        const handlePointerMove = (event: MouseEvent) => {
            const active = latestSceneDataRef.current;
            const mesh = surfaceMeshRef.current;
            if (!active || !mesh) return;
            const rect = renderer.domElement.getBoundingClientRect();
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.intersectObject(mesh, false)[0];
            if (!hit) {
                setHover(null);
                return;
            }
            const strike = active.strikeMapper.fromWorld(hit.point.x);
            const dte = active.dteMapper.fromWorld(hit.point.z);
            const analyticalGrid = analyticalGridRef.current;
            const strikeAxis = analyticalGrid[0]?.map((cell) => cell.strike) ?? [];
            const dteAxis = analyticalGrid.map((row) => row[0]?.dte ?? 0);
            const cell = nearestCell(analyticalGrid, strikeAxis, dteAxis, strike, dte);
            const metricValue = METRIC_CONFIGS[active.metric].value(cell);
            setHover({
                cell,
                metricValue,
                screenX: event.clientX - rect.left,
                screenY: event.clientY - rect.top,
                clipped: Math.abs(metricValue) > active.axisBound,
            });
        };

        const handlePointerLeave = () => setHover(null);
        const handleClick = () => {
            const cell = hoverRef.current?.cell;
            if (!cell) return;
            onSelectStrikeRef.current?.(cell.strike);
            onSelectPointRef.current?.(cell);
        };

        renderer.domElement.addEventListener('mousemove', handlePointerMove);
        renderer.domElement.addEventListener('mouseleave', handlePointerLeave);
        renderer.domElement.addEventListener('click', handleClick);

        const handleResize = () => {
            if (!containerRef.current) return;
            camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        window.addEventListener('resize', handleResize);

        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        applyCamera('3d');
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            renderer.domElement.removeEventListener('mousemove', handlePointerMove);
            renderer.domElement.removeEventListener('mouseleave', handlePointerLeave);
            renderer.domElement.removeEventListener('click', handleClick);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            disposeObject(rootGroup);
            renderer.dispose();
        };
    }, [applyCamera]);

    useEffect(() => {
        const rootGroup = rootGroupRef.current;
        if (!rootGroup) return;
        clearGroup(rootGroup);

        latestSceneDataRef.current = {
            renderGrid,
            strikeMapper,
            dteMapper,
            metric,
            axisBound: yScale.bound,
        };
        analyticalGridRef.current = data.surfaceGrid;

        const geometry = buildSurfaceGeometry(renderGrid, strikeMapper, dteMapper, metric, yScale.bound);
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.72,
            metalness: 0.02,
            side: THREE.DoubleSide,
        });
        const surface = new THREE.Mesh(geometry, material);
        surfaceMeshRef.current = surface;
        rootGroup.add(surface);

        if (showWireframe) {
            const wire = new THREE.LineSegments(
                new THREE.WireframeGeometry(geometry),
                new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.08 })
            );
            rootGroup.add(wire);
        }

        rootGroup.add(buildZeroPlane());
        rootGroup.add(buildAxesGroup({
            yTicks,
            strikeTicks,
            dteTicks,
            strikeMapper,
            dteMapper,
            yBound: yScale.bound,
        }));
        rootGroup.add(buildStructuralMarkers(data, strikeMapper));
        rootGroup.add(buildSelectionMarker({ selectedStrike, selectedDte, strikeMapper, dteMapper }));
    }, [data, dteMapper, dteTicks, metric, renderGrid, selectedDte, selectedStrike, showWireframe, strikeMapper, strikeTicks, yScale.bound, yTicks]);

    const setCameraPreset = (mode: CameraMode) => {
        setCameraMode(mode);
        applyCamera(mode);
    };

    const resetCamera = () => {
        setCameraMode('3d');
        applyCamera('3d');
    };

    const palette = METRIC_PALETTES[metric];

    return (
        <section className="relative w-full h-[620px] overflow-hidden rounded-lg border border-slate-700/80 bg-[#05080d]">
            <div ref={containerRef} className="h-full w-full cursor-crosshair" />

            <div className="absolute left-4 top-4 right-4 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
                <div className="space-y-2 pointer-events-auto">
                    <div className="flex rounded-md border border-slate-700 bg-slate-950/85 p-1 shadow-lg">
                        {(['gex', 'vanna', 'charm'] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setMetric(mode)}
                                className={`min-w-20 px-3 py-1.5 text-xs font-semibold tracking-wide ${metric === mode ? metricButtonClass(mode) : 'text-slate-300 hover:bg-slate-800'}`}
                            >
                                {METRIC_CONFIGS[mode].label}
                            </button>
                        ))}
                        <button
                            disabled
                            className="min-w-24 cursor-not-allowed px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-500"
                            title="Advanced view next round"
                        >
                            COMBINED
                        </button>
                    </div>
                    <div className="max-w-sm rounded-md border border-slate-800 bg-slate-950/82 px-3 py-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-white">{metricConfig.title}</div>
                        <div className="mt-1 text-[11px] text-slate-400">Y-axis: {metricConfig.unit}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/85 p-1 pointer-events-auto shadow-lg">
                    {(['3d', 'top', 'front'] as const).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setCameraPreset(mode)}
                            className={`px-2.5 py-1.5 text-xs font-semibold uppercase ${cameraMode === mode ? 'rounded bg-cyan-500/20 text-cyan-200' : 'text-slate-300 hover:text-white'}`}
                        >
                            {mode === '3d' ? '3D' : mode.toUpperCase()}
                        </button>
                    ))}
                    <button
                        onClick={resetCamera}
                        className="rounded px-2 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                        title="Reset camera"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setShowWireframe((value) => !value)}
                        className={`rounded px-2 py-1.5 ${showWireframe ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                        title="Subtle wireframe"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2 pointer-events-none">
                <div className="flex items-center justify-center gap-3 rounded-md border border-slate-800 bg-slate-950/82 px-3 py-2 text-[11px] text-slate-300">
                    <span className="font-mono">{formatFinancialAxis(-yScale.bound)}</span>
                    <div
                        className="h-2 w-56 rounded"
                        style={{ background: `linear-gradient(90deg, ${palette.negative}, ${palette.zero}, ${palette.positive})` }}
                    />
                    <span className="font-mono">{formatFinancialAxis(0)}</span>
                    <span className="font-mono">{formatFinancialAxis(yScale.bound)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Data Mode: <span className="text-emerald-300">{data.dataMode}</span></span>
                    <span>Assumption: {data.assumptionModel}</span>
                    <span>Scale: +/- {formatFinancialAxis(yScale.bound)}</span>
                </div>
            </div>

            {hover && (
                <div
                    className="pointer-events-none absolute z-10 w-72 rounded-md border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl"
                    style={{ left: Math.min(hover.screenX + 14, 720), top: Math.max(12, hover.screenY - 20) }}
                >
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <span className="font-semibold text-white">${hover.cell.strike.toLocaleString()} / {hover.cell.expiry}</span>
                        <span className="text-slate-400">{hover.cell.dte.toFixed(1)} DTE</span>
                    </div>
                    {!hover.cell.observed && <div className="mb-2 text-amber-300">NO DIRECT CONTRACT OBSERVATION</div>}
                    {hover.clipped && <div className="mb-2 text-rose-300">ABOVE DISPLAY RANGE</div>}
                    <TooltipRow label="GEX" value={formatFinancialAxis(hover.cell.gexExposure)} />
                    <TooltipRow label="Vanna" value={formatFinancialAxis(hover.cell.vannaExposure)} />
                    <TooltipRow label="Charm" value={formatFinancialAxis(hover.cell.charmExposure)} />
                    <TooltipRow label="Selected intensity" value={`${metricConfig.intensity(hover.cell).toFixed(1)} / 100`} />
                    <TooltipRow label="Confluence" value={`${hover.cell.confluenceScore.toFixed(1)} / 100`} />
                    <TooltipRow label="OI" value={`${hover.cell.openInterestBtc.toFixed(2)} BTC`} />
                    <TooltipRow label="IV" value={hover.cell.iv === null ? 'N/A' : `${hover.cell.iv.toFixed(1)}%`} />
                    <TooltipRow label="Delta" value={hover.cell.rawDelta === null ? 'N/A' : hover.cell.rawDelta.toFixed(3)} />
                    <TooltipRow label="Behavior" value={hover.cell.behaviorZone} />
                    {metric === 'charm' && (
                        <TooltipRow label="Hedge flow" value={hover.cell.charmExposure > 0 ? 'SELL_HEDGE' : hover.cell.charmExposure < 0 ? 'BUY_HEDGE' : 'NEUTRAL'} />
                    )}
                </div>
            )}
        </section>
    );
}

function buildSurfaceGeometry(
    renderGrid: RenderGrid,
    strikeMapper: LinearMapper,
    dteMapper: LinearMapper,
    metric: Exclude<TerrainMetric, 'combined'>,
    axisBound: number
): THREE.BufferGeometry {
    const rows = renderGrid.samples.length;
    const columns = renderGrid.samples[0]?.length ?? 0;
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            const sample = renderGrid.samples[row][column];
            const clipped = clampForDisplay(sample.value, axisBound);
            positions.push(
                strikeMapper.toWorld(sample.strike),
                (clipped / axisBound) * WORLD_HEIGHT,
                dteMapper.toWorld(sample.dte)
            );
            const color = colorForMetricValue(metric, sample.value, axisBound);
            colors.push(color.r, color.g, color.b);
        }
    }

    for (let row = 0; row < rows - 1; row++) {
        for (let column = 0; column < columns - 1; column++) {
            const a = row * columns + column;
            const b = a + 1;
            const c = a + columns;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
}

function buildZeroPlane(): THREE.Object3D {
    const group = new THREE.Group();
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_DEPTH),
        new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: ZERO_PLANE_OPACITY, side: THREE.DoubleSide })
    );
    plane.rotateX(-Math.PI / 2);
    group.add(plane);
    const grid = new THREE.GridHelper(Math.max(WORLD_WIDTH, WORLD_DEPTH), 16, 0x475569, 0x1e293b);
    grid.scale.x = WORLD_WIDTH / Math.max(WORLD_WIDTH, WORLD_DEPTH);
    grid.scale.z = WORLD_DEPTH / Math.max(WORLD_WIDTH, WORLD_DEPTH);
    group.add(grid);
    return group;
}

function buildAxesGroup(params: {
    yTicks: readonly number[];
    strikeTicks: readonly { value: number; world: number }[];
    dteTicks: readonly { value: number; world: number }[];
    strikeMapper: LinearMapper;
    dteMapper: LinearMapper;
    yBound: number;
}): THREE.Object3D {
    const group = new THREE.Group();
    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.75 });
    const yAxisX = -WORLD_WIDTH / 2 - 1.1;
    const frontZ = -WORLD_DEPTH / 2 - 0.8;
    group.add(line([new THREE.Vector3(-WORLD_WIDTH / 2, 0, frontZ), new THREE.Vector3(WORLD_WIDTH / 2, 0, frontZ)], axisMaterial));
    group.add(line([new THREE.Vector3(-WORLD_WIDTH / 2, 0, -WORLD_DEPTH / 2), new THREE.Vector3(-WORLD_WIDTH / 2, 0, WORLD_DEPTH / 2)], axisMaterial));
    group.add(line([new THREE.Vector3(yAxisX, -WORLD_HEIGHT, frontZ), new THREE.Vector3(yAxisX, WORLD_HEIGHT, frontZ)], axisMaterial));

    for (const tick of params.yTicks) {
        const y = (tick / params.yBound) * WORLD_HEIGHT;
        group.add(line([new THREE.Vector3(yAxisX - 0.15, y, frontZ), new THREE.Vector3(yAxisX + 0.15, y, frontZ)], axisMaterial));
        group.add(makeTextSprite(formatFinancialAxis(tick), new THREE.Vector3(yAxisX - 1.35, y, frontZ), { color: '#cbd5e1', size: 42 }));
    }
    for (const tick of params.strikeTicks) {
        group.add(line([new THREE.Vector3(tick.world, 0, frontZ - 0.1), new THREE.Vector3(tick.world, 0, frontZ + 0.25)], axisMaterial));
        group.add(makeTextSprite(formatStrikeAxis(tick.value), new THREE.Vector3(tick.world, -0.45, frontZ - 0.8), { color: '#cbd5e1', size: 38 }));
    }
    for (const tick of params.dteTicks) {
        group.add(line([new THREE.Vector3(-WORLD_WIDTH / 2 - 0.25, 0, tick.world), new THREE.Vector3(-WORLD_WIDTH / 2 + 0.1, 0, tick.world)], axisMaterial));
        group.add(makeTextSprite(`${tick.value}`, new THREE.Vector3(-WORLD_WIDTH / 2 - 1.15, -0.35, tick.world), { color: '#cbd5e1', size: 36 }));
    }

    group.add(makeTextSprite('STRIKE PRICE (USD)', new THREE.Vector3(0, -1.05, frontZ - 1.45), { color: '#f8fafc', size: 44 }));
    group.add(makeTextSprite('DAYS TO EXPIRY', new THREE.Vector3(-WORLD_WIDTH / 2 - 1.8, -0.95, 0), { color: '#f8fafc', size: 44 }));
    group.add(makeTextSprite('EXPOSURE', new THREE.Vector3(yAxisX - 1.55, WORLD_HEIGHT + 0.7, frontZ), { color: '#f8fafc', size: 44 }));
    return group;
}

function buildStructuralMarkers(data: TerrainDataContractV2, strikeMapper: LinearMapper): THREE.Object3D {
    const group = new THREE.Group();
    const levels = [
        { label: `SPOT ${formatStrikeAxis(data.spotPrice)}`, strike: data.spotPrice, color: 0xffffff, priority: 1 },
        { label: `GAMMA FLIP ${formatStrikeAxis(data.keyLevels.gammaFlip.strike)}`, strike: data.keyLevels.gammaFlip.strike, color: 0x38bdf8, priority: 2 },
        { label: `CALL WALL ${formatStrikeAxis(data.keyLevels.callWall.strike)}`, strike: data.keyLevels.callWall.strike, color: 0x22c55e, priority: 3 },
        { label: `PUT WALL ${formatStrikeAxis(data.keyLevels.putWall.strike)}`, strike: data.keyLevels.putWall.strike, color: 0xef4444, priority: 3 },
        ...(data.keyLevels.primaryMaxPain ? [{ label: `MAX PAIN ${formatStrikeAxis(data.keyLevels.primaryMaxPain.strike)}`, strike: data.keyLevels.primaryMaxPain.strike, color: 0xfacc15, priority: 4 }] : []),
    ].sort((a, b) => a.priority - b.priority);

    levels.forEach((level, index) => {
        const inRange = strikeMapper.inRange(level.strike);
        const x = inRange ? strikeMapper.toWorld(level.strike) : level.strike < strikeMapper.min ? -WORLD_WIDTH / 2 - 0.7 : WORLD_WIDTH / 2 + 0.7;
        const material = new THREE.LineDashedMaterial({ color: level.color, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: inRange ? 0.85 : 0.55 });
        const marker = line([
            new THREE.Vector3(x, -WORLD_HEIGHT, -WORLD_DEPTH / 2),
            new THREE.Vector3(x, WORLD_HEIGHT + 0.8, -WORLD_DEPTH / 2),
        ], material);
        marker.computeLineDistances();
        group.add(marker);
        group.add(makeTextSprite(
            inRange ? level.label : `${level.label} FULL CHAIN`,
            new THREE.Vector3(x, WORLD_HEIGHT + 1 + index * 0.22, -WORLD_DEPTH / 2 - 0.35),
            { color: `#${level.color.toString(16).padStart(6, '0')}`, size: 34 }
        ));
    });

    return group;
}

function buildSelectionMarker(params: {
    selectedStrike: number | null;
    selectedDte: number | null;
    strikeMapper: LinearMapper;
    dteMapper: LinearMapper;
}): THREE.Object3D {
    const group = new THREE.Group();
    if (params.selectedStrike === null || !params.strikeMapper.inRange(params.selectedStrike)) return group;

    const x = params.strikeMapper.toWorld(params.selectedStrike);
    const material = new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.7 });
    group.add(line([
        new THREE.Vector3(x, -WORLD_HEIGHT, -WORLD_DEPTH / 2),
        new THREE.Vector3(x, WORLD_HEIGHT + 0.5, -WORLD_DEPTH / 2),
    ], material));

    if (params.selectedDte !== null && params.selectedDte >= params.dteMapper.min && params.selectedDte <= params.dteMapper.max) {
        const z = params.dteMapper.toWorld(params.selectedDte);
        const point = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xf8fafc })
        );
        point.position.set(x, 0, z);
        group.add(point);
    }

    return group;
}

function TooltipRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 py-0.5">
            <span className="text-slate-400">{label}</span>
            <span className="text-right font-mono text-slate-100">{value}</span>
        </div>
    );
}

function metricButtonClass(mode: Exclude<TerrainMetric, 'combined'>): string {
    if (mode === 'gex') return 'rounded bg-emerald-500/20 text-emerald-200';
    if (mode === 'vanna') return 'rounded bg-fuchsia-500/20 text-fuchsia-200';
    return 'rounded bg-amber-500/20 text-amber-200';
}

function line(points: THREE.Vector3[], material: THREE.Material): THREE.Line {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function makeTextSprite(text: string, position: THREE.Vector3, options: { color: string; size: number }): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;
    if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = `600 ${options.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        context.fillStyle = options.color;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
}

function clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        disposeObject(child);
    }
}

function disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else material?.dispose();
    });
}

function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}
