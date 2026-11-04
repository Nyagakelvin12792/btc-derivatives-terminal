'use client';

import React, { useEffect, useRef } from 'react';
import type { TradingSessionBox } from '../../lib/orderflow/trading-sessions';

export interface TradingSessionsOverlayProps {
    sessions: TradingSessionBox[];
    timeToX: (time: number) => number | null;
    priceToY: (price: number) => number | null;
    width: number;
    height: number;
    showExtendedRays?: boolean;
    opacityPercent?: number;
    className?: string;
}

export default function TradingSessionsOverlay({
    sessions,
    timeToX,
    priceToY,
    width,
    height,
    showExtendedRays = true,
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

        // Render sessions from oldest to newest, so overlaps layer properly
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

            // 1. Fill Box
            ctx.fillStyle = session.fillColor;
            ctx.fillRect(left, top, boxWidth, boxHeight);

            // 2. Dashed Border
            ctx.save();
            ctx.strokeStyle = session.borderColor;
            ctx.lineWidth = session.session === 'OVERLAP' ? 1.5 : 1;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(left, top, boxWidth, boxHeight);
            ctx.restore();

            // 3. Session Tag & Range Header
            const tagText = `${session.label} $${session.range.toFixed(0)}`;
            ctx.font = 'bold 9px "JetBrains Mono", monospace';
            const textMetrics = ctx.measureText(tagText);
            const badgeW = textMetrics.width + 10;
            const badgeH = 14;

            const badgeX = Math.max(4, Math.min(width - badgeW - 4, left + 4));
            const badgeY = Math.max(4, Math.min(height - badgeH - 4, top + 3));

            ctx.save();
            ctx.fillStyle = 'rgba(7, 12, 19, 0.92)';
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            ctx.strokeStyle = session.borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

            ctx.fillStyle = session.tagColor;
            ctx.textBaseline = 'middle';
            ctx.fillText(tagText, badgeX + 5, badgeY + badgeH / 2);
            ctx.restore();

            // 4. Extended High / Low Rays for previous sessions
            if (showExtendedRays && !session.isCurrent && right < width) {
                ctx.save();
                ctx.strokeStyle = session.borderColor;
                ctx.lineWidth = 0.8;
                ctx.setLineDash([2, 4]);

                // High ray
                ctx.beginPath();
                ctx.moveTo(right, top);
                ctx.lineTo(Math.min(width, right + 180), top);
                ctx.stroke();

                // Low ray
                ctx.beginPath();
                ctx.moveTo(right, bottom);
                ctx.lineTo(Math.min(width, right + 180), bottom);
                ctx.stroke();

                ctx.restore();
            }
        }

        ctx.restore();
    }, [sessions, timeToX, priceToY, width, height, showExtendedRays, opacityPercent]);

    return (
        <canvas
            ref={canvasRef}
            className={className ?? 'pointer-events-none absolute inset-0 z-10'}
            data-testid="trading-sessions-overlay"
            aria-hidden="true"
        />
    );
}
