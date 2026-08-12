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
    "Aktive Ausleihen": "Active Checkouts",
    "Ausgeliehen": "Checked Out",
    "Ausleihe": "Checkout",
    "Ausleihe erfassen": "Record Checkout",
    "Bearbeiten": "Edit",
    "Defekt": "Defective",
    "Handwerker": "Technician",
    "Heute ausgeliehen: {0}": "Checked Out Today: {0}",
    "In Wartung/Reparatur": "In Maintenance/Repair",
    "Keine aktiven Ausleihen — alle Werkzeuge im Lager": "No Active Checkouts — All Tools in Storage",
    "Keine laufenden Wartungen oder Reparaturen": "No Ongoing Maintenance or Repairs",
    "Rückgabe": "Return",
    "Rückgabe buchen": "Book Return",
    "Unbekanntes Werkzeug": "Unknown Tool",
    "Unbenannt": "Untitled",
    "Verfügbar": "Available",
    "Vorgang anlegen": "Create Entry",
    "Wartung & Reparatur": "Maintenance & Repair",
    "Wartung/Reparatur": "Maintenance/Repair",
    "Werkzeug": "Tool",
    "Werkzeug anlegen": "Add Tool",
    "Zurückgegeben": "Returned",
    "Zustand geändert zu {0}": "Condition Changed to {0}",
    "bis": "until",
    "seit": "since",
    "{0} Werkzeuge verfügbar — Lager im grünen Bereich": "{0} Tools Available — Inventory in Good Shape",
    "{0} — Wartung abgeschlossen": "{0} — Maintenance Completed",
    "{0} — zurückgegeben": "{0} — Returned",
    "{0} — überfällige Rückgabe": "{0} — Overdue Return",
    "— Rückgabe überfällig": "— Return Overdue"
  }
};
