/**
 * The ONLY file that talks to the PPTB host. Services receive a `Host` and tests pass a fake.
 * Only the connected Dataverse environment is reachable (constitution T1).
 */

import { features } from './features';
import { environmentIdFrom } from './model/liveConnections';

export type Record_ = Record<string, unknown>;

/** A component that depends on the one asked about. */
export interface Dependent {
    readonly id: string;
    readonly type: number;
}

export interface Host {
    /** OData query against the connected environment, e.g. `workflows?$select=name`. */
    query(odata: string): Promise<Record_[]>;
    update(entity: string, id: string, record: Record_): Promise<void>;
    /** The id of the connected environment (RetrieveCurrentOrganization, `Detail.EnvironmentId`). Empty when it cannot be read. */
    environmentId(): Promise<string>;
    /**
     * The connections of the environment, raw, from the Power Platform API (Connectivity, List connections). With `next`
     * (the `nextLink` or token of the previous page) the next page. Rejects when it cannot be read.
     */
    listConnections(environmentId: string, next?: string): Promise<Record_>;
    /** The apps of the environment, raw (Power Platform API, Power Apps, Get AdminApps), one page; read only. Rejects when it cannot be read (an administrator call). */
    listApps(environmentId: string, next?: string): Promise<Record_>;
    /**
     * One page of the inventory (Power Platform API, Resource Query): the flows, apps and agents of the environment with the connectors each
     * uses. A read only query sent with POST. Rejects when the toolbox application may not call it.
     */
    queryConnectorUsage(environmentId: string, skipToken?: string): Promise<Record_>;
    /** The cloud flows whose definition holds the connection name (a filter on `clientdata`); rejects when the environment refuses the search. */
    searchFlowsByConnection(name: string): Promise<Record_[]>;
    /** Deletes a connection. GUARDED: it rejects while `features.connectionDelete` is off (constitution T11). */
    deleteConnection(environmentId: string, connectorKey: string, name: string): Promise<void>;
    /** Copies a text to the clipboard. */
    copyText(text: string): Promise<void>;
    /** Creates a row of the connected environment (no custom header) and returns its id. */
    create(entity: string, record: Record_): Promise<string>;
    /** Adds a component to an unmanaged solution (AddSolutionComponent); the component must already exist. */
    addToSolution(solutionUniqueName: string, componentId: string, componentType: number): Promise<void>;
    /** Deletes a row of the connected environment. */
    remove(entity: string, id: string): Promise<void>;
    /** Takes a component out of an unmanaged solution (RemoveSolutionComponent); the component itself stays in the environment. */
    removeFromSolution(solutionUniqueName: string, componentId: string, componentType: number): Promise<void>;
    /** Every component that depends on a component, in any solution (RetrieveDependentComponents: "Used by"). Rejects when it cannot be read. */
    dependents(componentType: number, id: string): Promise<Dependent[]>;
    /** The components that would stop a component from being deleted (RetrieveDependenciesForDelete). Rejects when it cannot be read. */
    dependencies(componentType: number, id: string): Promise<Dependent[]>;
    /** Id of the signed-in user (WhoAmI), lower case. Empty when unknown. */
    currentUserId(): Promise<string>;
    /** Lets the user save a text file; returns false when cancelled. */
    saveFile(name: string, content: string): Promise<boolean>;
    /** Name of the active connection, shown in the header badge. Empty when there is none. */
    connectionName(): Promise<string>;
    /** Name of the connected environment, shown in every confirmation. Empty when unknown. */
    environmentName(): Promise<string>;
    /** Shows a short message in the host's notification area. */
    notify(message: string, kind: 'info' | 'success' | 'warning' | 'error'): Promise<void>;
}

const API_VERSION = '2024-10-01';

/**
 * A path with the token of the next page added. `next` is either the whole `nextLink` (its query is kept, the host part
 * is dropped because the category client has its own base) or a bare token (sent as `$skiptoken`).
 */
