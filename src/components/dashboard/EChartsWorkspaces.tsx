/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TerrainDataContractV2 } from '@/lib/terrain/types';
import { formatGex, formatUsd } from '@/lib/dashboard/adapters';
import ExposureScalePanel from '@/components/dashboard/ExposureScalePanel';
import { Activity, Compass, Clock, Layers, ShieldCheck, Zap } from 'lucide-react';

interface WorkspaceProps {
    data: TerrainDataContractV2;
    selectedStrike: number | null;
    onSelectStrike: (strike: number) => void;
}

/**
 * 1. GEX Analysis Workspace (ECharts)
 */
export function GexAnalysisWorkspace({ data, selectedStrike, onSelectStrike }: WorkspaceProps) {
    const { strikes, dtes, surfaceGrid, summary, scales } = data;

    // Aggregate strike GEX profile
    const strikeProfileData = useMemo(() => {
        return strikes.map((s) => {
            let total = 0;
            surfaceGrid.forEach((row) => {
                const c = row.find((cell) => cell.strike === s);
                if (c) total += (c.gexExposure ?? c.gex ?? 0);
            });
            return { strike: s, gex: total };
        });
    }, [strikes, surfaceGrid]);

    // Bar Chart Option
    const barOption = useMemo(() => {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any) => {
                    const item = params[0];
                    return `<div style="font-family: monospace; font-size: 11px;">
                        <strong>$${item.name}</strong><br/>
                        Net GEX: ${formatGex(item.value)}
                    </div>`;
                },
            },
            grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
            xAxis: {
                type: 'category',
                data: strikes.map((s) => `$${Math.round(s / 1000)}k`),
                axisLine: { lineStyle: { color: '#334155' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#334155' } },
                splitLine: { lineStyle: { color: '#1e293b' } },
                axisLabel: {
                    color: '#94a3b8',
                    fontSize: 10,
                    fontFamily: 'monospace',
                    formatter: (val: number) => formatGex(val),
                },
            },
            series: [
                {
                    name: 'GEX Exposure',
                    type: 'bar',
                    data: strikeProfileData.map((d) => ({
                        value: d.gex,
                        itemStyle: {
                            color: d.gex >= 0 ? '#00e676' : '#ff1744',
                            borderRadius: d.gex >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
                        },
                    })),
                },
            ],
        };
    }, [strikes, strikeProfileData]);

    // Heatmap Option
    const heatmapOption = useMemo(() => {
        const heatmapData: Array<[number, number, number]> = [];
        surfaceGrid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                heatmapData.push([cIdx, rIdx, cell.gexExposure ?? cell.gex ?? 0]);
            });
        });

        const maxAbs = scales.gex.robustAbsMax || 1e9;

        return {
            backgroundColor: 'transparent',
            tooltip: {
                position: 'top',
                formatter: (params: any) => {
                    const [cIdx, rIdx, val] = params.data;
                    const strike = strikes[cIdx];
                    const dte = dtes[rIdx];
                    return `<div style="font-family: monospace; font-size: 11px;">
                        Strike: $${strike?.toLocaleString()}<br/>
                        DTE: ${dte}d<br/>
                        GEX: ${formatGex(val)}
                    </div>`;
                },
            },
            grid: { left: '4%', right: '4%', bottom: '10%', top: '8%', containLabel: true },
            xAxis: {
                type: 'category',
                data: strikes.map((s) => `${Math.round(s / 1000)}k`),
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
                axisLine: { lineStyle: { color: '#334155' } },
            },
            yAxis: {
                type: 'category',
                data: dtes.map((d) => `${d}d`),
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
                axisLine: { lineStyle: { color: '#334155' } },
            },
            visualMap: {
                min: -maxAbs,
                max: maxAbs,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: '0%',
                inRange: {
                    color: ['#ff1744', '#1e293b', '#00e676'],
                },
                textStyle: { color: '#94a3b8', fontFamily: 'monospace', fontSize: 9 },
                formatter: (val: number) => formatGex(val),
            },
            series: [
                {
                    type: 'heatmap',
                    data: heatmapData,
                    emphasis: {
                        itemStyle: { borderColor: '#38bdf8', borderWidth: 1 },
                    },
                },
            ],
        };
    }, [surfaceGrid, strikes, dtes, scales]);

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {/* 1. GEX Strike Profile */}
                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-2">
                    <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                        <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-emerald-400" /> Aggregate GEX Strike Profile
                        </span>
                        <span className="text-[10px] text-zinc-400">USD per 1% Spot Move</span>
                    </div>
                    <ReactECharts
                        option={barOption}
                        style={{ height: '240px', width: '100%' }}
                        onEvents={{
                            click: (params: any) => {
                                const s = strikes[params.dataIndex];
                                if (s) onSelectStrike(s);
                            },
                        }}
                    />
                </div>

                {/* 2. GEX Strike x Expiry Heatmap */}
                <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-2">
                    <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                        <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-cyan-400" /> Strike × Expiry GEX Heatmap
                        </span>
                        <span className="text-[10px] text-zinc-400">Green = Long Gamma | Red = Short Gamma</span>
                    </div>
                    <ReactECharts
                        option={heatmapOption}
                        style={{ height: '240px', width: '100%' }}
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * 2. Vanna Workspace (ECharts)
 */
