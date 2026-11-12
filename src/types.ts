import type { FlowInfo } from './model/flowinfo';

/** Plain data contracts shared by all layers. Imports nothing from the other layers. */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SolutionInfo {
    readonly id: string;
    readonly name: string;
    readonly uniqueName: string;
    readonly managed: boolean;
    readonly version: string;
    readonly publisher: string;
    /** Customization prefix of the publisher (`ava`); empty when it could not be read. */
    readonly prefix: string;
    /** ISO date, empty when unknown. */
    readonly createdOn: string;
}

export interface ConnectionReferenceRow {
    readonly id: string;
    readonly logicalName: string;
    readonly displayName: string;
    readonly connectorId: string;
    /** Id of the custom connector row (lookup `customconnectorid`); empty for a standard connector. */
    readonly customConnectorId: string;
    /** API hub connection name; empty when never set. */
    readonly connectionId: string;
    readonly ownerName: string;
    /** Email of the owner when it is a user and could be read; empty otherwise. Shown on screen only (T7). */
    readonly ownerEmail?: string;
    /** systemuser or team id of the reference row owner (raw, lower case); empty when unknown. */
    readonly ownerId: string;
    readonly managed: boolean;
}

export interface FlowRow {
    readonly id: string;
    readonly name: string;
    /** 0 draft, 1 activated, 2 suspended. */
    readonly stateCode: number;
    readonly managed: boolean;
    readonly clientData: string;
    readonly description: string;
    /** ISO dates, empty when unknown. */
    readonly createdOn: string;
    readonly modifiedOn: string;
    /** systemuser or team id of the flow owner (raw, lower case) and its name when it could be read. */
    readonly ownerId: string;
    readonly ownerName: string;
}

/** A connection of the connected environment as the Power Platform API lists it (feature 021). */
export interface LiveConnection {
    /** The connection name: the value a reference stores in `connectionid`. */
    readonly name: string;
    /** Connector key without the `shared_` prefix, from the resource id; empty when the id was not given. */
    readonly connectorKey: string;
    /** `properties.displayName`: what the connection is called (for most connectors the account it signs in with). */
    readonly displayName: string;
    readonly createdTime: string;
}

/** Optional facts about a connection, from a verified source only (see research.md). */
export interface ConnectionInfo {
    readonly ownerName: string;
    readonly connected: boolean;
}

/** Everything read for one solution. */
export interface SnapshotInput {
    readonly solution: SolutionInfo;
    /** Every reference of the environment (to detect missing ones). */
    readonly references: readonly ConnectionReferenceRow[];
    /** Ids of references that are members of the solution. */
    readonly memberReferenceIds: readonly string[];
    /** The `componenttype` of every member as stored in `solutioncomponent` (lower case object id -> code). Read, never guessed. */
    readonly memberTypes?: Readonly<Record<string, number>>;
    readonly flows: readonly FlowRow[];
    /** Keyed by connectionId. Empty when no verified source exists. */
    readonly connections: Readonly<Record<string, ConnectionInfo>>;
}

export type FlagKind = 'no-connection' | 'other-owner' | 'not-connected' | 'missing-reference';

export interface Flag {
    readonly kind: FlagKind;
    /** Short text for the table; `detail` is the full sentence. */
    readonly label: string;
    /** The data the flag is based on, shown to the user. */
    readonly detail: string;
}

export interface FlowRefUse {
    readonly logicalName: string;
    /** Undefined when the reference does not exist in the environment. */
    readonly reference: ConnectionReferenceRow | undefined;
    readonly flags: readonly Flag[];
}

export interface FlowView {
    readonly flow: FlowRow;
    readonly info: FlowInfo;
    readonly uses: readonly FlowRefUse[];
    readonly flags: readonly Flag[];
    /** True when the clientdata could not be parsed. */
    readonly unreadable: boolean;
}

export interface ReferenceView {
    readonly reference: ConnectionReferenceRow;
    readonly flowIds: readonly string[];
    readonly flags: readonly Flag[];
}