export function pagedPath(path: string, next: string): string {
    const token = next.trim();
    if (token === '') return path;
    if (/^https?:\/\//i.test(token)) {
        const query = token.includes('?') ? token.slice(token.indexOf('?') + 1) : '';
        const base = path.split('?')[0]!;
        return query === '' ? path : `${base}?${/api-version=/i.test(query) ? query : `${query}&api-version=${API_VERSION}`}`;
    }
    return `${path}&$skiptoken=${encodeURIComponent(token)}`;
}

/**
 * The address in the Maker portal: the page of one connection when the connector and the name are given (the form the
 * portal itself uses: `.../connections/shared_<connector>/<name>/details`, seen by the author on 2026-11-11, not in
 * Microsoft Learn), otherwise the connections page of the environment.
 */
export const portalAddress = (environmentId: string, connectorKey = '', name = ''): string => {
    const base = `https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/connections`;
    return connectorKey !== '' && name !== '' ? `${base}/shared_${encodeURIComponent(connectorKey.replace(/^shared_/, ''))}/${encodeURIComponent(name)}/details` : base;
};

/** Only plain names are searched for inside definitions: anything else could change the meaning of the filter. */
export const SEARCHABLE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * The request that deletes a connection (research D-4): the route that the live check of 2026-11-12 found accepted, through the
 * Power Platform API, Connectivity category. It is only reached while `features.connectionDelete` is on.
 */
export const connectionDeleteRoute = (environmentId: string, connectorKey: string, name: string): string =>
    `environments/${environmentId}/connectors/shared_${connectorKey.replace(/^shared_/, '')}/connections/${name}?api-version=${API_VERSION}`;

