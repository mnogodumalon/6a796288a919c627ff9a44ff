/**
 * src/i18n/index.ts — runtime language layer (generated). NEVER edit.
 *
 * The dashboard ships ALL locales (de/en/cs); the active one is chosen at
 * runtime: LA profile language → localStorage 'app-locale' (header switcher)
 * → build locale. Switching remounts the tree (LocaleGate in App.tsx), so
 * plain calls inside component bodies stay correct — never hoist their
 * results into module-scope constants.
 *
 * Scaffold chrome and structure labels are already localized — read them,
 * never re-type them:
 *   t(key, params?)                 — catalog chrome text ('save', 'search', …)
 *   appLabel(entityKey)             — localized entity display name
 *   fieldLabel(entityKey, field)    — localized field label
 *   lookupLabel(entityKey, field, optionKey) — lookup option label (null = unknown)
 *   dateFormat()/dateTimeFormat()/dateFnsLocale()/localeTag()/CURRENCY
 *
 * Text YOU write (overview, intent pages, bespoke public pages) must work in
 * all three languages. Define it ONCE via makeT and render through it:
 *
 *   import { makeT, appLabel } from '@/i18n';
 *   const tt = makeT({
 *     de: { util: 'Auslastung', open: '{n} offene Aufträge' },
 *     en: { util: 'Utilization', open: '{n} open orders' },
 *     cs: { util: 'Vytížení', open: '{n} otevřených zakázek' },
 *   });
 *   … <h2>{tt('util')}</h2> <p>{tt('open', { n: count })}</p>
 *
 * WRONG: <h2>Auslastung</h2>            (one language, switcher breaks it)
 * RIGHT: <h2>{tt('util')}</h2>          (three languages, defined once)
 */
import { de as dfDe, cs as dfCs } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';

export type Locale = 'de' | 'en' | 'cs';
export const LOCALES: Locale[] = ['de', 'en', 'cs'];
export const LOCALE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English', cs: 'Čeština' };

export const BUILD_LOCALE: Locale = 'de';

// Currency is a property of the DATA, not of the UI language — it stays
// fixed at the build-time choice while number formatting follows the locale.
export const CURRENCY = 'EUR';

const STORAGE_KEY = 'app-locale';
const LA_API_URL = 'https://my.living-apps.de/rest';

