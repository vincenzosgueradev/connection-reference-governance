/**
 * What the Connections area asks of the controller (feature 024). Kept apart from `Handlers` so the views of the solutions
 * do not depend on it: `Handlers.connections` is optional, and the area switch is shown only when it is given.
 */
export interface ConnectionsHandlers {
    /** Enters the area: switches to it and reads the list anew (Principle VII). */
    open(): Promise<void>;
    /** Reads the list again, keeping the filter, the search, the sort and the open rows. */
    refresh(): Promise<void>;
    /** Opens or closes a row; opening a row whose dependencies were not read reads them at once, by itself. */
    toggleOpen(name: string): Promise<void>;
    /** Reads the dependencies of one connection again, shared sources included. */
    checkAgain(name: string): Promise<void>;
    /** Reads the dependencies of every connection, four at a time. */
    /** Reads what depends on every connection, or, with `selected`, only on the ticked ones. */
    checkAll(only?: 'selected'): Promise<void>;
    /** Stops Check all from starting new connections; what was read is kept. */
    cancelCheckAll(): void;
    /** Copies the address of a connection in the Maker portal (its own page), or of the connections page when no name is given. */
    copyAddress(name?: string): Promise<void>;
    /** Opens the deletion dialog for the ticked connections (does nothing while the flag is off). */
    openDeletion(): void;
    saveBackup(): Promise<void>;
    confirmDeletion(): void;
    closeDeletion(): void;
    saveReport(): Promise<void>;
    /** From a connection chip of a reference: opens the area on that connection with its dependencies read. */
    openConnection(name: string): Promise<void>;
    /** Back to the solution that was open when the area was entered from it. */
    backToSolutions(): void;
}
