import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'werkzeug',
    'handwerker',
    'ausleihdatum',
    'geplanes_rueckgabedatum',
    'tatsaechliches_rueckgabedatum',
    'status_ausleihe',
    'bemerkungen_ausleihe',
  ],
  defaults: {
    'ausleihdatum': { kind: 'today', withTime: true },
    'geplanes_rueckgabedatum': { kind: 'todayOffset', days: 3, withTime: true },
    'status_ausleihe': { kind: 'lookup', key: 'ausgeliehen', label: 'Ausgeliehen' },
  },
  computed: {
    '_ausleihe_dauer_stunden': { kind: 'dateDiff', from: 'ausleihdatum', to: 'geplanes_rueckgabedatum', unit: 'hours' },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
