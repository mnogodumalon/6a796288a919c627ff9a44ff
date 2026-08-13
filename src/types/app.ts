import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Handwerker {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    personalnummer?: string;
    telefon?: string;
    email?: string;
    abteilung?: string;
    qualifikation?: LookupValue;
    status?: LookupValue;
    bemerkungen?: string;
  };
}

export interface Werkzeuge {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    werkzeugname?: string;
    inventarnummer?: string;
    kategorie?: LookupValue;
    hersteller?: string;
    modell?: string;
    seriennummer?: string;
    anschaffungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    standort?: string;
    zustand?: LookupValue;
    foto?: string;
    bemerkungen_werkzeug?: string;
  };
}

export interface Ausleihe {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    werkzeug?: string; // applookup -> URL zu 'Werkzeuge' Record
    handwerker?: string; // applookup -> URL zu 'Handwerker' Record
    ausleihdatum?: string; // Format: YYYY-MM-DD oder ISO String
    geplantes_rueckgabedatum?: string; // Format: YYYY-MM-DD oder ISO String
    tatsaechliches_rueckgabedatum?: string; // Format: YYYY-MM-DD oder ISO String
    status_ausleihe?: LookupValue;
    bemerkungen_ausleihe?: string;
  };
}

export interface WartungReparatur {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    werkzeug_wartung?: string; // applookup -> URL zu 'Werkzeuge' Record
    vorgangsart?: LookupValue;
    verantwortlicher?: string; // applookup -> URL zu 'Handwerker' Record
    startdatum?: string; // Format: YYYY-MM-DD oder ISO String
    geplantes_enddatum?: string; // Format: YYYY-MM-DD oder ISO String
    tatsaechliches_enddatum?: string; // Format: YYYY-MM-DD oder ISO String
    beschreibung?: string;
    status_wartung?: LookupValue;
    kosten?: number;
    bemerkungen_wartung?: string;
    dokument?: string;
  };
}

