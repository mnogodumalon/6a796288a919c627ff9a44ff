import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
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
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import { gruss, useClock, namen, undoToast } from '@/lib/polish';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconCalendarCheck,
  IconPlus,
  IconArrowBack,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    context_ok: 'Alle Werkzeuge verfügbar.',
    context_overdue: '{n} Ausleihe{s} überfällig — bitte zurückfordern.',
    context_maintenance: '{n} Wartung{s} aktiv.',
    hero_title: 'Überfällige Rückgabe',
    hero_action: 'Als zurückgegeben markieren',
    hero_undo: 'Rückgabe rückgängig gemacht',
    kpi_tools: 'Werkzeuge',
    kpi_lent: 'Ausgeliehen',
    kpi_maintenance: 'In Wartung/Reparatur',
    kpi_workers: 'Handwerker',
    aside_overdue: 'Überfällige Ausleihen',
    aside_maintenance: 'Aktive Wartungen',
    empty_overdue: 'Keine überfälligen Ausleihen',
    empty_maintenance: 'Keine aktiven Wartungen',
    return_tool: 'Zurückgeben',
    complete_maintenance: 'Abschließen',
    neue_wartung: 'Neue Wartung',
    neue_ausleihe: 'Neue Ausleihe',
    neues_werkzeug: 'Neues Werkzeug',
    neuer_handwerker: 'Neuer Handwerker',
    empty_app: 'Werkzeuge aufnehmen',
    empty_app_desc: 'Noch keine Werkzeuge erfasst. Füge dein erstes Werkzeug hinzu.',
    zurueckgegeben: 'Zurückgegeben',
    verfuegbar: 'Verfügbar',
    abgeschlossen: 'Abgeschlossen',
  },
  en: {
    context_ok: 'All tools available.',
    context_overdue: '{n} loan{s} overdue — please reclaim.',
    context_maintenance: '{n} maintenance{s} active.',
    hero_title: 'Overdue Return',
    hero_action: 'Mark as returned',
    hero_undo: 'Return undone',
    kpi_tools: 'Tools',
    kpi_lent: 'Lent out',
    kpi_maintenance: 'In maintenance',
    kpi_workers: 'Craftsmen',
    aside_overdue: 'Overdue loans',
    aside_maintenance: 'Active maintenance',
    empty_overdue: 'No overdue loans',
    empty_maintenance: 'No active maintenance',
    return_tool: 'Return',
    complete_maintenance: 'Complete',
    neue_wartung: 'New maintenance',
    neue_ausleihe: 'New loan',
    neues_werkzeug: 'New tool',
    neuer_handwerker: 'New craftsman',
    empty_app: 'Add tools',
    empty_app_desc: 'No tools registered yet. Add your first tool.',
    zurueckgegeben: 'Returned',
    verfuegbar: 'Available',
    abgeschlossen: 'Completed',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'handwerker'; id: string }
  | { type: 'wartung'; id: string };

