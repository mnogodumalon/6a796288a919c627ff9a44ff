import type { Ausleihe, WartungReparatur } from './app';

export type EnrichedAusleihe = Ausleihe & {
  werkzeugName: string;
  handwerkerName: string;
};

export type EnrichedWartungReparatur = WartungReparatur & {
  werkzeug_wartungName: string;
  verantwortlicherName: string;
};
