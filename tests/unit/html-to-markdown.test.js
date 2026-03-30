import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { convertHtmlToMarkdown } from '../../src/attachments/html-to-markdown.js';

describe('html-to-markdown', () => {
  test('converts common document structure to markdown', () => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;

    const result = convertHtmlToMarkdown(`
      <!doctype html>
      <html>
        <head>
          <title>Lesson</title>
          <style>.hidden { display: none; }</style>
          <script>window.alert('nope');</script>
        </head>
        <body>
          <h1>Photosynthesis</h1>
          <p>Plants use <strong>sunlight</strong> to make <em>sugar</em>.</p>
          <p>Read <a href="https://example.com">more here</a>.</p>
          <ul>
            <li>Needs water</li>
            <li>Needs carbon dioxide</li>
          </ul>
          <pre>const answer = 42;</pre>
          <table>
            <tr><th>Part</th><th>Role</th></tr>
            <tr><td>Leaf</td><td>Captures light</td></tr>
          </table>
        </body>
      </html>
    `);

    expect(result.warnings).toEqual([]);
    expect(result.markdown).toContain('# Photosynthesis');
    expect(result.markdown).toContain('Plants use **sunlight** to make *sugar*.');
    expect(result.markdown).toContain('[more here](https://example.com)');
    expect(result.markdown).toContain('- Needs water');
    expect(result.markdown).toContain('```');
    expect(result.markdown).toContain('| Part | Role |');
    expect(result.markdown).not.toContain('window.alert');
    expect(result.markdown).not.toContain('.hidden');
  });

  test('keeps nested lists and blockquotes readable', () => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;

    const result = convertHtmlToMarkdown(`
      <blockquote>
        <p>Important reminder.</p>
      </blockquote>
      <ol>
        <li>First step</li>
        <li>
          Second step
          <ul>
            <li>Detail A</li>
          </ul>
        </li>
      </ol>
    `);

    expect(result.markdown).toContain('> Important reminder.');
    expect(result.markdown).toContain('1. First step');
    expect(result.markdown).toContain('2. Second step');
    expect(result.markdown).toContain('  - Detail A');
  });
});
