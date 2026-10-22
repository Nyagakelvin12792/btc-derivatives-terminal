import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WorkspaceTab } from '@/lib/dashboard/types';
import { TerrainSurfaceCell } from '@/lib/terrain/types';

export interface VisibleLayersState {
    gex: boolean;
    vanna: boolean;
    charm: boolean;
    confluenceFloor: boolean;
    spot: boolean;
    levels: boolean;
    zeroPlane: boolean;
    wireframe: boolean;
}

export interface TerminalState {
    // Active Navigation
    activeWorkspace: WorkspaceTab;
    setActiveWorkspace: (tab: WorkspaceTab) => void;

    // Data Mode
    dataMode: 'LIVE' | 'DEMO' | 'DEGRADED';
    setDataMode: (mode: 'LIVE' | 'DEMO' | 'DEGRADED') => void;

    // Selection State
    selectedStrike: number | null;
    selectedExpiry: string | null;
    selectedDte: number | null;
    selectedLevelId: string | null;
    selectedContractInstrument: string | null;
    setSelectedStrike: (strike: number | null) => void;
    setSelectedPoint: (strike: number, dte: number, expiry: string) => void;
    setSelectedLevel: (levelId: string, strike: number) => void;
    setSelectedContract: (instrument: string, strike: number, expiry: string, dte: number) => void;

    // Hover State
    hoveredCell: TerrainSurfaceCell | null;
    setHoveredCell: (cell: TerrainSurfaceCell | null) => void;

    // 3D Layer Toggles
    visibleLayers: VisibleLayersState;
    toggleLayer: (layer: keyof VisibleLayersState) => void;
    setLayer: (layer: keyof VisibleLayersState, value: boolean) => void;

    // 3D Viewport
    viewMode: '3d' | '2d';
    setViewMode: (mode: '3d' | '2d') => void;
    isRotating: boolean;
    setIsRotating: (rotating: boolean) => void;

    // UI-only workspace preferences. Market responses are never persisted here.
    inspectorOpen: boolean;
    setInspectorOpen: (open: boolean) => void;
    inspectorTab: 'OPTIONS' | 'DECISION' | 'RISK' | 'DATA';
    setInspectorTab: (tab: 'OPTIONS' | 'DECISION' | 'RISK' | 'DATA') => void;
    studyPaneOpen: boolean;
    setStudyPaneOpen: (open: boolean) => void;
    activeOrderFlowStudy: 'CVD' | 'DELTA' | 'BOOK' | 'LIQUIDITY';
    setActiveOrderFlowStudy: (study: 'CVD' | 'DELTA' | 'BOOK' | 'LIQUIDITY') => void;
    dteFilter: '0-2D' | '7D' | '14D' | '30D' | 'ALL';
    setDteFilter: (filter: '0-2D' | '7D' | '14D' | '30D' | 'ALL') => void;
    optionsDisplay: 'GEX' | 'OI';
    setOptionsDisplay: (display: 'GEX' | 'OI') => void;
    chartLayers: {
        walls: boolean;
        secondaryWalls: boolean;
        gammaRegime: boolean;
        gammaFlip: boolean;
        maxPain: boolean;
        volumeProfile: boolean;
        avwap: boolean;
        volume: boolean;
    };
    toggleChartLayer: (layer: keyof TerminalState['chartLayers']) => void;
    resetWorkspaceUi: () => void;
}

const defaultChartLayers = {
    walls: true,
    secondaryWalls: true,
    gammaRegime: true,
    gammaFlip: true,
    maxPain: true,
    volumeProfile: true,
    avwap: true,
    volume: true,
};

export const useTerminalStore = create<TerminalState>()(persist((set) => ({
    activeWorkspace: 'MARKET STRUCTURE',
    setActiveWorkspace: (tab) => set({ activeWorkspace: tab }),

    dataMode: 'DEMO',
    setDataMode: (mode) => set({ dataMode: mode }),

    selectedStrike: 72000,
    selectedExpiry: '2025-06-27',
    selectedDte: 30,
    selectedLevelId: 'cw-1',
    selectedContractInstrument: null,

    setSelectedStrike: (strike) => set({ selectedStrike: strike }),
    setSelectedPoint: (strike, dte, expiry) =>
        set({ selectedStrike: strike, selectedDte: dte, selectedExpiry: expiry, selectedContractInstrument: null }),
    setSelectedLevel: (levelId, strike) =>
        set({ selectedLevelId: levelId, selectedStrike: strike, selectedContractInstrument: null }),
    setSelectedContract: (instrument, strike, expiry, dte) =>
        set({ selectedContractInstrument: instrument, selectedStrike: strike, selectedExpiry: expiry, selectedDte: dte }),

    hoveredCell: null,
    setHoveredCell: (cell) => set({ hoveredCell: cell }),

    visibleLayers: {
        gex: true,
        vanna: true,
        charm: true,
        confluenceFloor: true,
        spot: true,
        levels: true,
        zeroPlane: true,
        wireframe: true,
    },
    toggleLayer: (layer) =>
        set((state) => ({
            visibleLayers: { ...state.visibleLayers, [layer]: !state.visibleLayers[layer] },
        })),
    setLayer: (layer, value) =>
        set((state) => ({
            visibleLayers: { ...state.visibleLayers, [layer]: value },
        })),

    viewMode: '3d',
    setViewMode: (mode) => set({ viewMode: mode }),
    isRotating: false,
    setIsRotating: (rotating) => set({ isRotating: rotating }),

    inspectorOpen: true,
    setInspectorOpen: (open) => set({ inspectorOpen: open }),
    inspectorTab: 'OPTIONS',
    setInspectorTab: (tab) => set({ inspectorTab: tab }),
    studyPaneOpen: true,
    setStudyPaneOpen: (open) => set({ studyPaneOpen: open }),
    activeOrderFlowStudy: 'CVD',
    setActiveOrderFlowStudy: (study) => set({ activeOrderFlowStudy: study }),
    dteFilter: 'ALL',
    setDteFilter: (filter) => set({ dteFilter: filter }),
    optionsDisplay: 'GEX',
    setOptionsDisplay: (display) => set({ optionsDisplay: display }),
    chartLayers: defaultChartLayers,
    toggleChartLayer: (layer) => set((state) => ({
        chartLayers: { ...state.chartLayers, [layer]: !state.chartLayers[layer] },
    })),
    resetWorkspaceUi: () => set({
        inspectorOpen: true,
        inspectorTab: 'OPTIONS',
        studyPaneOpen: true,
        activeOrderFlowStudy: 'CVD',
        dteFilter: 'ALL',
        optionsDisplay: 'GEX',
        chartLayers: defaultChartLayers,
    }),
}), {
    name: 'btc-terminal-ui-v1',
    version: 1,
    partialize: (state) => ({
        activeWorkspace: state.activeWorkspace,
        inspectorOpen: state.inspectorOpen,
        inspectorTab: state.inspectorTab,
        studyPaneOpen: state.studyPaneOpen,
        activeOrderFlowStudy: state.activeOrderFlowStudy,
        dteFilter: state.dteFilter,
        optionsDisplay: state.optionsDisplay,
        chartLayers: state.chartLayers,
    }),
}));
