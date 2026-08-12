/**
 * src/i18n/pages.ts — page-text catalog (GENERATED — rewritten by the build
 * pipeline after every agent phase). NEVER edit, NEVER import directly:
 * the runtime reads it through tx() from '@/i18n'.
 *
 * Shape: { [locale]: { [sourceText]: translation } }. The build language
 * resolves to the source text itself and has no entry here; a missing key
 * falls back to the source text (fail-open).
 */
export const PAGES: Record<string, Record<string, string>> = {
  "en": {
    "Abgeschlossen": "Completed",
    "Abschließen": "Complete",
    "Aktive Ausleihen": "Active Loans",
    "Aktive Handwerker": "Active Craftsmen",
    "Alle Werkzeuge verfügbar.": "All tools available.",
    "Ausgeliehen": "Borrowed",
    "Ausleihe erfassen": "Record Loan",
    "Defekt": "Defective",
    "Keine Ausleihen aktiv — alle Werkzeuge verfügbar": "No active loans — all tools available",
    "Keine laufenden Wartungen oder Reparaturen": "No ongoing maintenance or repairs",
    "Nur verfügbare Werkzeuge können ausgeliehen werden": "Only available tools can be borrowed",
    "Unbekanntes Werkzeug": "Unknown Tool",
    "Verfügbar": "Available",
    "Wartung & Reparatur": "Maintenance & Repair",
    "Wartung erfassen": "Record Maintenance",
    "Werkzeug": "Tool",
    "Werkzeug zurückgeben": "Return Tool",
    "Werkzeuge gesamt": "Total Tools",
    "Zurückgeben": "Return",
    "Zurückgegeben": "Returned",
    "ausgeliehen": "borrowed",
    "bis": "until",
    "in Wartung/Reparatur": "under maintenance/repair",
    "{0} — abgeschlossen": "{0} — completed",
    "{0} — zurückgegeben": "{0} — returned",
    "Überfällig": "Overdue",
    "überfällig — geplante Rückgabe war": "overdue — scheduled return was",
    "✓ Abschließen": "✓ Complete",
    "✓ Zurückgeben": "✓ Return"
  }
};
