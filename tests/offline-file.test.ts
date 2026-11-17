// Opens the built single-file app straight from a file:// URL in headless Chromium.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { beforeAll, describe, expect, it } from 'vitest';

const file = path.resolve('dist-offline/index.html');

describe('dist-offline/index.html opens on file://', () => {
  beforeAll(() => { execSync('npm run build:offline', { stdio: 'ignore' }); }, 180_000);

  it('uses one classic script at the end of <body>: no type="module", no crossorigin', () => {
    const html = readFileSync(file, 'utf8');
    expect(html).not.toMatch(/<script[^>]*type=["']module["']/); expect(html).not.toMatch(/<(script|link)\b[^>]*crossorigin/i);
    const open = html.indexOf('<script>'); const outside = html.slice(0, open) + html.slice(html.lastIndexOf('</script>'));
    expect((outside.match(/<script/g) ?? []).length).toBe(0); expect(html.slice(0, open)).not.toMatch(/<script/); // exactly one script tag: the classic inline bundle
    expect(html.indexOf('<div id="root">')).toBeGreaterThan(-1); expect(open).toBeGreaterThan(html.indexOf('<div id="root">'));
    expect(html.lastIndexOf('</script>')).toBeLessThan(html.lastIndexOf('</body>'));
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=["']https?:/);
  });

  it('renders a non-empty UI via file:// with zero console or page errors', async () => {
    const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage(); const problems: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
      page.on('pageerror', (e) => problems.push(e.message));
      await page.goto(pathToFileURL(file).href); expect(page.url().startsWith('file://')).toBe(true);
      await page.waitForSelector('#root *', { timeout: 10_000 });
      expect((await page.locator('#root').innerText()).trim().length).toBeGreaterThan(20);
      expect(await page.getByRole('button', { name: 'Load Demo Workbook' }).first().isVisible()).toBe(true);
      expect(problems).toEqual([]);
    } finally { await browser.close(); }
  }, 60_000);
});