export function VannaWorkspace({ data, onSelectStrike }: WorkspaceProps) {
    const { strikes, dtes, surfaceGrid, scales } = data;

    const vannaProfileData = useMemo(() => {
        return strikes.map((s) => {
            let total = 0;
            surfaceGrid.forEach((row) => {
                const c = row.find((cell) => cell.strike === s);
                if (c) total += (c.vannaExposure ?? 0);
            });
            return { strike: s, vanna: total };
        });
    }, [strikes, surfaceGrid]);

    const barOption = useMemo(() => {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    const item = params[0];
                    return `<div style="font-family: monospace; font-size: 11px;">
                        <strong>$${item.name}</strong><br/>
                        Vanna Exposure: ${formatGex(item.value)}
                    </div>`;
                },
            },
            grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
            xAxis: {
                type: 'category',
                data: strikes.map((s) => `$${Math.round(s / 1000)}k`),
                axisLine: { lineStyle: { color: '#334155' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#334155' } },
                splitLine: { lineStyle: { color: '#1e293b' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', formatter: (val: number) => formatGex(val) },
            },
            series: [
                {
                    type: 'bar',
                    data: vannaProfileData.map((d) => ({
                        value: d.vanna,
                        itemStyle: { color: d.vanna >= 0 ? '#c084fc' : '#6366f1', borderRadius: [4, 4, 0, 0] },
                    })),
                },
            ],
        };
    }, [strikes, vannaProfileData]);

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-purple-400" /> Aggregate Vanna Exposure Profile (∂Delta / ∂IV)
                    </span>
                    <span className="text-[10px] text-zinc-400">USD per 1 Vol-Point IV Move</span>
                </div>
                <ReactECharts
                    option={barOption}
                    style={{ height: '280px', width: '100%' }}
                    onEvents={{
                        click: (params: any) => {
                            const s = strikes[params.dataIndex];
                            if (s) onSelectStrike(s);
                        },
                    }}
                />
            </div>
        </div>
    );
}

/**
 * 3. Charm Workspace (ECharts)
 */
