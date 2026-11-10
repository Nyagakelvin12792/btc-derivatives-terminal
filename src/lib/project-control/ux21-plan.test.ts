import { describe, expect, it } from 'vitest';
import checkpoint from '../../../.agents/project-control-ux21-state.json';
import { MilestoneProgressV1Schema } from './contracts';
import { ExecutionCheckpointV1Schema, findNextEligibleTask } from './orchestrator';
import { buildProjectProgressSnapshotV1, flattenProjectTasks } from './progress-calculator';
import { buildProjectControlResponseV1 } from './snapshot';
import { buildUx16Milestones } from './ux16-plan';
import { buildUx21Milestones } from './ux21-plan';

describe('UX21 Project Control registration', () => {
    it('registers a valid ordered dependency graph with an independent release reviewer', () => {
        const milestones = buildUx21Milestones();
        milestones.forEach((milestone) => MilestoneProgressV1Schema.parse(milestone));
        const tasks = flattenProjectTasks(milestones);
        const seen = new Set<string>();
        for (const task of tasks) {
            expect(seen.has(task.id)).toBe(false);
            expect(task.dependsOn.every((id) => seen.has(id))).toBe(true);
            seen.add(task.id);
        }
        expect(tasks).toHaveLength(18);
        expect(tasks.at(-1)).toMatchObject({ id: 'UX21.4-ACCEPT', owner: 'ARCHITECT' });
        expect(findNextEligibleTask(milestones)?.id).toBe('UX21.0-RESEARCH');
    });

    it('appends UX21 without altering existing initiative definitions', () => {
        const { progress } = buildProjectControlResponseV1({ applyCheckpoint: false });
        const prior = progress.milestones.filter(({ id }) => !id.startsWith('UX21.'));
        expect(prior).toEqual(buildUx16Milestones());
        expect(progress.milestones.filter(({ id }) => id.startsWith('UX21.'))).toEqual(buildUx21Milestones());
    });

    it('isolates the checkpoint and gives unverified tasks no completion credit', () => {
        const parsed = ExecutionCheckpointV1Schema.parse(checkpoint);
        expect(parsed.initiativeId).toBe('UX21-FOOTPRINT');
        expect(Object.keys(parsed.overrides).every((id) => id.startsWith('UX21.'))).toBe(true);
        const { progress } = buildProjectControlResponseV1({ applyCheckpoint: false });
        const scoped = buildProjectProgressSnapshotV1({
            ...progress,
            milestones: progress.milestones.filter(({ id }) => id.startsWith('UX21.')),
        });
        expect(scoped.totals).toMatchObject({
            totalWeight: 18,
            implementedWeight: 0,
            testedWeight: 0,
            acceptedWeight: 0,
        });
    });
});
