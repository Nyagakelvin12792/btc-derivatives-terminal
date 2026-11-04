'use client';

import React, { useEffect, useRef } from 'react';
import type { VolumeProfileLevels, VolumeProfileRow } from '../../lib/ui/market-fixtures';
export type ProfilePlacement = 'LEFT' | 'RIGHT';
export type ProfileVolumeMode = 'TOTAL' | 'UP_DOWN' | 'DELTA';

export interface FixedRangeVolumeProfileCanvasProps {
    profile: VolumeProfileRow[];
    profileRows: Array<{ price: number; y: number }>;
    maxProfile: number;
    profileWidthPercent: number;
    profileRowHeight: number;
    profilePlacement: ProfilePlacement;
    profileVolumeMode: ProfileVolumeMode;
    profileLevels: VolumeProfileLevels | null;
    opacityPercent: number;
    width: number;
    height: number;
    className?: string;
}

export default function FixedRangeVolumeProfileCanvas({
    profile,
    profileRows,
    maxProfile,
    profileWidthPercent,
    profileRowHeight,
    profilePlacement,
    profileVolumeMode,
    profileLevels,
    opacityPercent,
    width,
    height,
    className,
}: FixedRangeVolumeProfileCanvasProps) {
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

        if (!profile.length || maxProfile <= 0) {
            ctx.restore();
            return;
        }

        // Restrained institutional opacity so price candles remain visually dominant
        const alpha = Math.max(0.08, Math.min(0.75, (opacityPercent / 100) * 0.72));
        ctx.globalAlpha = alpha;

        const rowHeight = Math.max(1, profileRowHeight);
        const halfRow = rowHeight / 2;
        // Institutional proportional width scaling (10% to 100% of container width)
        const clampedWidthPercent = Math.max(10, Math.min(100, profileWidthPercent));
        const maxBarWidth = (width * clampedWidthPercent) / 100;
        const isRight = profilePlacement === 'RIGHT';

        for (let i = 0; i < profile.length; i++) {
            const row = profile[i];
            const coord = profileRows[i];
            if (!coord) continue;
            const y = coord.y;
            if (y < -rowHeight || y > height + rowHeight) continue;

            const metric = profileVolumeMode === 'DELTA' ? Math.abs(row.delta) : row.volume;
            const barWidth = Math.max(1, (metric / maxProfile) * maxBarWidth);
            const inValueArea =
                profileLevels !== null && row.price >= profileLevels.val && row.price <= profileLevels.vah;
            const isPocRow =
                profileLevels !== null && Math.abs(row.price - profileLevels.poc) <= Math.max(1, rowHeight);
            const top = y - halfRow;

            const startX = isRight ? width - barWidth : 0;

            if (isPocRow) {
                ctx.fillStyle = '#F59E0B';
                ctx.fillRect(startX, top, barWidth, Math.max(1.5, rowHeight));
                continue;
            }

            if (profileVolumeMode === 'TOTAL') {
                ctx.fillStyle = inValueArea ? 'rgba(56, 189, 248, 0.75)' : 'rgba(14, 116, 144, 0.45)';
                ctx.fillRect(startX, top, barWidth, rowHeight);
            } else if (profileVolumeMode === 'DELTA') {
                if (row.delta >= 0) {
                    ctx.fillStyle = inValueArea ? 'rgba(44, 199, 160, 0.78)' : 'rgba(44, 199, 160, 0.42)';
                } else {
                    ctx.fillStyle = inValueArea ? 'rgba(240, 97, 82, 0.78)' : 'rgba(240, 97, 82, 0.42)';
                }
                ctx.fillRect(startX, top, barWidth, rowHeight);
            } else {
                const upWidth = barWidth * row.upShare;
                const downWidth = barWidth * (1 - row.upShare);

                if (isRight) {
                    const downX = width - barWidth;
                    const upX = width - upWidth;

                    ctx.fillStyle = inValueArea ? 'rgba(240, 97, 82, 0.72)' : 'rgba(190, 18, 60, 0.42)';
                    ctx.fillRect(downX, top, downWidth, rowHeight);

                    ctx.fillStyle = inValueArea ? 'rgba(44, 199, 160, 0.78)' : 'rgba(14, 116, 144, 0.48)';
                    ctx.fillRect(upX, top, upWidth, rowHeight);
                } else {
                    ctx.fillStyle = inValueArea ? 'rgba(240, 97, 82, 0.72)' : 'rgba(190, 18, 60, 0.42)';
                    ctx.fillRect(0, top, downWidth, rowHeight);

                    ctx.fillStyle = inValueArea ? 'rgba(44, 199, 160, 0.78)' : 'rgba(14, 116, 144, 0.48)';
                    ctx.fillRect(downWidth, top, upWidth, rowHeight);
                }
            }
        }

        ctx.restore();
    }, [
        height,
        maxProfile,
        opacityPercent,
        profile,
        profileLevels,
        profilePlacement,
        profileRowHeight,
        profileRows,
        profileVolumeMode,
        profileWidthPercent,
        width,
    ]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            data-testid="fixed-range-vp-bars"
            aria-hidden="true"
        />
    );
}
