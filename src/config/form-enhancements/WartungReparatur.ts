import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'werkzeug_wartung',
    'vorgangsart',
    'verantwortlicher',
    'startdatum',
    'geplantes_enddatum',
    'tatsaechliches_enddatum',
    'beschreibung',
    'status_wartung',
    'kosten',
    'bemerkungen_wartung',
  ],
  defaults: {
    'startdatum': { kind: 'today' },
    'status_wartung': { kind: 'lookup', key: 'geplant', label: 'Geplant' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
