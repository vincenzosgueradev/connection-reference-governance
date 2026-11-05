// Mutation check (constitution VIII.5, T9): each mutant breaks one rule in the planner, the clientdata rewriter
// or apply; the test suite must fail. A surviving mutant is a missing test. Files are always restored.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const mutants = [
    ['src/model/plans.ts', "flow.stateCode !== REWRITABLE_STATE", "false", 'flow that is on is rewritten'],
    ['src/model/plans.ts', "from.connectorId !== target.connectorId", "false", 'different connector allowed'],
    ['src/model/plans.ts', "!targetInSolution", "false", 'target outside solution allowed'],
    ['src/model/plans.ts', "snapshot.solution.managed || flow.managed", "false", 'managed flow written'],
    ['src/model/plans.ts', "snapshot.solution.managed || ref.managed", "false", 'managed reference written'],
    ['src/model/plans.ts', "else if (mixed)", "else if (false)", 'mixed connectors allowed'],
    ['src/model/plans.ts', "target === ref.connectionId", "false", 'no-op change allowed'],
    ['src/model/plans.ts', "if (!known)", "if (false)", 'unknown connection id not warned'],
    ['src/model/plans.ts', "if (on > 0)", "if (false)", 'flows turned on not warned'],
    ['src/model/plans.ts', "r.ownerId !== '' && r.ownerId !== currentUserId", "false", 'foreign owner not warned'],
    ['src/model/plans.ts', "expectedCurrent: ref.connectionId", "expectedCurrent: ''", 'expected connection lost'],
    ['src/model/clientdata.ts', "!deepEqual(check.value, expected)", "false", 'safety comparison skipped'],
    ['src/model/clientdata.ts', "if (changed === 0)", "if (false)", 'no-match not an error'],
    ['src/model/clientdata.ts', "from === '' || to === ''", "false", 'empty names allowed'],
    ['src/model/clientdata.ts', "escapeRegex(JSON.stringify(from))", "JSON.stringify(from)", 'regex characters not escaped'],
    ['src/services/dataverse.ts', "before !== row.expectedCurrent", "false", 'concurrent change not detected'],
    ['src/services/dataverse.ts', "if (!writable.has(row.id))", "if (false)", 'blocked rows written'],
    ['src/services/dataverse.ts', "if (!confirmed(plan.kind, row, after))", "if (false)", 'write not confirmed'],
    ['src/services/dataverse.ts', "!names.value.includes(row.oldValue)", "true", 'old reference still present accepted'],
    ['src/services/dataverse.ts', "if (!GUID.test(row.id)) return undefined;", "", 'row id not validated'],
    ['src/services/dataverse.ts', "category eq 5 and type eq 1", "category eq 5", 'activation rows read'],
    ['src/model/flowinfo.ts', "if (t === 'recurrence') return 'scheduled';", '', 'scheduled flow not recognised'],
    ['src/model/flowinfo.ts', "if (t === 'request') return 'instant';", '', 'instant flow not recognised'],
    ['src/model/flowinfo.ts', "if (triggerType === '') return 'unknown';", '', 'no trigger not unknown'],
    ['src/model/flowinfo.ts', "n += countIn(otherwise['actions']);", '', 'else branch actions not counted'],
    ['src/model/repoint.ts', "r.connectorId === from.connectorId", "true", 'target of another connector offered'],
    ['src/model/repoint.ts', "r.logicalName !== from.logicalName", "true", 'the reference itself offered as target'],
    ['src/model/repoint.ts', "if (!from) return [];", "", 'targets offered for an unknown source'],
    ['src/state/reducer.ts', "isCompatibleTarget(snap!, from, s.repointTarget)", "true", 'incompatible target kept'],
    ['src/state/reducer.ts', ".some(x => x.logicalName === s.repointFrom)", ".some(() => true)", 'source not used by a selected flow kept'],
    ['src/views/confirm.ts', "disabled: !a.ack || writable.length === 0", "disabled: false", 'Apply enabled without acknowledgement'],
    ['src/state/reducer.ts', "wizard: freshWizard(a.plan.kind), planAck: false, backupSaved: false };", "wizard: freshWizard(a.plan.kind) };", 'acknowledgement kept for a new preview'],
    ['src/model/workflow.ts', "return to === 'preview' || to === 'leave';", "return true;", 'Review can move anywhere'],
    ['src/model/workflow.ts', "link: open && stepIndex(s.key) < stepIndex(current)", "link: true", 'breadcrumb links after the write started'],
    ['src/state/reducer.ts', "s.wizard.confirmOpen && s.planAck", "s.wizard.confirmOpen", 'write starts without acknowledgement'],
    ['src/state/reducer.ts', "if (s.wizard?.step === 'apply') return s;", "", 'the run can be abandoned'],
    ['src/state/reducer.ts', "canMove(s.wizard.step, 'leave') && s.wizard.step !== 'result'", "true", 'leaving during Apply'],
    ['src/controller.ts', "clearInterval(timer);", "", 'timer keeps running after the run'],
    ['src/controller.ts', "refreshFailed: !refreshed", "refreshFailed: false", 'failed refresh not reported'],
    ['src/model/diff.ts', "if (hidden < 2) out.push(...run);", "if (hidden < 0) out.push(...run);", 'one hidden line collapsed'],
    ['src/model/diff.ts', "while (p < a.length && p < b.length && a[p] === b[p]) p++;\n    let s = 0;\n    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s]", "while (false) p++;\n    let s = 0;\n    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s]", 'common start not taken off'],
    ['src/model/diff.ts', "const keepHead = leading ? 0 : context;", "const keepHead = 0;", 'no context after a change'],
    ['src/model/planDiff.ts', "if (r.blocked !== undefined) return { ...base, blocked: r.blocked, before: '', after: '', fields: [] };", "", 'blocked row gets a diff'],
    ['src/model/progress.ts', "if (refreshFailed) {", "if (false) {", 'failed refresh not in the banner'],
    ['src/model/progress.ts', "{ failed: 0, skipped: 1, done: 2 }", "{ failed: 2, skipped: 1, done: 0 }", 'problem rows not first'],
    ['src/model/progress.ts', "if (total < 60) return", "if (total < 61) return", 'a minute shown as seconds'],
    ['src/model/report.ts', "Math.max(0, i.finishedAt - i.startedAt)", "i.finishedAt - i.startedAt", 'negative duration in the report'],
    ['src/views/review.ts', "disabled: writable.length === 0, title", "disabled: false, title", 'Continue enabled with nothing to write'],
    ['src/views/preview.ts', "disabled: writable === 0, title", "disabled: false, title", 'Apply enabled with nothing to write'],
    ['src/model/analysis.ts', "if (ref.connectionId === '')", "if (false)", 'missing connection not flagged'],
    ['src/model/analysis.ts', "expectedOwner !== '' &&", "", 'owner flag before owner chosen'],
    ['src/model/backup.ts', "r.blocked === undefined", "true", 'blocked rows in the backup'],
];

const survivors = [];
for (const [file, from, to, name] of mutants) {
    const original = readFileSync(file, 'utf8');
    if (!original.includes(from)) {
        console.log(`SKIPPED (pattern not found): ${name}`);
        survivors.push(`${name} (pattern not found)`);
        continue;
    }
    try {
        writeFileSync(file, original.replace(from, to));
        let killed = false;
        try {
            execSync('npx vitest run', { stdio: 'pipe' });
        } catch {
            killed = true;
        }
        console.log(`${killed ? 'killed  ' : 'SURVIVED'}  ${name}`);
        if (!killed) survivors.push(name);
    } finally {
        writeFileSync(file, original);
    }
}
console.log(survivors.length === 0 ? `\nAll ${mutants.length} mutants killed.` : `\n${survivors.length} survivors:\n- ${survivors.join('\n- ')}`);
process.exit(survivors.length === 0 ? 0 : 1);