// ── Generated catalogs ─────────────────────────────────────────────
// UI chrome strings (generator UI_TEXTS, all locales):
export const UI_CATALOG: Record<Locale, Record<string, string>> = {
  "de": {
    "overview": "Übersicht",
    "navigation": "Navigation",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "save": "Speichern",
    "saving": "Speichern...",
    "submit_error": "Speichern fehlgeschlagen.",
    "create": "Erstellen",
    "search": "Suchen...",
    "actions": "Aktionen",
    "no_results": "Keine Ergebnisse gefunden.",
    "no_data_yet": "Noch keine {entity}. Jetzt hinzufügen!",
    "select_placeholder": "Auswählen...",
    "confirm_delete_desc": "Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.",
    "add": "Hinzufügen",
    "view_entity": "{entity} anzeigen",
    "edit_button": "Bearbeiten",
    "edit_entity": "{entity} bearbeiten",
    "new_entity": "{entity} hinzufügen",
    "delete_entity": "{entity} löschen",
    "yes": "Ja",
    "no": "Nein",
    "search_entity": "{entity} suchen...",
    "in_system": "{entity} im System",
    "welcome": "Willkommen",
    "overview_subtitle": "Hier ist eine Übersicht Ihrer Daten.",
    "management": "Verwaltung",
    "dashboard": "Dashboard",
    "date_format": "dd.MM.yyyy",
    "admin": "Verwaltung",
    "admin_subtitle": "Alle Daten verwalten",
    "records": "Einträge",
    "select_all": "Alle auswählen",
    "bulk_delete": "Ausgewählte löschen",
    "bulk_clone": "Kopieren",
    "bulk_edit": "Feld bearbeiten",
    "selected": "ausgewählt",
    "apply_to_n": "Auf {n} Einträge anwenden",
    "filter": "Filtern",
    "clear_filters": "Filter zurücksetzen",
    "choose_field": "Feld auswählen",
    "new_value": "Neuer Wert",
    "all_values": "Alle",
    "confirm_bulk_delete": "Sollen {n} Einträge wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.",
    "deselect_all": "Auswahl aufheben",
    "applying": "Wird angewendet...",
    "create_new_app": "Neue App erstellen",
    "apps_label": "Apps",
    "profile_label": "Profil",
    "back": "Zurück",
    "display_section": "Darstellung",
    "data_management": "Datenverwaltung",
    "apps_search": "Suche...",
    "apps_no_results": "Keine Apps gefunden",
    "apps_page_of": "von",
    "sort_newest": "Neuste zuerst",
    "sort_oldest": "Älteste zuerst",
    "sort_az": "Name, A → Z",
    "sort_za": "Name, Z → A",
    "edit_dashboard": "Klar Lab",
    "developer": "Entwickler",
    "beta_features": "Beta Features",
    "actions_section": "Aktionen",
    "public_pages_section": "Öffentliche Seiten",
    "legal_imprint": "Impressum",
    "legal_privacy": "Datenschutz",
    "source_code": "Quellcode",
    "copy_code": "Code kopieren",
    "copied": "Kopiert!",
    "code_for": "Code für",
    "delete_confirm": "Aktion löschen",
    "delete_confirm_from": "aus",
    "action_deleted": "Aktion gelöscht:",
    "empty_action": "Leere Aktion",
    "run": "Ausführen",
    "field_required": "ist erforderlich",
    "file_too_large": "Datei überschreitet das Limit von 10 MB.",
    "preparing": "Wird vorbereitet...",
    "busy": "In Arbeit...",
    "files_label": "Dateien",
    "no_files": "Keine Dateien vorhanden",
    "sort_name_az": "Name A→Z",
    "sort_name_za": "Name Z→A",
    "delete_file_confirm": "Datei löschen",
    "file_deleted": "Datei gelöscht:",
    "datetime_format": "dd.MM.yyyy, HH:mm",
    "download": "Herunterladen",
    "auth_error_title": "Du bist nicht angemeldet.",
    "auth_login_button": "Anmelden",
    "repair_text": "Dashboard reparieren",
    "repair_error_title": "Etwas ist schiefgelaufen",
    "repair_reload": "Neu laden",
    "repair_starting": "Reparatur wird gestartet...",
    "repair_running": "Reparatur läuft...",
    "repair_done_title": "Dashboard repariert",
    "repair_done_desc": "Das Problem wurde behoben. Bitte laden Sie die Seite neu.",
    "repair_failed": "Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.",
    "fix_action_button": "Automatisch beheben",
    "fix_action_running": "Wird behoben…",
    "fix_error_heading": "Etwas klappte nicht bei der Ausführung von",
    "fix_intro_prefix": "Korrektur für",
    "fix_intro_suffix": "neue Chat-Sitzung für diese Korrektur gestartet.",
    "fix_still_fails": "Die Aktion schlägt weiterhin fehl",
    "fix_not_confirmed": "Die Korrektur ist noch nicht bestätigt — deine ursprüngliche Eingabe bleibt erhalten.",
    "fix_request_failed": "Korrektur-Anfrage fehlgeschlagen",
    "fix_retry_hint": "Deine ursprüngliche Eingabe bleibt erhalten — du kannst es erneut versuchen.",
    "close": "Schließen",
    "code_versions": "Versionen",
    "code_version_active": "Aktiv",
    "code_tab_code": "Code",
    "code_tab_diff": "Änderungen",
    "code_tab_diff_to": "Änderungen zu",
    "code_viewing_old_prefix": "Du siehst",
    "code_viewing_old_suffix": "— nicht die aktive Version.",
    "code_restore": "Diese Version wiederherstellen",
    "code_restore_confirm_title": "Version wiederherstellen",
    "code_restore_confirm_desc": "Der aktuelle Code wird ersetzt. Nichts geht verloren — es entsteht eine neue Version.",
    "code_restore_failed": "Wiederherstellen fehlgeschlagen",
    "code_restored_to": "Zurückgesetzt auf Version",
    "code_origin_fix": "Auto-Fix",
    "code_origin_chat": "Chat",
    "code_origin_initial": "Erstellt",
    "code_origin_revert": "Wiederhergestellt",
    "code_no_versions": "Keine früheren Versionen",
    "code_lines": "Zeilen",
    "code_out_tab": "Ausgabe",
    "code_out_heading": "Testlauf",
    "code_out_history_badge": "Code aus der Historie — nicht wiederhergestellt",
    "code_out_inputs": "Eingaben",
    "code_out_open": "Öffnen",
    "code_out_no_output": "(keine Ausgabe)",
    "code_chat_placeholder": "Frage zum Code stellen…",
    "code_back_to_tools": "Zurück zu den Werkzeugen",
    "code_switch_tool": "Aktion wechseln",
    "version_card_view_changes": "Änderungen ansehen",
    "version_card_undo": "Rückgängig",
    "version_card_open_action": "Aktion öffnen",
    "chat_history_title": "Verlauf",
    "chat_new": "Neuer Chat",
    "run_done_badge": "Ausgeführt",
    "run_id_copy": "RunID kopieren — bei Problemen für den Support angeben",
    "dock_empty_hint": "Frag etwas zu dieser Aktion — die Antwort kennt Code und Versionen.",
    "dock_suggest_what": "Was macht diese Aktion?",
    "dock_suggest_explain": "Erkläre mir den Code",
    "dock_ctx_other_prefix": "Diese Unterhaltung gehört zu",
    "dock_ctx_general": "Allgemeine Unterhaltung ohne Aktions-Bezug",
    "scope_menu_general_title": "Allgemeine Unterhaltung",
    "scope_general_short": "Allgemein",
    "scope_menu_action_desc": "Fragen & Änderungen zu dieser Aktion",
    "scope_menu_last_prefix": "Zuletzt",
    "run_result_details": "Details",
    "chat_new_for_tool": "Neue Unterhaltung zu dieser Aktion",
    "chat_history_search": "Verlauf durchsuchen…",
    "chat_history_empty": "Noch keine Unterhaltungen",
    "chat_history_today": "Heute",
    "chat_history_yesterday": "Gestern",
    "chat_history_older": "Älter",
    "chat_history_active": "Aktiv",
    "chat_history_recent": "Zuletzt",
    "chat_history_filter_all": "Alle",
    "chat_history_filter_tool": "Diese Aktion",
    "chat_history_delete_title": "Sitzung löschen?",
    "chat_history_delete_desc": "Diese Unterhaltung wird dauerhaft gelöscht.",
    "chat_history_delete_action": "Löschen",
    "chat_resumed": "Sitzung fortgesetzt",
    "chat_messages_label": "Nachrichten",
    "toast_network_title": "Netzwerkfehler",
    "toast_network_desc": "Verbindung zum Server verloren.",
    "toast_server_title": "Serverfehler",
    "toast_server_desc": "Bitte versuche es später erneut.",
    "toast_bug_desc": "Ein Problem wurde entdeckt. Das Dashboard kann automatisch repariert werden.",
    "update_available": "Update verfügbar:",
    "update_confirm_title": "Update installieren?",
    "update_confirm_desc": "Die Anwendung wird auf die neueste Version aktualisiert. Das dauert einige Minuten.",
    "update_confirm_action": "Aktualisieren",
    "updating": "Aktualisiert…",
    "update_verifying": "Version wird bestätigt…",
    "update_verify_timeout": "Version konnte nicht bestätigt werden. Bitte Seite neu laden.",
    "rollback_label": "Zurück auf",
    "rollback_confirm_title": "Version zurücksetzen?",
    "rollback_confirm_desc": "Die Anwendung wird auf die ausgewählte Version zurückgesetzt.",
    "rollback_confirm_action": "Zurücksetzen",
    "rolling_back": "Wird zurückgesetzt…",
    "attachments_label": "Anhänge",
    "attachments_empty": "Keine Anhänge vorhanden",
    "attachments_add": "Anhang hinzufügen",
    "attachments_type": "Typ",
    "attachments_label_field": "Bezeichnung",
    "attachments_value": "Wert",
    "attachments_value_file": "Datei",
    "attachments_value_note": "Notiz",
    "attachments_value_url": "URL",
    "attachments_value_json": "JSON",
    "attachments_choose_file": "Datei auswählen",
    "attachments_uploading": "Hochladen…",
    "attachments_loading": "Lade Anhänge…",
    "attachments_save_record_first": "Datensatz zuerst speichern, dann können Anhänge hinzugefügt werden.",
    "attachments_invalid_json": "Ungültiges JSON",
    "attachments_open": "Öffnen",
    "attachments_dz_hint": "Datei hier ablegen oder klicken",
    "attachments_dz_subhint": "PDFs, Bilder, Dokumente",
    "attachments_input_placeholder": "Notiz, Bild oder URL",
    "attachments_hint_enter": "↵ Enter zum Hinzufügen",
    "attachments_add_dialog_title": "Anhang hinzufügen",
    "attachments_or": "oder",
    "attachments_empty_cta": "Anhang hinzufügen — Datei ablegen oder klicken",
    "attachments_drop_to_upload": "Datei loslassen zum Hochladen",
    "attachments_delete_title": "Anhang löschen?",
    "attachments_delete_desc": "Dieser Anhang wird unwiederbringlich entfernt.",
    "attachments_rel_just_now": "gerade eben",
    "attachments_rel_min_prefix": "vor ",
    "attachments_rel_min": "Min",
    "attachments_rel_hr_prefix": "vor ",
    "attachments_rel_hr": "Std",
    "attachments_rel_day_prefix": "vor ",
    "attachments_rel_day": "Tagen",
    "fr_show_coords": "Koordinaten anzeigen",
    "fr_hide_coords": "Koordinaten verbergen",
    "fr_lat": "Breitengrad",
    "fr_long": "Längengrad",
    "fr_upload_file": "Datei hochladen",
    "fr_change": "Ändern",
    "fr_remove": "Entfernen",
    "fr_use_location": "Aktuellen Standort verwenden",
    "fr_photo_location": "Standort aus Foto übernommen",
    "fr_search_address": "Adresse suchen und auswählen…",
    "fr_record_url": "Record URL",
    "create_in": "Neu in {entity}",
    "pf_submit_text": "Absenden",
    "pf_submitting_text": "Wird gesendet...",
    "pf_required_error_text": "Dieses Feld ist erforderlich.",
    "pf_unavailable_title": "Nicht verfügbar",
    "pf_unavailable_message": "Dieses Formular ist derzeit nicht verfügbar.",
    "pf_error_generic_text": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    "pf_rate_limit_text": "Zu viele Versuche — bitte warte einen Moment und versuche es erneut.",
    "pf_another_entry_text": "Weitere Eingabe",
    "pf_powered_by_text": "Powered by Klar",
    "pf_address_placeholder": "Adresse suchen...",
    "pf_remove_text": "Entfernen",
    "pps_unavailable_message": "Diese Seite ist derzeit nicht verfügbar.",
    "ppn_heading": "Öffentliche Seiten",
    "ppn_copy_label": "Link kopieren",
    "ppn_manage_label": "Verwalten",
    "ppa_title": "Öffentliche Seiten",
    "ppa_subtitle": "Formulare und Seiten, die du per Link teilen kannst — ohne dass Besucher ein Konto brauchen.",
    "ppa_empty": "Noch keine Seiten. Sag im Chat, welche öffentliche Seite du brauchst — sie wird dann gebaut und erscheint hier.",
    "ppa_origin_auto": "Vorschlag",
    "ppa_origin_user": "Eigene",
    "ppa_origin_agent": "KI-Seite",
    "ppa_status_published": "Öffentlich",
    "ppa_status_draft": "Entwurf",
    "ppa_publish": "Veröffentlichen",
    "ppa_pause": "Pausieren",
    "ppa_open": "Öffnen",
    "ppa_copy": "Link kopieren",
    "ppa_copied": "Kopiert!",
    "ppa_confirm_title": "Wirklich veröffentlichen?",
    "ppa_can_do": "Jeder mit dem Link kann:",
    "ppa_cannot_do": "Niemand kann:",
    "ppa_can_submit": "Einträge absenden",
    "ppa_can_view": "diese Daten sehen",
    "ppa_cannot_line": "bestehende Daten sehen oder ändern.",
    "ppa_cancel": "Abbrechen",
    "ppa_confirm_publish": "Veröffentlichen",
    "ppa_fields": "Felder",
    "ppa_fields_title": "Felder auswählen",
    "ppa_fields_intro": "Wähle, welche Felder im öffentlichen Formular erscheinen.",
    "ppa_field_required": "Pflichtfeld — immer enthalten",
    "ppa_field_file": "Datei-Upload wird öffentlich nicht unterstützt",
    "ppa_field_exposes": "Zeigt Besuchern die Liste der verknüpften Einträge",
    "ppa_save": "Speichern",
    "load_error_title": "Fehler beim Laden",
    "retry": "Erneut versuchen",
    "data_load_failed": "Fehler beim Laden der Daten",
    "wizard_back_to_dashboard": "Zurück zum Dashboard",
    "step_create_new": "Neu erstellen",
    "budget_none": "Kein Budget definiert",
    "budget_booked": "Gebucht",
    "budget_of": "von",
    "budget_remaining": "Verbleibend",
    "budget_over": "Budget überschritten!",
    "combo_search": "Suchen…",
    "combo_no_match": "Kein Treffer",
    "combo_clear_selection": "Auswahl entfernen",
    "combo_clear_search": "Suche leeren",
    "combo_create_new": "Neuen Eintrag anlegen",
    "combo_create_named": "„{name}“ anlegen",
    "combo_create_labeled": "{label} anlegen",
    "combo_create_prefill_hint": "Übernimmt den Suchtext als Vorbelegung",
    "combo_create_inline_hint": "Direkt im Dialog erfassen",
    "combo_add_more": "+ Hinzufügen",
    "combo_remove_item": "{label} entfernen",
    "date_hint_date": "tt.mm.jjjj",
    "date_hint_datetime": "tt.mm.jjjj, hh:mm",
    "date_pick_date": "Datum wählen",
    "date_pick_datetime": "Datum & Uhrzeit wählen",
    "date_clear": "Datum zurücksetzen",
    "date_hours": "Stunden",
    "date_minutes": "Minuten",
    "date_now": "Jetzt",
    "date_today": "Heute",
    "date_reset": "Zurücksetzen",
    "address_search": "Adresse suchen…",
    "address_none": "Keine Adresse gefunden",
    "sat_empty": "Noch keine {title}.",
    "sat_add": "{title} hinzufügen",
    "intents_heading": "Abläufe",
    "intents_pending": "Werden erstellt …",
    "placeholder_page_desc": "Hier die eigene {entity}-Ansicht bauen.",
    "placeholder_page_box": "Platzhalter für eigene UI — hier die {entity}-Ansicht bauen",
    "tools_label": "Werkzeuge",
    "tools_subtitle_available": "verfügbar",
    "tools_empty_title": "Noch keine Werkzeuge angelegt",
    "tools_empty_desc": "Beschreibe im Chat, was du automatisieren willst — daraus entsteht dein erstes Werkzeug.",
    "tools_empty_cta": "Im Chat erstellen",
    "tools_file_singular": "Datei",
    "tools_file_plural": "Dateien",
    "chatw_title": "Assistent",
    "chatw_placeholder": "Frage stellen oder Bild hochladen...",
    "chatw_thinking": "Denkt nach...",
    "chatw_analyze_image": "Bild analysieren",
    "chatw_attach_file": "Datei anhängen",
    "chatw_fullscreen": "Vollbild",
    "chatw_exit_fullscreen": "Verkleinern",
    "ctx_error_text": "Fehler bei der Ausführung",
    "ctx_action_label": "Aktion",
    "acd_test_version": "v{v} testen",
    "vc_loading_versions": "Lade Versionen...",
    "vc_no_previous_versions": "Keine früheren Versionen",
    "vc_error_text": "Fehler aufgetreten",
    "vc_label_initial": "Erstversion",
    "vc_label_update": "Scaffold-Update",
    "vc_label_agent": "KI-Änderung",
    "vc_label_main_branch": "Hauptlinie",
    "vc_label_alternate_direction": "Alternative Richtung",
    "vc_version_singular": "Version",
    "vc_version_plural": "Versionen",
    "polish_greeting_morning": "Guten Morgen!",
    "polish_greeting_day": "Guten Tag!",
    "polish_greeting_evening": "Guten Abend!",
    "polish_undo": "Rückgängig",
    "attachments_upload_failed": "Datei konnte nicht hochgeladen werden.",
    "scan_error": "Scan fehlgeschlagen",
    "scan_header_sub": "Versteht Fotos, Dokumente und Text und füllt alles für dich aus",
    "scan_analyzing": "KI analysiert...",
    "scan_analyzing_sub": "Felder werden automatisch ausgefüllt",
    "scan_success": "Felder ausgefüllt!",
    "scan_success_sub": "Prüfe die Werte und passe sie ggf. an",
    "scan_upload": "Foto oder Dokument hierher ziehen oder auswählen",
    "scan_camera_btn": "Kamera",
    "scan_file_btn": "Foto wählen",
    "scan_doc_btn": "Dokument",
    "useinfo_label": "KI-Assistent darf zusätzlich Informationen zu meiner Person verwenden",
    "useinfo_more": "mehr Infos",
    "useinfo_loading": "Lade...",
    "useinfo_error": "Profil konnte nicht geladen werden",
    "profile_preamble": "Folgende Infos über dich können von der KI genutzt werden:",
    "scan_text_placeholder": "Text eingeben oder einfügen, z.B. Notizen, E-Mails, Beschreibungen...",
    "scan_text_analyze": "Analysieren",
    "smart_fill": "KI-Ausfüllen",
    "missing_required": "Bitte fülle die markierten Pflichtfelder aus.",
    "paste": "Einfügen",
    "bulk_edit_title": "Feld für ausgewählte Einträge bearbeiten",
    "details": "Details",
    "relations": "Verknüpft",
    "not_found": "Eintrag nicht gefunden",
    "required_hint": "Pflichtfeld"
  },
  "en": {
    "overview": "Overview",
    "navigation": "Navigation",
    "cancel": "Cancel",
    "delete": "Delete",
    "save": "Save",
    "saving": "Saving...",
    "submit_error": "Saving failed.",
    "create": "Create",
    "search": "Search...",
    "actions": "Actions",
    "no_results": "No results found.",
    "no_data_yet": "No {entity} yet. Add one!",
    "select_placeholder": "Select...",
    "confirm_delete_desc": "Are you sure? This action cannot be undone.",
    "add": "Add",
    "view_entity": "View {entity}",
    "edit_button": "Edit",
    "edit_entity": "Edit {entity}",
    "new_entity": "New {entity}",
    "delete_entity": "Delete {entity}",
    "yes": "Yes",
    "no": "No",
    "search_entity": "Search {entity}...",
    "in_system": "{entity} in the system",
    "welcome": "Welcome back",
    "overview_subtitle": "Here's an overview of your data.",
    "management": "Management",
    "dashboard": "Dashboard",
    "date_format": "MMM d, yyyy",
    "admin": "Admin",
    "admin_subtitle": "Manage all data",
    "records": "records",
    "select_all": "Select all",
    "bulk_delete": "Delete selected",
    "bulk_clone": "Clone selected",
    "bulk_edit": "Edit field",
    "selected": "selected",
    "apply_to_n": "Apply to {n} records",
    "filter": "Filter",
    "clear_filters": "Clear filters",
    "choose_field": "Choose field",
    "new_value": "New value",
    "all_values": "All",
    "confirm_bulk_delete": "Are you sure you want to delete {n} records? This action cannot be undone.",
    "deselect_all": "Deselect all",
    "applying": "Applying...",
    "create_new_app": "Create New App",
    "apps_label": "Apps",
    "profile_label": "Profile",
    "back": "Back",
    "display_section": "View",
    "data_management": "Data management",
    "apps_search": "Search...",
    "apps_no_results": "No apps found",
    "apps_page_of": "of",
    "sort_newest": "Newest first",
    "sort_oldest": "Oldest first",
    "sort_az": "Name, A → Z",
    "sort_za": "Name, Z → A",
    "edit_dashboard": "Klar Lab",
    "developer": "Developer",
    "beta_features": "Beta Features",
    "actions_section": "Actions",
    "public_pages_section": "Public pages",
    "legal_imprint": "Imprint",
    "legal_privacy": "Privacy",
    "source_code": "Source Code",
    "copy_code": "Copy code",
    "copied": "Copied!",
    "code_for": "Code for",
    "delete_confirm": "Delete action",
    "delete_confirm_from": "from",
    "action_deleted": "Action deleted:",
    "empty_action": "Empty action",
    "run": "Run",
    "field_required": "is required",
    "file_too_large": "File exceeds the 10 MB limit.",
    "preparing": "Preparing...",
    "busy": "Working...",
    "files_label": "Files",
    "no_files": "No files yet",
    "sort_name_az": "Name A→Z",
    "sort_name_za": "Name Z→A",
    "delete_file_confirm": "Delete file",
    "file_deleted": "File deleted:",
    "datetime_format": "MMM d, yyyy, h:mm a",
    "download": "Download",
    "auth_error_title": "You are not logged in.",
    "auth_login_button": "Log in",
    "repair_text": "Repair Dashboard",
    "repair_error_title": "Something went wrong",
    "repair_reload": "Reload",
    "repair_starting": "Starting repair...",
    "repair_running": "Repairing...",
    "repair_done_title": "Dashboard Repaired",
    "repair_done_desc": "The issue has been fixed. Please reload the page.",
    "repair_failed": "Automatic repair failed. Please contact support.",
    "fix_action_button": "Try to fix",
    "fix_action_running": "Fixing…",
    "fix_error_heading": "Error executing",
    "fix_intro_prefix": "Fixing",
    "fix_intro_suffix": "started a new chat session for this fix.",
    "fix_still_fails": "The action still fails",
    "fix_not_confirmed": "The fix is not confirmed yet — your original input stays preserved.",
    "fix_request_failed": "Fix request failed",
    "fix_retry_hint": "Your original input stays preserved — you can retry the fix.",
    "close": "Close",
    "code_versions": "Versions",
    "code_version_active": "Active",
    "code_tab_code": "Code",
    "code_tab_diff": "Changes",
    "code_tab_diff_to": "Changes vs",
    "code_viewing_old_prefix": "Viewing",
    "code_viewing_old_suffix": "— not the active version.",
    "code_restore": "Restore this version",
    "code_restore_confirm_title": "Restore version",
    "code_restore_confirm_desc": "The current code will be replaced. Nothing is lost — a new version is created.",
    "code_restore_failed": "Restore failed",
    "code_restored_to": "Restored to version",
    "code_origin_fix": "Auto-Fix",
    "code_origin_chat": "Chat",
    "code_origin_initial": "Created",
    "code_origin_revert": "Restored",
    "code_no_versions": "No previous versions",
    "code_lines": "lines",
    "code_out_tab": "Output",
    "code_out_heading": "Test run",
    "code_out_history_badge": "Code from history — not restored",
    "code_out_inputs": "Inputs",
    "code_out_open": "Open",
    "code_out_no_output": "(no output)",
    "code_chat_placeholder": "Ask about this code…",
    "code_back_to_tools": "Back to tools",
    "code_switch_tool": "Switch action",
    "version_card_view_changes": "View changes",
    "version_card_undo": "Undo",
    "version_card_open_action": "Open action",
    "chat_history_title": "History",
    "chat_new": "New chat",
    "run_done_badge": "Completed",
    "run_id_copy": "Copy RunID — quote it when reporting a problem",
    "dock_empty_hint": "Ask about this action — the answer knows its code and versions.",
    "dock_suggest_what": "What does this action do?",
    "dock_suggest_explain": "Explain the code to me",
    "dock_ctx_other_prefix": "This conversation belongs to",
    "dock_ctx_general": "General conversation, not tied to an action",
    "scope_menu_general_title": "General conversation",
    "scope_general_short": "General",
    "scope_menu_action_desc": "Questions & changes about this action",
    "scope_menu_last_prefix": "Last",
    "run_result_details": "Details",
    "chat_new_for_tool": "New conversation about this action",
    "chat_history_search": "Search history…",
    "chat_history_empty": "No conversations yet",
    "chat_history_today": "Today",
    "chat_history_yesterday": "Yesterday",
    "chat_history_older": "Older",
    "chat_history_active": "Active",
    "chat_history_recent": "Recent",
    "chat_history_filter_all": "All",
    "chat_history_filter_tool": "This action",
    "chat_history_delete_title": "Delete session?",
    "chat_history_delete_desc": "This conversation will be permanently deleted.",
    "chat_history_delete_action": "Delete",
    "chat_resumed": "Session resumed",
    "chat_messages_label": "messages",
    "toast_network_title": "Network error",
    "toast_network_desc": "Lost connection to the server.",
    "toast_server_title": "Server error",
    "toast_server_desc": "Please try again later.",
    "toast_bug_desc": "An issue was detected. The dashboard can be repaired automatically.",
    "update_available": "Update available:",
    "update_confirm_title": "Install update?",
    "update_confirm_desc": "The app will be updated to the latest version. This takes a few minutes.",
    "update_confirm_action": "Update",
    "updating": "Updating…",
    "update_verifying": "Confirming version…",
    "update_verify_timeout": "Could not confirm new version. Please reload the page.",
    "rollback_label": "Revert to",
    "rollback_confirm_title": "Revert version?",
    "rollback_confirm_desc": "The app will be reverted to the selected version.",
    "rollback_confirm_action": "Revert",
    "rolling_back": "Reverting…",
    "attachments_label": "Attachments",
    "attachments_empty": "No attachments yet",
    "attachments_add": "Add attachment",
    "attachments_type": "Type",
    "attachments_label_field": "Label",
    "attachments_value": "Value",
    "attachments_value_file": "File",
    "attachments_value_note": "Note",
    "attachments_value_url": "URL",
    "attachments_value_json": "JSON",
    "attachments_choose_file": "Choose file",
    "attachments_uploading": "Uploading…",
    "attachments_loading": "Loading attachments…",
    "attachments_save_record_first": "Save the record first, then attachments can be added.",
    "attachments_invalid_json": "Invalid JSON",
    "attachments_open": "Open",
    "attachments_dz_hint": "Drop file here or click",
    "attachments_dz_subhint": "PDFs, images, documents",
    "attachments_input_placeholder": "Note, image, or URL",
    "attachments_hint_enter": "↵ Press Enter to add",
    "attachments_add_dialog_title": "Add attachment",
    "attachments_or": "or",
    "attachments_empty_cta": "Add attachment — drop a file or click",
    "attachments_drop_to_upload": "Release to upload",
    "attachments_delete_title": "Delete attachment?",
    "attachments_delete_desc": "This attachment will be permanently removed.",
    "attachments_rel_just_now": "just now",
    "attachments_rel_min_prefix": "",
    "attachments_rel_min": "min ago",
    "attachments_rel_hr_prefix": "",
    "attachments_rel_hr": "h ago",
    "attachments_rel_day_prefix": "",
    "attachments_rel_day": "d ago",
    "fr_show_coords": "Show coordinates",
    "fr_hide_coords": "Hide coordinates",
    "fr_lat": "Latitude",
    "fr_long": "Longitude",
    "fr_upload_file": "Upload file",
    "fr_change": "Change",
    "fr_remove": "Remove",
    "fr_use_location": "Use my location",
    "fr_photo_location": "Location from photo",
    "fr_search_address": "Search an address…",
    "fr_record_url": "Record URL",
    "create_in": "New in {entity}",
    "pf_submit_text": "Submit",
    "pf_submitting_text": "Submitting...",
    "pf_required_error_text": "This field is required.",
    "pf_unavailable_title": "Not available",
    "pf_unavailable_message": "This form is currently not available.",
    "pf_error_generic_text": "Something went wrong. Please try again.",
    "pf_rate_limit_text": "Too many attempts — please wait a moment and try again.",
    "pf_another_entry_text": "Submit another",
    "pf_powered_by_text": "Powered by Klar",
    "pf_address_placeholder": "Search address...",
    "pf_remove_text": "Remove",
    "pps_unavailable_message": "This page is currently not available.",
    "ppn_heading": "Public pages",
    "ppn_copy_label": "Copy link",
    "ppn_manage_label": "Manage",
    "ppa_title": "Public pages",
    "ppa_subtitle": "Forms and pages you can share via link — no account required for visitors.",
    "ppa_empty": "No pages yet. Ask in the chat for the public page you need — it gets built and shows up here.",
    "ppa_origin_auto": "Suggested",
    "ppa_origin_user": "Yours",
    "ppa_origin_agent": "AI page",
    "ppa_status_published": "Public",
    "ppa_status_draft": "Draft",
    "ppa_publish": "Publish",
    "ppa_pause": "Pause",
    "ppa_open": "Open",
    "ppa_copy": "Copy link",
    "ppa_copied": "Copied!",
    "ppa_confirm_title": "Publish this page?",
    "ppa_can_do": "Anyone with the link can:",
    "ppa_cannot_do": "Nobody can:",
    "ppa_can_submit": "submit entries",
    "ppa_can_view": "see this data",
    "ppa_cannot_line": "see or change existing data.",
    "ppa_cancel": "Cancel",
    "ppa_confirm_publish": "Publish",
    "ppa_fields": "Fields",
    "ppa_fields_title": "Choose fields",
    "ppa_fields_intro": "Choose which fields appear in the public form.",
    "ppa_field_required": "Required — always included",
    "ppa_field_file": "File upload is not supported publicly",
    "ppa_field_exposes": "Reveals the list of linked entries to visitors",
    "ppa_save": "Save",
    "load_error_title": "Error Loading",
    "retry": "Try Again",
    "data_load_failed": "Failed to load data",
    "wizard_back_to_dashboard": "Back to Dashboard",
    "step_create_new": "Create new",
    "budget_none": "No budget defined",
    "budget_booked": "Booked",
    "budget_of": "of",
    "budget_remaining": "Remaining",
    "budget_over": "Over budget!",
    "combo_search": "Search…",
    "combo_no_match": "No match",
    "combo_clear_selection": "Clear selection",
    "combo_clear_search": "Clear search",
    "combo_create_new": "Create new entry",
    "combo_create_named": "Create \"{name}\"",
    "combo_create_labeled": "Create {label}",
    "combo_create_prefill_hint": "Uses the search text as a pre-fill",
    "combo_create_inline_hint": "Enter it right in the dialog",
    "combo_add_more": "+ Add",
    "combo_remove_item": "Remove {label}",
    "date_hint_date": "mm/dd/yyyy",
    "date_hint_datetime": "mm/dd/yyyy, hh:mm",
    "date_pick_date": "Pick a date",
    "date_pick_datetime": "Pick date & time",
    "date_clear": "Clear date",
    "date_hours": "Hours",
    "date_minutes": "Minutes",
    "date_now": "Now",
    "date_today": "Today",
    "date_reset": "Reset",
    "address_search": "Search address…",
    "address_none": "No address found",
    "sat_empty": "No {title} yet.",
    "sat_add": "Add {title}",
    "intents_heading": "Flows",
    "intents_pending": "Being created …",
    "placeholder_page_desc": "Build your custom {entity} view here.",
    "placeholder_page_box": "Custom UI placeholder — build your {entity} view here",
    "tools_label": "Tools",
    "tools_subtitle_available": "available",
    "tools_empty_title": "No tools yet",
    "tools_empty_desc": "Describe in the chat what you want to automate — that becomes your first tool.",
    "tools_empty_cta": "Create in chat",
    "tools_file_singular": "file",
    "tools_file_plural": "files",
    "chatw_title": "Assistant",
    "chatw_placeholder": "Ask a question or upload an image...",
    "chatw_thinking": "Thinking...",
    "chatw_analyze_image": "Analyze image",
    "chatw_attach_file": "Attach file",
    "chatw_fullscreen": "Fullscreen",
    "chatw_exit_fullscreen": "Exit fullscreen",
    "ctx_error_text": "Execution failed",
    "ctx_action_label": "Action",
    "acd_test_version": "Test v{v}",
    "vc_loading_versions": "Loading versions...",
    "vc_no_previous_versions": "No previous versions",
    "vc_error_text": "An error occurred",
    "vc_label_initial": "Initial build",
    "vc_label_update": "Scaffold update",
    "vc_label_agent": "AI edit",
    "vc_label_main_branch": "Main line",
    "vc_label_alternate_direction": "Alternate direction",
    "vc_version_singular": "version",
    "vc_version_plural": "versions",
    "polish_greeting_morning": "Good morning!",
    "polish_greeting_day": "Good afternoon!",
    "polish_greeting_evening": "Good evening!",
    "polish_undo": "Undo",
    "attachments_upload_failed": "File could not be uploaded.",
    "scan_error": "Scan failed",
    "scan_header_sub": "Understands photos, documents, and text and fills everything out for you",
    "scan_analyzing": "AI analyzing...",
    "scan_analyzing_sub": "Fields will be filled automatically",
    "scan_success": "Fields filled!",
    "scan_success_sub": "Review the values and adjust if needed",
    "scan_upload": "Drop your photo or document here or browse",
    "scan_camera_btn": "Camera",
    "scan_file_btn": "Choose photo",
    "scan_doc_btn": "Document",
    "useinfo_label": "AI assistant may use my personal information",
    "useinfo_more": "more info",
    "useinfo_loading": "Loading...",
    "useinfo_error": "Could not load profile",
    "profile_preamble": "The following info about you can be used by the AI:",
    "scan_text_placeholder": "Type or paste text, e.g. notes, emails, descriptions...",
    "scan_text_analyze": "Analyze",
    "smart_fill": "AI fill",
    "missing_required": "Please fill out the marked required fields.",
    "paste": "Paste",
    "bulk_edit_title": "Edit field for selected records",
    "details": "Details",
    "relations": "Linked",
    "not_found": "Record not found",
    "required_hint": "Required"
  },
  "cs": {
    "overview": "Přehled",
    "navigation": "Navigace",
    "cancel": "Zrušit",
    "delete": "Smazat",
    "save": "Uložit",
    "saving": "Ukládám...",
    "submit_error": "Uložení se nezdařilo.",
    "create": "Vytvořit",
    "search": "Hledat...",
    "actions": "Akce",
    "no_results": "Nebyly nalezeny žádné výsledky.",
    "no_data_yet": "Zatím žádné {entity}. Přidej první!",
    "select_placeholder": "Vybrat...",
    "confirm_delete_desc": "Opravdu chceš tento záznam smazat? Tuto akci nelze vrátit zpět.",
    "add": "Přidat",
    "view_entity": "Zobrazit {entity}",
    "edit_button": "Upravit",
    "edit_entity": "Upravit {entity}",
    "new_entity": "Přidat {entity}",
    "delete_entity": "Smazat {entity}",
    "yes": "Ano",
    "no": "Ne",
    "search_entity": "Hledat {entity}...",
    "in_system": "{entity} v systému",
    "welcome": "Vítej",
    "overview_subtitle": "Zde je přehled tvých dat.",
    "management": "Správa",
    "dashboard": "Dashboard",
    "date_format": "dd.MM.yyyy",
    "admin": "Správa",
    "admin_subtitle": "Správa všech dat",
    "records": "Záznamy",
    "select_all": "Vybrat vše",
    "bulk_delete": "Smazat vybrané",
    "bulk_clone": "Kopírovat",
    "bulk_edit": "Upravit pole",
    "selected": "vybráno",
    "apply_to_n": "Použít na {n} záznamů",
    "filter": "Filtrovat",
    "clear_filters": "Zrušit filtry",
    "choose_field": "Vybrat pole",
    "new_value": "Nová hodnota",
    "all_values": "Vše",
    "confirm_bulk_delete": "Opravdu smazat {n} záznamů? Tuto akci nelze vrátit zpět.",
    "deselect_all": "Zrušit výběr",
    "applying": "Používám...",
    "create_new_app": "Vytvořit novou aplikaci",
    "apps_label": "Aplikace",
    "profile_label": "Profil",
    "back": "Zpět",
    "display_section": "Zobrazení",
    "data_management": "Správa dat",
    "apps_search": "Hledat...",
    "apps_no_results": "Žádné aplikace nenalezeny",
    "apps_page_of": "z",
    "sort_newest": "Nejnovější první",
    "sort_oldest": "Nejstarší první",
    "sort_az": "Název, A → Z",
    "sort_za": "Název, Z → A",
    "edit_dashboard": "Klar Lab",
    "developer": "Vývojář",
    "beta_features": "Beta funkce",
    "actions_section": "Akce",
    "public_pages_section": "Veřejné stránky",
    "legal_imprint": "Impresum",
    "legal_privacy": "Ochrana osobních údajů",
    "source_code": "Zdrojový kód",
    "copy_code": "Kopírovat kód",
    "copied": "Zkopírováno!",
    "code_for": "Kód pro",
    "delete_confirm": "Smazat akci",
    "delete_confirm_from": "z",
    "action_deleted": "Akce smazána:",
    "empty_action": "Prázdná akce",
    "run": "Spustit",
    "field_required": "je povinné",
    "file_too_large": "Soubor překračuje limit 10 MB.",
    "preparing": "Připravuji...",
    "busy": "Pracuji...",
    "files_label": "Soubory",
    "no_files": "Žádné soubory",
    "sort_name_az": "Název A→Z",
    "sort_name_za": "Název Z→A",
    "delete_file_confirm": "Smazat soubor",
    "file_deleted": "Soubor smazán:",
    "datetime_format": "dd.MM.yyyy, HH:mm",
    "download": "Stáhnout",
    "auth_error_title": "Nejsi přihlášen(a).",
    "auth_login_button": "Přihlásit se",
    "repair_text": "Opravit dashboard",
    "repair_error_title": "Něco se pokazilo",
    "repair_reload": "Znovu načíst",
    "repair_starting": "Spouštím opravu...",
    "repair_running": "Oprava probíhá...",
    "repair_done_title": "Dashboard opraven",
    "repair_done_desc": "Problém byl vyřešen. Načti prosím stránku znovu.",
    "repair_failed": "Automatická oprava se nezdařila. Kontaktuj prosím podporu.",
    "fix_action_button": "Opravit automaticky",
    "fix_action_running": "Opravuji…",
    "fix_error_heading": "Něco se nepovedlo při spuštění",
    "fix_intro_prefix": "Oprava pro",
    "fix_intro_suffix": "nová chatová relace pro tuto opravu byla spuštěna.",
    "fix_still_fails": "Akce stále selhává",
    "fix_not_confirmed": "Oprava zatím není potvrzena — tvůj původní vstup zůstává zachován.",
    "fix_request_failed": "Žádost o opravu se nezdařila",
    "fix_retry_hint": "Tvůj původní vstup zůstává zachován — můžeš to zkusit znovu.",
    "close": "Zavřít",
    "code_versions": "Verze",
    "code_version_active": "Aktivní",
    "code_tab_code": "Kód",
    "code_tab_diff": "Změny",
    "code_tab_diff_to": "Změny oproti",
    "code_viewing_old_prefix": "Díváš se na",
    "code_viewing_old_suffix": "— není to aktivní verze.",
    "code_restore": "Obnovit tuto verzi",
    "code_restore_confirm_title": "Obnovit verzi",
    "code_restore_confirm_desc": "Aktuální kód bude nahrazen. Nic se neztratí — vznikne nová verze.",
    "code_restore_failed": "Obnovení se nezdařilo",
    "code_restored_to": "Obnoveno na verzi",
    "code_origin_fix": "Auto-oprava",
    "code_origin_chat": "Chat",
    "code_origin_initial": "Vytvořeno",
    "code_origin_revert": "Obnoveno",
    "code_no_versions": "Žádné starší verze",
    "code_lines": "řádků",
    "code_out_tab": "Výstup",
    "code_out_heading": "Testovací běh",
    "code_out_history_badge": "Kód z historie — neobnoveno",
    "code_out_inputs": "Vstupy",
    "code_out_open": "Otevřít",
    "code_out_no_output": "(žádný výstup)",
    "code_chat_placeholder": "Zeptej se na kód…",
    "code_back_to_tools": "Zpět na nástroje",
    "code_switch_tool": "Přepnout akci",
    "version_card_view_changes": "Zobrazit změny",
    "version_card_undo": "Vrátit zpět",
    "version_card_open_action": "Otevřít akci",
    "chat_history_title": "Historie",
    "chat_new": "Nový chat",
    "run_done_badge": "Provedeno",
    "run_id_copy": "Kopírovat RunID — při problémech uveď podpoře",
    "dock_empty_hint": "Zeptej se na tuto akci — odpověď zná kód i verze.",
    "dock_suggest_what": "Co tato akce dělá?",
    "dock_suggest_explain": "Vysvětli mi kód",
    "dock_ctx_other_prefix": "Tato konverzace patří k",
    "dock_ctx_general": "Obecná konverzace bez vazby na akci",
    "scope_menu_general_title": "Obecná konverzace",
    "scope_general_short": "Obecné",
    "scope_menu_action_desc": "Dotazy a změny k této akci",
    "scope_menu_last_prefix": "Naposledy",
    "run_result_details": "Podrobnosti",
    "chat_new_for_tool": "Nová konverzace k této akci",
    "chat_history_search": "Prohledat historii…",
    "chat_history_empty": "Zatím žádné konverzace",
    "chat_history_today": "Dnes",
    "chat_history_yesterday": "Včera",
    "chat_history_older": "Starší",
    "chat_history_active": "Aktivní",
    "chat_history_recent": "Naposledy",
    "chat_history_filter_all": "Vše",
    "chat_history_filter_tool": "Tato akce",
    "chat_history_delete_title": "Smazat relaci?",
    "chat_history_delete_desc": "Tato konverzace bude trvale smazána.",
    "chat_history_delete_action": "Smazat",
    "chat_resumed": "Relace obnovena",
    "chat_messages_label": "zpráv",
    "toast_network_title": "Chyba sítě",
    "toast_network_desc": "Spojení se serverem bylo ztraceno.",
    "toast_server_title": "Chyba serveru",
    "toast_server_desc": "Zkus to prosím později znovu.",
    "toast_bug_desc": "Byl zjištěn problém. Dashboard lze automaticky opravit.",
    "update_available": "Dostupná aktualizace:",
    "update_confirm_title": "Nainstalovat aktualizaci?",
    "update_confirm_desc": "Aplikace bude aktualizována na nejnovější verzi. Zabere to několik minut.",
    "update_confirm_action": "Aktualizovat",
    "updating": "Aktualizuji…",
    "update_verifying": "Ověřuji verzi…",
    "update_verify_timeout": "Verzi se nepodařilo ověřit. Načti prosím stránku znovu.",
    "rollback_label": "Zpět na",
    "rollback_confirm_title": "Vrátit verzi?",
    "rollback_confirm_desc": "Aplikace bude vrácena na vybranou verzi.",
    "rollback_confirm_action": "Vrátit",
    "rolling_back": "Vracím…",
    "attachments_label": "Přílohy",
    "attachments_empty": "Žádné přílohy",
    "attachments_add": "Přidat přílohu",
    "attachments_type": "Typ",
    "attachments_label_field": "Označení",
    "attachments_value": "Hodnota",
    "attachments_value_file": "Soubor",
    "attachments_value_note": "Poznámka",
    "attachments_value_url": "URL",
    "attachments_value_json": "JSON",
    "attachments_choose_file": "Vybrat soubor",
    "attachments_uploading": "Nahrávám…",
    "attachments_loading": "Načítám přílohy…",
    "attachments_save_record_first": "Nejdřív ulož záznam, pak lze přidávat přílohy.",
    "attachments_invalid_json": "Neplatný JSON",
    "attachments_open": "Otevřít",
    "attachments_dz_hint": "Přetáhni soubor sem nebo klikni",
    "attachments_dz_subhint": "PDF, obrázky, dokumenty",
    "attachments_input_placeholder": "Poznámka, obrázek nebo URL",
    "attachments_hint_enter": "↵ Enter pro přidání",
    "attachments_add_dialog_title": "Přidat přílohu",
    "attachments_or": "nebo",
    "attachments_empty_cta": "Přidat přílohu — přetáhni soubor nebo klikni",
    "attachments_drop_to_upload": "Pusť soubor pro nahrání",
    "attachments_delete_title": "Smazat přílohu?",
    "attachments_delete_desc": "Tato příloha bude nenávratně odstraněna.",
    "attachments_rel_just_now": "právě teď",
    "attachments_rel_min_prefix": "před ",
    "attachments_rel_min": "min",
    "attachments_rel_hr_prefix": "před ",
    "attachments_rel_hr": "hod",
    "attachments_rel_day_prefix": "před ",
    "attachments_rel_day": "dny",
    "fr_show_coords": "Zobrazit souřadnice",
    "fr_hide_coords": "Skrýt souřadnice",
    "fr_lat": "Zeměpisná šířka",
    "fr_long": "Zeměpisná délka",
    "fr_upload_file": "Nahrát soubor",
    "fr_change": "Změnit",
    "fr_remove": "Odebrat",
    "fr_use_location": "Použít aktuální polohu",
    "fr_photo_location": "Poloha převzata z fotky",
    "fr_search_address": "Vyhledej a vyber adresu…",
    "fr_record_url": "URL záznamu",
    "create_in": "Nové v {entity}",
    "pf_submit_text": "Odeslat",
    "pf_submitting_text": "Odesílání...",
    "pf_required_error_text": "Toto pole je povinné.",
    "pf_unavailable_title": "Není dostupné",
    "pf_unavailable_message": "Tento formulář není momentálně dostupný.",
    "pf_error_generic_text": "Něco se pokazilo. Zkuste to prosím znovu.",
    "pf_rate_limit_text": "Příliš mnoho pokusů — chvíli prosím počkejte a zkuste to znovu.",
    "pf_another_entry_text": "Zadat další",
    "pf_powered_by_text": "Powered by Klar",
    "pf_address_placeholder": "Hledat adresu...",
    "pf_remove_text": "Odebrat",
    "pps_unavailable_message": "Tato stránka není momentálně dostupná.",
    "ppn_heading": "Veřejné stránky",
    "ppn_copy_label": "Kopírovat odkaz",
    "ppn_manage_label": "Spravovat",
    "ppa_title": "Veřejné stránky",
    "ppa_subtitle": "Formuláře a stránky, které můžeš sdílet odkazem — návštěvníci nepotřebují účet.",
    "ppa_empty": "Zatím žádné stránky. Napiš do chatu, jakou veřejnou stránku potřebuješ — vytvoří se a objeví se tady.",
    "ppa_origin_auto": "Návrh",
    "ppa_origin_user": "Vlastní",
    "ppa_origin_agent": "Stránka od AI",
    "ppa_status_published": "Veřejná",
    "ppa_status_draft": "Koncept",
    "ppa_publish": "Zveřejnit",
    "ppa_pause": "Pozastavit",
    "ppa_open": "Otevřít",
    "ppa_copy": "Kopírovat odkaz",
    "ppa_copied": "Zkopírováno!",
    "ppa_confirm_title": "Opravdu zveřejnit?",
    "ppa_can_do": "Kdokoli s odkazem může:",
    "ppa_cannot_do": "Nikdo nemůže:",
    "ppa_can_submit": "odesílat záznamy",
    "ppa_can_view": "vidět tato data",
    "ppa_cannot_line": "vidět ani měnit existující data.",
    "ppa_cancel": "Zrušit",
    "ppa_confirm_publish": "Zveřejnit",
    "ppa_fields": "Pole",
    "ppa_fields_title": "Výběr polí",
    "ppa_fields_intro": "Vyber, která pole se zobrazí ve veřejném formuláři.",
    "ppa_field_required": "Povinné pole — vždy obsaženo",
    "ppa_field_file": "Nahrávání souborů není veřejně podporováno",
    "ppa_field_exposes": "Zobrazí návštěvníkům seznam propojených záznamů",
    "ppa_save": "Uložit",
    "load_error_title": "Chyba při načítání",
    "retry": "Zkusit znovu",
    "data_load_failed": "Data se nepodařilo načíst",
    "wizard_back_to_dashboard": "Zpět na dashboard",
    "step_create_new": "Vytvořit nový",
    "budget_none": "Rozpočet není nastavený",
    "budget_booked": "Vyčerpáno",
    "budget_of": "z",
    "budget_remaining": "Zbývá",
    "budget_over": "Rozpočet překročen!",
    "combo_search": "Hledat…",
    "combo_no_match": "Žádný výsledek",
    "combo_clear_selection": "Odebrat výběr",
    "combo_clear_search": "Vymazat hledání",
    "combo_create_new": "Vytvořit nový záznam",
    "combo_create_named": "Vytvořit „{name}“",
    "combo_create_labeled": "Vytvořit {label}",
    "combo_create_prefill_hint": "Použije zadaný text jako předvolbu",
    "combo_create_inline_hint": "Zadej to přímo v dialogu",
    "combo_add_more": "+ Přidat",
    "combo_remove_item": "Odebrat {label}",
    "date_hint_date": "dd.mm.rrrr",
    "date_hint_datetime": "dd.mm.rrrr, hh:mm",
    "date_pick_date": "Vyber datum",
    "date_pick_datetime": "Vyber datum a čas",
    "date_clear": "Vymazat datum",
    "date_hours": "Hodiny",
    "date_minutes": "Minuty",
    "date_now": "Teď",
    "date_today": "Dnes",
    "date_reset": "Vymazat",
    "address_search": "Hledat adresu…",
    "address_none": "Žádná adresa nenalezena",
    "sat_empty": "Zatím žádné {title}.",
    "sat_add": "Přidat {title}",
    "intents_heading": "Postupy",
    "intents_pending": "Vytvářejí se …",
    "placeholder_page_desc": "Tady si postav vlastní zobrazení pro {entity}.",
    "placeholder_page_box": "Zástupný obsah — tady postav zobrazení pro {entity}",
    "tools_label": "Nástroje",
    "tools_subtitle_available": "k dispozici",
    "tools_empty_title": "Zatím žádné nástroje",
    "tools_empty_desc": "Napiš v chatu, co chceš zautomatizovat — z toho vznikne tvůj první nástroj.",
    "tools_empty_cta": "Vytvořit v chatu",
    "tools_file_singular": "soubor",
    "tools_file_plural": "soubory",
    "chatw_title": "Asistent",
    "chatw_placeholder": "Zadej dotaz nebo nahraj obrázek...",
    "chatw_thinking": "Přemýšlím...",
    "chatw_analyze_image": "Analyzovat obrázek",
    "chatw_attach_file": "Připojit soubor",
    "chatw_fullscreen": "Na celou obrazovku",
    "chatw_exit_fullscreen": "Zmenšit",
    "ctx_error_text": "Spuštění selhalo",
    "ctx_action_label": "Akce",
    "acd_test_version": "Otestovat v{v}",
    "vc_loading_versions": "Načítám verze...",
    "vc_no_previous_versions": "Žádné starší verze",
    "vc_error_text": "Došlo k chybě",
    "vc_label_initial": "První verze",
    "vc_label_update": "Aktualizace scaffoldu",
    "vc_label_agent": "Úprava AI",
    "vc_label_main_branch": "Hlavní linie",
    "vc_label_alternate_direction": "Alternativní směr",
    "vc_version_singular": "verze",
    "vc_version_plural": "verze",
    "polish_greeting_morning": "Dobré ráno!",
    "polish_greeting_day": "Dobrý den!",
    "polish_greeting_evening": "Dobrý večer!",
    "polish_undo": "Zpět",
    "attachments_upload_failed": "Soubor se nepodařilo nahrát.",
    "scan_error": "Skenování selhalo",
    "scan_header_sub": "Rozumí fotkám, dokumentům i textu a všechno za tebe vyplní",
    "scan_analyzing": "AI analyzuje...",
    "scan_analyzing_sub": "Pole se vyplní automaticky",
    "scan_success": "Pole vyplněna!",
    "scan_success_sub": "Zkontroluj hodnoty a případně je uprav",
    "scan_upload": "Přetáhni sem fotku nebo dokument, nebo vyber soubor",
    "scan_camera_btn": "Kamera",
    "scan_file_btn": "Vybrat fotku",
    "scan_doc_btn": "Dokument",
    "useinfo_label": "AI asistent smí použít i informace o mé osobě",
    "useinfo_more": "více informací",
    "useinfo_loading": "Načítám...",
    "useinfo_error": "Profil se nepodařilo načíst",
    "profile_preamble": "AI může využít tyto informace o tobě:",
    "scan_text_placeholder": "Napiš nebo vlož text, např. poznámky, e-maily, popisy...",
    "scan_text_analyze": "Analyzovat",
    "smart_fill": "Vyplnit s AI",
    "missing_required": "Vyplň prosím označená povinná pole.",
    "paste": "Vložit",
    "bulk_edit_title": "Upravit pole u vybraných záznamů",
    "details": "Podrobnosti",
    "relations": "Propojeno",
    "not_found": "Záznam nenalezen",
    "required_hint": "Povinné pole"
  }
};