export const APP_IDS = {
  HANDWERKER: '6a796265ef74b1aaf76e20d0',
  WERKZEUGE: '6a79626b47fc8732b877c8c3',
  AUSLEIHE: '6a79626ce3b636c8e29270c0',
  WARTUNG_REPARATUR: '6a79626c62bacd6c2a0a3dc1',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'handwerker': {
    qualifikation: [{ key: "elektriker", get label() { return lookupLabel('handwerker', 'qualifikation', "elektriker") ?? "Elektriker"; } }, { key: "meister", get label() { return lookupLabel('handwerker', 'qualifikation', "meister") ?? "Meister"; } }, { key: "geselle", get label() { return lookupLabel('handwerker', 'qualifikation', "geselle") ?? "Geselle"; } }, { key: "auszubildender", get label() { return lookupLabel('handwerker', 'qualifikation', "auszubildender") ?? "Auszubildender"; } }, { key: "techniker", get label() { return lookupLabel('handwerker', 'qualifikation', "techniker") ?? "Techniker"; } }],
    status: [{ key: "aktiv", get label() { return lookupLabel('handwerker', 'status', "aktiv") ?? "Aktiv"; } }, { key: "inaktiv", get label() { return lookupLabel('handwerker', 'status', "inaktiv") ?? "Inaktiv"; } }],
  },
  'werkzeuge': {
    kategorie: [{ key: "messgeraet", get label() { return lookupLabel('werkzeuge', 'kategorie', "messgeraet") ?? "Messgerät"; } }, { key: "handwerkzeug", get label() { return lookupLabel('werkzeuge', 'kategorie', "handwerkzeug") ?? "Handwerkzeug"; } }, { key: "elektrowerkzeug", get label() { return lookupLabel('werkzeuge', 'kategorie', "elektrowerkzeug") ?? "Elektrowerkzeug"; } }, { key: "pruefgeraet", get label() { return lookupLabel('werkzeuge', 'kategorie', "pruefgeraet") ?? "Prüfgerät"; } }, { key: "sicherheitsausruestung", get label() { return lookupLabel('werkzeuge', 'kategorie', "sicherheitsausruestung") ?? "Sicherheitsausrüstung"; } }, { key: "sonstiges", get label() { return lookupLabel('werkzeuge', 'kategorie', "sonstiges") ?? "Sonstiges"; } }],
    zustand: [{ key: "verfuegbar", get label() { return lookupLabel('werkzeuge', 'zustand', "verfuegbar") ?? "Verfügbar"; } }, { key: "ausgeliehen", get label() { return lookupLabel('werkzeuge', 'zustand', "ausgeliehen") ?? "Ausgeliehen"; } }, { key: "in_reparatur", get label() { return lookupLabel('werkzeuge', 'zustand', "in_reparatur") ?? "In Reparatur"; } }, { key: "in_wartung", get label() { return lookupLabel('werkzeuge', 'zustand', "in_wartung") ?? "In Wartung"; } }, { key: "defekt", get label() { return lookupLabel('werkzeuge', 'zustand', "defekt") ?? "Defekt"; } }, { key: "ausgemustert", get label() { return lookupLabel('werkzeuge', 'zustand', "ausgemustert") ?? "Ausgemustert"; } }],
  },
  'ausleihe': {
    status_ausleihe: [{ key: "ausgeliehen", get label() { return lookupLabel('ausleihe', 'status_ausleihe', "ausgeliehen") ?? "Ausgeliehen"; } }, { key: "zurueckgegeben", get label() { return lookupLabel('ausleihe', 'status_ausleihe', "zurueckgegeben") ?? "Zurückgegeben"; } }],
  },
  'wartung_reparatur': {
    vorgangsart: [{ key: "wartung", get label() { return lookupLabel('wartung_reparatur', 'vorgangsart', "wartung") ?? "Wartung"; } }, { key: "reparatur", get label() { return lookupLabel('wartung_reparatur', 'vorgangsart', "reparatur") ?? "Reparatur"; } }],
    status_wartung: [{ key: "geplant", get label() { return lookupLabel('wartung_reparatur', 'status_wartung', "geplant") ?? "Geplant"; } }, { key: "in_bearbeitung", get label() { return lookupLabel('wartung_reparatur', 'status_wartung', "in_bearbeitung") ?? "In Bearbeitung"; } }, { key: "abgeschlossen", get label() { return lookupLabel('wartung_reparatur', 'status_wartung', "abgeschlossen") ?? "Abgeschlossen"; } }, { key: "abgebrochen", get label() { return lookupLabel('wartung_reparatur', 'status_wartung', "abgebrochen") ?? "Abgebrochen"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'handwerker': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'personalnummer': 'string/text',
    'telefon': 'string/tel',
    'email': 'string/email',
    'abteilung': 'string/text',
    'qualifikation': 'lookup/select',
    'status': 'lookup/radio',
    'bemerkungen': 'string/textarea',
  },
  'werkzeuge': {
    'werkzeugname': 'string/text',
    'inventarnummer': 'string/text',
    'kategorie': 'lookup/select',
    'hersteller': 'string/text',
    'modell': 'string/text',
    'seriennummer': 'string/text',
    'anschaffungsdatum': 'date/date',
    'standort': 'string/text',
    'zustand': 'lookup/select',
    'foto': 'file',
    'bemerkungen_werkzeug': 'string/textarea',
  },
  'ausleihe': {
    'werkzeug': 'applookup/select',
    'handwerker': 'applookup/select',
    'ausleihdatum': 'date/datetimeminute',
    'geplantes_rueckgabedatum': 'date/datetimeminute',
    'tatsaechliches_rueckgabedatum': 'date/datetimeminute',
    'status_ausleihe': 'lookup/radio',
    'bemerkungen_ausleihe': 'string/textarea',
  },
  'wartung_reparatur': {
    'werkzeug_wartung': 'applookup/select',
    'vorgangsart': 'lookup/radio',
    'verantwortlicher': 'applookup/select',
    'startdatum': 'date/date',
    'geplantes_enddatum': 'date/date',
    'tatsaechliches_enddatum': 'date/date',
    'beschreibung': 'string/textarea',
    'status_wartung': 'lookup/select',
    'kosten': 'number',
    'bemerkungen_wartung': 'string/textarea',
    'dokument': 'file',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

// Aliases for the pre-0.0.279 app keys (see 4c).
LOOKUP_OPTIONS['wartung_&_reparatur'] = LOOKUP_OPTIONS['wartung_reparatur'];
FIELD_TYPES['wartung_&_reparatur'] = FIELD_TYPES['wartung_reparatur'];

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateHandwerker = StripLookup<Handwerker['fields']>;
export type CreateWerkzeuge = StripLookup<Werkzeuge['fields']>;
export type CreateAusleihe = StripLookup<Ausleihe['fields']>;
export type CreateWartungReparatur = StripLookup<WartungReparatur['fields']>;