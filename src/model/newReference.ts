import type { Snapshot } from '../types';
import { connectorInfo, connectorKey } from './connectors';
import { connectionsOf, noLive, normalizeConnectionName, verifyConnection, type LiveState, type Verdict } from './liveConnections';

/** Rules for a new connection reference (feature 021). Pure: no DOM, no host. */

/** Our own conservative limit for the part after the prefix; Dataverse allows 200 for the whole logical name (Microsoft Learn). */
export const NAME_MAX = 50;
/** Dataverse limits (Microsoft Learn, connectionreference table): display name 200, description 2000, connection id 1000. */
export const DISPLAY_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const CONNECTION_MAX = 1000;

/** What the user types. The connector is not here: it comes from the category and cannot be edited. */
export interface NewReferenceForm {
    readonly connectorId: string;
    readonly displayName: string;
    /** The part after the publisher prefix. */
    readonly name: string;
    /** The user edited the name by hand: it no longer follows the display name. */
    readonly nameTouched: boolean;
    readonly description: string;
    /** The connection name as typed or picked; it must exist among the listed connections before Review opens. */
    readonly connectionId: string;
    /** Where the connection came from: a card (listed, so verified), typed by the user (verified only by a search), or none. */
    readonly connectionSource: 'none' | 'card' | 'typed';
    /** The typed id that was searched (lower case) and what the search found; null until the user searches. */
    readonly checked: { readonly id: string; readonly verdict: Verdict } | null;
    /** The connections of the environment, read from the Power Platform API. */
    readonly live: LiveState;
    /** Connection names whose "Used by" section is open. */
    readonly openConnections: readonly string[];
    /** Five random hex characters for the suggestions (the Maker portal's own style of suffix). */
    readonly seed: string;
    /** The list of suggestions is open (it folds into one line once a suggestion is applied). */
    readonly suggestOpen: boolean;
    /** While the row is written: the step the service has reached; `done` once it is read back; empty otherwise. */
    readonly step: '' | 'check' | 'write' | 'readback' | 'done';
    /** The user pressed Review: the exact record is shown and Create is offered. */
    readonly reviewing: boolean;
    readonly saving: boolean;
    readonly error: string;
}

export function emptyForm(connectorId: string, seed = '00000'): NewReferenceForm {
    return { connectorId, displayName: '', name: '', nameTouched: false, description: '', connectionId: '', connectionSource: 'none', checked: null, live: noLive, openConnections: [], seed, suggestOpen: true, step: '', reviewing: false, saving: false, error: '' };
}

/** Five random lowercase hex characters. */
export function randomSeed(): string {
    const bytes = new Uint8Array(3);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 5);
}

/** A name from a display name: letters and digits only, accents dropped, starting with a letter. */
export function suggestName(displayName: string): string {
    const plain = displayName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '');
    const trimmed = plain.replace(/^[0-9]+/, '');
    return trimmed.slice(0, NAME_MAX);
}

/**
 * The publisher prefix to put in front of the name: the one read from the solution's publisher, else the prefix shared by
 * every reference of the solution (when they agree), else empty.
 */
export function prefixFor(snapshot: Snapshot): string {
    const read = snapshot.solution.prefix.trim();
    if (read !== '') return read;
    const prefixes = new Set(snapshot.references.map(r => /^([A-Za-z][A-Za-z0-9]{1,7})_/.exec(r.reference.logicalName)?.[1]?.toLowerCase()).filter((p): p is string => p !== undefined));
    return prefixes.size === 1 ? [...prefixes][0]! : '';
}

export const logicalNameOf = (prefix: string, name: string): string => `${prefix}_${name}`;

export interface FormCheck {
    readonly errors: { displayName?: string; name?: string; connectionId?: string; prefix?: string; description?: string };
    readonly warnings: readonly string[];
    readonly ok: boolean;
}

const NAME_RULE = /^[A-Za-z][A-Za-z0-9_]*$/;
const CONNECTION_RULE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

