import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/model/analysis';
import { backupFileName, buildBackup } from '../src/model/backup';
import { planConnectionChange, planRepoint } from '../src/model/plans';
import { flow, guid, input } from './helpers/fixtures';

const snap = () => buildSnapshot(input({ flows: [flow(10, ['sample_ref1']), flow(11, ['sample_ref1'], { stateCode: 1 })] }));
const AT = '2026-11-04T10:20:30.000Z';

describe('backup of old values', () => {
    it('lists the previous value of every writable row and nothing else', () => {
        const plan = planConnectionChange(snap(), [guid(1), guid(2)], 'conn-2');
        const b = JSON.parse(buildBackup(plan, 'Env (Dev)', AT));
        expect(b).toMatchObject({ kind: 'connection', table: 'connectionreference', environment: 'Env (Dev)', createdAt: AT });
        // ref 2 already uses conn-2 -> blocked -> not in the backup
        expect(b.rows).toEqual([{ id: guid(1), name: 'Ref 1', column: 'connectionid', previousValue: 'conn-1' }]);
    });
    it('keeps the full previous definition of a flow so it can be restored', () => {
        const s = snap();
        const plan = planRepoint(s, [guid(10), guid(11)], 'sample_ref1', 'sample_ref2');
        const b = JSON.parse(buildBackup(plan, '', AT));
        expect(b.rows).toHaveLength(1); // the flow that is on is blocked
        expect(b.rows[0].previousValue).toBe(s.flows[0]!.flow.clientData);
    });
    it('an empty plan gives an empty list', () => {
        expect(JSON.parse(buildBackup(planConnectionChange(snap(), [], 'x'), '', AT)).rows).toEqual([]);
    });
    it('file name has the kind and a compact timestamp and no path characters', () => {
        const plan = planConnectionChange(snap(), [guid(1)], 'x');
        expect(backupFileName(plan, AT)).toBe('backup-connection-20261104102030.json');
    });
});
