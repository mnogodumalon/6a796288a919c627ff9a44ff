import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { format, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import { IconAlertTriangle, IconTool, IconPlus, IconUser } from '@tabler/icons-react';
import type { WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import type { AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import type { WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import type { HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';

const tt = makeT({ /* i18n-exempt */
  de: { /* i18n-exempt */
    page_title: 'Werkzeugmanagement', /* i18n-exempt */
    ctx_none: 'Alle Werkzeuge verfügbar.', /* i18n-exempt */
    ctx_borrowed: '{n} ausgeliehen — {who}.', /* i18n-exempt */
    ctx_problem: '{n} in Reparatur/Wartung.', /* i18n-exempt */
    kpi_verfuegbar: 'Verfügbar', /* i18n-exempt */
    kpi_ausgeliehen: 'Ausgeliehen', /* i18n-exempt */
    kpi_wartung: 'Wartung/Rep.', /* i18n-exempt */
    kpi_handwerker: 'Handwerker', /* i18n-exempt */
    hero_ueberfaellig: '{n} Ausleihe überfällig — {who}', /* i18n-exempt */
    hero_action: 'Rückgabe erfassen', /* i18n-exempt */
    list_ausleihe: 'Aktive Ausleihen', /* i18n-exempt */
    list_wartung: 'Laufende Wartungen', /* i18n-exempt */
    empty_ausleihe: 'Keine aktiven Ausleihen', /* i18n-exempt */
    empty_wartung: 'Keine laufenden Wartungen', /* i18n-exempt */
    btn_werkzeug: 'Werkzeug', /* i18n-exempt */
    btn_ausleihe: 'Ausleihe', /* i18n-exempt */
    btn_handwerker: 'Handwerker', /* i18n-exempt */
    undo_zustand: 'Zustand zurückgesetzt', /* i18n-exempt */
    rueckgabe_ok: 'Rückgabe erfasst', /* i18n-exempt */
    wartung_ok: 'Wartung abgeschlossen', /* i18n-exempt */
    wartung_action: 'Wartung abschließen', /* i18n-exempt */
    rueckgabe_undo: 'Zurück', /* i18n-exempt */
    maintenance_add: '+ Wartung', /* i18n-exempt */
    empty_app_head: 'Werkzeugverwaltung einrichten', /* i18n-exempt */
    empty_app_sub: 'Erfasse dein erstes Werkzeug und beginne mit der Ausleihe.', /* i18n-exempt */
    empty_app_btn: 'Erstes Werkzeug aufnehmen', /* i18n-exempt */
    overdue: 'überfällig', /* i18n-exempt */
    zurueck: '✓ Zurück', /* i18n-exempt */
    abschliessen: '✓ Abschließen',
    bis: '· bis', /* i18n-exempt */
  },
  en: { /* i18n-exempt */
    page_title: 'Tool Management', /* i18n-exempt */
    ctx_none: 'All tools available.', /* i18n-exempt */
    ctx_borrowed: '{n} borrowed — {who}.', /* i18n-exempt */
    ctx_problem: '{n} in repair/maintenance.', /* i18n-exempt */
    kpi_verfuegbar: 'Available', /* i18n-exempt */
    kpi_ausgeliehen: 'Borrowed', /* i18n-exempt */
    kpi_wartung: 'Maint./Repair', /* i18n-exempt */
    kpi_handwerker: 'Craftsmen', /* i18n-exempt */
    hero_ueberfaellig: '{n} overdue loan — {who}', /* i18n-exempt */
    hero_action: 'Record return', /* i18n-exempt */
    list_ausleihe: 'Active Loans', /* i18n-exempt */
    list_wartung: 'Ongoing Maintenance', /* i18n-exempt */
    empty_ausleihe: 'No active loans', /* i18n-exempt */
    empty_wartung: 'No ongoing maintenance', /* i18n-exempt */
    btn_werkzeug: 'Tool', /* i18n-exempt */
    btn_ausleihe: 'Loan', /* i18n-exempt */
    btn_handwerker: 'Craftsman', /* i18n-exempt */
    undo_zustand: 'Status reverted', /* i18n-exempt */
    rueckgabe_ok: 'Return recorded', /* i18n-exempt */
    wartung_ok: 'Maintenance completed', /* i18n-exempt */
    wartung_action: 'Complete maintenance', /* i18n-exempt */
    rueckgabe_undo: 'Back', /* i18n-exempt */
    maintenance_add: '+ Maintenance', /* i18n-exempt */
    empty_app_head: 'Set up tool management', /* i18n-exempt */
    empty_app_sub: 'Add your first tool and start tracking loans.', /* i18n-exempt */
    empty_app_btn: 'Add first tool', /* i18n-exempt */
    overdue: 'overdue', /* i18n-exempt */
    zurueck: '✓ Return', /* i18n-exempt */
    abschliessen: '✓ Complete',
    bis: '· to', /* i18n-exempt */
  },
  cs: { /* i18n-exempt */
    page_title: 'Správa nástrojů', /* i18n-exempt */
    ctx_none: 'Všechny nástroje dostupné.', /* i18n-exempt */
    ctx_borrowed: '{n} půjčeno — {who}.', /* i18n-exempt */
    ctx_problem: '{n} v opravě/údržbě.', /* i18n-exempt */
    kpi_verfuegbar: 'Dostupné', /* i18n-exempt */
    kpi_ausgeliehen: 'Půjčeno', /* i18n-exempt */
    kpi_wartung: 'Údržba/Oprava', /* i18n-exempt */
    kpi_handwerker: 'Řemeslníci', /* i18n-exempt */
    hero_ueberfaellig: '{n} půjčka po termínu — {who}', /* i18n-exempt */
    hero_action: 'Zaznamenat vrácení', /* i18n-exempt */
    list_ausleihe: 'Aktivní půjčky', /* i18n-exempt */
    list_wartung: 'Probíhající údržba', /* i18n-exempt */
    empty_ausleihe: 'Žádné aktivní půjčky', /* i18n-exempt */
    empty_wartung: 'Žádná probíhající údržba', /* i18n-exempt */
    btn_werkzeug: 'Nástroj', /* i18n-exempt */
    btn_ausleihe: 'Půjčka', /* i18n-exempt */
    btn_handwerker: 'Řemeslník', /* i18n-exempt */
    undo_zustand: 'Stav vrácen', /* i18n-exempt */
    rueckgabe_ok: 'Vrácení zaznamenáno', /* i18n-exempt */
    wartung_ok: 'Údržba dokončena', /* i18n-exempt */
    wartung_action: 'Dokončit údržbu', /* i18n-exempt */
    rueckgabe_undo: 'Zpět', /* i18n-exempt */
    maintenance_add: '+ Údržba', /* i18n-exempt */
    empty_app_head: 'Nastavit správu nástrojů', /* i18n-exempt */
    empty_app_sub: 'Přidejte první nástroj a začněte sledovat půjčky.', /* i18n-exempt */
    empty_app_btn: 'Přidat první nástroj', /* i18n-exempt */
    overdue: 'po termínu', /* i18n-exempt */
    zurueck: '✓ Vrátit', /* i18n-exempt */
    abschliessen: '✓ Dokončit',
    bis: '· to', /* i18n-exempt */
  },
}); /* i18n-exempt */

// Columns derived INSIDE the component so labels are locale-aware
function buildColumns(): KanbanColumn[] {
  return (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
  }));
}

function toneForZustand(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt' || key === 'ausgemustert') return 'destructive';
  return 'default';
}

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

export default function DashboardOverview() {
  const {
    handwerker, setHandwerker,
    werkzeuge, setWerkzeuge,
    ausleihe, setAusleihe,
    wartungReparatur, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [editWerkzeug, setEditWerkzeug] = useState<Werkzeuge | null>(null);

  const [ausleiheDialog, setAusleiheDialog] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [editAusleihe, setEditAusleihe] = useState<Ausleihe | null>(null);

  const [wartungDialog, setWartungDialog] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [editWartung, setEditWartung] = useState<WartungReparatur | null>(null);

  const [handwerkerDialog, setHandwerkerDialog] = useState(false);
  const [editHandwerker, setEditHandwerker] = useState<Handwerker | null>(null);

  // Columns locale-aware (derived inside component body)
  const columns = useMemo(() => buildColumns(), []);

  const today = format(clock, 'yyyy-MM-dd');

  // KPIs
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'), [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen'), [werkzeuge]);
  const inService = useMemo(() => werkzeuge.filter(w => {
    const k = lookupKey(w.fields.zustand);
    return k === 'in_reparatur' || k === 'in_wartung';
  }), [werkzeuge]);
  const aktiveHandwerker = useMemo(() => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'), [handwerker]);

  // Überfällige Ausleihen (geplantes Rückgabedatum in der Vergangenheit, Status noch ausgeliehen)
  const ueberfaelligeAusleihen = useMemo(() => enrichedAusleihe.filter(a => {
    if (lookupKey(a.fields.status_ausleihe) !== 'ausgeliehen') return false;
    if (!a.fields.geplantes_rueckgabedatum) return false;
    try {
      return isBefore(parseISO(a.fields.geplantes_rueckgabedatum), startOfDay(clock));
    } catch { return false; }
  }), [enrichedAusleihe, clock]);

  // Aktive Ausleihen
  const aktiveAusleihen = useMemo(() => enrichedAusleihe.filter(a =>
    lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'
  ), [enrichedAusleihe]);

  // Laufende Wartungen
  const laufendeWartungen = useMemo(() => enrichedWartungReparatur.filter(w => {
    const k = lookupKey(w.fields.status_wartung);
    return k === 'in_bearbeitung' || k === 'geplant';
  }), [enrichedWartungReparatur]);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(() => werkzeuge.map(w => {
    const zustand = lookupKey(w.fields.zustand) ?? columns[0]?.key ?? '';
    return {
      id: `werkzeug:${w.record_id}`,
      column: zustand,
      title: w.fields.werkzeugname ?? '—',
      subtitle: [w.fields.inventarnummer, w.fields.hersteller].filter(Boolean).join(' · ') || undefined,
      tone: toneForZustand(zustand),
    };
  }), [werkzeuge, columns]);

  // Move card = Werkzeugzustand ändern (optimistisch)
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prev = werkzeuge.find(w => w.record_id === rid);
    if (!prev) return;
    const colLabel = columns.find(c => c.key === newColumn)?.label ?? newColumn;
    setWerkzeuge(ws => ws.map(w => w.record_id === rid
      ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: colLabel } } }
      : w
    ));
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
      undoToast(tt('undo_zustand') /* i18n-exempt */, async () => {
        const prevKey = lookupKey(prev.fields.zustand) ?? '';
        setWerkzeuge(ws => ws.map(w => w.record_id === rid
          ? { ...w, fields: { ...w.fields, zustand: prev.fields.zustand } }
          : w
        ));
        await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: prevKey });
      });
    } catch {
      fetchAll();
    }
  }, [werkzeuge, columns, setWerkzeuge, fetchAll]);

  // Rückgabe erfassen (Optimistisch)
  const rueckgabeErfassen = useCallback(async (a: EnrichedAusleihe) => {
    const prevStatus = a.fields.status_ausleihe;
    const prevRueckgabe = a.fields.tatsaechliches_rueckgabedatum;
    setAusleihe(prev => prev.map(x => x.record_id === a.record_id
      ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' /* i18n-exempt */ }, tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } }
      : x
    ));
    // Auch Werkzeug-Zustand auf verfügbar setzen
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    if (werkzeugId) {
      setWerkzeuge(ws => ws.map(w => w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' /* i18n-exempt */ } } }
        : w
      ));
    }
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm"),
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
      undoToast(tt('rueckgabe_ok'), async () => {
        setAusleihe(prev => prev.map(x => x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status_ausleihe: prevStatus, tatsaechliches_rueckgabedatum: prevRueckgabe } }
          : x
        ));
        await LivingAppsService.updateAusleiheEntry(a.record_id, {
          status_ausleihe: lookupKey(prevStatus) ?? 'ausgeliehen',
          tatsaechliches_rueckgabedatum: prevRueckgabe ?? undefined,
        });
        if (werkzeugId) {
          await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: lookupKey(werkzeuge.find(w => w.record_id === werkzeugId)?.fields.zustand) ?? 'ausgeliehen' });
        }
      });
    } catch {
      fetchAll();
    }
  }, [clock, setAusleihe, setWerkzeuge, fetchAll, werkzeuge]);

  // ─── All hooks ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Plain derivations below ───

  // Context line
  const borrowedNames = namen(aktiveAusleihen.map(a => a.handwerkerName));
  let contextLine: string;
  if (werkzeuge.length === 0) {
    contextLine = tt('ctx_none');
  } else if (inService.length > 0) {
    contextLine = tt('ctx_problem', { n: inService.length });
  } else if (aktiveAusleihen.length > 0) {
    contextLine = tt('ctx_borrowed', { n: aktiveAusleihen.length, who: borrowedNames });
  } else {
    contextLine = tt('ctx_none');
  }

  // Empty state
  if (werkzeuge.length === 0 && handwerker.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
        <div className="rounded-2xl bg-muted p-6">
          <IconTool size={48} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{tt('empty_app_head')}</h2>
          <p className="mt-1 text-muted-foreground">{tt('empty_app_sub')}</p>
        </div>
        <button
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setWerkzeugDefaults(undefined); setEditWerkzeug(null); setWerkzeugDialog(true); }}
        >
          {tt('empty_app_btn')}
        </button>
        <WerkzeugeDialog
          open={werkzeugDialog}
          onClose={() => setWerkzeugDialog(false)}
          onSubmit={async (fields) => { await LivingAppsService.createWerkzeugeEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
        />
      </div>
    );
  }

  const heroUeberfaellig = ueberfaelligeAusleihen.length > 0 ? ueberfaelligeAusleihen[0] : null;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{gruss(clock)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            onClick={() => { setEditHandwerker(null); setHandwerkerDialog(true); }}
          >
            <IconUser size={16} className="shrink-0" />
            <span className="hidden sm:inline">{tt('btn_handwerker')}</span>
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
            onClick={() => { setAusleiheDefaults(undefined); setEditAusleihe(null); setAusleiheDialog(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            <span className="hidden sm:inline">{tt('btn_ausleihe')}</span>
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => { setWerkzeugDefaults(undefined); setEditWerkzeug(null); setWerkzeugDialog(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            <span className="hidden sm:inline">{tt('btn_werkzeug')}</span>
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroUeberfaellig ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => rueckgabeErfassen(heroUeberfaellig),
            }}
          >
            <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName))}</b>{' '}
            {tt('hero_ueberfaellig', { n: ueberfaelligeAusleihen.length, who: namen(ueberfaelligeAusleihen.map(a => a.handwerkerName)) })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_verfuegbar')}
              value={verfuegbar.length}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_ausgeliehen')}
              value={aktiveAusleihen.length}
              tone={aktiveAusleihen.length > 0 ? 'primary' : 'default'}
              onClick={() => overlay.replace({ type: 'ausleihe', id: aktiveAusleihen[0]?.record_id ?? '' })}
            />
            <StatStripItem
              title={tt('kpi_wartung')}
              value={inService.length}
              tone={inService.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_handwerker')}
              value={aktiveHandwerker.length}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={columns}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => overlay.replace({ type: 'werkzeug', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveCard}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setEditWerkzeug(null);
              setWerkzeugDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('list_ausleihe')}
              items={aktiveAusleihen.slice(0, 8).map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-foreground">{a.handwerkerName}</span>
                    {a.fields.geplantes_rueckgabedatum && (
                      <span className="text-muted-foreground"> {tt('bis')} {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                    )}
                    {ueberfaelligeAusleihen.some(u => u.record_id === a.record_id) && (
                      <span className="ml-1 font-medium text-destructive">{tt('overdue')}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('zurueck'),
                  onClick: () => rueckgabeErfassen(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('empty_ausleihe'),
                action: { label: tt('btn_ausleihe'), onClick: () => { setAusleiheDefaults(undefined); setEditAusleihe(null); setAusleiheDialog(true); } },
              }}
            />
            <WorkList
              title={tt('list_wartung')}
              items={laufendeWartungen.slice(0, 6).map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-foreground">{w.fields.vorgangsart?.label}</span>
                    {w.verantwortlicherName && (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                    )}
                    {w.fields.geplantes_enddatum && (
                      <span className="text-muted-foreground"> {tt('bis')} {formatDate(w.fields.geplantes_enddatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('abschliessen'),
                  onClick: async () => {
                    const prev = w.fields.status_wartung;
                    setWartungReparatur(prev2 => prev2.map(x => x.record_id === w.record_id
                      ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' /* i18n-exempt */ }, tatsaechliches_enddatum: today } }
                      : x
                    ));
                    try {
                      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: today });
                      undoToast(tt('wartung_ok'), async () => {
                        setWartungReparatur(prev2 => prev2.map(x => x.record_id === w.record_id
                          ? { ...x, fields: { ...x.fields, status_wartung: prev, tatsaechliches_enddatum: w.fields.tatsaechliches_enddatum } }
                          : x
                        ));
                        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: lookupKey(prev) ?? 'in_bearbeitung', tatsaechliches_enddatum: w.fields.tatsaechliches_enddatum });
                      });
                    } catch { fetchAll(); }
                  },
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung', id })}
              empty={{
                text: tt('empty_wartung'),
                action: { label: tt('maintenance_add'), onClick: () => { setWartungDefaults(undefined); setEditWartung(null); setWartungDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlay Stack — ONE host for the whole page */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={rec.fields.werkzeugname ?? '—'}
                  subtitle={rec.fields.zustand?.label}
                  badges={<span className="text-xs text-muted-foreground">{rec.fields.inventarnummer}</span>}
                />
                <WerkzeugeDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ werkzeug: rec.record_id }); setEditAusleihe(null); setAusleiheDialog(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ werkzeug_wartung: rec.record_id }); setEditWartung(null); setWartungDialog(true); }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (!rec) return null;
            const enriched = enrichedAusleihe.find(a => a.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.werkzeugName ?? '—'}
                  subtitle={rec.fields.status_ausleihe?.label}
                  badges={<span className="text-xs text-muted-foreground">{enriched?.handwerkerName}</span>}
                />
                <AusleiheDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (!rec) return null;
            const enriched = enrichedWartungReparatur.find(w => w.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.werkzeug_wartungName ?? '—'}
                  subtitle={rec.fields.vorgangsart?.label}
                  badges={<span className="text-xs text-muted-foreground">{rec.fields.status_wartung?.label}</span>}
                />
                <WartungReparaturDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={`${rec.fields.vorname ?? ''} ${rec.fields.nachname ?? ''}`.trim() || '—'}
                  subtitle={rec.fields.qualifikation?.label}
                  badges={<span className="text-xs text-muted-foreground">{rec.fields.abteilung}</span>}
                />
                <HandwerkerDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ handwerker: rec.record_id }); setEditAusleihe(null); setAusleiheDialog(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ verantwortlicher: rec.record_id }); setEditWartung(null); setWartungDialog(true); }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (rec && lookupKey(rec.fields.status_ausleihe) === 'ausgeliehen') {
              const enriched = enrichedAusleihe.find(a => a.record_id === top.id);
              if (enriched) return { label: tt('hero_action'), onClick: () => { rueckgabeErfassen(enriched); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            const k = lookupKey(rec?.fields.status_wartung);
            if (k === 'in_bearbeitung' || k === 'geplant') {
              return {
                label: tt('wartung_action'),
                onClick: async () => {
                  if (!rec) return;
                  const prev = rec.fields.status_wartung;
                  setWartungReparatur(prev2 => prev2.map(x => x.record_id === rec.record_id
                    ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' /* i18n-exempt */ }, tatsaechliches_enddatum: today } }
                    : x
                  ));
                  overlay.close();
                  try {
                    await LivingAppsService.updateWartungReparaturEntry(rec.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: today });
                    undoToast(tt('wartung_ok'), async () => {
                      setWartungReparatur(prev2 => prev2.map(x => x.record_id === rec.record_id
                        ? { ...x, fields: { ...x.fields, status_wartung: prev, tatsaechliches_enddatum: rec.fields.tatsaechliches_enddatum } }
                        : x
                      ));
                      await LivingAppsService.updateWartungReparaturEntry(rec.record_id, { status_wartung: lookupKey(prev) ?? 'in_bearbeitung', tatsaechliches_enddatum: rec.fields.tatsaechliches_enddatum });
                    });
                  } catch { fetchAll(); }
                },
              };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (rec) { setEditWerkzeug(rec); setWerkzeugDefaults(undefined); setWerkzeugDialog(true); }
          } else if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (rec) { setEditAusleihe(rec); setAusleiheDefaults(undefined); setAusleiheDialog(true); }
          } else if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (rec) { setEditWartung(rec); setWartungDefaults(undefined); setWartungDialog(true); }
          } else if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (rec) { setEditHandwerker(rec); setHandwerkerDialog(true); }
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => { setWerkzeugDialog(false); setEditWerkzeug(null); setWerkzeugDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editWerkzeug) {
            await LivingAppsService.updateWerkzeugeEntry(editWerkzeug.record_id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editWerkzeug ? editWerkzeug.fields : werkzeugDefaults}
        recordId={editWerkzeug?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => { setAusleiheDialog(false); setEditAusleihe(null); setAusleiheDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editAusleihe) {
            await LivingAppsService.updateAusleiheEntry(editAusleihe.record_id, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAusleihe ? editAusleihe.fields : ausleiheDefaults}
        recordId={editAusleihe?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog}
        onClose={() => { setWartungDialog(false); setEditWartung(null); setWartungDefaults(undefined); }}
        onSubmit={async (fields) => {
          if (editWartung) {
            await LivingAppsService.updateWartungReparaturEntry(editWartung.record_id, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editWartung ? editWartung.fields : wartungDefaults}
        recordId={editWartung?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialog}
        onClose={() => { setHandwerkerDialog(false); setEditHandwerker(null); }}
        onSubmit={async (fields) => {
          if (editHandwerker) {
            await LivingAppsService.updateHandwerkerEntry(editHandwerker.record_id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editHandwerker?.fields}
        recordId={editHandwerker?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
