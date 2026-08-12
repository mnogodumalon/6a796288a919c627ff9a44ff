import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'werkzeugname',
    'inventarnummer',
    'kategorie',
    { row: ['hersteller', 'modell'], cols: '1fr 1fr' },
    'seriennummer',
    'anschaffungsdatum',
    'standort',
    'zustand',
    'bemerkungen_werkzeug',
  ],
  defaults: {
    'zustand': { kind: 'lookup', key: 'verfuegbar', label: 'Verfügbar' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
