import { describe, expect, it } from 'vitest';

import { ProjectControlResponseV1Schema } from '../../../lib/project-control/contracts';

import { GET } from './route';

describe('/api/project-control route', () => {
    it('returns a validated read-only snapshot without pretending unknown spend is zero-cost usage', async () => {
        const response = await GET();
        expect(response.headers.get('cache-control')).toBe('no-store');
        const payload = ProjectControlResponseV1Schema.parse(await response.json());
        expect(payload.progress.milestones.some((milestone) => milestone.id === 'UX16.2')).toBe(true);
        expect(payload.usage.totals.runsWithUnreportedUsage).toBeGreaterThan(0);
        expect(JSON.stringify(payload)).not.toMatch(/api[_-]?key|secret|authorization/i);
    });
});
