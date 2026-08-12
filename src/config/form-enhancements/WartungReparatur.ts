import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'werkzeug_wartung',
    'vorgangsart',
    'verantwortlicher',
    { row: ['startdatum', 'geplantes_enddatum'] },
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
  computed: {
    '_wartung_dauer_tage': { kind: 'dateDiff', from: 'startdatum', to: 'geplantes_enddatum', unit: 'days' },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