// Structure labels (app names, field labels, lookup option labels):
type AppLabels = {
  name: string;
  fields: Record<string, string>;
  lookups: Record<string, Record<string, string>>;
};
type LabelBundle = { appgroup: string; apps: Record<string, AppLabels> };
export const LABELS: Record<Locale, LabelBundle> = {
  "de": {
    "appgroup": "Elektro-Werkzeugmanagement",
    "apps": {
      "handwerker": {
        "name": "Handwerker",
        "fields": {
          "vorname": "Vorname",
          "nachname": "Nachname",
          "personalnummer": "Personalnummer",
          "telefon": "Telefonnummer",
          "email": "E-Mail-Adresse",
          "abteilung": "Abteilung",
          "qualifikation": "Qualifikation / Rolle",
          "status": "Status",
          "bemerkungen": "Bemerkungen"
        },
        "lookups": {
          "qualifikation": {
            "elektriker": "Elektriker",
            "meister": "Meister",
            "geselle": "Geselle",
            "auszubildender": "Auszubildender",
            "techniker": "Techniker"
          },
          "status": {
            "aktiv": "Aktiv",
            "inaktiv": "Inaktiv"
          }
        }
      },
      "werkzeuge": {
        "name": "Werkzeuge",
        "fields": {
          "werkzeugname": "Werkzeugname",
          "inventarnummer": "Inventarnummer",
          "kategorie": "Kategorie",
          "hersteller": "Hersteller",
          "modell": "Modell",
          "seriennummer": "Seriennummer",
          "anschaffungsdatum": "Anschaffungsdatum",
          "standort": "Standort / Lagerort",
          "zustand": "Aktueller Zustand",
          "foto": "Foto des Werkzeugs",
          "bemerkungen_werkzeug": "Bemerkungen"
        },
        "lookups": {
          "kategorie": {
            "messgeraet": "Messgerät",
            "handwerkzeug": "Handwerkzeug",
            "elektrowerkzeug": "Elektrowerkzeug",
            "pruefgeraet": "Prüfgerät",
            "sicherheitsausruestung": "Sicherheitsausrüstung",
            "sonstiges": "Sonstiges"
          },
          "zustand": {
            "verfuegbar": "Verfügbar",
            "ausgeliehen": "Ausgeliehen",
            "in_reparatur": "In Reparatur",
            "in_wartung": "In Wartung",
            "defekt": "Defekt",
            "ausgemustert": "Ausgemustert"
          }
        }
      },
      "ausleihe": {
        "name": "Ausleihe",
        "fields": {
          "werkzeug": "Werkzeug",
          "handwerker": "Handwerker",
          "ausleihdatum": "Ausleihdatum und -uhrzeit",
          "geplantes_rueckgabedatum": "Geplantes Rückgabedatum und -uhrzeit",
          "tatsaechliches_rueckgabedatum": "Tatsächliches Rückgabedatum und -uhrzeit",
          "status_ausleihe": "Status",
          "bemerkungen_ausleihe": "Bemerkungen"
        },
        "lookups": {
          "status_ausleihe": {
            "ausgeliehen": "Ausgeliehen",
            "zurueckgegeben": "Zurückgegeben"
          }
        }
      },
      "wartung_reparatur": {
        "name": "Wartung & Reparatur",
        "fields": {
          "werkzeug_wartung": "Werkzeug",
          "vorgangsart": "Vorgangsart",
          "verantwortlicher": "Verantwortlicher Handwerker",
          "startdatum": "Startdatum",
          "geplantes_enddatum": "Geplantes Enddatum",
          "tatsaechliches_enddatum": "Tatsächliches Enddatum",
          "beschreibung": "Beschreibung des Problems / der Maßnahme",
          "status_wartung": "Status",
          "kosten": "Kosten (€)",
          "bemerkungen_wartung": "Bemerkungen",
          "dokument": "Dokument / Bericht"
        },
        "lookups": {
          "vorgangsart": {
            "wartung": "Wartung",
            "reparatur": "Reparatur"
          },
          "status_wartung": {
            "geplant": "Geplant",
            "in_bearbeitung": "In Bearbeitung",
            "abgeschlossen": "Abgeschlossen",
            "abgebrochen": "Abgebrochen"
          }
        }
      }
    }
  },
  "en": {
    "appgroup": "Electric Tool Management",
    "apps": {
      "handwerker": {
        "name": "Craftsmen",
        "fields": {
          "vorname": "First Name",
          "nachname": "Last Name",
          "personalnummer": "Employee Number",
          "telefon": "Phone Number",
          "email": "Email Address",
          "abteilung": "Department",
          "qualifikation": "Qualification / Role",
          "status": "Status",
          "bemerkungen": "Remarks"
        },
        "lookups": {
          "qualifikation": {
            "elektriker": "Electrician",
            "meister": "Master",
            "geselle": "Journeyman",
            "auszubildender": "Apprentice",
            "techniker": "Technician"
          },
          "status": {
            "aktiv": "Active",
            "inaktiv": "Inactive"
          }
        }
      },
      "werkzeuge": {
        "name": "Tools",
        "fields": {
          "werkzeugname": "Tool Name",
          "inventarnummer": "Inventory Number",
          "kategorie": "Category",
          "hersteller": "Manufacturer",
          "modell": "Model",
          "seriennummer": "Serial Number",
          "anschaffungsdatum": "Purchase Date",
          "standort": "Location / Storage Location",
          "zustand": "Current Condition",
          "foto": "Photo of Tool",
          "bemerkungen_werkzeug": "Remarks"
        },
        "lookups": {
          "kategorie": {
            "messgeraet": "Measuring Device",
            "handwerkzeug": "Hand Tool",
            "elektrowerkzeug": "Power Tool",
            "pruefgeraet": "Test Device",
            "sicherheitsausruestung": "Safety Equipment",
            "sonstiges": "Other"
          },
          "zustand": {
            "verfuegbar": "Available",
            "ausgeliehen": "Checked Out",
            "in_reparatur": "In Repair",
            "in_wartung": "In Maintenance",
            "defekt": "Defective",
            "ausgemustert": "Decommissioned"
          }
        }
      },
      "ausleihe": {
        "name": "Lending",
        "fields": {
          "werkzeug": "Tool",
          "handwerker": "Craftsmen",
          "ausleihdatum": "Checkout Date and Time",
          "geplantes_rueckgabedatum": "Planned Return Date and Time",
          "tatsaechliches_rueckgabedatum": "Actual Return Date and Time",
          "status_ausleihe": "Status",
          "bemerkungen_ausleihe": "Remarks"
        },
        "lookups": {
          "status_ausleihe": {
            "ausgeliehen": "Checked Out",
            "zurueckgegeben": "Returned"
          }
        }
      },
      "wartung_reparatur": {
        "name": "Maintenance & Repair",
        "fields": {
          "werkzeug_wartung": "Tool",
          "vorgangsart": "Process Type",
          "verantwortlicher": "Responsible Craftsman",
          "startdatum": "Start Date",
          "geplantes_enddatum": "Planned End Date",
          "tatsaechliches_enddatum": "Actual End Date",
          "beschreibung": "Description of Problem / Action",
          "status_wartung": "Status",
          "kosten": "Cost (€)",
          "bemerkungen_wartung": "Remarks",
          "dokument": "Document / Report"
        },
        "lookups": {
          "vorgangsart": {
            "wartung": "Maintenance",
            "reparatur": "Repair"
          },
          "status_wartung": {
            "geplant": "Planned",
            "in_bearbeitung": "In Progress",
            "abgeschlossen": "Completed",
            "abgebrochen": "Cancelled"
          }
        }
      }
    }
  },
  "cs": {
    "appgroup": "Správa elektro-nářadí",
    "apps": {
      "handwerker": {
        "name": "Řemeslníci",
        "fields": {
          "vorname": "Jméno",
          "nachname": "Příjmení",
          "personalnummer": "Osobní číslo",
          "telefon": "Telefonní číslo",
          "email": "E-mailová adresa",
          "abteilung": "Oddělení",
          "qualifikation": "Kvalifikace / Role",
          "status": "Stav",
          "bemerkungen": "Poznámky"
        },
        "lookups": {
          "qualifikation": {
            "elektriker": "Elektrikář",
            "meister": "Mistr",
            "geselle": "Tovaryš",
            "auszubildender": "Učeň",
            "techniker": "Technik"
          },
          "status": {
            "aktiv": "Aktivní",
            "inaktiv": "Neaktivní"
          }
        }
      },
      "werkzeuge": {
        "name": "Nářadí",
        "fields": {
          "werkzeugname": "Název nářadí",
          "inventarnummer": "Inventární číslo",
          "kategorie": "Kategorie",
          "hersteller": "Výrobce",
          "modell": "Model",
          "seriennummer": "Sériové číslo",
          "anschaffungsdatum": "Datum pořízení",
          "standort": "Umístění / Sklad",
          "zustand": "Aktuální stav",
          "foto": "Foto nářadí",
          "bemerkungen_werkzeug": "Poznámky"
        },
        "lookups": {
          "kategorie": {
            "messgeraet": "Měřicí přístroj",
            "handwerkzeug": "Ruční nářadí",
            "elektrowerkzeug": "Elektro-nářadí",
            "pruefgeraet": "Zkušební přístroj",
            "sicherheitsausruestung": "Bezpečnostní vybavení",
            "sonstiges": "Ostatní"
          },
          "zustand": {
            "verfuegbar": "Dostupné",
            "ausgeliehen": "Zapůjčeno",
            "in_reparatur": "V opravě",
            "in_wartung": "V údržbě",
            "defekt": "Vadné",
            "ausgemustert": "Vyřazeno"
          }
        }
      },
      "ausleihe": {
        "name": "Výpůjčky",
        "fields": {
          "werkzeug": "Nářadí",
          "handwerker": "Řemeslníci",
          "ausleihdatum": "Datum a čas výpůjčky",
          "geplantes_rueckgabedatum": "Plánované datum a čas vrácení",
          "tatsaechliches_rueckgabedatum": "Skutečné datum a čas vrácení",
          "status_ausleihe": "Stav",
          "bemerkungen_ausleihe": "Poznámky"
        },
        "lookups": {
          "status_ausleihe": {
            "ausgeliehen": "Zapůjčeno",
            "zurueckgegeben": "Vráceno"
          }
        }
      },
      "wartung_reparatur": {
        "name": "Údržba & Opravy",
        "fields": {
          "werkzeug_wartung": "Nářadí",
          "vorgangsart": "Typ záznamu",
          "verantwortlicher": "Odpovědný řemeslník",
          "startdatum": "Datum zahájení",
          "geplantes_enddatum": "Plánované datum ukončení",
          "tatsaechliches_enddatum": "Skutečné datum ukončení",
          "beschreibung": "Popis problému / opatření",
          "status_wartung": "Stav",
          "kosten": "Náklady (€)",
          "bemerkungen_wartung": "Poznámky",
          "dokument": "Dokument / Zpráva"
        },
        "lookups": {
          "vorgangsart": {
            "wartung": "Údržba",
            "reparatur": "Oprava"
          },
          "status_wartung": {
            "geplant": "Naplánováno",
            "in_bearbeitung": "Probíhá",
            "abgeschlossen": "Dokončeno",
            "abgebrochen": "Zrušeno"
          }
        }
      }
    }
  }
};