export interface Snapshot {
    readonly solution: SolutionInfo;
    readonly flows: readonly FlowView[];
    readonly references: readonly ReferenceView[];
    /** References of the environment, used as candidates for targets and connection ids. */
    readonly allReferences: readonly ConnectionReferenceRow[];
    /** The component type of every member of the solution, as stored (lower case object id -> code). */
    readonly componentTypes: Readonly<Record<string, number>>;
}

export interface PlanRow {
    /** Row id in Dataverse. */
    readonly id: string;
    readonly label: string;
    /** `membership` (remove from the solution) and `row` (delete the row) write nothing into a column (feature 016). */
    readonly field: 'connectionid' | 'clientdata' | 'membership' | 'row';
    readonly oldValue: string;
    readonly newValue: string;
    /** The exact value written to `field`. */
    readonly payload: string;
    readonly affectedFlows: number;
    /** How many of the affected flows are turned on right now. */
    readonly affectedOn: number;
    /** The value of `field` when the plan was built; apply refuses the row if it has changed since. */
    readonly expectedCurrent: string;
    /** When set the row is blocked and will not be written. */
    readonly blocked?: string;
    /** The flow is on: with the user's permission it is turned off for the write and on again after it (feature 011). */
    readonly turnOff?: boolean;
    /** The table of the row when it is not the one of the plan (remove and delete may hold both kinds). */
    readonly entity?: 'connectionreference' | 'workflow';
    /** The `componenttype` of the member, as stored (remove, and delete for the dependency check). */
    readonly componentType?: number;
}

export interface Plan {
    readonly kind: 'connection' | 'repoint' | 'remove' | 'delete';
    readonly entity: 'connectionreference' | 'workflow';
    readonly rows: readonly PlanRow[];
    /** Things the user should read before confirming; they do not block. */
    readonly warnings: readonly string[];
    /** The user allowed the tool to turn flows that are on off and on again (feature 011). */
    readonly manageState?: boolean;
    /** Remove only: the solution the components leave. */
    readonly solution?: { readonly id: string; readonly uniqueName: string };
}

export interface RowOutcome {
    readonly id: string;
    readonly label: string;
    readonly status: 'done' | 'failed' | 'skipped';
    readonly message: string;
    /** Only for a flow the tool turned off: it is on again, or it was left off (feature 011). */
    readonly stateChange?: 'back-on' | 'left-off';
}

/** The state of a connection as the list reports it (feature 024). `unknown` is what is shown when the answer does not say. */
export type ConnectionStatus = 'connected' | 'error' | 'reconnect' | 'unknown';

/** A connection of the environment with what the list says about it (feature 024). Absent fields are empty strings, never guessed. */
export interface ConnectionRow {
    /** The connection name: the value a reference stores in `connectionid`. The key everywhere. */
    readonly name: string;
    /** Connector key without the `shared_` prefix; empty when the id did not give it. */
    readonly connectorKey: string;
    /** The connector as the tool names it (falls back to the key). */
    readonly connectorName: string;
    readonly displayName: string;
    readonly status: ConnectionStatus;
    /** The message of the status when it carries one. Shown on screen only (T7). */
    readonly statusDetail: string;
    readonly createdTime: string;
    readonly modifiedTime: string;
    /** Who created it. On screen only (T7); the email never goes into the backup. */
    readonly creator: { readonly name: string; readonly email: string };
}

/** Something that needs a connection, found by one of the sources (feature 024). */
export interface ConnectionDependent {
    readonly kind: 'app' | 'flow' | 'reference' | 'agent' | 'other';
    readonly id: string;
    readonly name: string;
    /** On, Off, Suspended, or empty when not read. */
    readonly state: string;
    readonly ownerName: string;
    /** Names of the solutions that hold it; empty for an app or a flow outside any solution. */
    readonly solutions: readonly string[];
    /** For a flow or an agent found through a reference: the name of that reference. */
    readonly via: string;
}
