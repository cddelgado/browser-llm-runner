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
      'cloudProviders',
      'proxy',
      'debug',
    ]);
  });

  test('includes the Transformers.js CPU thread control on the System tab', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const cpuThreadsInput = dom.window.document.getElementById('cpuThreadsInput');

    expect(cpuThreadsInput).not.toBeNull();
    expect(cpuThreadsInput?.getAttribute('type')).toBe('number');
    expect(cpuThreadsInput?.getAttribute('aria-describedby')).toBe('cpuThreadsHelp');
    expect(dom.window.document.getElementById('cpuThreadsHelp')?.textContent).toContain(
      'LiteRT runtime'
    );
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
});
