// Mutation check (constitution VIII.5, T9): each mutant breaks one rule in the planner, the clientdata rewriter
// or apply; the test suite must fail. A surviving mutant is a missing test. Files are always restored.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const mutants = [
    ['src/model/plans.ts', "flow.stateCode !== REWRITABLE_STATE", "false", 'flow that is on is rewritten'],
    ['src/model/plans.ts', "froms[0]!.connectorId !== target.connectorId", "false", 'different connector allowed'],
    ['src/model/plans.ts', "if (!snapshot.references.some(r => r.reference.logicalName === targetLogicalName))", "if (false)", 'target outside solution allowed'],
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
    ['src/model/clientdata.ts', "list.some(n => n === '') || to === ''", "false", 'empty names allowed'],
    ['src/model/clientdata.ts', "escapeRegex(JSON.stringify(n))", "JSON.stringify(n)", 'regex characters not escaped'],
    ['src/services/dataverse.ts', "before !== row.expectedCurrent", "false", 'concurrent change not detected'],
    ['src/services/dataverse.ts', "if (!writable.has(row.id))", "if (false)", 'blocked rows written'],
    ['src/services/dataverse.ts', "if (!confirmed(plan.kind, row, after))", "if (false)", 'write not confirmed'],
    ['src/services/dataverse.ts', "if (!GUID.test(row.id)) return undefined;", "", 'row id not validated'],
    ['src/services/dataverse.ts', "category eq 5 and type eq 1", "category eq 5", 'activation rows read'],
    ['src/model/flowinfo.ts', "if (t === 'recurrence') return 'scheduled';", '', 'scheduled flow not recognised'],
    ['src/model/flowinfo.ts', "if (t === 'request') return 'instant';", '', 'instant flow not recognised'],
    ['src/model/flowinfo.ts', "if (triggerType === '') return 'unknown';", '', 'no trigger not unknown'],
    ['src/model/flowinfo.ts', "n += countIn(otherwise['actions']);", '', 'else branch actions not counted'],
    ['src/model/repoint.ts', "r.connectorId === connector &&", "true &&", 'target of another connector offered'],
    ['src/model/repoint.ts', "(list.length > 1 || r.logicalName !== list[0])", "true", 'the reference itself offered as target'],
    ['src/state/reducer.ts', "isCompatibleTarget(snap!, kept, g.target) ? g.target : ''", "g.target", 'incompatible target kept'],
    ['src/state/reducer.ts', ".filter(n => connectorOf(n) !== undefined)", ".filter(() => true)", 'source not used by a selected flow kept'],
    ['src/views/confirm.ts', "disabled: !a.ack ||", "disabled: false ||", 'Apply enabled without acknowledgement'],
    ['src/state/reducer.ts', "planAck: false, stateAck: false, backupSaved: false, confirmCode: a.code ?? '', typedCode: '' };", "confirmCode: a.code ?? '', typedCode: '' };", 'acknowledgement kept for a new preview'],
    ['src/model/workflow.ts', "return to === 'leave';", "return true;", 'the Preview or the Result can move anywhere'],
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
    ['src/views/preview.ts', "disabled: writable === 0 && unlockableRows(plan).length === 0, title", "disabled: false, title", 'Apply enabled with nothing to write'],
    ['src/model/analysis.ts', "if (ref.connectionId === '')", "if (false)", 'missing connection not flagged'],
    ['src/model/analysis.ts', "expectedOwner !== '' &&", "", 'owner flag before owner chosen'],
    ['src/model/backup.ts', "r.blocked === undefined", "true", 'blocked rows in the backup'],
    // feature 016: remove from the solution and delete
    ['src/model/removal.ts', "const solutionBlock = snapshot.solution.managed ? 'Managed: read-only.' : undefined;", "const solutionBlock = undefined;", 'remove/delete allowed in a managed solution'],
    ['src/model/removal.ts', "blocked === undefined && kind === 'remove' && componentType === undefined", "false", 'component type guessed'],
    ['src/model/removal.ts', "blocked === undefined && staying > 0", "false", 'reference used by a staying flow removed'],
    ['src/model/removal.ts', "kind === 'delete' && f.stateCode !== 0", "false", 'flow that is on deleted without being turned off'],
    ['src/model/removal.ts', "if (f.stateCode === 1) turnOff = true;", "if (false) turnOff = true;", 'flow that is on not turned off before delete'],
    ['src/services/dataverse.ts', "if (!(await isMember(host, solution.id, row.id)))", "if (false)", 'membership not checked before remove'],
    ['src/services/dataverse.ts', "if (await isMember(host, solution.id, row.id)) return { status: 'failed'", "if (false) return { status: 'failed'", 'remove not read back'],
    ['src/services/dataverse.ts', "if (!(await rowExists(host, table, row.id))) return", "if (false) return", 'existence not checked before delete'],
    ['src/services/dataverse.ts', "if (await rowExists(host, table, row.id)) return { status: 'failed'", "if (false) return { status: 'failed'", 'delete not read back'],
    ['src/services/dataverse.ts', "if (state !== 0) return { status: 'skipped'", "if (false) return { status: 'skipped'", 'flow state not checked before delete'],
    ['src/services/dataverse.ts', "if (plan.kind === 'delete') {", "if (false) {", 'deleted flow turned on again'],
    ['src/host.ts', "ComponentType: componentType", "ComponentType: 0", 'wrong component type sent'],
    ['src/host.ts', "solutioncomponentid: componentId", "solutioncomponentid: ''", 'component id not sent'],
    ['src/views/removal.ts', "tone: deleting ? 'error' : 'primary',", "tone: 'primary',", 'delete dialog not in the danger tone'],
    ['src/views/removal.ts', "code !== '' && typed.trim() === code", "true", 'delete unlocked without the code'],
    ['src/views/removal.ts', "(deleting && !codeMatches(a.code, a.typed))", "false", 'delete button open without the code'],
    ['src/state/reducer.ts', "s.confirmCode !== '' && s.typedCode.trim() === s.confirmCode", "true", 'state starts a delete without the code'],
    ['src/model/removal.ts', "if (outside.length === 0) return undefined;", "return undefined;", 'dependencies ignored when planning a delete'],
    ['src/model/removal.ts', "if (found === undefined) return", "if (false) return", 'unreadable dependencies allowed'],
    ['src/services/dataverse.ts', "if (outside.length > 0) return { status: 'skipped'", "if (false) return { status: 'skipped'", 'dependencies not checked again at the delete'],
    ['src/controller.ts', "const deps = await readDependencies(host, snapshot, chosen);", "const deps = undefined;", 'dependencies not read before a delete'],
    ['src/views/main.ts', "remove.disabled = off || allInUse;", "remove.disabled = allInUse;", 'Remove enabled without selection'],
    ['src/views/main.ts', "del.disabled = off || allInUse;", "del.disabled = allInUse;", 'Delete enabled without selection'],
];

// `node scripts/mutation-check.mjs <text>` runs only the mutants whose file or name contains the text.
const only = process.argv[2];
const survivors = [];
for (const [file, from, to, name] of mutants) {
    if (only && !`${file} ${name}`.includes(only)) continue;
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
