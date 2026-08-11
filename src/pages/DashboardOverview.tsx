import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Ausleihe, WartungReparatur, Werkzeuge, Handwerker } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { makeT, fieldLabel, appLabel } from '@/i18n';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconTool,
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconUsers,
  IconBox,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    greeting_context: 'Elektro-Werkzeugmanagement im Überblick.',
    verfuegbar: 'Verfügbar',
    ausgeliehen: 'Ausgeliehen',
    in_service: 'In Service',
    defekt: 'Defekt / Ausgemustert',
    ueberfaellig: 'Überfällige Rückgaben',
    aktive_handwerker: 'Aktive Handwerker',
    offene_wartung: 'Offene Wartungen',
    ausleihe_zurueck: 'Rückgabe buchen',
    neue_ausleihe: 'Neue Ausleihe',
    neues_werkzeug: 'Neues Werkzeug',
    neuer_handwerker: 'Neuer Handwerker',
    neue_wartung: 'Neue Wartung',
    ueberfaellig_banner: '{n} Rückgabe überfällig — sofort zurückfordern',
    ueberfaellig_banner_multi: '{n} Rückgaben überfällig — sofort zurückfordern',
    rueckgabe_gebucht: 'Rückgabe gebucht',
    rueckgabe_rueckgaengig: 'Rückgabe rückgängig gemacht',
    werkzeug_bestand: 'Werkzeugbestand nach Kategorie',
    wartung_pipeline: 'Wartung & Reparatur',
    aktuelle_ausleihen: 'Aktuelle Ausleihen',
    naechste_faellig: 'Nächste Fälligkeit',
    alle_puenktlich: 'Alle Rückgaben im Plan',
    kein_werkzeug: 'Noch keine Werkzeuge',
    kein_werkzeug_text: 'Nimm das erste Werkzeug der Elektroabteilung auf.',
    abschliessen: 'Abschließen',
    wartung_abgeschlossen: 'Wartung abgeschlossen',
    erstes_werkzeug: 'Erstes Werkzeug aufnehmen',
  },
  en: {
    greeting_context: 'Electrical tool management overview.',
    verfuegbar: 'Available',
    ausgeliehen: 'Checked out',
    in_service: 'In service',
    defekt: 'Defective / Retired',
    ueberfaellig: 'Overdue returns',
    aktive_handwerker: 'Active craftsmen',
    offene_wartung: 'Open maintenance',
    ausleihe_zurueck: 'Return tool',
    neue_ausleihe: 'New loan',
    neues_werkzeug: 'New tool',
    neuer_handwerker: 'New craftsman',
    neue_wartung: 'New maintenance',
    ueberfaellig_banner: '{n} return overdue — follow up immediately',
    ueberfaellig_banner_multi: '{n} returns overdue — follow up immediately',
    rueckgabe_gebucht: 'Return recorded',
    rueckgabe_rueckgaengig: 'Return undone',
    werkzeug_bestand: 'Tool stock by category',
    wartung_pipeline: 'Maintenance & Repair',
    aktuelle_ausleihen: 'Current loans',
    naechste_faellig: 'Next due',
    alle_puenktlich: 'All returns on schedule',
    kein_werkzeug: 'No tools yet',
    kein_werkzeug_text: 'Add the first tool to the electrical department.',
    abschliessen: 'Complete',
    wartung_abgeschlossen: 'Maintenance completed',
    erstes_werkzeug: 'Add first tool',
  },
});


function toneForZustand(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt' || key === 'ausgemustert') return 'destructive';
  return 'default';
}

// Overlay item union
type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

