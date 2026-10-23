'use client';

import React from 'react';
import type { ChartTool } from './types';

export interface ChartDrawingPoint {
    time: number;
    price: number;
}

export interface ChartDrawingObject {
    id: string;
    type: Exclude<ChartTool, 'cursor'>;
    points: ChartDrawingPoint[];
    locked: boolean;
}

export interface ChartDrawingView {
    drawing: ChartDrawingObject;
    points: Array<{ x: number; y: number }>;
    preview?: boolean;
}

export type DrawingDragTarget = { kind: 'body' } | { kind: 'anchor'; pointIndex: number };

interface ChartDrawingLayerProps {
    views: ChartDrawingView[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onStartDrag: (event: React.PointerEvent<SVGElement>, id: string, target: DrawingDragTarget) => void;
}

const visibleLine = { strokeLinecap: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
const hitLine = { stroke: 'transparent', strokeWidth: 14, pointerEvents: 'stroke' as const, cursor: 'move' };

function lineDrawing(
    view: ChartDrawingView,
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

    return <g
        key={view.drawing.id}
        data-drawing-id={view.drawing.id}
        data-drawing-type={view.drawing.type}
        data-start-time={view.drawing.points[0].time}
        data-start-price={view.drawing.points[0].price}
        data-locked={view.drawing.locked}
        onClick={(event) => {
            if (view.preview) return;
            event.stopPropagation();
            onSelect(view.drawing.id);
        }}
    >
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={selected ? 2.5 : 1.5} strokeDasharray={dash} opacity={view.preview ? 0.7 : 1} {...visibleLine} />
        {!view.preview && <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            style={hitLine}
            onPointerDown={(event) => { onSelect(view.drawing.id); onStartDrag(event, view.drawing.id, { kind: 'body' }); }}
        />}
    </g>;
}

function boxDrawing(
    view: ChartDrawingView,
    selected: boolean,
    onSelect: ChartDrawingLayerProps['onSelect'],
    onStartDrag: ChartDrawingLayerProps['onStartDrag'],
) {
    const [first, second = first] = view.points;
    const left = Math.min(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const width = Math.abs(second.x - first.x);
    const height = Math.abs(second.y - first.y);
    const isPosition = view.drawing.type === 'long-position' || view.drawing.type === 'short-position';
    const color = view.drawing.type === 'long-position' ? '#31c5a0' : view.drawing.type === 'short-position' ? '#ef6277' : '#49c1ff';

    return <g
        key={view.drawing.id}
        data-drawing-id={view.drawing.id}
        data-drawing-type={view.drawing.type}
        data-start-time={view.drawing.points[0].time}
        data-start-price={view.drawing.points[0].price}
        data-locked={view.drawing.locked}
        onClick={(event) => {
            if (view.preview) return;
            event.stopPropagation();
            onSelect(view.drawing.id);
        }}
    >
        <rect
            x={left} y={top} width={Math.max(1, width)} height={Math.max(1, height)}
            fill={isPosition ? `${color}22` : 'rgba(73, 193, 255, 0.08)'}
            stroke={color} strokeWidth={selected ? 2.5 : 1.5}
            strokeDasharray={isPosition ? '5 3' : undefined}
            opacity={view.preview ? 0.7 : 1}
            vectorEffect="non-scaling-stroke"
        />
        {!view.preview && <rect
            x={left} y={top} width={Math.max(8, width)} height={Math.max(8, height)}
            fill="transparent" stroke="transparent" strokeWidth={10}
            style={{ pointerEvents: 'all', cursor: 'move' }}
            onPointerDown={(event) => { onSelect(view.drawing.id); onStartDrag(event, view.drawing.id, { kind: 'body' }); }}
        />}
    </g>;
}

export default function ChartDrawingLayer({ views, selectedId, onSelect, onStartDrag }: ChartDrawingLayerProps) {
    return <svg className="pointer-events-none absolute inset-0 z-30 size-full overflow-visible" aria-hidden="true">
        {views.map((view) => {
            const selected = view.drawing.id === selectedId && !view.preview;
            let shape: React.ReactNode;
            if (view.drawing.type === 'horizontal' || view.drawing.type === 'vertical' || view.drawing.type === 'trendline') {
                shape = lineDrawing(view, selected, onSelect, onStartDrag);
            } else if (view.drawing.type === 'rectangle' || view.drawing.type === 'long-position' || view.drawing.type === 'short-position') {
                shape = boxDrawing(view, selected, onSelect, onStartDrag);
            } else {
                const point = view.points[0];
                shape = <g
                    key={view.drawing.id}
                    data-drawing-id={view.drawing.id}
                    data-drawing-type={view.drawing.type}
                    data-start-time={view.drawing.points[0].time}
                    data-start-price={view.drawing.points[0].price}
                    data-locked={view.drawing.locked}
                    onClick={(event) => {
                        if (view.preview) return;
                        event.stopPropagation();
                        onSelect(view.drawing.id);
                    }}
                >
                    <text x={point.x} y={point.y} fill="#dce6f2" fontSize="11" fontWeight="600">NOTE</text>
                    {!view.preview && <rect x={point.x - 5} y={point.y - 16} width={42} height={22} fill="transparent" style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(event) => { onSelect(view.drawing.id); onStartDrag(event, view.drawing.id, { kind: 'body' }); }} />}
                </g>;
            }

            return <React.Fragment key={view.drawing.id}>
                {shape}
                {selected && !view.drawing.locked && view.points.map((point, pointIndex) => <circle
                    key={`${view.drawing.id}-anchor-${pointIndex}`}
                    cx={point.x} cy={point.y} r={5}
                    fill="#07111c" stroke="#8ddcff" strokeWidth={2}
                    style={{ pointerEvents: 'all', cursor: 'crosshair' }}
                    onPointerDown={(event) => onStartDrag(event, view.drawing.id, { kind: 'anchor', pointIndex })}
                />)}
            </React.Fragment>;
        })}
    </svg>;
}
