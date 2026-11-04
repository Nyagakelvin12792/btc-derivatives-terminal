'use client';

import React, { useEffect, useRef } from 'react';
import type { TradingSessionBox } from '../../lib/orderflow/trading-sessions';

export interface TradingSessionsOverlayProps {
    sessions: TradingSessionBox[];
    timeToX: (time: number) => number | null;
    priceToY: (price: number) => number | null;
    width: number;
    height: number;
    opacityPercent?: number;
    className?: string;
}

export default function TradingSessionsOverlay({
    sessions,
    timeToX,
    priceToY,
    width,
    height,
    opacityPercent = 90,
    className,
}: TradingSessionsOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (width <= 0 || height <= 0) return;

        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        if (!sessions.length) {
            ctx.restore();
            return;
        }

        const alphaMultiplier = Math.max(0.1, Math.min(1, opacityPercent / 100));
        ctx.globalAlpha = alphaMultiplier;

        // Render sessions from oldest to newest
        for (const session of sessions) {
            const rawX1 = timeToX(session.startTime);
            const rawX2 = timeToX(session.endTime);
            const rawYTop = priceToY(session.high);
            const rawYBottom = priceToY(session.low);

            if (rawX1 === null && rawX2 === null) continue;
            if (rawYTop === null && rawYBottom === null) continue;

            // Clamping coordinates to visible viewport
            const x1 = rawX1 !== null ? rawX1 : 0;
            const x2 = rawX2 !== null ? rawX2 : width;
            const left = Math.min(x1, x2);
            const right = Math.max(x1, x2);
            const boxWidth = Math.max(4, right - left);

            const yTop = rawYTop !== null ? rawYTop : 0;
            const yBottom = rawYBottom !== null ? rawYBottom : height;
            const top = Math.min(yTop, yBottom);
            const bottom = Math.max(yTop, yBottom);
            const boxHeight = Math.max(4, bottom - top);

            // Skip if completely outside viewport
            if (right < 0 || left > width || bottom < 0 || top > height) {
                continue;
            }

            // 1. Fill Box (ends strictly at the end of the session)
            ctx.fillStyle = session.fillColor;
            ctx.fillRect(left, top, boxWidth, boxHeight);

            // 2. Clean Dashed Border (ends strictly at the end of the session)
            ctx.save();
            ctx.strokeStyle = session.borderColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(left, top, boxWidth, boxHeight);
            ctx.restore();

            // 3. Clean minimal label: AS, LON, NY (no price, no bulky badges)
            ctx.save();
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            ctx.fillStyle = session.tagColor;
            ctx.textBaseline = 'top';
            ctx.fillText(session.label, left + 4, top + 3);
            ctx.restore();
        }

        ctx.restore();
    }, [sessions, timeToX, priceToY, width, height, opacityPercent]);

    return (
        <canvas
            ref={canvasRef}
            className={className ?? 'pointer-events-none absolute inset-0 z-10'}
            data-testid="trading-sessions-overlay"
            aria-hidden="true"
        />
    );
}
