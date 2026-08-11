import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isBefore } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { makeT, appLabel } from '@/i18n';
import {
  IconTool,
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconPackage,
  IconPlus,
  IconUsers,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    greeting_context: 'Werkzeugmanagement für die Elektroabteilung.',
    overdue_banner: '{n} Ausleihe(n) mit überfälliger Rückgabe',
    overdue_action: 'Zurückgabe erfassen',
    stat_available: 'Verfügbar',
    stat_loaned: 'Ausgeliehen',
    stat_service: 'In Wartung/Reparatur',
    stat_defect: 'Defekt',
    list_active_loans: 'Aktive Ausleihen',
    list_open_service: 'Offene Wartungen & Reparaturen',
    empty_loans: 'Keine aktiven Ausleihen — alle Werkzeuge verfügbar',
    empty_service: 'Keine offenen Wartungen oder Reparaturen',
    return_loan: '✓ Zurückgegeben',
    add_tool: 'Werkzeug aufnehmen',
    add_loan: 'Ausleihe starten',
    add_handwerker: 'Handwerker anlegen',
    add_service: 'Wartung/Reparatur',
    complete_service: '✓ Abgeschlossen',
    empty_tools: 'Noch keine Werkzeuge erfasst',
    empty_tools_sub: 'Erfasse dein erstes Werkzeug um loszulegen.',
  },
  en: {
    greeting_context: 'Tool management for the electrical department.',
    overdue_banner: '{n} loan(s) with overdue return',
    overdue_action: 'Record return',
    stat_available: 'Available',
    stat_loaned: 'On loan',
    stat_service: 'In maintenance/repair',
    stat_defect: 'Defective',
    list_active_loans: 'Active loans',
    list_open_service: 'Open maintenance & repairs',
    empty_loans: 'No active loans — all tools available',
    empty_service: 'No open maintenance or repairs',
    return_loan: '✓ Returned',
    add_tool: 'Add tool',
    add_loan: 'Start loan',
    add_handwerker: 'Add craftsman',
    add_service: 'Maintenance/repair',
    complete_service: '✓ Completed',
    empty_tools: 'No tools recorded yet',
    empty_tools_sub: 'Record your first tool to get started.',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'handwerker'; id: string }
  | { type: 'wartung'; id: string };

