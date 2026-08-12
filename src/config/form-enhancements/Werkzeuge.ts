import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'werkzeugname',
    'inventarnummer',
    'kategorie',
    'hersteller',
    'modell',
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
