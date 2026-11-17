// Opens the built single-file app straight from a file:// URL in headless Chromium.
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
    const open = html.indexOf('<script>'); // the bundle; a tiny <script id="boot-guard"> error handler precedes it in <head>
    expect(html.slice(0, open).match(/<script/g)?.length).toBe(1); expect(html.slice(0, open)).toContain('<script id="boot-guard">');
    expect((html.match(/<\/script/gi) ?? []).length).toBe(2); // only the real closing tags: none inside the JavaScript
    expect(html).toContain('If this screen stays blank, corporate browser policy may be blocking local file:// JavaScript');
    expect(html.slice(html.lastIndexOf('</script>'))).not.toMatch(/<script/);
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
      expect(await page.evaluate(() => document.getElementById('root')!.innerHTML.length)).toBeGreaterThan(200);
      expect(await page.locator('#boot-error').count()).toBe(0);
      expect(await page.getByRole('button', { name: 'Load Demo Workbook' }).first().isVisible()).toBe(true);
      expect(problems).toEqual([]);
    } finally { await browser.close(); }
  }, 60_000);

  it('shows the exact error on screen instead of a blank page when the app throws on load', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'hub-')); const bad = path.join(dir, 'index.html');
    writeFileSync(bad, readFileSync(file, 'utf8').replace(/<script>[\s\S]*<\/script>(?=\s*<\/body>)/, () => '<script>throw new Error("Simulated start-up failure 42");</script>'));
    const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
    const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    try { const page = await browser.newPage(); page.on('pageerror', () => undefined); await page.goto(pathToFileURL(bad).href);
      await page.waitForSelector('#boot-error'); expect(await page.locator('#boot-error').innerText()).toContain('Simulated start-up failure 42');
      expect(await page.locator('#root').innerText()).toContain('Simulated start-up failure 42'); expect(await page.locator('#root').innerText()).toContain('failed to load');
    } finally { await browser.close(); }
  }, 60_000);
});
