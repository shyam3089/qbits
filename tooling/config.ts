import raw from '../identity.json' with { type: 'json' };
import { validateIdentity } from './identity.mjs';
export const identity = validateIdentity(raw);
export function isSource(filename: string): boolean { return filename.split(/[?#]/, 1)[0].endsWith(identity.sourceExtension); }
export function metadata(): string { return `export const metadata = ${JSON.stringify(identity)};\n`; }
