// Writes the realistic sample session used only by the browser test (e2e/run.mjs). Never part of the app.
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { serialise } from '../src/persist';
import { demoModel } from './fixtures/sample';

it('writes e2e/sample-session.json', () => { mkdirSync('e2e', { recursive: true }); writeFileSync('e2e/sample-session.json', serialise(demoModel())); });
