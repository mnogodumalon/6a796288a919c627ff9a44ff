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
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
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
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertTriangle,
  IconPlus,
  IconTool,
  IconUsers,
  IconCircleCheck,
  IconCalendarEvent,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    gruss_line: 'Werkzeugverwaltung Elektroabteilung',
    ctx_all_ok: 'Alle Werkzeuge verfügbar — kein Handlungsbedarf.',
    ctx_ausgeliehen: '{n} Werkzeug ausgeliehen an {names}.',
    ctx_mehrere: '{n} Werkzeuge ausgeliehen, {r} überfällig.',
    hero_ueberfaellig: '{names} — Rückgabe überfällig seit {date}.',
    hero_action: 'Als zurückgegeben markieren',
    verfuegbar: 'Verfügbar',
    ausgeliehen: 'Ausgeliehen',
    in_wartung: 'In Wartung/Reparatur',
    defekt: 'Defekt/Ausgemustert',
    neue_ausleihe: 'Neue Ausleihe',
    neues_werkzeug: 'Neues Werkzeug',
    ueberfaellig_list: 'Überfällige Ausleihen',
    aktive_wartung: 'Aktive Wartung & Reparatur',
    keine_ueberfaelligen: 'Keine überfälligen Ausleihen',
    keine_wartung: 'Keine aktiven Vorgänge',
    rueckgabe: 'Rückgabe',
    wartung_abschliessen: 'Abschließen',
    handwerker: 'Handwerker',
    neue_wartung: 'Neue Wartung/Reparatur',
    neuer_handwerker: 'Neuer Handwerker',
  },
  en: {
    gruss_line: 'Tool Management — Electrical Dept.',
    ctx_all_ok: 'All tools available — no action needed.',
    ctx_ausgeliehen: '{n} tool on loan to {names}.',
    ctx_mehrere: '{n} tools on loan, {r} overdue.',
    hero_ueberfaellig: '{names} — return overdue since {date}.',
    hero_action: 'Mark as returned',
    verfuegbar: 'Available',
    ausgeliehen: 'On Loan',
    in_wartung: 'In Maintenance/Repair',
    defekt: 'Defective/Retired',
    neue_ausleihe: 'New Loan',
    neues_werkzeug: 'New Tool',
    ueberfaellig_list: 'Overdue Loans',
    aktive_wartung: 'Active Maintenance & Repair',
    keine_ueberfaelligen: 'No overdue loans',
    keine_wartung: 'No active jobs',
    rueckgabe: 'Return',
    wartung_abschliessen: 'Complete',
    handwerker: 'Craftsmen',
    neue_wartung: 'New Maintenance/Repair',
    neuer_handwerker: 'New Craftsman',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

function zustandTone(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt' || key === 'ausgemustert') return 'default';
  return 'default';
}

export default function DashboardOverview() {
  const {
    handwerker, setHandwerker, werkzeuge, setWerkzeuge,
    ausleihe, setAusleihe, wartungReparatur, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap],
  );
  const enrichedWartungReparatur = useMemo(
    () => enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap }),
    [wartungReparatur, werkzeugeMap, handwerkerMap],
  );

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; editId?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; editId?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; editId?: string }>({ open: false });
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; defaults?: HandwerkerDialogDefaults; editId?: string }>({ open: false });

  // KanbanWidget: columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label, tone: zustandTone(o.key) as KanbanTone })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(() => {
    return werkzeuge.map(w => {
      const status = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      // find current borrower if on loan
      const aktiveAusleihe = ausleihe.find(
        a => extractRecordId(a.fields.werkzeug) === w.record_id && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen',
      );
      const borrowerName = aktiveAusleihe
        ? (handwerkerMap.get(extractRecordId(aktiveAusleihe.fields.handwerker) ?? '') ?.fields.vorname ?? '')
        : undefined;
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.werkzeugname ?? '—',
        subtitle: borrowerName
          ? `${borrowerName} · ${w.fields.inventarnummer ?? ''}`
          : w.fields.inventarnummer ?? w.fields.hersteller ?? '',
        tone: zustandTone(status),
      };
    });
  }, [werkzeuge, ausleihe, handwerkerMap]);

  // KPIs
  const today = format(clock, 'yyyy-MM-dd');
  const verfuegbar = werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length;
  const ausgeliehenCount = werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length;
  const inWartungCount = werkzeuge.filter(w => ['in_reparatur', 'in_wartung'].includes(lookupKey(w.fields.zustand) ?? '')).length;
  const defektCount = werkzeuge.filter(w => ['defekt', 'ausgemustert'].includes(lookupKey(w.fields.zustand) ?? '')).length;

  // Overdue loans
  const ueberfaellige = useMemo(() => enrichedAusleihe.filter(a => {
    if (lookupKey(a.fields.status_ausleihe) !== 'ausgeliehen') return false;
    if (!a.fields.geplantes_rueckgabedatum) return false;
    return a.fields.geplantes_rueckgabedatum.slice(0, 10) < today;
  }), [enrichedAusleihe, today]);

  // Active maintenance
  const aktiveWartung = useMemo(() => enrichedWartungReparatur.filter(w => {
    const s = lookupKey(w.fields.status_wartung);
    return s === 'geplant' || s === 'in_bearbeitung';
  }), [enrichedWartungReparatur]);

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaellige.length > 0) {
      return tt('ctx_mehrere', { n: String(ausgeliehenCount), r: String(ueberfaellige.length) });
    }
    const activeBorrowers = enrichedAusleihe
      .filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen')
      .map(a => a.handwerkerName);
    if (activeBorrowers.length > 0) {
      return tt('ctx_ausgeliehen', { n: String(activeBorrowers.length), names: namen(activeBorrowers) });
    }
    return tt('ctx_all_ok');
  }, [ueberfaellige, enrichedAusleihe, ausgeliehenCount]);

  // Advance: mark loan as returned (optimistic)
  const markZurueckgegeben = useCallback(async (a: EnrichedAusleihe) => {
    const snapshot = [...ausleihe];
    const snapshotWerkzeuge = [...werkzeuge];
    const returnTime = format(clock, "yyyy-MM-dd'T'HH:mm");

    // Optimistic: update ausleihe status
    setAusleihe(prev => prev.map(r =>
      r.record_id === a.record_id
        ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' }, tatsaechliches_rueckgabedatum: returnTime } }
        : r,
    ));
    // Optimistic: update werkzeug zustand to verfuegbar
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === werkzeugId
          ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
          : w,
      ));
    }

    undoToast(`${a.werkzeugName} — ${tc('zurueckgegeben')}`, async () => {
      setAusleihe(snapshot);
      setWerkzeuge(snapshotWerkzeuge);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
      }
    });

    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: returnTime,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setAusleihe(snapshot);
      setWerkzeuge(snapshotWerkzeuge);
      fetchAll();
    }
  }, [ausleihe, werkzeuge, clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Advance: mark maintenance as completed (optimistic)
  const markWartungAbgeschlossen = useCallback(async (w: EnrichedWartungReparatur) => {
    const snapshot = [...wartungReparatur];
    const snapshotWerkzeuge = [...werkzeuge];
    const endDate = format(clock, 'yyyy-MM-dd');

    setWartungReparatur(prev => prev.map(r =>
      r.record_id === w.record_id
        ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' }, tatsaechliches_enddatum: endDate } }
        : r,
    ));
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(t =>
        t.record_id === werkzeugId
          ? { ...t, fields: { ...t.fields, zustand: { key: 'verfuegbar', label: 'Verfügbar' } } }
          : t,
      ));
    }

    undoToast(`${w.werkzeug_wartungName} — ${tc('abgeschlossen')}`, async () => {
      setWartungReparatur(snapshot);
      setWerkzeuge(snapshotWerkzeuge);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
      if (werkzeugId) {
        const origZustand = lookupKey(w.fields.vorgangsart) === 'wartung' ? 'in_wartung' : 'in_reparatur';
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: origZustand });
      }
    });

    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: endDate,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setWartungReparatur(snapshot);
      setWerkzeuge(snapshotWerkzeuge);
      fetchAll();
    }
  }, [wartungReparatur, werkzeuge, clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  // Kanban card move: status change
  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const werkzeugId = cardId.split(':')[1] ?? '';
    const colLabel = COLUMNS.find(c => c.key === newColumn)?.label ?? newColumn;
    const snapshot = [...werkzeuge];
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: colLabel } } }
        : w,
    ));
    undoToast(`${tc('geaendert')}`, async () => {
      setWerkzeuge(snapshot);
      const orig = snapshot.find(w => w.record_id === werkzeugId);
      if (orig) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: lookupKey(orig.fields.zustand) });
    });
    try {
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: newColumn });
    } catch {
      setWerkzeuge(snapshot);
      fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll, COLUMNS]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Overlay helpers
  const openWerkzeugOverlay = (w: Werkzeuge) => overlay.push({ type: 'werkzeug', id: w.record_id });
  const openAusleiheOverlay = (a: Ausleihe) => overlay.push({ type: 'ausleihe', id: a.record_id });
  const openWartungOverlay = (w: WartungReparatur) => overlay.push({ type: 'wartung', id: w.record_id });
  const openHandwerkerOverlay = (h: Handwerker) => overlay.push({ type: 'handwerker', id: h.record_id });

  const mostOverdue = ueberfaellige[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAusleiheDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('neue_ausleihe')}
          </button>
          <button
            onClick={() => setWerkzeugDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('neues_werkzeug')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={mostOverdue ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{ label: tt('hero_action'), onClick: () => markZurueckgegeben(mostOverdue) }}
          >
            {tt('hero_ueberfaellig', {
              names: namen(ueberfaellige.map(a => a.werkzeugName)),
              date: formatDate(mostOverdue.fields.geplantes_rueckgabedatum),
            })}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('verfuegbar')}
              value={verfuegbar}
              icon={<IconCircleCheck size={16} />}
              tone={verfuegbar > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tt('ausgeliehen')}
              value={ausgeliehenCount}
              icon={<IconTool size={16} />}
              tone={ueberfaellige.length > 0 ? 'warning' : ausgeliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('in_wartung')}
              value={inWartungCount}
              icon={<IconCalendarEvent size={16} />}
              tone={inWartungCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('defekt')}
              value={defektCount}
              icon={<IconAlertTriangle size={16} />}
              tone={defektCount > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={COLUMNS}
            cards={cards}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const werkzeugId = card.id.split(':')[1] ?? '';
              overlay.push({ type: 'werkzeug', id: werkzeugId });
            }}
            onCardMove={handleCardMove}
            onAddCard={colKey => setWerkzeugDialog({ open: true, defaults: { zustand: colKey } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('ueberfaellig_list')}
              items={ueberfaellige.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tc('ueberfaellig')}</span>
                    <span className="text-muted-foreground"> · {a.handwerkerName} · {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tt('rueckgabe'),
                  onClick: () => markZurueckgegeben(a),
                },
              }))}
              onItemClick={id => overlay.push({ type: 'ausleihe', id })}
              empty={{
                text: tt('keine_ueberfaelligen'),
                action: { label: tt('neue_ausleihe'), onClick: () => setAusleiheDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tt('aktive_wartung')}
              items={aktiveWartung.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-warning-foreground">
                      {w.fields.vorgangsart?.label ?? '—'}
                    </span>
                    <span className="text-muted-foreground"> · {w.verantwortlicherName} · {formatDate(w.fields.geplantes_enddatum)}</span>
                  </>
                ),
                action: {
                  label: tt('wartung_abschliessen'),
                  onClick: () => markWartungAbgeschlossen(w),
                },
              }))}
              onItemClick={id => overlay.push({ type: 'wartung', id })}
              empty={{
                text: tt('keine_wartung'),
                action: { label: tt('neue_wartung'), onClick: () => setWartungDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* Overlay host — single shell for all entity types */}
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
                  subtitle={[rec.fields.inventarnummer, rec.fields.hersteller].filter(Boolean).join(' · ')}
                  badges={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {rec.fields.zustand?.label ?? '—'}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={openAusleiheOverlay}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: top.id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={openWartungOverlay}
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
                  badges={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {rec.fields.status_ausleihe?.label ?? '—'}
                    </span>
                  }
                />
                <AusleiheDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={openWerkzeugOverlay}
                  handwerkerList={handwerker}
                  onOpenHandwerker={openHandwerkerOverlay}
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
                  badges={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {rec.fields.status_wartung?.label ?? '—'}
                    </span>
                  }
                />
                <WartungReparaturDetails
                  record={rec}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={openWerkzeugOverlay}
                  handwerkerList={handwerker}
                  onOpenHandwerker={openHandwerkerOverlay}
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
                  title={[rec.fields.vorname, rec.fields.nachname].filter(Boolean).join(' ')}
                  subtitle={rec.fields.qualifikation?.label}
                  badges={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {rec.fields.status?.label ?? '—'}
                    </span>
                  }
                />
                <HandwerkerDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={openAusleiheOverlay}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: top.id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={openWartungOverlay}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: top.id } })}
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
              if (enriched) return { label: tt('rueckgabe'), onClick: () => { markZurueckgegeben(enriched); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            const s = lookupKey(rec?.fields.status_wartung);
            if (s === 'geplant' || s === 'in_bearbeitung') {
              const enriched = enrichedWartungReparatur.find(w => w.record_id === top.id);
              if (enriched) return { label: tt('wartung_abschliessen'), onClick: () => { markWartungAbgeschlossen(enriched); overlay.close(); } };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (rec) { setWerkzeugDialog({ open: true, defaults: rec.fields as WerkzeugeDialogDefaults, editId: rec.record_id }); overlay.close(); }
          } else if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (rec) { setAusleiheDialog({ open: true, defaults: rec.fields as AusleiheDialogDefaults, editId: rec.record_id }); overlay.close(); }
          } else if (top.type === 'wartung') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (rec) { setWartungDialog({ open: true, defaults: rec.fields as WartungReparaturDialogDefaults, editId: rec.record_id }); overlay.close(); }
          } else if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (rec) { setHandwerkerDialog({ open: true, defaults: rec.fields as HandwerkerDialogDefaults, editId: rec.record_id }); overlay.close(); }
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog.open}
        onClose={() => setWerkzeugDialog({ open: false })}
        onSubmit={async fields => {
          if (werkzeugDialog.editId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugDialog.editId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={werkzeugDialog.defaults}
        recordId={werkzeugDialog.editId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />
      <AusleiheDialog
        open={ausleiheDialog.open}
        onClose={() => setAusleiheDialog({ open: false })}
        onSubmit={async fields => {
          if (ausleiheDialog.editId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheDialog.editId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={ausleiheDialog.defaults}
        recordId={ausleiheDialog.editId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />
      <WartungReparaturDialog
        open={wartungDialog.open}
        onClose={() => setWartungDialog({ open: false })}
        onSubmit={async fields => {
          if (wartungDialog.editId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungDialog.editId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={wartungDialog.defaults}
        recordId={wartungDialog.editId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />
      <HandwerkerDialog
        open={handwerkerDialog.open}
        onClose={() => setHandwerkerDialog({ open: false })}
        onSubmit={async fields => {
          if (handwerkerDialog.editId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerDialog.editId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={handwerkerDialog.defaults}
        recordId={handwerkerDialog.editId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </div>
  );
}