// ── Locale state ───────────────────────────────────────────────────
function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return (LOCALES as string[]).includes(v ?? '') ? (v as Locale) : null;
  } catch {
    return null;
  }
}

function htmlLang(): Locale | null {
  const raw = (document.documentElement.getAttribute('lang') ?? '')
    .split(/[-_]/)[0]
    .toLowerCase();
  return (LOCALES as string[]).includes(raw) ? (raw as Locale) : null;
}

// The PLATFORM header owns the language switcher. Its contract is
// <html lang> (the la-widget library resolves and observes the same
// attribute): adopt it at load when present, keep it in sync otherwise.
export let locale: Locale = htmlLang() ?? readStored() ?? BUILD_LOCALE;
document.documentElement.lang = locale;

// Follow platform-initiated switches LIVE — same MutationObserver contract
// the la-widgets use. applyLocale is a no-op for our own writes (same value).
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    const next = htmlLang();
    if (next && next !== locale) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      applyLocale(next);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

const listeners = new Set<() => void>();

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

export function setLocale(next: Locale) {
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  applyLocale(next);
  void persistProfileLanguage(next);
}

// The LA profile is the language's source of truth AT REST: adopt it once
// per page load (LocaleGate calls this on mount). It must NOT re-run on the
// remount a language switch causes — that reverted every header-switcher
// change back to the profile within a second (live-proven). Persisting a
// switch into the profile is the platform header's job.
let profileSyncDone = false;
export async function syncProfileLocale(): Promise<void> {
  if (profileSyncDone) return;
  profileSyncDone = true;
  const before = locale;
  try {
    const r = await fetch(`${LA_API_URL}/user`, { credentials: 'include' });
    if (!r.ok) return;
    const raw = (await r.json()) as { lang?: unknown };
    const lang = String(raw?.lang ?? '').slice(0, 2).toLowerCase();
    if (!(LOCALES as string[]).includes(lang)) return;
    // A switch that happened while we fetched wins over the profile.
    if (locale !== before) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    applyLocale(lang as Locale);
  } catch { /* offline/anonymous — keep the current locale */ }
}

