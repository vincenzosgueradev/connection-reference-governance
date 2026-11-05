import { reducer, type Action, type State } from './reducer';

/** Minimal store: views `subscribe` and re-render; they change state only through `dispatch`. */
export interface Store {
    get(): State;
    dispatch(a: Action): void;
    subscribe(fn: (s: State) => void): () => void;
}

export function createStore(initial: State): Store {
    let state = initial;
    const listeners = new Set<(s: State) => void>();
    return {
        get: () => state,
        dispatch(a) {
            const next = reducer(state, a);
            if (next === state) return;
            state = next;
            listeners.forEach(fn => fn(state));
        },
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
}