export default function DashboardOverview() {
  const {
    handwerker, werkzeuge, ausleihe, wartungReparatur,
    setWerkzeuge, setAusleihe,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  // Columns derived inside component body — locale-aware labels
  const WERKZEUG_COLUMNS: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [werkzeugEditId, setWerkzeugEditId] = useState<string | undefined>();

  const [ausleiheDialog, setAusleiheDialog] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [ausleiheEditId, setAusleiheEditId] = useState<string | undefined>();

  const [wartungDialog, setWartungDialog] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [wartungEditId, setWartungEditId] = useState<string | undefined>();

  const [handwerkerDialog, setHandwerkerDialog] = useState(false);
  const [handwerkerDefaults, setHandwerkerDefaults] = useState<HandwerkerDialogDefaults | undefined>();
  const [handwerkerEditId, setHandwerkerEditId] = useState<string | undefined>();

  // Overlay
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Kanban cards: Werkzeuge by Zustand
  const kanbanCards = useMemo<KanbanCard[]>(
    () =>
      werkzeuge.map(w => {
        const zustand = lookupKey(w.fields.zustand) ?? WERKZEUG_COLUMNS[0]?.key ?? '';
        // find active ausleihe to show borrower name
        const aktiveAusleihe = enrichedAusleihe.find(
          a => extractRecordId(a.fields.werkzeug) === w.record_id && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'
        );
        return {
          id: `werkzeug:${w.record_id}`,
          column: zustand,
          title: w.fields.werkzeugname ?? '—',
          subtitle: aktiveAusleihe
            ? aktiveAusleihe.handwerkerName
            : w.fields.standort ?? w.fields.hersteller,
          tone: toneForZustand(zustand),
        };
      }),
    [werkzeuge, enrichedAusleihe],
  );

  // Überfällige Ausleihen (geplantes_rueckgabedatum < now AND status == ausgeliehen)
  const todayStr = format(clock, 'yyyy-MM-dd');
  const ueberfaelligeAusleihen = useMemo(
    () =>
      enrichedAusleihe.filter(a => {
        if (lookupKey(a.fields.status_ausleihe) !== 'ausgeliehen') return false;
        const due = a.fields.geplantes_rueckgabedatum;
        if (!due) return false;
        return due.slice(0, 10) < todayStr;
      }),
    [enrichedAusleihe, todayStr],
  );

  // KPIs
  const verfuegbarCount = werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length;
  const ausgeliehenCount = werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length;
  const inServiceCount = werkzeuge.filter(w =>
    ['in_reparatur', 'in_wartung'].includes(lookupKey(w.fields.zustand) ?? '')
  ).length;
  const aktiveHandwerker = handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv').length;
  const offeneWartungen = wartungReparatur.filter(w =>
    ['geplant', 'in_bearbeitung'].includes(lookupKey(w.fields.status_wartung) ?? '')
  ).length;

  // Rückgabe buchen (quick return)
  const returnTool = useCallback(
    async (a: EnrichedAusleihe) => {
      const prev = a.fields.status_ausleihe;
      const prevZustand = werkzeugeMap.get(extractRecordId(a.fields.werkzeug) ?? '')?.fields.zustand;
      // Optimistic
      setAusleihe(list =>
        list.map(x =>
          x.record_id === a.record_id
            ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' }, tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } }
            : x
        )
      );
      const wid = extractRecordId(a.fields.werkzeug);
      if (wid) {
        setWerkzeuge(list =>
          list.map(x =>
            x.record_id === wid
              ? { ...x, fields: { ...x.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
              : x
          )
        );
      }
      undoToast(tt('rueckgabe_gebucht'), async () => {
        // undo
        setAusleihe(list =>
          list.map(x =>
            x.record_id === a.record_id
              ? { ...x, fields: { ...x.fields, status_ausleihe: prev, tatsaechliches_rueckgabedatum: undefined } }
              : x
          )
        );
        if (wid) {
          setWerkzeuge(list =>
            list.map(x =>
              x.record_id === wid
                ? { ...x, fields: { ...x.fields, zustand: prevZustand } }
                : x
            )
          );
        }
        try {
          await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
          if (wid && prevZustand) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: lookupKey(prevZustand) });
        } catch { fetchAll(); }
      });
      try {
        await LivingAppsService.updateAusleiheEntry(a.record_id, {
          status_ausleihe: 'zurueckgegeben',
          tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm"),
        });
        if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: 'verfuegbar' });
      } catch { fetchAll(); }
    },
    [clock, setAusleihe, setWerkzeuge, werkzeugeMap, fetchAll],
  );

  // Kanban drag — update Zustand
  const moveWerkzeug = useCallback(
    async (cardId: string, newColumn: string) => {
      const wid = cardId.split(':')[1];
      if (!wid) return;
      const label = WERKZEUG_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wid
            ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label } } }
            : w
        )
      );
      try {
        await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: newColumn });
        undoToast(`${label}`, undefined);
      } catch { fetchAll(); }
    },
    [setWerkzeuge, fetchAll],
  );

  // ─── All hooks above this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Overlay helpers after early returns (plain derivations only)
  const topItem = overlay.top;
  const currentWerkzeug = topItem?.type === 'werkzeug' ? werkzeuge.find(w => w.record_id === topItem.id) : undefined;
  const currentAusleihe = topItem?.type === 'ausleihe' ? ausleihe.find(a => a.record_id === topItem.id) : undefined;
  const currentWartung = topItem?.type === 'wartung' ? wartungReparatur.find(w => w.record_id === topItem.id) : undefined;
  const currentHandwerker = topItem?.type === 'handwerker' ? handwerker.find(h => h.record_id === topItem.id) : undefined;

  // Context line
  const aktuelleAusleiheNamen = namen(enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen').map(a => a.handwerkerName));

  // Empty state
  if (werkzeuge.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <IconBox size={48} className="text-muted-foreground" stroke={1.5} />
        <h2 className="text-xl font-semibold">{tt('kein_werkzeug')}</h2>
        <p className="text-muted-foreground max-w-xs">{tt('kein_werkzeug_text')}</p>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setWerkzeugDefaults(undefined); setWerkzeugEditId(undefined); setWerkzeugDialog(true); }}
        >
          <IconPlus size={16} className="shrink-0" />
          {tt('erstes_werkzeug')}
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

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {aktuelleAusleiheNamen
              ? `${ausgeliehenCount} ${tt('ausgeliehen').toLowerCase()}: ${aktuelleAusleiheNamen}.`
              : tt('greeting_context')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setHandwerkerDefaults(undefined); setHandwerkerEditId(undefined); setHandwerkerDialog(true); }}
          >
            <IconUsers size={14} className="shrink-0" />
            {tt('neuer_handwerker')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setWartungDefaults(undefined); setWartungEditId(undefined); setWartungDialog(true); }}
          >
            <IconTool size={14} className="shrink-0" />
            {tt('neue_wartung')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialog(true); }}
          >
            <IconTool size={14} className="shrink-0" />
            {tt('neue_ausleihe')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => { setWerkzeugDefaults(undefined); setWerkzeugEditId(undefined); setWerkzeugDialog(true); }}
          >
            <IconPlus size={14} className="shrink-0" />
            {tt('neues_werkzeug')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeAusleihen.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('ausleihe_zurueck'),
                onClick: () => returnTool(ueberfaelligeAusleihen[0]),
              }}
            >
              <b>{namen(ueberfaelligeAusleihen.map(a => a.handwerkerName))}</b>
              {' '}— {ueberfaelligeAusleihen.length === 1
                ? tt('ueberfaellig_banner', { n: ueberfaelligeAusleihen.length })
                : tt('ueberfaellig_banner_multi', { n: ueberfaelligeAusleihen.length })}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('verfuegbar')}
              value={verfuegbarCount}
              icon={<IconCheck size={14} className="shrink-0" />}
              tone={verfuegbarCount > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tt('ausgeliehen')}
              value={ausgeliehenCount}
              icon={<IconTool size={14} className="shrink-0" />}
              tone={ausgeliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('in_service')}
              value={inServiceCount}
              icon={<IconTool size={14} className="shrink-0" />}
              tone={inServiceCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('offene_wartung')}
              value={offeneWartungen}
              tone={offeneWartungen > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('aktive_handwerker')}
              value={aktiveHandwerker}
              icon={<IconUsers size={14} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={kanbanCards}
            columns={WERKZEUG_COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => overlay.replace({ type: 'werkzeug', id: card.id.split(':')[1] ?? '' })}
            onCardMove={moveWerkzeug}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugEditId(undefined);
              setWerkzeugDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('ueberfaellig')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{a.handwerkerName}</span>
                    <span className="text-muted-foreground"> · {tt('naechste_faellig')}: {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: <span className="flex items-center gap-1"><IconCheck size={12} className="shrink-0" />{tt('ausleihe_zurueck')}</span>,
                  onClick: () => returnTool(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('alle_puenktlich'),
                action: {
                  label: tt('neue_ausleihe'),
                  onClick: () => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialog(true); },
                },
              }}
            />
            <ChartWidget
              title={tt('werkzeug_bestand')}
              rows={werkzeuge.map(w => ({ id: `werkzeug:${w.record_id}`, data: w }))}
              dimension={{ kind: 'category', accessor: r => r.data.fields.kategorie }}
              timeEnd={format(clock, "yyyy-MM-dd'T'HH:mm")}
            />
          </>
        }
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => setWerkzeugDialog(false)}
        defaultValues={werkzeugDefaults}
        recordId={werkzeugEditId}
        onSubmit={async (fields) => {
          if (werkzeugEditId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugEditId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => setAusleiheDialog(false)}
        defaultValues={ausleiheDefaults}
        recordId={ausleiheEditId}
        onSubmit={async (fields) => {
          if (ausleiheEditId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheEditId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog}
        onClose={() => setWartungDialog(false)}
        defaultValues={wartungDefaults}
        recordId={wartungEditId}
        onSubmit={async (fields) => {
          if (wartungEditId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungEditId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialog}
        onClose={() => setHandwerkerDialog(false)}
        defaultValues={handwerkerDefaults}
        recordId={handwerkerEditId}
        onSubmit={async (fields) => {
          if (handwerkerEditId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerEditId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      {/* Single overlay host for the whole overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const w = werkzeuge.find(x => x.record_id === top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={w.fields.inventarnummer}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                      {w.fields.zustand?.label ?? '—'}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ werkzeug: w.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', id: wr.record_id })}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: w.record_id });
                    setWartungEditId(undefined);
                    setWartungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = ausleihe.find(x => x.record_id === top.id);
            if (!a) return null;
            const ea = enrichedAusleihe.find(x => x.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={ea?.werkzeugName ?? '—'}
                  subtitle={ea?.handwerkerName}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                      {a.fields.status_ausleihe?.label ?? '—'}
                    </span>
                  }
                />
                <AusleiheDetails
                  record={a}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const wr = wartungReparatur.find(x => x.record_id === top.id);
            if (!wr) return null;
            const ewr = enrichedWartungReparatur.find(x => x.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={ewr?.werkzeug_wartungName ?? '—'}
                  subtitle={wr.fields.vorgangsart?.label}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                      {wr.fields.status_wartung?.label ?? '—'}
                    </span>
                  }
                />
                <WartungReparaturDetails
                  record={wr}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = handwerker.find(x => x.record_id === top.id);
            if (!h) return null;
            return (
              <>
                <RecordHeader
                  title={`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || '—'}
                  subtitle={h.fields.qualifikation?.label}
                  badges={
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                      {h.fields.status?.label ?? '—'}
                    </span>
                  }
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ handwerker: h.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', id: wr.record_id })}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: h.record_id });
                    setWartungEditId(undefined);
                    setWartungDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const a = ausleihe.find(x => x.record_id === top.id);
            if (a && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              const ea = enrichedAusleihe.find(x => x.record_id === top.id);
              if (ea) {
                return {
                  label: tt('ausleihe_zurueck'),
                  onClick: () => { returnTool(ea); overlay.close(); },
                };
              }
            }
          }
          if (top.type === 'wartung') {
            const wr = wartungReparatur.find(x => x.record_id === top.id);
            if (wr && lookupKey(wr.fields.status_wartung) === 'in_bearbeitung') {
              return {
                label: `✓ ${tt('abschliessen')}`,
                onClick: async () => {
                  const prev = wr.fields.status_wartung;
                  setWerkzeuge(prev => prev.map(w =>
                    w.record_id === (extractRecordId(wr.fields.werkzeug_wartung) ?? '')
                      ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
                      : w
                  ));
                  overlay.close();
                  undoToast(tt('wartung_abgeschlossen'), async () => {
                    try {
                      await LivingAppsService.updateWartungReparaturEntry(wr.record_id, { status_wartung: lookupKey(prev) });
                    } catch { fetchAll(); }
                  });
                  try {
                    await LivingAppsService.updateWartungReparaturEntry(wr.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: format(clock, 'yyyy-MM-dd') });
                    const wid = extractRecordId(wr.fields.werkzeug_wartung);
                    if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: 'verfuegbar' });
                    fetchAll();
                  } catch { fetchAll(); }
                },
              };
            }
          }
          return undefined;
        }}
      />
    </>
  );
}
