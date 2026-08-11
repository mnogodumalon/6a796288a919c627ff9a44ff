import { useState, useMemo, useCallback } from 'react';
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
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import type { AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import type { WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format, parseISO, isBefore } from 'date-fns';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconPlus,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

const tt = makeT({
  de: {
    context_line: 'Werkzeugmanagement der Elektroabteilung',
    context_none: 'Alle Werkzeuge verfügbar — ruhiger Tag.',
    context_borrowed: '{n} Werkzeug ausgeliehen',
    context_borrowed_pl: '{n} Werkzeuge ausgeliehen',
    hero_title: '{n} Rückgabe überfällig',
    hero_title_pl: '{n} Rückgaben überfällig',
    hero_action: 'Rückgabe buchen',
    kpi_ausgeliehen: 'Ausgeliehen',
    kpi_verfuegbar: 'Verfügbar',
    kpi_wartung: 'In Wartung/Reparatur',
    kpi_handwerker: 'Handwerker',
    ueberfaellig: 'Überfällig',
    list_ueberfaellig: 'Überfällige Rückgaben',
    list_wartung: 'Laufende Wartungen',
    list_empty_ueberfaellig: 'Alle Rückgaben pünktlich',
    list_empty_wartung: 'Keine laufenden Wartungen',
    neue_wartung: 'Neue Wartung',
    new_ausleihe: 'Neue Ausleihe',
    new_werkzeug: 'Neues Werkzeug',
    ausleihe_board_title: 'Ausleih-Status',
    status_zurueck: 'Zurückgeben',
    returned_toast: '{name} zurückgegeben',
    undo_toast: 'Rückgängig',
    wartung_action: 'Abschließen',
    wartung_toast: 'Wartung abgeschlossen',
  },
  en: {
    context_line: 'Electrical department tool management',
    context_none: 'All tools available — quiet day.',
    context_borrowed: '{n} tool checked out',
    context_borrowed_pl: '{n} tools checked out',
    hero_title: '{n} return overdue',
    hero_title_pl: '{n} returns overdue',
    hero_action: 'Book return',
    kpi_ausgeliehen: 'Checked out',
    kpi_verfuegbar: 'Available',
    kpi_wartung: 'In maintenance/repair',
    kpi_handwerker: 'Craftsmen',
    ueberfaellig: 'Overdue',
    list_ueberfaellig: 'Overdue returns',
    list_wartung: 'Ongoing maintenance',
    list_empty_ueberfaellig: 'All returns on time',
    list_empty_wartung: 'No ongoing maintenance',
    neue_wartung: 'New maintenance',
    new_ausleihe: 'New loan',
    new_werkzeug: 'New tool',
    ausleihe_board_title: 'Loan status',
    status_zurueck: 'Return',
    returned_toast: '{name} returned',
    undo_toast: 'Undo',
    wartung_action: 'Complete',
    wartung_toast: 'Maintenance completed',
  },
});

// Overlay item type union
type OverlayItem =
  | { type: 'ausleihe'; id: string }
  | { type: 'werkzeuge'; id: string }
  | { type: 'handwerker'; id: string }
  | { type: 'wartung'; id: string };


function toneForAusleihe(status: string | undefined, isOverdue: boolean): KanbanTone {
  if (isOverdue) return 'destructive';
  if (status === 'zurueckgegeben') return 'success';
  return 'warning';
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
  const today = format(clock, 'yyyy-MM-dd');

  // Columns inside component body — labels are locale-aware getters
  const AUSLEIHE_COLUMNS: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['ausleihe']?.['status_ausleihe'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>(undefined);
  const [editAusleiheId, setEditAusleiheId] = useState<string | undefined>(undefined);

  const [werkzeugDialogOpen, setWerkzeugDialogOpen] = useState(false);
  const [editWerkzeugId, setEditWerkzeugId] = useState<string | undefined>(undefined);

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [editHandwerkerId, setEditHandwerkerId] = useState<string | undefined>(undefined);

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>(undefined);
  const [editWartungId, setEditWartungId] = useState<string | undefined>(undefined);

  // Derived data
  const ausgeliehenAusleihe = useMemo(
    () => enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  const ueberfaelligeAusleihe = useMemo(
    () => ausgeliehenAusleihe.filter(a =>
      a.fields.geplantes_rueckgabedatum &&
      isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock)
    ),
    [ausgeliehenAusleihe, clock]
  );

  const verfuegbareWerkzeuge = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'),
    [werkzeuge]
  );

  const inWartungWerkzeuge = useMemo(
    () => werkzeuge.filter(w => {
      const z = lookupKey(w.fields.zustand);
      return z === 'in_reparatur' || z === 'in_wartung';
    }),
    [werkzeuge]
  );

  const laufendeWartungen = useMemo(
    () => enrichedWartungReparatur.filter(w => {
      const s = lookupKey(w.fields.status_wartung);
      return s === 'geplant' || s === 'in_bearbeitung';
    }),
    [enrichedWartungReparatur]
  );

  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker]
  );

  // Kanban cards for Ausleihe
  const ausleiheCards = useMemo<KanbanCard[]>(
    () => enrichedAusleihe.map(a => {
      const status = lookupKey(a.fields.status_ausleihe) ?? AUSLEIHE_COLUMNS[0]?.key ?? '';
      const isOverdue = status === 'ausgeliehen' &&
        !!a.fields.geplantes_rueckgabedatum &&
        isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock);
      return {
        id: `ausleihe:${a.record_id}`,
        column: status,
        title: a.werkzeugName || a.fields.werkzeug || '—',
        subtitle: a.handwerkerName
          ? `${a.handwerkerName}${a.fields.geplantes_rueckgabedatum ? ' · bis ' + formatDateTime(a.fields.geplantes_rueckgabedatum) : ''}`
          : undefined,
        tone: toneForAusleihe(status, isOverdue),
      };
    }),
    [enrichedAusleihe, clock]
  );

  // Context line
  const contextLine = useMemo(() => {
    const n = ausgeliehenAusleihe.length;
    if (n === 0) return tt('context_none');
    const names = namen(ausgeliehenAusleihe.slice(0, 3).map(a => a.handwerkerName));
    const suffix = n === 1 ? tt('context_borrowed', { n }) : tt('context_borrowed_pl', { n });
    return `${suffix} — ${names}.`;
  }, [ausgeliehenAusleihe]);

  // Return a loan (optimistic)
  const returnAusleihe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = [...ausleihe];
    const returnTime = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(ausleihe.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' }, tatsaechliches_rueckgabedatum: returnTime } }
        : x
    ));
    undoToast(tt('returned_toast', { name: a.werkzeugName || '—' }), async () => {
      setAusleihe(prev);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: returnTime,
      });
      // Also update Werkzeug zustand to verfuegbar
      const werkzeugId = extractRecordId(a.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setAusleihe(prev);
      fetchAll();
    }
  }, [ausleihe, setAusleihe, clock, fetchAll]);

  // Complete a maintenance (optimistic)
  const completeWartung = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = [...wartungReparatur];
    const endDate = today;
    setWartungReparatur(wartungReparatur.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' }, tatsaechliches_enddatum: endDate } }
        : x
    ));
    undoToast(tt('wartung_toast'), async () => {
      setWartungReparatur(prev);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung' });
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: endDate,
      });
      const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setWartungReparatur(prev);
      fetchAll();
    }
  }, [wartungReparatur, setWartungReparatur, today, fetchAll]);

  // Kanban move handler
  const moveAusleiheCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const a = ausleihe.find(x => x.record_id === rid);
    if (!a) return;
    const prev = [...ausleihe];
    const colLabel = AUSLEIHE_COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    setAusleihe(ausleihe.map(x =>
      x.record_id === rid
        ? { ...x, fields: { ...x.fields, status_ausleihe: { key: newColumn, label: colLabel } } }
        : x
    ));
    undoToast(`Status auf "${colLabel}" gesetzt`, async () => {
      setAusleihe(prev);
      const oldKey = lookupKey(a.fields.status_ausleihe) ?? '';
      await LivingAppsService.updateAusleiheEntry(rid, { status_ausleihe: oldKey });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(rid, { status_ausleihe: newColumn });
      if (newColumn === 'zurueckgegeben') {
        const wId = extractRecordId(a.fields.werkzeug);
        if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      } else if (newColumn === 'ausgeliehen') {
        const wId = extractRecordId(a.fields.werkzeug);
        if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'ausgeliehen' });
      }
    } catch {
      setAusleihe(prev);
      fetchAll();
    }
  }, [ausleihe, setAusleihe, fetchAll]);

  // ─── hooks above ─── early returns below ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Helpers for overlay
  const getAusleihe = (id: string) => ausleihe.find(x => x.record_id === id);
  const getWerkzeug = (id: string) => werkzeuge.find(x => x.record_id === id);
  const getHandwerker = (id: string) => handwerker.find(x => x.record_id === id);
  const getWartung = (id: string) => wartungReparatur.find(x => x.record_id === id);

  const openAusleiheCreate = (defaults?: AusleiheDialogDefaults) => {
    setAusleiheDefaults(defaults);
    setEditAusleiheId(undefined);
    setAusleiheDialogOpen(true);
  };
  const openWartungCreate = (defaults?: WartungReparaturDialogDefaults, editId?: string) => {
    setWartungDefaults(defaults);
    setEditWartungId(editId);
    setWartungDialogOpen(true);
  };

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextLine}</p>
        </div>
        <Button onClick={() => openAusleiheCreate()} className="shrink-0">
          <IconPlus size={16} className="mr-2 shrink-0" />
          {tt('new_ausleihe')}
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeAusleihe.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tt('hero_action'),
                onClick: () => returnAusleihe(ueberfaelligeAusleihe[0]),
              }}
            >
              <b>{namen(ueberfaelligeAusleihe.map(a => a.werkzeugName))}</b>{' '}
              {ueberfaelligeAusleihe.length === 1
                ? tt('hero_title', { n: ueberfaelligeAusleihe.length })
                : tt('hero_title_pl', { n: ueberfaelligeAusleihe.length })}
              {' — '}geplante Rückgabe: {formatDateTime(ueberfaelligeAusleihe[0].fields.geplantes_rueckgabedatum)}.
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_ausgeliehen')}
              value={ausgeliehenAusleihe.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={ueberfaelligeAusleihe.length > 0 ? 'destructive' : ausgeliehenAusleihe.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_verfuegbar')}
              value={verfuegbareWerkzeuge.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone="success"
            />
            <StatStripItem
              title={tt('kpi_wartung')}
              value={inWartungWerkzeuge.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={inWartungWerkzeuge.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_handwerker')}
              value={aktiveHandwerker.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={AUSLEIHE_COLUMNS}
            cards={ausleiheCards}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              if (id) overlay.replace({ type: 'ausleihe', id });
            }}
            onCardMove={moveAusleiheCard}
            onAddCard={col => openAusleiheCreate({ status_ausleihe: col })}
            defaultCollapsed={['zurueckgegeben']}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('list_ueberfaellig')}
              items={ueberfaelligeAusleihe.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tt('ueberfaellig')}</span>
                    <span className="text-muted-foreground"> · {a.handwerkerName} · bis {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tt('status_zurueck'),
                  onClick: () => returnAusleihe(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('list_empty_ueberfaellig'),
                action: { label: tt('new_ausleihe'), onClick: () => openAusleiheCreate() },
              }}
            />
            <WorkList
              title={tt('list_wartung')}
              items={laufendeWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.status_wartung?.label ?? '—'}
                    </span>
                    <span className="text-muted-foreground"> · {w.fields.vorgangsart?.label} · {w.verantwortlicherName || 'kein Verantwortlicher'}</span>
                  </>
                ),
                action: {
                  label: tt('wartung_action'),
                  onClick: () => completeWartung(w),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung', id })}
              empty={{
                text: tt('list_empty_wartung'),
                action: {
                  label: tt('neue_wartung'),
                  onClick: () => openWartungCreate(),
                },
              }}
            />
          </>
        }
      />

      {/* Single overlay host for all entity types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'ausleihe') {
            const rec = getAusleihe(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={werkzeugeMap.get(extractRecordId(rec.fields.werkzeug) ?? '')?.fields.werkzeugname ?? '—'}
                  subtitle={handwerkerMap.get(extractRecordId(rec.fields.handwerker) ?? '')?.fields.vorname}
                  badges={
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lookupKey(rec.fields.status_ausleihe) === 'zurueckgegeben' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {rec.fields.status_ausleihe?.label ?? '—'}
                    </span>
                  }
                />
                <AusleiheDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  handwerkerList={handwerker}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', id: w.record_id })}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'werkzeuge') {
            const rec = getWerkzeug(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={rec.fields.werkzeugname ?? '—'}
                  subtitle={[rec.fields.hersteller, rec.fields.modell].filter(Boolean).join(' · ')}
                  badges={
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                      {rec.fields.zustand?.label ?? '—'}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  wartungReparaturList={wartungReparatur}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => openAusleiheCreate({ werkzeug: rec.record_id })}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => openWartungCreate({ werkzeug_wartung: rec.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const rec = getHandwerker(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.vorname, rec.fields.nachname].filter(Boolean).join(' ')}
                  subtitle={[rec.fields.qualifikation?.label, rec.fields.abteilung].filter(Boolean).join(' · ')}
                  badges={
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lookupKey(rec.fields.status) === 'aktiv' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {rec.fields.status?.label ?? '—'}
                    </span>
                  }
                />
                <HandwerkerDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  wartungReparaturList={wartungReparatur}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => openAusleiheCreate({ handwerker: rec.record_id })}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => openWartungCreate({ verantwortlicher: rec.record_id })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const rec = getWartung(top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={enrichedWartungReparatur.find(x => x.record_id === rec.record_id)?.werkzeug_wartungName ?? '—'}
                  subtitle={rec.fields.vorgangsart?.label}
                  badges={
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                      {rec.fields.status_wartung?.label ?? '—'}
                    </span>
                  }
                />
                <WartungReparaturDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  handwerkerList={handwerker}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', id: w.record_id })}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const rec = getAusleihe(top.id);
            if (!rec || lookupKey(rec.fields.status_ausleihe) === 'zurueckgegeben') return undefined;
            const enriched = enrichedAusleihe.find(x => x.record_id === top.id);
            if (!enriched) return undefined;
            return { label: tt('status_zurueck'), onClick: () => returnAusleihe(enriched) };
          }
          if (top.type === 'wartung') {
            const rec = getWartung(top.id);
            const s = lookupKey(rec?.fields.status_wartung);
            if (!rec || s === 'abgeschlossen' || s === 'abgebrochen') return undefined;
            const enriched = enrichedWartungReparatur.find(x => x.record_id === top.id);
            if (!enriched) return undefined;
            return { label: tt('wartung_action'), onClick: () => completeWartung(enriched) };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'ausleihe') {
            const rec = getAusleihe(top.id);
            if (!rec) return;
            setAusleiheDefaults(rec.fields as AusleiheDialogDefaults);
            setEditAusleiheId(rec.record_id);
            setAusleiheDialogOpen(true);
          } else if (top.type === 'werkzeuge') {
            setEditWerkzeugId(top.id);
            setWerkzeugDialogOpen(true);
          } else if (top.type === 'handwerker') {
            setEditHandwerkerId(top.id);
            setHandwerkerDialogOpen(true);
          } else if (top.type === 'wartung') {
            const rec = getWartung(top.id);
            if (!rec) return;
            setWartungDefaults(rec.fields as WartungReparaturDialogDefaults);
            setEditWartungId(rec.record_id);
            setWartungDialogOpen(true);
          }
        }}
      />

      {/* Dialogs */}
      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setEditAusleiheId(undefined); setAusleiheDefaults(undefined); }}
        onSubmit={async fields => {
          if (editAusleiheId) {
            await LivingAppsService.updateAusleiheEntry(editAusleiheId, fields as any);
          } else {
            await LivingAppsService.createAusleiheEntry(fields as any);
          }
          fetchAll();
        }}
        defaultValues={ausleiheDefaults}
        recordId={editAusleiheId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WerkzeugeDialog
        open={werkzeugDialogOpen}
        onClose={() => { setWerkzeugDialogOpen(false); setEditWerkzeugId(undefined); }}
        onSubmit={async fields => {
          if (editWerkzeugId) {
            await LivingAppsService.updateWerkzeugeEntry(editWerkzeugId, fields as any);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields as any);
          }
          fetchAll();
        }}
        defaultValues={editWerkzeugId ? werkzeuge.find(w => w.record_id === editWerkzeugId)?.fields : undefined}
        recordId={editWerkzeugId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => { setHandwerkerDialogOpen(false); setEditHandwerkerId(undefined); }}
        onSubmit={async fields => {
          if (editHandwerkerId) {
            await LivingAppsService.updateHandwerkerEntry(editHandwerkerId, fields as any);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields as any);
          }
          fetchAll();
        }}
        defaultValues={editHandwerkerId ? handwerker.find(h => h.record_id === editHandwerkerId)?.fields : undefined}
        recordId={editHandwerkerId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => { setWartungDialogOpen(false); setEditWartungId(undefined); setWartungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editWartungId) {
            await LivingAppsService.updateWartungReparaturEntry(editWartungId, fields as any);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields as any);
          }
          fetchAll();
        }}
        defaultValues={wartungDefaults}
        recordId={editWartungId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />
    </>
  );
}