export function createHost(): Host {
    let envId = '';
    return {
        async environmentId() {
            if (envId !== '') return envId;
            // Learn: RetrieveCurrentOrganization(AccessType=Default); its Detail holds the EnvironmentId. A GET, no custom header.
            const call = "RetrieveCurrentOrganization(AccessType=@p1)?@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'";
            const res = await window.dataverseAPI.queryData(call);
            envId = environmentIdFrom(res);
            return envId;
        },
        async listConnections(environmentId, next = '') {
            // Learn: Power Platform API, Connectivity, List connections (api-version 2024-10-01). Read only.
            return (await window.powerplatformAPI.Connectivity.Get(pagedPath(`environments/${environmentId}/connections?api-version=${API_VERSION}`, next))) as Record_;
        },
        async listApps(environmentId, next = '') {
            // Learn: Power Platform API, Power Apps, Get AdminApps (api-version 2024-10-01). Read only; an administrator call.
            return (await window.powerplatformAPI.PowerApps.Get(pagedPath(`environments/${environmentId}/apps?api-version=${API_VERSION}&$top=100`, next))) as Record_;
        },
        async queryConnectorUsage(environmentId, skipToken = '') {
            // Learn: Power Platform inventory API, POST resourcequery/resources/query (api-version 2024-10-01). A read only query.
            const body = {
                TableName: 'PowerPlatformResources',
                Clauses: [
                    { $type: 'where', FieldName: 'type', Operator: 'in~', Values: ["'microsoft.powerautomate/cloudflows'", "'microsoft.powerautomate/agentflows'", "'microsoft.powerautomate/m365agentflows'", "'microsoft.powerapps/canvasapps'", "'microsoft.powerapps/modeldrivenapps'", "'microsoft.powerapps/apps'", "'microsoft.copilotstudio/agents'"] },
                    { $type: 'where', FieldName: 'properties.environmentId', Operator: '=~', Values: [`'${environmentId}'`] },
                    { $type: 'project', FieldList: ['type', 'id = name', 'displayName = tostring(properties.displayName)', 'workflowId = tostring(properties.workflowEntityId)', 'connectors = properties.powerPlatformConnectors'] },
                ],
                Options: { Top: 1000, Skip: 0, SkipToken: skipToken },
            };
            return (await window.powerplatformAPI.ResourceQuery.Post(`resources/query?api-version=${API_VERSION}`, body)) as Record_;
        },
        async searchFlowsByConnection(name) {
            if (!SEARCHABLE_NAME.test(name)) throw new Error('The connection name has characters that cannot be searched for.');
            const call = `workflows?$select=workflowid,name,statecode,_ownerid_value&$filter=category eq 5 and contains(clientdata,'${name}')`;
            const res = await window.dataverseAPI.queryData(call);
            return res.value;
        },
        async deleteConnection(environmentId, connectorKey, name) {
            if (!features.connectionDelete) throw new Error('Deleting connections is switched off.');
            await window.powerplatformAPI.Connectivity.Delete(connectionDeleteRoute(environmentId, connectorKey, name));
        },
        async copyText(text) {
            await window.toolboxAPI.utils.copyToClipboard(text);
        },
        async query(odata) {
            const res = await window.dataverseAPI.queryData(odata);
            return res.value;
        },
        async update(entity, id, record) {
            await window.dataverseAPI.update(entity, id, record);
        },
        async create(entity, record) {
            const res = await window.dataverseAPI.create(entity, record);
            return typeof res.id === 'string' ? res.id : '';
        },
        async addToSolution(solutionUniqueName, componentId, componentType) {
            // Learn: AddSolutionComponent is an unbound action; no custom request header is needed (creating inside a solution with a header would ask the user for consent).
            await window.dataverseAPI.execute({
                operationName: 'AddSolutionComponent',
                operationType: 'action',
                parameters: { ComponentId: componentId, ComponentType: componentType, SolutionUniqueName: solutionUniqueName, AddRequiredComponents: false },
            });
        },
        async remove(entity, id) {
            await window.dataverseAPI.delete(entity, id);
        },
        async removeFromSolution(solutionUniqueName, componentId, componentType) {
            // Learn: RemoveSolutionComponent takes the component as a solutioncomponent whose id is the component id.
            await window.dataverseAPI.execute({
                operationName: 'RemoveSolutionComponent',
                operationType: 'action',
                parameters: { SolutionComponent: { '@odata.type': 'Microsoft.Dynamics.CRM.solutioncomponent', solutioncomponentid: componentId }, ComponentType: componentType, SolutionUniqueName: solutionUniqueName },
            });
        },
        async dependents(componentType, id) {
            // Learn: RetrieveDependentComponents(ObjectId, ComponentType) lists every component that depends on this one (a GET).
            const call = `RetrieveDependentComponents(ObjectId=${id},ComponentType=${componentType})`;
            const res = await window.dataverseAPI.queryData(call);
            return res.value.map(r => ({ id: String(r['dependentcomponentobjectid'] ?? '').toLowerCase(), type: Number(r['dependentcomponenttype'] ?? 0) }));
        },
        async dependencies(componentType, id) {
            // A function of the Web API, called as a plain GET; the result is the list of dependency records.
            const call = `RetrieveDependenciesForDelete(ObjectId=${id},ComponentType=${componentType})`;
            const res = await window.dataverseAPI.queryData(call);
            return res.value.map(r => ({ id: String(r['dependentcomponentobjectid'] ?? '').toLowerCase(), type: Number(r['dependentcomponenttype'] ?? 0) }));
        },
        async currentUserId() {
            const r = await window.dataverseAPI.execute({ operationName: 'WhoAmI', operationType: 'function' });
            return typeof r['UserId'] === 'string' ? r['UserId'].toLowerCase() : '';
        },
        async saveFile(name, content) {
            const path = await window.toolboxAPI.fileSystem.saveFile(name, content);
            return path !== null;
        },
        async connectionName() {
            const c = await window.toolboxAPI.connections.getActiveConnection();
            return c ? c.name : '';
        },
        async environmentName() {
            const c = await window.toolboxAPI.connections.getActiveConnection();
            return c ? `${c.name} (${c.environment})` : '';
        },
        async notify(message, kind) {
            await window.toolboxAPI.utils.showNotification({ title: 'Connection Reference Governance', body: message, type: kind, duration: 6000 }); // closes by itself: the host's close button was seen not to respond
        },
    };
}