const taken = (snapshot: Snapshot, logicalName: string): boolean => snapshot.allReferences.some(r => r.logicalName.toLowerCase() === logicalName.toLowerCase());

export function checkForm(snapshot: Snapshot, form: NewReferenceForm): FormCheck {
    const errors: { displayName?: string; name?: string; connectionId?: string; prefix?: string; description?: string } = {};
    const warnings: string[] = [];
    const prefix = prefixFor(snapshot);
    const display = form.displayName.trim();
    if (display === '') errors.displayName = 'Enter a display name.';
    else if (display.length > DISPLAY_MAX) errors.displayName = `At most ${DISPLAY_MAX} characters.`;
    if (form.description.trim().length > DESCRIPTION_MAX) errors.description = `At most ${DESCRIPTION_MAX} characters.`;
    if (prefix === '') errors.prefix = 'The publisher prefix of this solution could not be found, so a name cannot be built.';
    if (form.name === '') errors.name = 'Enter a name.';
    else if (!NAME_RULE.test(form.name)) errors.name = 'Letters, digits and underscores only, starting with a letter.';
    else if (form.name.length > NAME_MAX) errors.name = `At most ${NAME_MAX} characters.`;
    else if (prefix !== '' && taken(snapshot, logicalNameOf(prefix, form.name))) errors.name = `${logicalNameOf(prefix, form.name)} already exists in this environment.`;

    // a connection is only accepted when it was found among the connections of the environment: a card was listed; a typed
    // id has to be searched (Enter or the search icon) and found. Nothing is looked up while typing.
    const connection = normalizeConnectionName(form.connectionId);
    if (connection === '') errors.connectionId = 'Choose a connection. A reference without one cannot be saved in the Maker portal, and flows moved onto it cannot be written (error 0x80060467).';
    else if (!CONNECTION_RULE.test(connection) || connection.length > CONNECTION_MAX) errors.connectionId = 'Letters, digits, "-", "_" and "." only.';
    else {
        const searched = form.connectionSource === 'typed' && form.checked !== null && form.checked.id === connection.toLowerCase();
        if (form.connectionSource === 'typed' && !searched) errors.connectionId = 'Press Enter or the search icon to check this connection.';
        else {
            const verdict = form.connectionSource === 'typed' ? form.checked!.verdict : verifyConnection(form.live, form.connectorId, connection);
            if (verdict === 'missing') errors.connectionId = 'This connection was not found among your connections. Check the id, or press Refresh.';
            else if (verdict === 'other-connector') errors.connectionId = `This connection belongs to another connector, not ${connectorInfo(form.connectorId).name}.`;
            else if (verdict === 'unknown')
                errors.connectionId = form.live.status === 'loading' ? 'Reading your connections...' : `Your connections could not be read${form.live.error === '' ? '' : ` (${form.live.error})`}, so this one cannot be verified. Press Refresh to try again.`;
        }
    }

    // the logical name is unique (checked above); the display name should be (Microsoft Learn: not enforced), so only a warning
    if (display !== '') {
        const same = snapshot.allReferences.filter(r => (r.displayName || '').trim().toLowerCase() === display.toLowerCase());
        if (same.some(r => snapshot.references.some(v => v.reference.id === r.id)))
            warnings.push('Another reference in this solution has the same display name. Microsoft recommends a unique display name so references can be told apart.');
        else if (same.length > 0) warnings.push('A reference elsewhere in this environment has the same display name. It is allowed, but a unique name is easier to tell apart.');
    }
    return { errors, warnings, ok: Object.keys(errors).length === 0 };
}

/** The custom connector shared by every reference of the connector in the environment; empty for a standard connector or when they differ. */
export function customConnectorOf(snapshot: Snapshot, connectorId: string): string {
    const ids = new Set(snapshot.allReferences.filter(r => r.connectorId === connectorId).map(r => r.customConnectorId));
    return ids.size === 1 ? [...ids][0]! : '';
}

