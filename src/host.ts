/**
 * The ONLY file that talks to the PPTB host. Services receive a `Host` and tests pass a fake.
 * Only the connected Dataverse environment is reachable (constitution T1).
 */

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
    /** The connections of the environment, raw, from the Power Platform API (Connectivity, List connections). Rejects when it cannot be read. */
    listConnections(environmentId: string): Promise<Record_>;
    /** Creates a row of the connected environment (no custom header) and returns its id. */
    create(entity: string, record: Record_): Promise<string>;
    /** Adds a component to an unmanaged solution (AddSolutionComponent); the component must already exist. */
    addToSolution(solutionUniqueName: string, componentId: string, componentType: number): Promise<void>;
    /** Deletes a row of the connected environment. */
    remove(entity: string, id: string): Promise<void>;
    /** Takes a component out of an unmanaged solution (RemoveSolutionComponent); the component itself stays in the environment. */
    removeFromSolution(solutionUniqueName: string, componentId: string, componentType: number): Promise<void>;
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
        async listConnections(environmentId) {
            // Learn: Power Platform API, Connectivity, List connections (api-version 2024-10-01). Read only.
            return (await window.powerplatformAPI.Connectivity.Get(`environments/${environmentId}/connections?api-version=2024-10-01`)) as Record_;
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
            await window.toolboxAPI.utils.showNotification({ title: 'Connection Reference Governance', body: message, type: kind });
        },
    };
}
