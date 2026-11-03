import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/orderflow/calibration', () => {
    it('returns 200 with calibrated report and paper evaluation', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        const json = await response.json();
        expect(json.calibration).toBeDefined();
        expect(json.calibration.allPassed).toBe(true);
        expect(json.calibration.metrics.reproducibilityRate).toBe(1.0);
        expect(json.calibration.architectSignoffStatus).toBe('APPROVED_FOR_PAPER');
        expect(json.paperEvaluation).toBeDefined();
        expect(json.paperEvaluation.calibrationStatus).toBe('CALIBRATED');
    });
});
