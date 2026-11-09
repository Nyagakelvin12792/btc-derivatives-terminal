'use client';

import React, { useMemo, useState } from 'react';
import type { TerrainDataContractV2, TerrainSurfaceCell } from '../../lib/terrain/types';
import { cn } from '../../lib/ui/cn';

export type MatrixMetricMode = 'SIGNED_GEX' | 'OPEN_INTEREST' | 'IMPLIED_VOL';

export interface OptionsStrikeExpiryMatrixProps {
    contract?: TerrainDataContractV2 | null;
    spotPrice: number;
    callWall: number;
    putWall: number;
    gammaFlip: number;
    className?: string;
}

export interface MatrixCellRow {
    strike: number;
    byExpiry: Record<
        string,
        {
            signedGexUsd: number;
            openInterestBtc: number;
            ivPercent: number | null;
        }
    >;
}

export function buildStrikeExpiryMatrixRows(
    cellsInput: readonly TerrainSurfaceCell[] | readonly (readonly TerrainSurfaceCell[])[] | undefined,
    spotPrice: number,
    callWall: number,
    putWall: number,
    gammaFlip: number,
): { expiries: string[]; rows: MatrixCellRow[]; isSyntheticPreview: boolean } {
    const cells: TerrainSurfaceCell[] = Array.isArray(cellsInput)
        ? (cellsInput.flat() as TerrainSurfaceCell[])
        : [];
    if (cells.length > 0) {
        const expirySet = new Set<string>();
        const strikeMap = new Map<number, MatrixCellRow['byExpiry']>();

        for (const cell of cells) {
            if (!cell.observed) continue;
            expirySet.add(cell.expiry);
            const row = strikeMap.get(cell.strike) ?? {};
            row[cell.expiry] = {
                signedGexUsd: cell.gexExposure,
                openInterestBtc: cell.openInterestBtc,
                ivPercent: cell.iv,
            };
            strikeMap.set(cell.strike, row);
        }

        const expiries = Array.from(expirySet).slice(0, 4);
        const sortedStrikes = Array.from(strikeMap.keys())
            .sort((a, b) => Math.abs(a - spotPrice) - Math.abs(b - spotPrice))
            .slice(0, 7)
            .sort((a, b) => b - a);

        return {
            expiries,
            rows: sortedStrikes.map((strike) => ({
                strike,
                byExpiry: strikeMap.get(strike) ?? {},
            })),
            isSyntheticPreview: false,
        };
    }

    return { expiries: [], rows: [], isSyntheticPreview: false };
}

function formatMatrixValue(
    cell: { signedGexUsd: number; openInterestBtc: number; ivPercent: number | null } | undefined,
    mode: MatrixMetricMode,
): string {
    if (!cell) return '—';
    if (mode === 'SIGNED_GEX') {
        const m = cell.signedGexUsd / 1_000_000;
        return `${m >= 0 ? '+' : ''}${m.toFixed(1)}M`;
    }
    if (mode === 'OPEN_INTEREST') {
        return `${cell.openInterestBtc.toFixed(1)} BTC`;
    }
    return cell.ivPercent === null ? '—' : `${cell.ivPercent.toFixed(1)}%`;
}

export default function OptionsStrikeExpiryMatrix({
    contract,
    spotPrice,
    callWall,
    putWall,
    gammaFlip,
    className,
}: OptionsStrikeExpiryMatrixProps) {
    const [mode, setMode] = useState<MatrixMetricMode>('SIGNED_GEX');
    const matrix = useMemo(
        () =>
            buildStrikeExpiryMatrixRows(
                contract?.surfaceGrid,
                spotPrice,
                callWall,
                putWall,
                gammaFlip,
            ),
        [callWall, contract?.surfaceGrid, gammaFlip, putWall, spotPrice],
    );

    return (
        <div
            className={cn('rounded border border-[#18212C] bg-[#0C1118] p-3', className)}
            data-testid="options-strike-expiry-matrix"
        >
            <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#8390A0]">
                    2D STRIKE × EXPIRY MATRIX
                </span>
                <div className="flex gap-1">
                    {([
                        { id: 'SIGNED_GEX', label: 'GEX' },
                        { id: 'OPEN_INTEREST', label: 'OI' },
                        { id: 'IMPLIED_VOL', label: 'IV' },
                    ] as const).map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setMode(tab.id)}
                            data-testid={`matrix-mode-${tab.id.toLowerCase()}`}
                            className={cn(
                                'rounded px-1.5 py-0.5 font-mono text-[7.5px] font-bold',
                                mode === tab.id
                                    ? 'bg-[#39A9F5]/20 text-[#39A9F5] ring-1 ring-[#39A9F5]/40'
                                    : 'bg-[#070A0F] text-[#8390A0] hover:text-[#D8DEE8]',
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <p className="mb-1 font-mono text-[8px] text-[#8390A0]">
                {contract?.dataMode === 'DEMO' ? 'SYNTHETIC DEMO' : contract?.sourceTime ? `Deribit UTC · ${contract.sourceTime}` : 'Deribit chain unavailable'}
                {contract?.coverage && ` · ${contract.coverage.selected} selected / ${contract.coverage.valid ?? '—'} valid / ${contract.coverage.received ?? '—'} received`}
            </p>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[8px]">
                    <thead>
                        <tr className="border-b border-[#18212C] text-left text-[#8390A0]">
                            <th className="py-1 pr-2">STRIKE</th>
                            {matrix.expiries.map((exp) => (
                                <th key={exp} className="px-1 py-1 text-right">
                                    {exp}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map((row) => {
                            const isCallWall = Math.abs(row.strike - callWall) < 50;
                            const isPutWall = Math.abs(row.strike - putWall) < 50;
                            return (
                                <tr
                                    key={row.strike}
                                    className="border-b border-[#141B24] last:border-none"
                                    data-testid={`matrix-row-${row.strike}`}
                                >
                                    <td className="py-1 pr-2 font-bold text-[#D8DEE8]">
                                        ${row.strike.toLocaleString()}
                                        {isCallWall && (
                                            <span className="ml-1 text-[7px] text-[#2CC7A0]">CW</span>
                                        )}
                                        {isPutWall && (
                                            <span className="ml-1 text-[7px] text-[#E06379]">PW</span>
                                        )}
                                    </td>
                                    {matrix.expiries.map((exp) => {
                                        const cell = row.byExpiry[exp];
                                        const gex = cell?.signedGexUsd ?? 0;
                                        return (
                                            <td
                                                key={exp}
                                                className={cn(
                                                    'px-1 py-1 text-right',
                                                    mode === 'SIGNED_GEX'
                                                        ? gex >= 0
                                                            ? 'text-[#2CC7A0]'
                                                            : 'text-[#E06379]'
                                                        : 'text-[#D8DEE8]',
                                                )}
                                            >
                                                {formatMatrixValue(cell, mode)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