function zustandTone(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt') return 'destructive';
  return 'default';
}

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
  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartung = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>(undefined);
  const [editingWerkzeugId, setEditingWerkzeugId] = useState<string | undefined>(undefined);

  const [ausleiheDialog, setAusleiheDialog] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>(undefined);
  const [editingAusleiheId, setEditingAusleiheId] = useState<string | undefined>(undefined);

  const [handwerkerDialog, setHandwerkerDialog] = useState(false);
  const [handwerkerDefaults, setHandwerkerDefaults] = useState<HandwerkerDialogDefaults | undefined>(undefined);
  const [editingHandwerkerId, setEditingHandwerkerId] = useState<string | undefined>(undefined);

  const [wartungDialog, setWartungDialog] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>(undefined);
  const [editingWartungId, setEditingWartungId] = useState<string | undefined>(undefined);

  // KPI derivations
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'), [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen'), [werkzeuge]);
  const inService = useMemo(() => werkzeuge.filter(w => {
    const k = lookupKey(w.fields.zustand);
    return k === 'in_reparatur' || k === 'in_wartung';
  }), [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'), [werkzeuge]);

  // Overdue loans: status=ausgeliehen AND geplantes_rueckgabedatum < now
  const today = format(clock, 'yyyy-MM-dd');
  const ueberfaellig = useMemo(() => enrichedAusleihe.filter(a => {
    if (lookupKey(a.fields.status_ausleihe) !== 'ausgeliehen') return false;
    if (!a.fields.geplantes_rueckgabedatum) return false;
    return isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock);
  }), [enrichedAusleihe, clock]);

  // Active loans (currently checked out, not overdue)
  const activeLoans = useMemo(() =>
    enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  // Open maintenance/repair
  const openService = useMemo(() =>
    enrichedWartung.filter(w => {
      const k = lookupKey(w.fields.status_wartung);
      return k === 'geplant' || k === 'in_bearbeitung';
    }),
    [enrichedWartung],
  );

  // Return a loan (optimistic)
  const returnLoan = useCallback(async (loan: EnrichedAusleihe) => {
    const prev = [...ausleihe];
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(p => p.map(a => a.record_id === loan.record_id
      ? { ...a, fields: { ...a.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' }, tatsaechliches_rueckgabedatum: now } }
      : a,
    ));
    // Also update werkzeug zustand back to verfuegbar
    const wId = extractRecordId(loan.fields.werkzeug);
    if (wId) {
      setWerkzeuge(p => p.map(w => w.record_id === wId
        ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
        : w,
      ));
    }
    try {
      await LivingAppsService.updateAusleiheEntry(loan.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: now,
      });
      if (wId) {
        await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      }
      undoToast(`${loan.werkzeugName} zurückgegeben`, async () => {
        setAusleihe(prev);
        await LivingAppsService.updateAusleiheEntry(loan.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
        if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'ausgeliehen' });
      });
    } catch {
      await fetchAll();
    }
  }, [ausleihe, clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Complete a service (optimistic)
  const completeService = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = [...wartungReparatur];
    const now = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(p => p.map(r => r.record_id === w.record_id
      ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' }, tatsaechliches_enddatum: now } }
      : r,
    ));
    const wId = extractRecordId(w.fields.werkzeug_wartung);
    if (wId) {
      setWerkzeuge(p => p.map(wz => wz.record_id === wId
        ? { ...wz, fields: { ...wz.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
        : wz,
      ));
    }
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: now,
      });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      undoToast(`${w.werkzeug_wartungName} — Vorgang abgeschlossen`, async () => {
        setWartungReparatur(prev);
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
      });
    } catch {
      await fetchAll();
    }
  }, [wartungReparatur, clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  // Kanban columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Map werkzeuge → Kanban cards
  const cards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const status = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.werkzeugname ?? '—',
        subtitle: [w.fields.kategorie?.label, w.fields.inventarnummer].filter(Boolean).join(' · '),
        tone: zustandTone(status),
      };
    }),
    [werkzeuge],
  );

  // Drag: change Werkzeug zustand
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prevWerkzeuge = [...werkzeuge];
    const label = LOOKUP_OPTIONS['werkzeuge']?.['zustand']?.find(o => o.key === newColumn)?.label ?? newColumn;
    setWerkzeuge(p => p.map(w => w.record_id === rid
      ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label } } }
      : w,
    ));
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
      undoToast(`Zustand geändert auf „${label}"`, async () => {
        setWerkzeuge(prevWerkzeuge);
        const prev = prevWerkzeuge.find(w => w.record_id === rid);
        if (prev) await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: lookupKey(prev.fields.zustand) });
      });
    } catch {
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll, COLUMNS]);

  // ─── early returns AFTER all hooks ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Overlay record resolution
  const topItem = overlay.top;
  const overlayWerkzeug = topItem?.type === 'werkzeug' ? werkzeuge.find(w => w.record_id === topItem.id) : undefined;
  const overlayAusleihe = topItem?.type === 'ausleihe' ? ausleihe.find(a => a.record_id === topItem.id) : undefined;
  const overlayHandwerker = topItem?.type === 'handwerker' ? handwerker.find(h => h.record_id === topItem.id) : undefined;
  const overlayWartung = topItem?.type === 'wartung' ? wartungReparatur.find(w => w.record_id === topItem.id) : undefined;

  // Hero: overdue loans
  const heroBanner = ueberfaellig.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: tt('overdue_action'),
        onClick: () => {
          const first = ueberfaellig[0];
          if (first) void returnLoan(first);
        },
      }}
    >
      <b>{namen(ueberfaellig.map(a => a.werkzeugName))}</b>{' '}
      {tt('overdue_banner', { n: ueberfaellig.length })} — geplante Rückgabe war{' '}
      {formatDate(ueberfaellig[0]?.fields.geplantes_rueckgabedatum)}.
    </HeroBanner>
  ) : undefined;

  // Context line
  const contextLine = (() => {
    const names: string[] = [];
    if (ueberfaellig.length > 0) {
      names.push(...ueberfaellig.map(a => a.handwerkerName).filter(Boolean));
    } else if (activeLoans.length > 0) {
      names.push(...activeLoans.slice(0, 3).map(a => a.handwerkerName).filter(Boolean));
    }
    if (names.length > 0) {
      return `${gruss(clock)} ${namen(names)} ${activeLoans.length > 0 ? `hat/haben ${activeLoans.length} aktive Ausleihe(n).` : ''}`;
    }
    return `${gruss(clock)} ${tt('greeting_context')}`;
  })();

  // Empty state
  if (werkzeuge.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <IconPackage size={48} className="text-muted-foreground" />
        <div>
          <h2 className="text-xl font-semibold mb-2">{tt('empty_tools')}</h2>
          <p className="text-muted-foreground">{tt('empty_tools_sub')}</p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            onClick={() => { setWerkzeugDefaults(undefined); setEditingWerkzeugId(undefined); setWerkzeugDialog(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('add_tool')}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            onClick={() => { setHandwerkerDefaults(undefined); setEditingHandwerkerId(undefined); setHandwerkerDialog(true); }}
          >
            <IconUsers size={16} className="shrink-0" />
            {tt('add_handwerker')}
          </button>
        </div>
        <WerkzeugeDialog
          open={werkzeugDialog}
          onClose={() => setWerkzeugDialog(false)}
          recordId={editingWerkzeugId}
          defaultValues={werkzeugDefaults}
          onSubmit={async (fields) => {
            if (editingWerkzeugId) {
              await LivingAppsService.updateWerkzeugeEntry(editingWerkzeugId, fields);
            } else {
              await LivingAppsService.createWerkzeugeEntry(fields);
            }
            await fetchAll();
          }}
          enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
        />
        <HandwerkerDialog
          open={handwerkerDialog}
          onClose={() => setHandwerkerDialog(false)}
          recordId={editingHandwerkerId}
          defaultValues={handwerkerDefaults}
          onSubmit={async (fields) => {
            if (editingHandwerkerId) {
              await LivingAppsService.updateHandwerkerEntry(editingHandwerkerId, fields);
            } else {
              await LivingAppsService.createHandwerkerEntry(fields);
            }
            await fetchAll();
          }}
          enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{contextLine}</h1>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
            onClick={() => { setAusleiheDefaults(undefined); setEditingAusleiheId(undefined); setAusleiheDialog(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('add_loan')}
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            onClick={() => { setWerkzeugDefaults(undefined); setEditingWerkzeugId(undefined); setWerkzeugDialog(true); }}
          >
            <IconTool size={16} className="shrink-0" />
            {tt('add_tool')}
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            onClick={() => { setHandwerkerDefaults(undefined); setEditingHandwerkerId(undefined); setHandwerkerDialog(true); }}
          >
            <IconUsers size={16} className="shrink-0" />
            {tt('add_handwerker')}
          </button>
          <button
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted"
            onClick={() => { setWartungDefaults(undefined); setEditingWartungId(undefined); setWartungDialog(true); }}
          >
            <IconTool size={16} className="shrink-0" />
            {tt('add_service')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBanner}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('stat_available')}
              value={verfuegbar.length}
              icon={<IconCircleCheck size={16} />}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tt('stat_loaned')}
              value={ausgeliehen.length}
              icon={<IconPackage size={16} />}
              tone={ausgeliehen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('stat_service')}
              value={inService.length}
              icon={<IconTool size={16} />}
              tone={inService.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('stat_defect')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              if (id) overlay.replace({ type: 'werkzeug', id });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setEditingWerkzeugId(undefined);
              setWerkzeugDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('list_active_loans')}
              items={activeLoans.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{a.handwerkerName}</span>
                    {a.fields.geplantes_rueckgabedatum && (
                      <span className={`ml-1 ${ueberfaellig.some(u => u.record_id === a.record_id) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {' '}· bis {formatDate(a.fields.geplantes_rueckgabedatum)}
                      </span>
                    )}
                  </>
                ),
                action: {
                  label: tt('return_loan'),
                  onClick: () => void returnLoan(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('empty_loans'),
                action: {
                  label: tt('add_loan'),
                  onClick: () => { setAusleiheDefaults(undefined); setEditingAusleiheId(undefined); setAusleiheDialog(true); },
                },
              }}
            />
            <WorkList
              title={tt('list_open_service')}
              items={openService.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'text-warning' : 'text-primary'}`}>
                      {w.fields.vorgangsart?.label}
                    </span>
                    {w.verantwortlicherName && (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                    )}
                    {w.fields.geplantes_enddatum && (
                      <span className="text-muted-foreground"> · bis {formatDate(w.fields.geplantes_enddatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tt('complete_service'),
                  onClick: () => void completeService(w),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung', id })}
              empty={{
                text: tt('empty_service'),
                action: {
                  label: tt('add_service'),
                  onClick: () => { setWartungDefaults(undefined); setEditingWartungId(undefined); setWartungDialog(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => setWerkzeugDialog(false)}
        recordId={editingWerkzeugId}
        defaultValues={werkzeugDefaults}
        onSubmit={async (fields) => {
          if (editingWerkzeugId) {
            await LivingAppsService.updateWerkzeugeEntry(editingWerkzeugId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />
      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => setAusleiheDialog(false)}
        recordId={editingAusleiheId}
        defaultValues={ausleiheDefaults}
        onSubmit={async (fields) => {
          if (editingAusleiheId) {
            await LivingAppsService.updateAusleiheEntry(editingAusleiheId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          await fetchAll();
        }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />
      <HandwerkerDialog
        open={handwerkerDialog}
        onClose={() => setHandwerkerDialog(false)}
        recordId={editingHandwerkerId}
        defaultValues={handwerkerDefaults}
        onSubmit={async (fields) => {
          if (editingHandwerkerId) {
            await LivingAppsService.updateHandwerkerEntry(editingHandwerkerId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          await fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
      <WartungReparaturDialog
        open={wartungDialog}
        onClose={() => setWartungDialog(false)}
        recordId={editingWartungId}
        defaultValues={wartungDefaults}
        onSubmit={async (fields) => {
          if (editingWartungId) {
            await LivingAppsService.updateWartungReparaturEntry(editingWartungId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          await fetchAll();
        }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug' && overlayWerkzeug) {
            return (
              <>
                <RecordHeader
                  title={overlayWerkzeug.fields.werkzeugname ?? '—'}
                  subtitle={overlayWerkzeug.fields.kategorie?.label}
                  badges={<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    lookupKey(overlayWerkzeug.fields.zustand) === 'verfuegbar' ? 'bg-success/10 text-success' :
                    lookupKey(overlayWerkzeug.fields.zustand) === 'ausgeliehen' ? 'bg-primary/10 text-primary' :
                    lookupKey(overlayWerkzeug.fields.zustand) === 'defekt' ? 'bg-destructive/10 text-destructive' :
                    'bg-warning/10 text-warning'
                  }`}>{overlayWerkzeug.fields.zustand?.label}</span>}
                />
                <WerkzeugeDetails
                  record={overlayWerkzeug}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ werkzeug: overlayWerkzeug.record_id }); setEditingAusleiheId(undefined); setAusleiheDialog(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ werkzeug_wartung: overlayWerkzeug.record_id }); setEditingWartungId(undefined); setWartungDialog(true); }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe' && overlayAusleihe) {
            return (
              <>
                <RecordHeader
                  title={werkzeugeMap.get(extractRecordId(overlayAusleihe.fields.werkzeug) ?? '')?.fields.werkzeugname ?? '—'}
                  subtitle={overlayAusleihe.fields.status_ausleihe?.label}
                />
                <AusleiheDetails
                  record={overlayAusleihe}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker' && overlayHandwerker) {
            return (
              <>
                <RecordHeader
                  title={[overlayHandwerker.fields.vorname, overlayHandwerker.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={overlayHandwerker.fields.qualifikation?.label}
                />
                <HandwerkerDetails
                  record={overlayHandwerker}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ handwerker: overlayHandwerker.record_id }); setEditingAusleiheId(undefined); setAusleiheDialog(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ verantwortlicher: overlayHandwerker.record_id }); setEditingWartungId(undefined); setWartungDialog(true); }}
                />
              </>
            );
          }
          if (top.type === 'wartung' && overlayWartung) {
            return (
              <>
                <RecordHeader
                  title={werkzeugeMap.get(extractRecordId(overlayWartung.fields.werkzeug_wartung) ?? '')?.fields.werkzeugname ?? '—'}
                  subtitle={overlayWartung.fields.vorgangsart?.label}
                />
                <WartungReparaturDetails
                  record={overlayWartung}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeug', id: w.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && overlayAusleihe && lookupKey(overlayAusleihe.fields.status_ausleihe) === 'ausgeliehen') {
            return { label: tt('return_loan'), onClick: () => { void returnLoan(overlayAusleihe as EnrichedAusleihe); overlay.close(); } };
          }
          if (top.type === 'wartung' && overlayWartung) {
            const k = lookupKey(overlayWartung.fields.status_wartung);
            if (k === 'geplant' || k === 'in_bearbeitung') {
              const enrichedW = enrichedWartung.find(w => w.record_id === overlayWartung.record_id);
              if (enrichedW) return { label: tt('complete_service'), onClick: () => { void completeService(enrichedW); overlay.close(); } };
            }
          }
          if (top.type === 'werkzeug' && overlayWerkzeug) {
            return {
              label: `Bearbeiten`,
              onClick: () => {
                setWerkzeugDefaults({ zustand: lookupKey(overlayWerkzeug.fields.zustand) });
                setEditingWerkzeugId(overlayWerkzeug.record_id);
                setWerkzeugDialog(true);
              },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'ausleihe' && overlayAusleihe) {
            setAusleiheDefaults({
              werkzeug: extractRecordId(overlayAusleihe.fields.werkzeug) ?? undefined,
              handwerker: extractRecordId(overlayAusleihe.fields.handwerker) ?? undefined,
            });
            setEditingAusleiheId(overlayAusleihe.record_id);
            setAusleiheDialog(true);
          } else if (top.type === 'handwerker' && overlayHandwerker) {
            setHandwerkerDefaults({});
            setEditingHandwerkerId(overlayHandwerker.record_id);
            setHandwerkerDialog(true);
          } else if (top.type === 'wartung' && overlayWartung) {
            setWartungDefaults({
              werkzeug_wartung: extractRecordId(overlayWartung.fields.werkzeug_wartung) ?? undefined,
              verantwortlicher: extractRecordId(overlayWartung.fields.verantwortlicher) ?? undefined,
            });
            setEditingWartungId(overlayWartung.record_id);
            setWartungDialog(true);
          }
        }}
      />
    </>
  );
}
