'use client';

import React from 'react';
import type { PositionRiskResult } from '../../lib/quant/position-risk';
import type {
    DrawingDragTarget,
    DrawingObject,
    DrawingPoint,
    DrawingView,
} from './drawing-model';

export type { DrawingDragTarget } from './drawing-model';
export type ChartDrawingObject = DrawingObject;
export type ChartDrawingPoint = DrawingPoint;
export type ChartDrawingView = DrawingView;

interface ChartDrawingLayerProps {
    views: DrawingView[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStartDrag: (event: React.PointerEvent<SVGElement>, id: string, target: DrawingDragTarget) => void;
    riskResults?: Record<string, PositionRiskResult | null>;
}

const visibleLine = { strokeLinecap: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
const hitLine = { stroke: 'transparent', strokeWidth: 16, pointerEvents: 'stroke' as const, cursor: 'move' };

function lineDrawing(
    view: DrawingView,
    selected: boolean,
    onSelect: ChartDrawingLayerProps['onSelect'],
    onStartDrag: ChartDrawingLayerProps['onStartDrag'],
) {
    const [first, second = first] = view.points;
    const horizontal = view.drawing.type === 'horizontal';
    const vertical = view.drawing.type === 'vertical';
    const x1 = horizontal ? 0 : first.x;
    const x2 = horizontal ? '100%' : vertical ? first.x : second.x;
    const y1 = vertical ? 0 : first.y;
    const y2 = vertical ? '100%' : horizontal ? first.y : second.y;
    const color = vertical ? '#a8b6c9' : '#79d5ff';
    const dash = horizontal ? '6 4' : vertical ? '4 4' : undefined;

    return (
        <g
            key={view.drawing.id}
            data-drawing-id={view.drawing.id}
            data-drawing-type={view.drawing.type}
            data-start-time={view.drawing.points[0]?.time}
            data-start-price={view.drawing.points[0]?.price}
            data-end-time={view.drawing.points[1]?.time}
            data-end-price={view.drawing.points[1]?.price}
            data-locked={view.drawing.locked}
            onClick={(event) => {
                if (view.preview) return;
                event.stopPropagation();
                onSelect(view.drawing.id);
            }}
        >
            <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={selected ? 2.5 : 1.5}
                strokeDasharray={dash}
                opacity={view.preview ? 0.7 : 1}
                {...visibleLine}
            />
            {!view.preview && (
                <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    style={hitLine}
                    onPointerDown={(event) => {
                        onSelect(view.drawing.id);
                        onStartDrag(event, view.drawing.id, { kind: 'body' });
                    }}
                />
            )}
        </g>
    );
}

function rectangleDrawing(
    view: DrawingView,
    selected: boolean,
    onSelect: ChartDrawingLayerProps['onSelect'],
    onStartDrag: ChartDrawingLayerProps['onStartDrag'],
) {
    const [first, second = first] = view.points;
    const left = Math.min(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const width = Math.abs(second.x - first.x);
    const height = Math.abs(second.y - first.y);
    const color = '#49c1ff';

    return (
        <g
            key={view.drawing.id}
            data-drawing-id={view.drawing.id}
            data-drawing-type={view.drawing.type}
            data-start-time={view.drawing.points[0]?.time}
            data-start-price={view.drawing.points[0]?.price}
            data-locked={view.drawing.locked}
            onClick={(event) => {
                if (view.preview) return;
                event.stopPropagation();
                onSelect(view.drawing.id);
            }}
        >
            <rect
                x={left}
                y={top}
                width={Math.max(1, width)}
                height={Math.max(1, height)}
                fill="rgba(73, 193, 255, 0.08)"
                stroke={color}
                strokeWidth={selected ? 2.5 : 1.5}
                opacity={view.preview ? 0.7 : 1}
                vectorEffect="non-scaling-stroke"
            />
            {!view.preview && (
                <rect
                    x={left}
                    y={top}
                    width={Math.max(8, width)}
                    height={Math.max(8, height)}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={10}
                    style={{ pointerEvents: 'all', cursor: 'move' }}
                    onPointerDown={(event) => {
                        onSelect(view.drawing.id);
                        onStartDrag(event, view.drawing.id, { kind: 'body' });
                    }}
                />
            )}
        </g>
    );
}

function fibonacciDrawing(
    view: DrawingView,
    selected: boolean,
    onSelect: ChartDrawingLayerProps['onSelect'],
    onStartDrag: ChartDrawingLayerProps['onStartDrag'],
) {
    const [first, second = first] = view.points;
    const fib = view.fibonacci;
    if (!fib) return null;

    const leftX = fib.leftX;
    const rightX = fib.rightX;
    const settings = view.drawing.fibonacci;
    const lineDash = settings?.lineStyle === 'dashed' ? '5 3' : settings?.lineStyle === 'dotted' ? '2 2' : undefined;

    return (
        <g
            key={view.drawing.id}
            data-drawing-id={view.drawing.id}
            data-drawing-type="fibonacci"
            data-start-time={view.drawing.points[0]?.time}
            data-start-price={view.drawing.points[0]?.price}
            data-locked={view.drawing.locked}
            onClick={(event) => {
                if (view.preview) return;
                event.stopPropagation();
                onSelect(view.drawing.id);
            }}
        >
            {/* Trend/Baseline vector connecting anchors */}
            <line
                x1={first.x}
                y1={first.y}
                x2={second.x}
                y2={second.y}
                stroke="#8ddcff"
                strokeWidth={selected ? 1.5 : 1}
                strokeDasharray="3 3"
                opacity={0.6}
                vectorEffect="non-scaling-stroke"
            />

            {/* Shaded bands between consecutive visible levels */}
            {fib.levels.map((level, idx) => {
                if (idx === 0) return null;
                const prev = fib.levels[idx - 1];
                const top = Math.min(prev.y, level.y);
                const height = Math.abs(prev.y - level.y);
                return (
                    <rect
                        key={`band-${idx}`}
                        x={leftX}
                        y={top}
                        width={Math.max(1, rightX - leftX)}
                        height={Math.max(1, height)}
                        fill={prev.color}
                        opacity={0.06}
                        vectorEffect="non-scaling-stroke"
                    />
                );
            })}

            {/* Individual horizontal level lines and labels */}
            {fib.levels.map((level) => (
                <g key={`level-${level.value}`}>
                    <line
                        x1={leftX}
                        y1={level.y}
                        x2={rightX}
                        y2={level.y}
                        stroke={level.color}
                        strokeWidth={selected ? 2 : 1}
                        strokeDasharray={lineDash}
                        opacity={settings?.opacity ?? 0.85}
                        vectorEffect="non-scaling-stroke"
                    />
                    {settings?.showLabels !== false && (
                        <text
                            x={leftX + 6}
                            y={level.y - 4}
                            fill={level.color}
                            fontSize="9"
                            fontFamily="var(--font-geist-mono), monospace"
                            fontWeight="600"
                        >
                            {level.value}
                            {settings?.showPrices !== false && ` (${level.price.toFixed(1)})`}
                        </text>
                    )}
                </g>
            ))}

            {/* Invisible wide hit region along trendline and levels */}
            {!view.preview && (
                <>
                    <line
                        x1={first.x}
                        y1={first.y}
                        x2={second.x}
                        y2={second.y}
                        style={hitLine}
                        onPointerDown={(event) => {
                            onSelect(view.drawing.id);
                            onStartDrag(event, view.drawing.id, { kind: 'body' });
                        }}
                    />
                    {fib.levels.map((level) => (
                        <line
                            key={`hit-${level.value}`}
                            x1={leftX}
                            y1={level.y}
                            x2={rightX}
                            y2={level.y}
                            style={hitLine}
                            onPointerDown={(event) => {
                                onSelect(view.drawing.id);
                                onStartDrag(event, view.drawing.id, { kind: 'body' });
                            }}
                        />
                    ))}
                </>
            )}
        </g>
    );
}

function positionDrawing(
    view: DrawingView,
    selected: boolean,
    onSelect: ChartDrawingLayerProps['onSelect'],
    onStartDrag: ChartDrawingLayerProps['onStartDrag'],
    riskResult?: PositionRiskResult | null,
) {
    const pos = view.position;
    if (!pos || !view.drawing.position) return null;

    const isLong = view.drawing.type === 'long-position';
    const leftX = pos.leftX;
    const rightX = pos.rightX;
    const width = Math.max(8, rightX - leftX);

    const entryY = pos.entryY;
    const stopY = pos.stopY;
    const targetY = pos.targetY;

    const profitTop = Math.min(entryY, targetY);
    const profitHeight = Math.abs(entryY - targetY);

    const lossTop = Math.min(entryY, stopY);
    const lossHeight = Math.abs(entryY - stopY);

    const isReady = riskResult?.status === 'ready';
    const isInvalid = riskResult?.status === 'invalid';
    const isBlocked = riskResult?.status === 'blocked';

    const profitColor = '#31c5a0';
    const lossColor = '#ef6277';
    const entryColor = '#dce6f2';

    return (
        <g
            key={view.drawing.id}
            data-drawing-id={view.drawing.id}
            data-drawing-type={view.drawing.type}
            data-start-time={view.drawing.points[0]?.time}
            data-start-price={view.drawing.points[0]?.price}
            data-end-time={view.drawing.points[1]?.time}
            data-end-price={view.drawing.points[1]?.price}
            data-position-entry={view.drawing.position?.entry}
            data-position-stop={view.drawing.position?.stop}
            data-position-target={view.drawing.position?.target}
            data-position-status={riskResult?.status ?? 'evaluating'}
            data-position-quantity={riskResult?.metrics ? riskResult.metrics.quantity.toFixed(riskResult.metrics.quantityPrecision) : undefined}
            data-position-loss={riskResult?.metrics ? riskResult.metrics.lossAtStopUsd.toFixed(2) : undefined}
            data-position-profit={riskResult?.metrics ? riskResult.metrics.profitAtTargetUsd.toFixed(2) : undefined}
            data-position-rr={riskResult?.metrics ? riskResult.metrics.rewardToRisk.toFixed(2) : undefined}
            data-position-notional={riskResult?.metrics ? riskResult.metrics.notionalUsd.toFixed(2) : undefined}
            data-locked={view.drawing.locked}
            onClick={(event) => {
                if (view.preview) return;
                event.stopPropagation();
                onSelect(view.drawing.id);
            }}
        >
            {/* Target / Profit Zone Shading */}
            <rect
                x={leftX}
                y={profitTop}
                width={width}
                height={Math.max(1, profitHeight)}
                fill="rgba(49, 197, 160, 0.12)"
                stroke={profitColor}
                strokeWidth={selected ? 2 : 1}
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
            />

            {/* Stop / Loss Zone Shading */}
            <rect
                x={leftX}
                y={lossTop}
                width={width}
                height={Math.max(1, lossHeight)}
                fill="rgba(239, 98, 119, 0.12)"
                stroke={lossColor}
                strokeWidth={selected ? 2 : 1}
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
            />

            {/* Target Price Line */}
            <line
                x1={leftX}
                y1={targetY}
                x2={rightX}
                y2={targetY}
                stroke={profitColor}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
            />

            {/* Entry Price Line */}
            <line
                x1={leftX}
                y1={entryY}
                x2={rightX}
                y2={entryY}
                stroke={entryColor}
                strokeWidth={2}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
            />

            {/* Stop Price Line */}
            <line
                x1={leftX}
                y1={stopY}
                x2={rightX}
                y2={stopY}
                stroke={lossColor}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
            />

            {/* Whole Object Drag Area (Rendered underneath handles and price lines so specific hit areas take priority) */}
            {!view.preview && !view.drawing.locked && (
                <rect
                    data-testid="position-hit-body"
                    x={leftX}
                    y={Math.min(profitTop, lossTop)}
                    width={width}
                    height={Math.max(8, profitHeight + lossHeight)}
                    fill="transparent"
                    stroke="transparent"
                    style={{ pointerEvents: 'all', cursor: 'move' }}
                    onPointerDown={(event) => {
                        onSelect(view.drawing.id);
                        onStartDrag(event, view.drawing.id, { kind: 'body' });
                    }}
                />
            )}

            {/* Draggable Price Line Hit Areas (Entry, Stop, Target) rendered ON TOP of body hit area */}
            {!view.preview && !view.drawing.locked && (
                <>
                    {/* Entry Line Hit Target */}
                    <line
                        data-testid="position-hit-entry"
                        x1={leftX}
                        y1={entryY}
                        x2={rightX}
                        y2={entryY}
                        style={{ stroke: 'transparent', strokeWidth: 14, pointerEvents: 'stroke', cursor: 'ns-resize' }}
                        onPointerDown={(event) => {
                            onSelect(view.drawing.id);
                            onStartDrag(event, view.drawing.id, { kind: 'position-line', line: 'entry' });
                        }}
                    />
                    {/* Stop Line Hit Target */}
                    <line
                        data-testid="position-hit-stop"
                        x1={leftX}
                        y1={stopY}
                        x2={rightX}
                        y2={stopY}
                        style={{ stroke: 'transparent', strokeWidth: 14, pointerEvents: 'stroke', cursor: 'ns-resize' }}
                        onPointerDown={(event) => {
                            onSelect(view.drawing.id);
                            onStartDrag(event, view.drawing.id, { kind: 'position-line', line: 'stop' });
                        }}
                    />
                    {/* Target Line Hit Target */}
                    <line
                        data-testid="position-hit-target"
                        x1={leftX}
                        y1={targetY}
                        x2={rightX}
                        y2={targetY}
                        style={{ stroke: 'transparent', strokeWidth: 14, pointerEvents: 'stroke', cursor: 'ns-resize' }}
                        onPointerDown={(event) => {
                            onSelect(view.drawing.id);
                            onStartDrag(event, view.drawing.id, { kind: 'position-line', line: 'target' });
                        }}
                    />

                    {/* Left/Right Extent Handles */}
                    {selected && (
                        <>
                            <circle
                                data-testid="position-handle-left"
                                cx={leftX}
                                cy={entryY}
                                r={5}
                                fill="#07111c"
                                stroke="#dce6f2"
                                strokeWidth={2}
                                style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                onPointerDown={(event) => onStartDrag(event, view.drawing.id, { kind: 'position-extent', edge: 'left' })}
                            />
                            <circle
                                data-testid="position-handle-right"
                                cx={rightX}
                                cy={entryY}
                                r={5}
                                fill="#07111c"
                                stroke="#dce6f2"
                                strokeWidth={2}
                                style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                onPointerDown={(event) => onStartDrag(event, view.drawing.id, { kind: 'position-extent', edge: 'right' })}
                            />
                            {/* Target & Stop Anchor Handles */}
                            <circle
                                data-testid="position-handle-target"
                                cx={rightX}
                                cy={targetY}
                                r={5}
                                fill="#07111c"
                                stroke={profitColor}
                                strokeWidth={2}
                                style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                onPointerDown={(event) => onStartDrag(event, view.drawing.id, { kind: 'position-line', line: 'target' })}
                            />
                            <circle
                                data-testid="position-handle-stop"
                                cx={rightX}
                                cy={stopY}
                                r={5}
                                fill="#07111c"
                                stroke={lossColor}
                                strokeWidth={2}
                                style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                onPointerDown={(event) => onStartDrag(event, view.drawing.id, { kind: 'position-line', line: 'stop' })}
                            />
                        </>
                    )}
                </>
            )}

            {/* Chart Sizing & Risk HUD Badge */}
            <g transform={`translate(${leftX + 6}, ${profitTop + 14})`} style={{ pointerEvents: 'none' }}>
                <rect
                    x={0}
                    y={-10}
                    width={selected ? 190 : 130}
                    height={selected ? (isReady ? 62 : 44) : 26}
                    rx={3}
                    fill="#080e17"
                    fillOpacity={0.92}
                    stroke={isReady ? profitColor : isInvalid ? lossColor : '#eab308'}
                    strokeWidth={1}
                />
                <text
                    x={6}
                    y={2}
                    fill="#ffffff"
                    fontSize="9"
                    fontFamily="var(--font-geist-mono), monospace"
                    fontWeight="700"
                    data-testid="position-hud-status"
                >
                    {isLong ? 'LONG' : 'SHORT'} · {riskResult?.status.toUpperCase() ?? 'EVAL'}
                    {riskResult?.metrics && ` · 1:${riskResult.metrics.rewardToRisk.toFixed(2)}`}
                </text>
                <text
                    x={6}
                    y={13}
                    fill="#a1a1aa"
                    fontSize="8"
                    fontFamily="var(--font-geist-mono), monospace"
                >
                    {riskResult?.metrics
                        ? `Qty: ${riskResult.metrics.quantity} · Risk: $${Math.round(riskResult.metrics.lossAtStopUsd).toLocaleString()}`
                        : isInvalid
                        ? 'Invalid Geometry'
                        : isBlocked
                        ? 'Capacity Blocked'
                        : 'Evaluating...'}
                </text>
                {selected && isReady && riskResult.metrics && (
                    <>
                        <text
                            x={6}
                            y={27}
                            fill="#34d399"
                            fontSize="8"
                            fontFamily="var(--font-geist-mono), monospace"
                        >
                            Target: +${Math.round(riskResult.metrics.profitAtTargetUsd).toLocaleString()} ({riskResult.metrics.targetDistancePercent.toFixed(1)}%)
                        </text>
                        <text
                            x={6}
                            y={38}
                            fill="#f87171"
                            fontSize="8"
                            fontFamily="var(--font-geist-mono), monospace"
                        >
                            Stop: -${Math.round(riskResult.metrics.lossAtStopUsd).toLocaleString()} ({riskResult.metrics.stopDistancePercent.toFixed(1)}%)
                        </text>
                        <text
                            x={6}
                            y={48}
                            fill="#67e8f9"
                            fontSize="7.5"
                            fontFamily="var(--font-geist-mono), monospace"
                        >
                            Notional: ${Math.round(riskResult.metrics.notionalUsd).toLocaleString()} · Lev: {riskResult.metrics.limitedBy}
                        </text>
                    </>
                )}
            </g>
        </g>
    );
}

export default function ChartDrawingLayer({
    views,
    selectedId,
    onSelect,
    onStartDrag,
    riskResults,
}: ChartDrawingLayerProps) {
    return (
        <svg
            className="pointer-events-none absolute inset-0 z-30 size-full overflow-visible"
            aria-hidden="true"
        >
            {views.map((view) => {
                if (view.drawing.hidden) return null;
                const selected = view.drawing.id === selectedId && !view.preview;
                let shape: React.ReactNode;

                if (
                    view.drawing.type === 'horizontal' ||
                    view.drawing.type === 'vertical' ||
                    view.drawing.type === 'trendline'
                ) {
                    shape = lineDrawing(view, selected, onSelect, onStartDrag);
                } else if (view.drawing.type === 'rectangle') {
                    shape = rectangleDrawing(view, selected, onSelect, onStartDrag);
                } else if (view.drawing.type === 'fibonacci') {
                    shape = fibonacciDrawing(view, selected, onSelect, onStartDrag);
                } else if (view.drawing.type === 'long-position' || view.drawing.type === 'short-position') {
                    shape = positionDrawing(
                        view,
                        selected,
                        onSelect,
                        onStartDrag,
                        riskResults?.[view.drawing.id],
                    );
                } else {
                    const point = view.points[0];
                    if (!point) return null;
                    shape = (
                        <g
                            key={view.drawing.id}
                            data-drawing-id={view.drawing.id}
                            data-drawing-type={view.drawing.type}
                            data-start-time={view.drawing.points[0]?.time}
                            data-start-price={view.drawing.points[0]?.price}
                            data-locked={view.drawing.locked}
                            onClick={(event) => {
                                if (view.preview) return;
                                event.stopPropagation();
                                onSelect(view.drawing.id);
                            }}
                        >
                            <text
                                x={point.x}
                                y={point.y}
                                fill="#dce6f2"
                                fontSize="11"
                                fontWeight="600"
                            >
                                NOTE
                            </text>
                            {!view.preview && (
                                <rect
                                    x={point.x - 5}
                                    y={point.y - 16}
                                    width={42}
                                    height={22}
                                    fill="transparent"
                                    style={{ pointerEvents: 'all', cursor: 'move' }}
                                    onPointerDown={(event) => {
                                        onSelect(view.drawing.id);
                                        onStartDrag(event, view.drawing.id, { kind: 'body' });
                                    }}
                                />
                            )}
                        </g>
                    );
                }

                return (
                    <React.Fragment key={view.drawing.id}>
                        {shape}
                        {selected &&
                            !view.drawing.locked &&
                            view.drawing.type !== 'long-position' &&
                            view.drawing.type !== 'short-position' &&
                            view.points.map((point, pointIndex) => (
                                <circle
                                    key={`${view.drawing.id}-anchor-${pointIndex}`}
                                    cx={point.x}
                                    cy={point.y}
                                    r={5}
                                    fill="#07111c"
                                    stroke="#8ddcff"
                                    strokeWidth={2}
                                    style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                                    onPointerDown={(event) =>
                                        onStartDrag(event, view.drawing.id, { kind: 'anchor', pointIndex })
                                    }
                                />
                            ))}
                    </React.Fragment>
                );
            })}
        </svg>
    );
}
