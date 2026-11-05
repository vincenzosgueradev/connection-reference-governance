/**
 * Connector names and glyphs. Pure.
 *
 * Names are the display names of the Microsoft Learn connector reference (checked 2026-11-04). The glyphs are
 * original category drawings in the shared UI kit (`.icon-NAME`), not the brand logos of the services: Microsoft
 * publishes no SVG set for connectors, the icons it serves are PNG files behind a versioned CDN address, and logos of
 * third-party services are trademarks. An unknown connector gets a readable name made from its id and the plug glyph.
 */

export interface ConnectorInfo {
    /** Id without path and without the `shared_` prefix, lower case. */
    readonly key: string;
    readonly name: string;
    /** Name of a kit icon (`icon-<glyph>`). */
    readonly glyph: string;
    /** False when the name was made from the id. */
    readonly known: boolean;
    /** Colour family of the glyph (a token in the stylesheet). */
    readonly tone: Tone;
}

export type Tone = 'primary' | 'info' | 'success' | 'warning' | 'muted';

/** One colour per kind of service, so a row of tiles reads at a glance. */
export const GLYPH_TONE: Readonly<Record<string, Tone>> = {
    mail: 'info', user: 'primary', users: 'primary', chat: 'info', layout: 'primary', cloud: 'info', table: 'success',
    'file-text': 'info', database: 'primary', 'clipboard-check': 'success', 'clipboard-list': 'success', 'bar-chart': 'warning',
    key: 'warning', 'git-branch': 'primary', globe: 'info', bell: 'warning', bot: 'primary', sliders: 'muted', plug: 'muted',
    sun: 'warning', layers: 'info', rss: 'warning',
};

export const toneOf = (glyph: string): Tone => GLYPH_TONE[glyph] ?? 'muted';

const CATALOG: Readonly<Record<string, { name: string; glyph: string }>> = {
    office365: { name: 'Office 365 Outlook', glyph: 'mail' },
    office365users: { name: 'Office 365 Users', glyph: 'user' },
    office365groups: { name: 'Office 365 Groups', glyph: 'users' },
    office365groupsmail: { name: 'Office 365 Groups Mail', glyph: 'mail' },
    sharepointonline: { name: 'SharePoint', glyph: 'layout' },
    teams: { name: 'Microsoft Teams', glyph: 'chat' },
    onedriveforbusiness: { name: 'OneDrive for Business', glyph: 'cloud' },
    onedrive: { name: 'OneDrive', glyph: 'cloud' },
    excelonlinebusiness: { name: 'Excel Online (Business)', glyph: 'table' },
    wordonlinebusiness: { name: 'Word Online (Business)', glyph: 'file-text' },
    onenote: { name: 'OneNote (Business)', glyph: 'file-text' },
    planner: { name: 'Planner', glyph: 'clipboard-list' },
    todo: { name: 'Microsoft To-Do (Business)', glyph: 'clipboard-check' },
    approvals: { name: 'Standard approvals', glyph: 'clipboard-check' },
    microsoftforms: { name: 'Microsoft Forms', glyph: 'clipboard-list' },
    powerbi: { name: 'Power BI', glyph: 'bar-chart' },
    commondataserviceforapps: { name: 'Microsoft Dataverse', glyph: 'database' },
    commondataservice: { name: 'Microsoft Dataverse (legacy)', glyph: 'database' },
    dynamicscrmonline: { name: 'Dynamics 365 (deprecated)', glyph: 'database' },
    sql: { name: 'SQL Server', glyph: 'database' },
    kusto: { name: 'Azure Data Explorer', glyph: 'database' },
    azureblob: { name: 'Azure Blob Storage', glyph: 'cloud' },
    azuretables: { name: 'Azure Table Storage', glyph: 'table' },
    azurequeues: { name: 'Azure Queues', glyph: 'layers' },
    servicebus: { name: 'Service Bus', glyph: 'layers' },
    azureeventgrid: { name: 'Azure Event Grid', glyph: 'layers' },
    keyvault: { name: 'Azure Key Vault', glyph: 'key' },
    azuread: { name: 'Microsoft Entra ID', glyph: 'user' },
    visualstudioteamservices: { name: 'Azure DevOps', glyph: 'git-branch' },
    webcontents: { name: 'HTTP with Microsoft Entra ID (preauthorized)', glyph: 'globe' },
    webcontentsv2: { name: 'HTTP With Microsoft Entra ID', glyph: 'globe' },
    rss: { name: 'RSS', glyph: 'rss' },
    msnweather: { name: 'MSN Weather', glyph: 'sun' },
    sendmail: { name: 'Mail', glyph: 'mail' },
    outlook: { name: 'Outlook.com', glyph: 'mail' },
    gmail: { name: 'Gmail', glyph: 'mail' },
    slack: { name: 'Slack', glyph: 'chat' },
    powerappsnotification: { name: 'Power Apps Notification', glyph: 'bell' },
    microsoftcopilotstudio: { name: 'Microsoft Copilot Studio', glyph: 'bot' },
    powerplatformforadmins: { name: 'Power Platform for Admins', glyph: 'sliders' },
    flowmanagement: { name: 'Power Automate Management', glyph: 'sliders' },
};

export const GENERIC_GLYPH = 'plug';

/** Every glyph the catalog can return, for the test that checks the kit defines them all. */
export function glyphsUsed(): string[] {
    return [...new Set([...Object.values(CATALOG).map(c => c.glyph), GENERIC_GLYPH])].sort();
}

export function connectorKey(connectorId: string): string {
    const last = connectorId.split('/').filter(Boolean).pop() ?? '';
    return last.toLowerCase().replace(/^shared_/, '');
}

function readableName(key: string): string {
    // Custom connectors look like `name-5f<id>`: keep the part before the first dash.
    const base = (key.split('-')[0] ?? '').replace(/_/g, ' ').trim();
    if (base === '') return 'Unknown connector';
    return base.replace(/\b\w/g, c => c.toUpperCase());
}

export function connectorInfo(connectorId: string): ConnectorInfo {
    const key = connectorKey(connectorId);
    const hit = Object.prototype.hasOwnProperty.call(CATALOG, key) ? CATALOG[key] : undefined;
    return hit ? { key, name: hit.name, glyph: hit.glyph, known: true, tone: toneOf(hit.glyph) } : { key, name: readableName(key), glyph: GENERIC_GLYPH, known: false, tone: toneOf(GENERIC_GLYPH) };
}