/** The record sent to Dataverse (no custom request header is needed: the membership is added by an action afterwards). */
export function newReferenceRecord(snapshot: Snapshot, form: NewReferenceForm): Record<string, unknown> {
    const prefix = prefixFor(snapshot);
    const record: Record<string, unknown> = {
        connectionreferencelogicalname: logicalNameOf(prefix, form.name),
        connectionreferencedisplayname: form.displayName.trim(),
        connectorid: form.connectorId,
    };
    if (form.description.trim() !== '') record['description'] = form.description.trim();
    const connection = normalizeConnectionName(form.connectionId);
    if (connection !== '') record['connectionid'] = connection;
    const custom = customConnectorOf(snapshot, form.connectorId);
    if (custom !== '') record['customconnectorid@odata.bind'] = `/connectors(${custom})`;
    return record;
}

/** One reference that holds a connection, with the flows of the open solution that use it. */
export interface ConnectionUser {
    /** The id of the reference: what its dependencies are asked for. */
    readonly id: string;
    readonly logicalName: string;
    readonly displayName: string;
    /** Owner of the reference row (not of the connection) and the email of that owner when it is a user. */
    readonly ownerName: string;
    readonly ownerEmail: string;
    /** Names of the flows of this solution that use the reference. */
    readonly flows: readonly string[];
}

/** One connection of the user, as listed by the environment, with everything in this environment that uses it. */
export interface ConnectionChoice {
    /** The connection name: what `connectionid` holds. */
    readonly id: string;
    /** What the connection is called (for most connectors the account it signs in with); empty when not listed. */
    readonly displayName: string;
    readonly createdTime: string;
    /** Every reference of the environment that holds this connection. */
    readonly users: readonly ConnectionUser[];
    /** Distinct flows of this solution that use any of those references. */
    readonly flowCount: number;
}

/**
 * The listed connections of this connector, most used first then by name, each with the references that hold it (any
 * solution) and the flows of the open solution that use each. Empty until the list has been read.
 */
export function connectionChoices(snapshot: Snapshot, form: NewReferenceForm): ConnectionChoice[] {
    return connectionsOf(form.live, form.connectorId)
        .map(c => {
            const users = snapshot.allReferences
                .filter(r => r.connectionId.toLowerCase() === c.name.toLowerCase())
                .map((r): ConnectionUser => ({
                    id: r.id,
                    logicalName: r.logicalName,
                    displayName: r.displayName || r.logicalName,
                    ownerName: r.ownerName,
                    ownerEmail: r.ownerEmail ?? '',
                    flows: snapshot.flows.filter(f => f.uses.some(u => u.logicalName === r.logicalName)).map(f => f.flow.name),
                }));
            return { id: c.name, displayName: c.displayName, createdTime: c.createdTime, users, flowCount: new Set(users.flatMap(u => u.flows)).size };
        })
        .sort((a, b) => b.users.length - a.users.length || (a.displayName || a.id).localeCompare(b.displayName || b.id, undefined, { sensitivity: 'base' }));
}

export interface Suggestion {
    readonly label: string;
    readonly displayName: string;
    /** The part after the prefix. */
    readonly name: string;
    readonly description: string;
}

/** A name that is free in the environment: the base, else the base with the seed, else with a counter. */
function freeName(snapshot: Snapshot, prefix: string, base: string, seed: string): string {
    const cut = (s: string) => s.slice(0, NAME_MAX);
    if (!taken(snapshot, logicalNameOf(prefix, cut(base)))) return cut(base);
    for (let i = 0; i < 1000; i++) {
        const tail = `_${seed}${i === 0 ? '' : String(i)}`;
        const candidate = cut(base.slice(0, NAME_MAX - tail.length) + tail);
        if (!taken(snapshot, logicalNameOf(prefix, candidate))) return candidate;
    }
    return cut(base);
}

/**
 * Ready-made names and descriptions for the form, in the styles Microsoft describes and the Maker portal uses (Learn,
 * "Connection reference naming": the connector, the solution for context, and a random suffix for uniqueness).
 * 1. Maker style: "Connector Solution-suffix" and `prefix_connectorkey_suffix`.
 * 2. Readable: "Connector - Solution", free of any suffix unless it would clash.
 * 3. By account: when a connection is chosen, "Connector (account)", so the name says whose connection it is.
 * Every name offered is free in the environment, so a suggestion can always be applied.
 */
