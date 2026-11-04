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

        const alpha = Math.max(0.05, Math.min(1, opacityPercent / 100));
        ctx.globalAlpha = alpha;

        const rowHeight = Math.max(1, profileRowHeight);
        const halfRow = rowHeight / 2;
        const maxBarWidth = Math.min((width * profileWidthPercent) / 100, Math.min(width * 0.45, 320));
        const isRight = profilePlacement === 'RIGHT';

        for (let i = 0; i < profile.length; i++) {
            const row = profile[i];
            const coord = profileRows[i];
            if (!coord) continue;
            const y = coord.y;
            if (y < -rowHeight || y > height + rowHeight) continue;

            const metric = profileVolumeMode === 'DELTA' ? Math.abs(row.delta) : row.volume;
            const barWidth = Math.max(1, (metric / maxProfile) * maxBarWidth);
            const inValueArea = profileLevels !== null && row.price >= profileLevels.val && row.price <= profileLevels.vah;
            const top = y - halfRow;

            const startX = isRight ? width - barWidth : 0;

            if (profileVolumeMode === 'TOTAL') {
                ctx.fillStyle = inValueArea ? '#38bdf8' : '#0284c7';
                ctx.fillRect(startX, top, barWidth, rowHeight);
            } else if (profileVolumeMode === 'DELTA') {
                if (row.delta >= 0) {
                    ctx.fillStyle = inValueArea ? '#22d3ee' : '#06b6d4';
                } else {
                    ctx.fillStyle = inValueArea ? '#fda4af' : '#f43f5e';
                }
                ctx.fillRect(startX, top, barWidth, rowHeight);
            } else {
                // UP_DOWN mode: two-tone bar
                const upWidth = barWidth * row.upShare;
                const downWidth = barWidth * (1 - row.upShare);

                if (isRight) {
                    // Down volume on left, Up volume on right
                    const downX = width - barWidth;
                    const upX = width - upWidth;

                    ctx.fillStyle = inValueArea ? '#fda4af' : '#e11d48';
                    ctx.fillRect(downX, top, downWidth, rowHeight);

                    ctx.fillStyle = inValueArea ? '#67e8f9' : '#0891b2';
                    ctx.fillRect(upX, top, upWidth, rowHeight);
                } else {
                    // Down volume first, Up volume second
                    ctx.fillStyle = inValueArea ? '#fda4af' : '#e11d48';
                    ctx.fillRect(0, top, downWidth, rowHeight);

                    ctx.fillStyle = inValueArea ? '#67e8f9' : '#0891b2';
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
