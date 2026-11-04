'use client';

import React, { useEffect, useRef } from 'react';
import type { TradingSessionBox } from '../../lib/orderflow/trading-sessions';

export interface TradingSessionsOverlayProps {
    sessions: TradingSessionBox[];
    timeToX: (time: number) => number | null;
    priceToY: (price: number) => number | null;
    width: number;
    height: number;
    lastBarX?: number | null;
    opacityPercent?: number;
    showHighLowLines?: boolean;
    showOpeningRange?: boolean;
    className?: string;
}

export default function TradingSessionsOverlay({
    sessions,
    timeToX,
    priceToY,
    width,
    height,
    lastBarX = null,
    opacityPercent = 65,
    showHighLowLines = false,
    showOpeningRange = false,
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
        const maxRightBoundary =
            lastBarX !== null && Number.isFinite(lastBarX) ? Math.min(width, lastBarX + 4) : width;

        for (const session of sessions) {
            const rawX1 = timeToX(session.startTime);
            const rawX2 = timeToX(session.endTime);
            const rawYTop = priceToY(session.high);
            const rawYBottom = priceToY(session.low);

            if (rawX1 === null && rawX2 === null) continue;
            if (rawYTop === null && rawYBottom === null) continue;

            // Clamp right boundary strictly to session end or latest plotted candle (lastBarX), never stretching into empty future margin
            const x1 = rawX1 !== null ? rawX1 : 0;
            const unclampedX2 = rawX2 !== null ? rawX2 : maxRightBoundary;
            const x2 = Math.min(unclampedX2, maxRightBoundary);
            const left = Math.min(x1, x2);
            const right = Math.max(x1, x2);
            const boxWidth = Math.max(4, right - left);

            const yTop = rawYTop !== null ? rawYTop : 0;
            const yBottom = rawYBottom !== null ? rawYBottom : height;
            const top = Math.min(yTop, yBottom);
            const bottom = Math.max(yTop, yBottom);
            const boxHeight = Math.max(4, bottom - top);

            if (right < 0 || left > width || bottom < 0 || top > height) {
                continue;
            }

            // 1. Restrained subtle session fill
            ctx.save();
            ctx.globalAlpha = alphaMultiplier * 0.45;
            ctx.fillStyle = session.fillColor;
            ctx.fillRect(left, top, boxWidth, boxHeight);
            ctx.restore();

            // 2. Subtle dashed border terminating strictly at the session close / lastBarX
            ctx.save();
            ctx.globalAlpha = alphaMultiplier * 0.72;
            ctx.strokeStyle = session.borderColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(left, top, boxWidth, boxHeight);
            ctx.restore();

            // 3. Optional Session High / Low solid accent caps
            if (showHighLowLines) {
                ctx.save();
                ctx.globalAlpha = alphaMultiplier * 0.9;
                ctx.strokeStyle = session.tagColor;
                ctx.lineWidth = 1.25;
                ctx.beginPath();
                ctx.moveTo(left, top);
                ctx.lineTo(right, top);
                ctx.moveTo(left, bottom);
                ctx.lineTo(right, bottom);
                ctx.stroke();
                ctx.restore();
            }

            // 4. Optional Opening Range (initial 20% width subtle highlight)
            if (showOpeningRange && boxWidth >= 16) {
                ctx.save();
                ctx.globalAlpha = alphaMultiplier * 0.35;
                ctx.fillStyle = session.borderColor;
                ctx.fillRect(left, top, Math.min(28, boxWidth * 0.2), boxHeight);
                ctx.restore();
            }

            // 5. Compact minimal session tag: AS, LON, NY, LON/NY
            ctx.save();
            ctx.globalAlpha = Math.min(1, alphaMultiplier * 0.95);
            ctx.font = '600 9px "JetBrains Mono", monospace';
            ctx.fillStyle = session.tagColor;
            ctx.textBaseline = 'top';
            ctx.fillText(session.label, left + 4, top + 3);
            ctx.restore();
        }

        ctx.restore();
    }, [sessions, timeToX, priceToY, width, height, lastBarX, opacityPercent, showHighLowLines, showOpeningRange]);

    return (
        <canvas
            ref={canvasRef}
            className={className ?? 'pointer-events-none absolute inset-0 z-10'}
            data-testid="trading-sessions-overlay"
            aria-hidden="true"
        />
    );
}
