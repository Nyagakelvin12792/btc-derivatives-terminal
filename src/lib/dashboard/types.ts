export type DealerRegimeType = 'LONG_GAMMA' | 'SHORT_GAMMA' | 'TRANSITIONAL';

export interface DealerEnvironmentSummaryData {
    spotPrice: number;
    spot24hChange: number;
    spot24hChangePct: number;
    openInterestUsd: number;
    openInterestBtc: number;
    openInterestChangePct: number;
    iv30d: number;
    iv30dChange: number;
    skew25d: number;
    skew25dChange: number;
    fundingRate: number;
    fundingPeriod: string;
    utcTime: string;
    netGex: number;
    netVanna: number;
    netCharm: number;
    gammaFlip: number;
    callWall: number;
    putWall: number;
    maxPain: number;
    totalOiUsd: number;
    dealerRegime: DealerRegimeType;
    regimeTitle: string;
    regimeSubtitle: string;
    regimeDescription: string;
    regimeScore: number; // 0 to 100 for gauge meter
}

export interface TerrainGridCell {
    strike: number;
    dte: number;
    expiry: string;
    gex: number;
    vanna: number;
    charm: number;
    callGex: number;
    putGex: number;
    openInterest: number;
    gamma: number;
    delta: number;
    iv: number;
}

export type ConfluenceTag = 'High Confluence' | 'Dealer Support Zone' | 'Regime Transition' | 'Gamma Flip Zone';
export type LevelType = 'CALL WALL' | 'PUT WALL' | 'FLIP LEVEL' | 'MAX PAIN' | 'SUPPORT' | 'RESISTANCE';

export interface ConfluenceLevelItem {
    id: string;
    level: string;
    strike: number;
    gex: number;
    vanna: number;
    charm: number;
    wallType: LevelType;
    confluenceScore: number;
    tag: ConfluenceTag;
}

export interface KeyContractItem {
    instrument: string;
    type: 'call' | 'put';
    expiry: string;
    dte: number;
    strike: number;
    spotPct: number;
    gamma: number;
    gex: number;
    vanna: number;
    charm: number;
    iv: number;
    ivPercentile: number;
    oiBtc: number;
    oiUsd: number;
    delta: number;
    volume24h: number;
    confluenceBadge: string;
    confluenceTag: ConfluenceTag;
}

export interface DashboardData {
    timestamp: string;
    summary: DealerEnvironmentSummaryData;
    strikes: number[];
    expirations: string[];
    dtes: number[];
    surfaceGrid: TerrainGridCell[][];
    confluenceLevels: ConfluenceLevelItem[];
    keyContracts: KeyContractItem[];
}
