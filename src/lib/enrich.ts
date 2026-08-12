import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Ausleihe, Handwerker, WartungReparatur, Werkzeuge } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface AusleiheMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
  handwerkerMap: Map<string, Handwerker>;
}

export function enrichAusleihe(
  ausleihe: Ausleihe[],
  maps: AusleiheMaps
): EnrichedAusleihe[] {
  return ausleihe.map(r => ({
    ...r,
    werkzeugName: resolveDisplay(r.fields.werkzeug, maps.werkzeugeMap, 'werkzeugname'),
    handwerkerName: resolveDisplay(r.fields.handwerker, maps.handwerkerMap, 'vorname', 'nachname'),
  }));
}

interface WartungReparaturMaps {
  werkzeugeMap: Map<string, Werkzeuge>;
  handwerkerMap: Map<string, Handwerker>;
}

export function enrichWartungReparatur(
  wartungReparatur: WartungReparatur[],
  maps: WartungReparaturMaps
): EnrichedWartungReparatur[] {
  return wartungReparatur.map(r => ({
    ...r,
    werkzeug_wartungName: resolveDisplay(r.fields.werkzeug_wartung, maps.werkzeugeMap, 'werkzeugname'),
    verantwortlicherName: resolveDisplay(r.fields.verantwortlicher, maps.handwerkerMap, 'vorname', 'nachname'),
  }));
}