// Write-back of the switcher choice into the LA profile. PATCH is partial
// by definition — unlike a PUT it cannot full-replace the profile, and an
// unsupported endpoint answers 405 without side effects. Fire-and-forget:
// the local switch already happened; localStorage carries it meanwhile.
async function persistProfileLanguage(next: Locale): Promise<void> {
  try {
    await fetch(`${LA_API_URL}/user`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: next }),
    });
  } catch { /* offline — the choice still lives in localStorage */ }
}

// Public pages follow the visitor's browser language (no profile, no
// persistence — a public visitor must not pin the operator's dashboard
// locale). Call once when mounting a public route.
export function initPublicLocale() {
  const nav = (navigator.language || '').toLowerCase();
  const match = LOCALES.find((l) => nav === l || nav.startsWith(l + '-'));
  locale = match ?? BUILD_LOCALE;
  document.documentElement.lang = locale;
}

// ── Text lookup ────────────────────────────────────────────────────
export function t(key: string, params?: Record<string, string | number>): string {
  const table = UI_CATALOG[locale] ?? UI_CATALOG.en;
  let text = table[key] ?? UI_CATALOG.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

// Page-local text for agent-written pages (overview, intent pages, bespoke
// public pages): define EVERY locale once, read at render time. The returned
// function behaves like t() (current locale, {param} interpolation, fallback
// chain locale → build locale → en → key).
//
//   const tt = makeT({
//     de: { title: 'Auslastung', hint: '{n} offene Aufträge' },
//     en: { title: 'Utilization', hint: '{n} open orders' },
//     cs: { title: 'Vytížení', hint: '{n} otevřených zakázek' },
//   });
//   ... <h2>{tt('title')}</h2>
export function makeT<K extends string>(table: Record<Locale, Record<K, string>>) {
  return (key: K, params?: Record<string, string | number>): string => {
    let text: string =
      table[locale]?.[key] ?? table[BUILD_LOCALE]?.[key] ?? table.en?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
}

function bundle(): LabelBundle {
  return LABELS[locale] ?? LABELS[BUILD_LOCALE];
}

export function appgroupLabel(): string {
  return bundle().appgroup || LABELS[BUILD_LOCALE].appgroup;
}

export function appLabel(app: string): string {
  return bundle().apps[app]?.name ?? LABELS[BUILD_LOCALE].apps[app]?.name ?? app;
}

export function fieldLabel(app: string, field: string): string {
  return (
    bundle().apps[app]?.fields?.[field] ??
    LABELS[BUILD_LOCALE].apps[app]?.fields?.[field] ??
    field
  );
}

// All field labels of one app in the active locale (fallback per field).
export function fieldLabels(app: string): Record<string, string> {
  return {
    ...LABELS[BUILD_LOCALE].apps[app]?.fields,
    ...bundle().apps[app]?.fields,
  };
}

// Display label for a lookup option key; null when the key is unknown so
// callers can fall back to the enriched record label (build language).
export function lookupLabel(app: string, field: string, key: string | null | undefined): string | null {
  if (key == null) return null;
  return (
    bundle().apps[app]?.lookups?.[field]?.[key] ??
    LABELS[BUILD_LOCALE].apps[app]?.lookups?.[field]?.[key] ??
    null
  );
}

// ── Locale-dependent formatting ────────────────────────────────────
export function localeTag(): string {
  return locale === 'de' ? 'de-DE' : locale === 'cs' ? 'cs-CZ' : 'en-US';
}

// date-fns needs an explicit locale object for non-English month/weekday names.
export function dateFnsLocale(): DateFnsLocale | undefined {
  return locale === 'de' ? dfDe : locale === 'cs' ? dfCs : undefined;
}

export function dateFormat(): string {
  return t('date_format');
}

export function dateTimeFormat(): string {
  return t('datetime_format');
}
