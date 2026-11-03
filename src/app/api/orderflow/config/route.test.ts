import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const originalFlag = process.env.ORDERFLOW_AGGTRADE_ENABLED;

afterEach(() => {
    if (originalFlag === undefined) delete process.env.ORDERFLOW_AGGTRADE_ENABLED;
    else process.env.ORDERFLOW_AGGTRADE_ENABLED = originalFlag;
});

describe('/api/orderflow/config route', () => {
    it('is safely disabled by default and never exposes environment values', async () => {
        delete process.env.ORDERFLOW_AGGTRADE_ENABLED;
        const response = await GET();
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({
            schemaVersion: 1,
            enabled: false,
            dataMode: 'SHADOW',
            source: 'BINANCE_SPOT',
            symbol: 'BTCUSDT',
        });
    });

    it('enables only for the explicit true value', async () => {
        process.env.ORDERFLOW_AGGTRADE_ENABLED = 'true';
        expect(await (await GET()).json()).toEqual(expect.objectContaining({ enabled: true }));
        process.env.ORDERFLOW_AGGTRADE_ENABLED = '1';
        expect(await (await GET()).json()).toEqual(expect.objectContaining({ enabled: false }));
    });
});