export function suggestions(snapshot: Snapshot, form: NewReferenceForm): Suggestion[] {
    const prefix = prefixFor(snapshot);
    if (prefix === '') return [];
    const connector = connectorInfo(form.connectorId).name;
    const solution = snapshot.solution.name;
    const key = connectorKey(form.connectorId).replace(/[^a-z0-9]/g, '');
    const seed = form.seed;
    const uniqueDisplay = (display: string): string => (snapshot.allReferences.some(r => (r.displayName || '').trim().toLowerCase() === display.toLowerCase()) ? `${display}-${seed}` : display);
    const out: Suggestion[] = [
        { label: 'Maker style', displayName: `${connector} ${solution}-${seed}`, name: freeName(snapshot, prefix, `shared${key}_${seed}`, seed), description: `${connector} connection reference for ${solution}.` },
        { label: 'Readable', displayName: uniqueDisplay(`${connector} - ${solution}`), name: freeName(snapshot, prefix, suggestName(`${connector} ${solution}`), seed), description: `Connection used by the flows of ${solution}.` },
    ];
    const live = form.connectionSource === 'card' ? connectionsOf(form.live, form.connectorId).find(c => c.name.toLowerCase() === normalizeConnectionName(form.connectionId).toLowerCase()) : undefined;
    if (live && live.displayName !== '') {
        const account = live.displayName;
        out.push({ label: 'By account', displayName: uniqueDisplay(`${connector} (${account})`), name: freeName(snapshot, prefix, suggestName(`${connector} ${account}`), seed), description: `${connector} as ${account}, for ${solution}.` });
    }
    return out;
}

/** The form after one field changed; the name follows the display name until the user edits it. */
export function withField(form: NewReferenceForm, field: 'displayName' | 'name' | 'description' | 'connectionId', value: string): NewReferenceForm {
    const base = { ...form, reviewing: false, error: '' };
    if (field === 'connectionId') return { ...base, connectionId: value, connectionSource: value.trim() === '' ? 'none' : 'typed' };
    if (field === 'displayName') return { ...base, displayName: value, name: form.nameTouched ? form.name : suggestName(value) };
    if (field === 'name') return { ...base, name: value, nameTouched: value !== '' };
    return { ...base, [field]: value };
}

/** The form with a suggestion applied: display name, name and description together; the name is then the user's (it stops following). */
export function withSuggestion(form: NewReferenceForm, s: Suggestion): NewReferenceForm {
    return { ...form, displayName: s.displayName, name: s.name, nameTouched: true, description: s.description, suggestOpen: false, reviewing: false, error: '' };
}

/** True while the three fields still hold exactly what the suggestion offers (so editing any of them removes the mark). */
export function isApplied(form: NewReferenceForm, s: Suggestion): boolean {
    return form.displayName === s.displayName && form.name === s.name && form.description === s.description;
}

/** A connection picked from a card (listed, so verified), or none (an empty id). */
export function withPick(form: NewReferenceForm, id: string): NewReferenceForm {
    return { ...form, connectionId: id, connectionSource: id === '' ? 'none' : 'card', reviewing: false, error: '' };
}

/**
 * The form after a search for the typed id: a found connection becomes the selected card (under its listed name), anything
 * else is remembered as the verdict for that text. A result for text that is no longer in the field is ignored.
 */
export function withChecked(form: NewReferenceForm, typed: string, verdict: Verdict): NewReferenceForm {
    const id = normalizeConnectionName(typed);
    if (form.connectionSource !== 'typed' || normalizeConnectionName(form.connectionId).toLowerCase() !== id.toLowerCase()) return form;
    if (verdict === 'found') {
        const listed = form.live.items.find(c => c.name.toLowerCase() === id.toLowerCase());
        return withPick(form, listed ? listed.name : id);
    }
    return { ...form, checked: { id: id.toLowerCase(), verdict } };
}
