import { createController } from './controller';
import { createHost } from './host';
import { log } from './services/log';
import { mountLogDock } from './views/logDock';
import { initialState } from './state/reducer';
import { createStore } from './state/store';
import { installErrorBoundary } from './views/errorBoundary';
import { connectionBadge, setConnectionBadge } from './ui/components';
import { mountMain } from './views/main';

// Entry: composes host, store and views. No rules and no markup of its own.
function init(): void {
    const host = createHost();
    const version = document.getElementById('app-version');
    if (version) version.textContent = `v${__APP_VERSION__}`;
    const dock = document.getElementById('log-dock');
    if (dock) mountLogDock(dock, (name, content) => host.saveFile(name, content));

    // The environment the tool works on is always visible in the header.
    const badge = connectionBadge('Connecting...', 'loading');
    document.getElementById('header-right')?.append(badge);
    host.connectionName()
        .then(name => (name === '' ? setConnectionBadge(badge, 'No connection', 'error') : setConnectionBadge(badge, name, 'connected')))
        .catch(() => setConnectionBadge(badge, 'Connection error', 'error'));

    const content = document.getElementById('content')!;
    installErrorBoundary(msg => { content.textContent = msg; });

    const store = createStore(initialState());
    const controller = createController(host, store);
    mountMain(content, store, controller, controller.environment);
    log('Ready.', 'info');
    void controller.start();
}

document.addEventListener('DOMContentLoaded', init);