function toneForZustand(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur') return 'destructive';
  if (key === 'in_wartung') return 'warning';
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
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; id?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; id?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; id?: string }>({ open: false });
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; defaults?: HandwerkerDialogDefaults; id?: string }>({ open: false });

  // Kanban columns from LOOKUP_OPTIONS — inside the component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label, tone: toneForZustand(o.key) })),
    [],
  );

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const ueberfaellig = useMemo(() =>
    enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      a.fields.geplantes_rueckgabedatum &&
      a.fields.geplantes_rueckgabedatum.slice(0, 10) < today
    ),
    [enrichedAusleihe, today],
  );

  const aktiveAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  const aktiveWartungen = useMemo(() =>
    enrichedWartung.filter(w => {
      const s = lookupKey(w.fields.status_wartung);
      return s === 'geplant' || s === 'in_bearbeitung';
    }),
    [enrichedWartung],
  );

  const inWartungCount = useMemo(() =>
    werkzeuge.filter(w => {
      const k = lookupKey(w.fields.zustand);
      return k === 'in_reparatur' || k === 'in_wartung';
    }).length,
    [werkzeuge],
  );

  // Kanban cards — Werkzeuge nach Zustand
  const cards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const zustand = lookupKey(w.fields.zustand) ?? COLUMNS[0]?.key ?? '';
      return {
        id: `werkzeug:${w.record_id}`,
        column: zustand,
        title: w.fields.werkzeugname ?? '—',
        subtitle: [w.fields.hersteller, w.fields.modell].filter(Boolean).join(' '),
        tone: toneForZustand(zustand),
      };
    }),
    [werkzeuge, COLUMNS],
  );

  // Return (Rückgabe) action — shared helper
  const returnAusleihe = useCallback(async (a: EnrichedAusleihe) => {
    const snapshot = { ...a };
    const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(prev => prev.map(r =>
      r.record_id === a.record_id
        ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: tt('zurueckgegeben') }, tatsaechliches_rueckgabedatum: nowStr } }
        : r
    ));
    // Update tool status to available
    const wId = extractRecordId(a.fields.werkzeug);
    if (wId) {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === wId
          ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
          : w
      ));
    }
    undoToast(`${a.werkzeugName} — ${tc('zurueckgegeben')}`, async () => {
      setAusleihe(prev => prev.map(r => r.record_id === a.record_id ? snapshot : r));
      if (wId) {
        await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: lookupKey(snapshot.fields.status_ausleihe) === 'ausgeliehen' ? 'ausgeliehen' : 'verfuegbar' });
      }
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: snapshot.fields.status_ausleihe?.key,
        tatsaechliches_rueckgabedatum: snapshot.fields.tatsaechliches_rueckgabedatum,
      });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: nowStr,
      });
      if (wId) {
        await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      }
    } catch {
      await fetchAll();
    }
  }, [clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Complete maintenance action
  const completeWartung = useCallback(async (w: EnrichedWartungReparatur) => {
    const snapshot = { ...w };
    const todayStr = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(prev => prev.map(r =>
      r.record_id === w.record_id
        ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: tt('abgeschlossen') }, tatsaechliches_enddatum: todayStr } }
        : r
    ));
    // Restore tool to available
    const wId = extractRecordId(w.fields.werkzeug_wartung);
    if (wId) {
      setWerkzeuge(prev => prev.map(t =>
        t.record_id === wId
          ? { ...t, fields: { ...t.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
          : t
      ));
    }
    undoToast(`${w.werkzeug_wartungName} — ${tc('abgeschlossen')}`, async () => {
      setWartungReparatur(prev => prev.map(r => r.record_id === w.record_id ? snapshot : r));
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: todayStr,
      });
      if (wId) {
        await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      }
    } catch {
      await fetchAll();
    }
  }, [clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  // Kanban move — update Zustand on drag
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const label = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === rid
        ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label } } }
        : w
    ));
    undoToast(`${werkzeugeMap.get(rid)?.fields.werkzeugname ?? ''} → ${label}`);
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch {
      await fetchAll();
    }
  }, [COLUMNS, setWerkzeuge, werkzeugeMap, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const s = (n: number) => n !== 1 ? 'n' : '';
  let contextLine: string;
  if (ueberfaellig.length > 0) {
    contextLine = tt('context_overdue', { n: ueberfaellig.length, s: s(ueberfaellig.length) });
  } else if (aktiveWartungen.length > 0) {
    contextLine = tt('context_maintenance', { n: aktiveWartungen.length, s: s(aktiveWartungen.length) });
  } else {
    contextLine = tt('context_ok');
  }

  const firstOverdue = ueberfaellig[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setWerkzeugDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('neues_werkzeug')}
          </button>
          <button
            onClick={() => setAusleiheDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('neue_ausleihe')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={firstOverdue && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{ label: tt('hero_action'), onClick: () => void returnAusleihe(firstOverdue) }}
          >
            <b>{namen(ueberfaellig.map(a => a.werkzeugName))}</b>
            {' '}— {tt('hero_title').toLowerCase()}. {tt('context_overdue', { n: ueberfaellig.length, s: s(ueberfaellig.length) })}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('kpi_tools')}
              value={werkzeuge.length}
              icon={<IconTool size={15} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tt('kpi_lent')}
              value={aktiveAusleihen.length}
              icon={<IconArrowBack size={15} className="shrink-0" />}
              tone={aktiveAusleihen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_maintenance')}
              value={inWartungCount}
              icon={<IconTool size={15} className="shrink-0" />}
              tone={inWartungCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('kpi_workers')}
              value={handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv').length}
              icon={<IconUsers size={15} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => overlay.replace({ type: 'werkzeug', id: card.id.split(':')[1] })}
            onCardMove={moveCard}
            onAddCard={column => setWerkzeugDialog({ open: true, defaults: { zustand: column } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('aside_overdue')}
              items={ueberfaellig.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tc('ueberfaellig')}</span>
                    <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                    {a.fields.geplantes_rueckgabedatum && (
                      <span className="text-muted-foreground"> · {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                    )}
                  </>
                ),
                action: { label: tt('return_tool'), onClick: () => void returnAusleihe(a) },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{ text: tt('empty_overdue'), action: { label: tt('neue_ausleihe'), onClick: () => setAusleiheDialog({ open: true }) } }}
            />
            <WorkList
              title={tt('aside_maintenance')}
              items={aktiveWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.status_wartung?.label ?? ''}
                    </span>
                    <span className="text-muted-foreground"> · {w.fields.vorgangsart?.label ?? ''}</span>
                    {w.verantwortlicherName && (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                    )}
                  </>
                ),
                action: { label: tt('complete_maintenance'), onClick: () => void completeWartung(w) },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung', id })}
              empty={{ text: tt('empty_maintenance'), action: { label: tt('neue_wartung'), onClick: () => setWartungDialog({ open: true }) } }}
            />
          </>
        }
      />

      {/* Record overlays — one shell, all entity types */}
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
                  subtitle={[rec.fields.hersteller, rec.fields.modell].filter(Boolean).join(' ')}
                  badges={rec.fields.zustand ? (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                      {rec.fields.zustand.label}
                    </span>
                  ) : undefined}
                />
                <WerkzeugeDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: top.id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { werkzeug_wartung: top.id } })}
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
                  subtitle={enriched?.handwerkerName}
                  badges={rec.fields.status_ausleihe ? (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${lookupKey(rec.fields.status_ausleihe) === 'ausgeliehen' ? 'border-primary/30 bg-primary/10 text-primary' : ''}`}>
                      {rec.fields.status_ausleihe.label}
                    </span>
                  ) : undefined}
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
          if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={[rec.fields.vorname, rec.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={rec.fields.qualifikation?.label}
                />
                <HandwerkerDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: top.id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung', id: w.record_id })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: top.id } })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (!rec) return null;
            const enriched = enrichedWartung.find(w => w.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={enriched?.werkzeug_wartungName ?? '—'}
                  subtitle={rec.fields.vorgangsart?.label}
                  badges={rec.fields.status_wartung ? (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                      {rec.fields.status_wartung.label}
                    </span>
                  ) : undefined}
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
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const rec = enrichedAusleihe.find(a => a.record_id === top.id);
            if (rec && lookupKey(rec.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tt('return_tool'), onClick: () => { void returnAusleihe(rec); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const rec = enrichedWartung.find(w => w.record_id === top.id);
            if (rec && (lookupKey(rec.fields.status_wartung) === 'geplant' || lookupKey(rec.fields.status_wartung) === 'in_bearbeitung')) {
              return { label: tt('complete_maintenance'), onClick: () => { void completeWartung(rec); overlay.close(); } };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (rec) setWerkzeugDialog({ open: true, defaults: rec.fields as WerkzeugeDialogDefaults, id: top.id });
          } else if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (rec) setAusleiheDialog({ open: true, defaults: rec.fields as AusleiheDialogDefaults, id: top.id });
          } else if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (rec) setHandwerkerDialog({ open: true, defaults: rec.fields as HandwerkerDialogDefaults, id: top.id });
          } else if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (rec) setWartungDialog({ open: true, defaults: rec.fields as WartungReparaturDialogDefaults, id: top.id });
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog.open}
        onClose={() => setWerkzeugDialog({ open: false })}
        onSubmit={async fields => {
          if (werkzeugDialog.id) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugDialog.id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={werkzeugDialog.defaults}
        recordId={werkzeugDialog.id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog.open}
        onClose={() => setAusleiheDialog({ open: false })}
        onSubmit={async fields => {
          if (ausleiheDialog.id) {
            await LivingAppsService.updateAusleiheEntry(ausleiheDialog.id, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={ausleiheDialog.defaults}
        recordId={ausleiheDialog.id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog.open}
        onClose={() => setWartungDialog({ open: false })}
        onSubmit={async fields => {
          if (wartungDialog.id) {
            await LivingAppsService.updateWartungReparaturEntry(wartungDialog.id, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={wartungDialog.defaults}
        recordId={wartungDialog.id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialog.open}
        onClose={() => setHandwerkerDialog({ open: false })}
        onSubmit={async fields => {
          if (handwerkerDialog.id) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerDialog.id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={handwerkerDialog.defaults}
        recordId={handwerkerDialog.id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
