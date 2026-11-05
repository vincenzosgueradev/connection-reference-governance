/**
 * The ONLY file that talks to the PPTB host. Services receive a `Host` and tests pass a fake.
 * Only the connected Dataverse environment is reachable (constitution T1).
 */

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
    return {
        async query(odata) {
            const res = await window.dataverseAPI.queryData(odata);
            return res.value;
        },
        async update(entity, id, record) {
            await window.dataverseAPI.update(entity, id, record);
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