export function CharmWorkspace({ data }: WorkspaceProps) {
    const { strikes, surfaceGrid, scales } = data;

    const charmProfileData = useMemo(() => {
        return strikes.map((s) => {
            let total = 0;
            surfaceGrid.forEach((row) => {
                const c = row.find((cell) => cell.strike === s);
                if (c) total += (c.charmExposure ?? 0);
            });
            return { strike: s, charm: total };
        });
    }, [strikes, surfaceGrid]);

    const barOption = useMemo(() => {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    const item = params[0];
                    return `<div style="font-family: monospace; font-size: 11px;">
                        <strong>$${item.name}</strong><br/>
                        Daily Charm Bleed: ${formatGex(item.value)}/day
                    </div>`;
                },
            },
            grid: { left: '3%', right: '4%', bottom: '8%', top: '10%', containLabel: true },
            xAxis: {
                type: 'category',
                data: strikes.map((s) => `$${Math.round(s / 1000)}k`),
                axisLine: { lineStyle: { color: '#334155' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#334155' } },
                splitLine: { lineStyle: { color: '#1e293b' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace', formatter: (val: number) => `${formatGex(val)}/d` },
            },
            series: [
                {
                    type: 'bar',
                    data: charmProfileData.map((d) => ({
                        value: d.charm,
                        itemStyle: { color: '#ff9100', borderRadius: [4, 4, 0, 0] },
                    })),
                },
            ],
        };
    }, [strikes, charmProfileData]);

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-400" /> Daily Charm Decay Profile (∂Delta / ∂Time)
                    </span>
                    <span className="text-[10px] text-zinc-400">USD Daily Time-Decay Drift</span>
                </div>
                <ReactECharts
                    option={barOption}
                    style={{ height: '280px', width: '100%' }}
                />
            </div>
        </div>
    );
}

/**
 * 4. Open Interest Workspace (ECharts)
 */
export function OpenInterestWorkspace({ data, onSelectStrike }: WorkspaceProps) {
    const { strikes, keyContracts, scales } = data;

    const oiData = useMemo(() => {
        return strikes.map((s) => {
            const calls = keyContracts.filter((c) => c.strike === s && c.type === 'call').reduce((acc, c) => acc + (c.openInterestBtc || c.openInterest || 0), 0);
            const puts = keyContracts.filter((c) => c.strike === s && c.type === 'put').reduce((acc, c) => acc + (c.openInterestBtc || c.openInterest || 0), 0);
            return { strike: s, calls, puts };
        });
    }, [strikes, keyContracts]);

    const barOption = useMemo(() => {
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
            },
            legend: {
                data: ['Call OI (BTC)', 'Put OI (BTC)'],
                textStyle: { color: '#94a3b8', fontFamily: 'monospace', fontSize: 10 },
            },
            grid: { left: '3%', right: '4%', bottom: '8%', top: '12%', containLabel: true },
            xAxis: {
                type: 'category',
                data: strikes.map((s) => `$${Math.round(s / 1000)}k`),
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
                axisLine: { lineStyle: { color: '#334155' } },
            },
            yAxis: {
                type: 'value',
                axisLine: { lineStyle: { color: '#334155' } },
                splitLine: { lineStyle: { color: '#1e293b' } },
                axisLabel: { color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' },
            },
            series: [
                {
                    name: 'Call OI (BTC)',
                    type: 'bar',
                    stack: 'total',
                    data: oiData.map((d) => d.calls),
                    itemStyle: { color: '#00e676' },
                },
                {
                    name: 'Put OI (BTC)',
                    type: 'bar',
                    stack: 'total',
                    data: oiData.map((d) => d.puts),
                    itemStyle: { color: '#ff1744' },
                },
            ],
        };
    }, [strikes, oiData]);

    return (
        <div className="space-y-3 font-mono select-none">
            <ExposureScalePanel scales={scales} />

            <div className="p-4 rounded-xl bg-[#080d16] border border-[#151f30] shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-[#151f30] pb-2">
                    <span className="text-xs font-bold text-white uppercase flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-cyan-400" /> Open Interest Concentration by Strike (BTC)
                    </span>
                    <span className="text-[10px] text-zinc-400">Verified Contracts from Active Deribit Books</span>
                </div>
                <ReactECharts
                    option={barOption}
                    style={{ height: '280px', width: '100%' }}
                    onEvents={{
                        click: (params: any) => {
                            const s = strikes[params.dataIndex];
                            if (s) onSelectStrike(s);
                        },
                    }}
                />
            </div>
        </div>
    );
}
