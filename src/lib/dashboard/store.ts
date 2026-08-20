import { create } from 'zustand';
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
}

export const useTerminalStore = create<TerminalState>((set) => ({
    activeWorkspace: 'SURFACE MAP',
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
}));
