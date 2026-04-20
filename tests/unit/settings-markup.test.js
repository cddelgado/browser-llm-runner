import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';

describe('settings markup', () => {
  test('orders quick settings tabs in the expected sequence', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const tabOrder = Array.from(dom.window.document.querySelectorAll('.settings-tabs [data-settings-tab]'))
      .map((button) => button.getAttribute('data-settings-tab'));

    expect(tabOrder).toEqual([
      'system',
      'conversation',
      'model',
      'tools',
      'mcpServers',
      'skills',
      'orchestrations',
      'cloudProviders',
      'proxy',
      'debug',
    ]);
  });

  test('includes the local CPU thread control on the System tab', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const cpuThreadsInput = dom.window.document.getElementById('cpuThreadsInput');

    expect(cpuThreadsInput).not.toBeNull();
    expect(cpuThreadsInput?.getAttribute('type')).toBe('number');
    expect(cpuThreadsInput?.getAttribute('aria-describedby')).toBe('cpuThreadsHelp');
    expect(dom.window.document.getElementById('cpuThreadsHelp')?.textContent).toContain(
      'wllama'
    );
  });

  test('registers the COOP/COEP service worker helper from index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const serviceWorkerScript = dom.window.document.querySelector(
      'script[src="./coi-serviceworker.js"]'
    );

    expect(serviceWorkerScript).not.toBeNull();
  });

  test('includes the Cloud Providers settings form and accordion list', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);

    expect(dom.window.document.getElementById('cloudProviderForm')).not.toBeNull();
    expect(dom.window.document.getElementById('cloudProviderEndpointInput')).not.toBeNull();
    expect(dom.window.document.getElementById('cloudProviderApiKeyInput')?.getAttribute('type')).toBe(
      'password'
    );
    expect(dom.window.document.getElementById('cloudProvidersList')).not.toBeNull();
    expect(dom.window.document.getElementById('cloudProviderStorageHelp')?.textContent).toContain(
      'cannot be shown again'
    );
  });

  test('includes the Orchestrations settings editor and read-only built-in list', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    expect(document.getElementById('settingsTabOrchestrations')).not.toBeNull();
    expect(document.getElementById('settingsOrchestrationsPanel')).not.toBeNull();
    expect(document.getElementById('orchestrationEditorForm')).not.toBeNull();
    expect(document.getElementById('orchestrationSlashCommandInput')).not.toBeNull();
    expect(document.getElementById('orchestrationDefinitionInput')).not.toBeNull();
    expect(document.getElementById('orchestrationImportButton')?.textContent).toContain('Import');
    expect(document.getElementById('exportAllOrchestrationsButton')?.textContent).toContain(
      'Export all'
    );
    expect(document.getElementById('builtInOrchestrationsListLabel')?.textContent).toContain(
      'Built-in orchestrations'
    );
    expect(document.body.textContent).toContain('read-only here and cannot be changed by the user');
  });
});
