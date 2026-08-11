import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
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
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconArrowBack,
  IconPlus,
  IconCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    verfuegbar: 'Verfügbar',
    ausgeliehen: 'Ausgeliehen',
    in_reparatur: 'In Reparatur',
    in_wartung: 'In Wartung',
    defekt: 'Defekt',
    ausgemustert: 'Ausgemustert',
    werkzeugbestand: 'Werkzeugbestand',
    aktive_ausleihen: 'Aktive Ausleihen',
    aktive_wartungen: 'Aktive Wartungen & Reparaturen',
    ueberfaellig_ausleihe: 'Überfällige Rückgaben',
    keine_ausleihe: 'Keine aktiven Ausleihen',
    keine_wartung: 'Keine laufenden Wartungen',
    rueckgabe_today: 'Heute fällig',
    neue_ausleihe: 'Neue Ausleihe',
    neue_wartung: 'Neue Wartung',
    neues_werkzeug: 'Neues Werkzeug',
    neuer_handwerker: 'Neuer Handwerker',
    werkzeuge_gesamt: 'Werkzeuge gesamt',
    aktive_handwerker: 'Aktive Handwerker',
    context_all_good: 'Alle Werkzeuge im Überblick — alles im grünen Bereich.',
    context_overdue: '{n} Ausleihe(n) überfällig — sofort Rückgabe einholen.',
    context_defekt: '{n} Werkzeug(e) defekt — Reparatur einleiten.',
    zurueckgeben: 'Als zurückgegeben markieren',
    abschliessen_wartung: 'Wartung abschließen',
    banner_overdue: '{n} Rückgabe(n) überfällig',
    banner_defekt: '{n} Werkzeug(e) defekt oder ausgefallen',
    empty_werkzeuge: 'Noch keine Werkzeuge erfasst',
    empty_werkzeuge_sub: 'Füge das erste Werkzeug hinzu, um den Bestand zu verwalten.',
    erstes_werkzeug: 'Erstes Werkzeug erfassen',
    ausleihe_zurueck: '{name} zurückgegeben',
    wartung_abgeschlossen: '{name} abgeschlossen',
    zurueckgegeben: 'Zurückgegeben',
    abgeschlossen: 'Abgeschlossen',
  },
  en: {
    verfuegbar: 'Available',
    ausgeliehen: 'On Loan',
    in_reparatur: 'In Repair',
    in_wartung: 'In Maintenance',
    defekt: 'Defective',
    ausgemustert: 'Decommissioned',
    werkzeugbestand: 'Tool Inventory',
    aktive_ausleihen: 'Active Loans',
    aktive_wartungen: 'Active Maintenance & Repairs',
    ueberfaellig_ausleihe: 'Overdue Returns',
    keine_ausleihe: 'No active loans',
    keine_wartung: 'No ongoing maintenance',
    rueckgabe_today: 'Due today',
    neue_ausleihe: 'New Loan',
    neue_wartung: 'New Maintenance',
    neues_werkzeug: 'New Tool',
    neuer_handwerker: 'New Craftsman',
    werkzeuge_gesamt: 'Tools total',
    aktive_handwerker: 'Active craftsmen',
    context_all_good: 'All tools at a glance — everything looks good.',
    context_overdue: '{n} loan(s) overdue — collect returns immediately.',
    context_defekt: '{n} tool(s) defective — initiate repairs.',
    zurueckgeben: 'Mark as returned',
    abschliessen_wartung: 'Complete maintenance',
    banner_overdue: '{n} return(s) overdue',
    banner_defekt: '{n} tool(s) defective or failed',
    empty_werkzeuge: 'No tools recorded yet',
    empty_werkzeuge_sub: 'Add the first tool to start managing your inventory.',
    erstes_werkzeug: 'Record first tool',
    ausleihe_zurueck: '{name} returned',
    wartung_abgeschlossen: '{name} completed',
    zurueckgegeben: 'Returned',
    abgeschlossen: 'Completed',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

function werkzeugTone(zustandKey: string | undefined): KanbanTone {
  if (zustandKey === 'verfuegbar') return 'success';
  if (zustandKey === 'ausgeliehen') return 'primary';
  if (zustandKey === 'in_reparatur') return 'warning';
  if (zustandKey === 'in_wartung') return 'warning';
  if (zustandKey === 'defekt') return 'destructive';
  if (zustandKey === 'ausgemustert') return 'default';
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
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; recordId?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; recordId?: string }>({ open: false });
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; defaults?: HandwerkerDialogDefaults; recordId?: string }>({ open: false });

  const today = format(clock, 'yyyy-MM-dd');
  const todayDateTime = format(clock, "yyyy-MM-dd'T'HH:mm");

  // KPI derivations
  const aktiveAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  const ueberfaelligeAusleihen = useMemo(
    () => aktiveAusleihen.filter(a =>
      a.fields.geplantes_rueckgabedatum && a.fields.geplantes_rueckgabedatum < todayDateTime
    ),
    [aktiveAusleihen, todayDateTime]
  );

  const defekteWerkzeuge = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'),
    [werkzeuge]
  );

  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker]
  );

  const laufendeWartungen = useMemo(
    () => enrichedWartungReparatur.filter(w =>
      lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ||
      lookupKey(w.fields.status_wartung) === 'geplant'
    ),
    [enrichedWartungReparatur]
  );

  // Kanban columns for Werkzeuge.zustand
  const werkzeugColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const werkzeugCards: KanbanCard[] = useMemo(
    () => werkzeuge.map(w => ({
      id: `werkzeug:${w.record_id}`,
      column: lookupKey(w.fields.zustand) ?? '',
      title: w.fields.werkzeugname ?? '—',
      subtitle: [w.fields.inventarnummer, w.fields.hersteller].filter(Boolean).join(' · ') || undefined,
      tone: werkzeugTone(lookupKey(w.fields.zustand)),
    })),
    [werkzeuge]
  );

  // Advance helpers
  const markZurueckgegeben = useCallback(async (a: EnrichedAusleihe) => {
    const prev = [...ausleihe];
    const prevWerkzeuge = [...werkzeuge];
    // Optimistic update Ausleihe
    setAusleihe(list => list.map(r => r.record_id === a.record_id
      ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: tt('zurueckgegeben') }, tatsaechliches_rueckgabedatum: todayDateTime } }
      : r
    ));
    // Optimistic update Werkzeug zustand → verfuegbar
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    if (werkzeugId) {
      setWerkzeuge(list => list.map(w => w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
        : w
      ));
    }
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: todayDateTime,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
      undoToast(tt('ausleihe_zurueck', { name: a.werkzeugName || a.handwerkerName }), async () => {
        setAusleihe(prev);
        setWerkzeuge(prevWerkzeuge);
        await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
        if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
      });
    } catch {
      setAusleihe(prev);
      setWerkzeuge(prevWerkzeuge);
      fetchAll();
    }
  }, [ausleihe, werkzeuge, setAusleihe, setWerkzeuge, todayDateTime, fetchAll]);

  const markWartungAbgeschlossen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = [...wartungReparatur];
    setWartungReparatur(list => list.map(r => r.record_id === w.record_id
      ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: tt('abgeschlossen') }, tatsaechliches_enddatum: today } }
      : r
    ));
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
    if (werkzeugId) {
      setWerkzeuge(list => list.map(wz => wz.record_id === werkzeugId
        ? { ...wz, fields: { ...wz.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
        : wz
      ));
    }
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: today,
      });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      undoToast(tt('wartung_abgeschlossen', { name: w.werkzeug_wartungName }), async () => {
        setWartungReparatur(prev);
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung' });
      });
    } catch {
      setWartungReparatur(prev);
      fetchAll();
    }
  }, [wartungReparatur, werkzeuge, setWartungReparatur, setWerkzeuge, today, fetchAll]);

  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const werkzeugId = cardId.split(':')[1] ?? '';
    const label = werkzeugColumns.find(c => c.key === newColumn)?.label ?? newColumn;
    const prevWerkzeuge = [...werkzeuge];
    setWerkzeuge(list => list.map(w => w.record_id === werkzeugId
      ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label } } }
      : w
    ));
    try {
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: newColumn });
      undoToast(`${prevWerkzeuge.find(w => w.record_id === werkzeugId)?.fields.werkzeugname ?? ''} → ${label}`, async () => {
        setWerkzeuge(prevWerkzeuge);
        const prev = prevWerkzeuge.find(w => w.record_id === werkzeugId);
        if (prev) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: lookupKey(prev.fields.zustand) ?? '' });
      });
    } catch {
      setWerkzeuge(prevWerkzeuge);
      fetchAll();
    }
  }, [werkzeuge, werkzeugColumns, setWerkzeuge, fetchAll]);

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const names = namen(ueberfaelligeAusleihen.map(a => a.handwerkerName));
      return tt('context_overdue', { n: ueberfaelligeAusleihen.length }) + (names ? ` (${names})` : '');
    }
    if (defekteWerkzeuge.length > 0) {
      const names = namen(defekteWerkzeuge.map(w => w.fields.werkzeugname ?? ''));
      return tt('context_defekt', { n: defekteWerkzeuge.length }) + (names ? ` (${names})` : '');
    }
    return tt('context_all_good');
  }, [ueberfaelligeAusleihen, defekteWerkzeuge]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Hero: überfällige Rückgaben
  const heroBanner = ueberfaelligeAusleihen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: tt('zurueckgeben'),
        onClick: () => markZurueckgegeben(ueberfaelligeAusleihen[0]),
      }}
    >
      <b>{namen(ueberfaelligeAusleihen.map(a => a.handwerkerName))}</b>
      {' '}{tt('banner_overdue', { n: ueberfaelligeAusleihen.length })}
      {ueberfaelligeAusleihen[0]?.fields.geplantes_rueckgabedatum
        ? ` — ${tc('ueberfaellig')} seit ${formatDate(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}`
        : ''}
    </HeroBanner>
  ) : undefined;

  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tt('werkzeuge_gesamt')}
        value={werkzeuge.length}
        icon={<IconTool size={16} className="shrink-0" />}
        tone="default"
      />
      <StatStripItem
        title={tt('verfuegbar')}
        value={werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length}
        icon={<IconCheck size={16} className="shrink-0" />}
        tone={werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length > 0 ? 'success' : 'default'}
      />
      <StatStripItem
        title={tt('ausgeliehen')}
        value={aktiveAusleihen.length}
        icon={<IconArrowBack size={16} className="shrink-0" />}
        tone={aktiveAusleihen.length > 0 ? 'primary' : 'default'}
      />
      <StatStripItem
        title={tc('ueberfaellig')}
        value={ueberfaelligeAusleihen.length}
        icon={<IconAlertTriangle size={16} className="shrink-0" />}
        tone={ueberfaelligeAusleihen.length > 0 ? 'destructive' : 'default'}
      />
      <StatStripItem
        title={tt('aktive_handwerker')}
        value={aktiveHandwerker.length}
        icon={<IconUsers size={16} className="shrink-0" />}
        tone="default"
      />
    </StatStrip>
  );

  const primary = (
    <KanbanWidget
      columns={werkzeugColumns}
      cards={werkzeugCards}
      defaultCollapsed={['ausgemustert']}
      onCardClick={card => overlay.replace({ type: 'werkzeug', id: card.id.split(':')[1] ?? '' })}
      onCardMove={handleCardMove}
      onAddCard={column => setWerkzeugDialog({ open: true, defaults: { zustand: column } })}
    />
  );

  const aside = (
    <>
      <WorkList
        title={tt('aktive_ausleihen')}
        items={aktiveAusleihen
          .sort((a, b) => {
            const ad = a.fields.geplantes_rueckgabedatum ?? '';
            const bd = b.fields.geplantes_rueckgabedatum ?? '';
            return ad.localeCompare(bd);
          })
          .map(a => {
            const ueberfaellig = a.fields.geplantes_rueckgabedatum && a.fields.geplantes_rueckgabedatum < todayDateTime;
            return {
              id: a.record_id,
              title: a.werkzeugName || '—',
              secondLine: (
                <>
                  {ueberfaellig
                    ? <span className="font-medium text-destructive">{tc('ueberfaellig')}</span>
                    : <span className="text-muted-foreground">{tc('aktiv')}</span>
                  }
                  {a.handwerkerName && (
                    <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                  )}
                  {a.fields.geplantes_rueckgabedatum && (
                    <span className="text-muted-foreground"> · {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                  )}
                </>
              ),
              action: { label: `✓ ${tc('zurueckgeben')}`, onClick: () => markZurueckgegeben(a) },
            };
          })}
        onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
        empty={{
          text: tt('keine_ausleihe'),
          action: { label: tt('neue_ausleihe'), onClick: () => setAusleiheDialog({ open: true }) },
        }}
      />
      <WorkList
        title={tt('aktive_wartungen')}
        items={laufendeWartungen
          .sort((a, b) => {
            const ad = a.fields.startdatum ?? '';
            const bd = b.fields.startdatum ?? '';
            return ad.localeCompare(bd);
          })
          .map(w => ({
            id: w.record_id,
            title: w.werkzeug_wartungName || '—',
            secondLine: (
              <>
                <span className="font-medium text-warning-foreground">{w.fields.vorgangsart?.label ?? '—'}</span>
                {w.verantwortlicherName && (
                  <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                )}
                {w.fields.startdatum && (
                  <span className="text-muted-foreground"> · {formatDate(w.fields.startdatum)}</span>
                )}
              </>
            ),
            action: { label: `✓ ${tc('abschliessen')}`, onClick: () => markWartungAbgeschlossen(w) },
          }))}
        onItemClick={id => overlay.replace({ type: 'wartung', id })}
        empty={{
          text: tt('keine_wartung'),
          action: { label: tt('neue_wartung'), onClick: () => setWartungDialog({ open: true }) },
        }}
      />
    </>
  );

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-1">{contextLine}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setAusleiheDialog({ open: true })}
            >
              <IconPlus size={16} className="shrink-0" />
              {tt('neue_ausleihe')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              onClick={() => setWartungDialog({ open: true })}
            >
              <IconTool size={16} className="shrink-0" />
              {tt('neue_wartung')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              onClick={() => setWerkzeugDialog({ open: true })}
            >
              <IconPlus size={16} className="shrink-0" />
              {tt('neues_werkzeug')}
            </button>
          </div>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBanner}
        kpis={kpis}
        primary={primary}
        aside={aside}
      />

      {/* Record Overlay Host — ONE shell for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const w = werkzeuge.find(r => r.record_id === top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={[w.fields.hersteller, w.fields.modell].filter(Boolean).join(' · ') || undefined}
                  badges={<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{w.fields.zustand?.label ?? '—'}</span>}
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={r => overlay.push({ type: 'ausleihe', id: r.record_id })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: w.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={r => overlay.push({ type: 'wartung', id: r.record_id })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { werkzeug_wartung: w.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = enrichedAusleihe.find(r => r.record_id === top.id);
            if (!a) return null;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || '—'}
                  subtitle={a.handwerkerName || undefined}
                  badges={<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{a.fields.status_ausleihe?.label ?? '—'}</span>}
                />
                <AusleiheDetails
                  record={a}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={r => overlay.push({ type: 'werkzeug', id: r.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={r => overlay.push({ type: 'handwerker', id: r.record_id })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const w = enrichedWartungReparatur.find(r => r.record_id === top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.werkzeug_wartungName || '—'}
                  subtitle={w.fields.vorgangsart?.label || undefined}
                  badges={<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{w.fields.status_wartung?.label ?? '—'}</span>}
                />
                <WartungReparaturDetails
                  record={w}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={r => overlay.push({ type: 'werkzeug', id: r.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={r => overlay.push({ type: 'handwerker', id: r.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = handwerker.find(r => r.record_id === top.id);
            if (!h) return null;
            return (
              <>
                <RecordHeader
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={h.fields.qualifikation?.label || undefined}
                  badges={<span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{h.fields.status?.label ?? '—'}</span>}
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={r => overlay.push({ type: 'ausleihe', id: r.record_id })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: h.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={r => overlay.push({ type: 'wartung', id: r.record_id })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: h.record_id } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const a = enrichedAusleihe.find(r => r.record_id === top.id);
            if (a && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: `✓ ${tc('zurueckgeben')}`, onClick: () => { markZurueckgegeben(a); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const w = enrichedWartungReparatur.find(r => r.record_id === top.id);
            if (w && (lookupKey(w.fields.status_wartung) === 'in_bearbeitung' || lookupKey(w.fields.status_wartung) === 'geplant')) {
              return { label: `✓ ${tc('abschliessen')}`, onClick: () => { markWartungAbgeschlossen(w); overlay.close(); } };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const w = werkzeuge.find(r => r.record_id === top.id);
            if (w) { overlay.close(); setWerkzeugDialog({ open: true, defaults: w.fields as WerkzeugeDialogDefaults, recordId: w.record_id }); }
          }
          if (top.type === 'ausleihe') {
            const a = ausleihe.find(r => r.record_id === top.id);
            if (a) { overlay.close(); setAusleiheDialog({ open: true, defaults: a.fields as AusleiheDialogDefaults, recordId: a.record_id }); }
          }
          if (top.type === 'wartung') {
            const w = wartungReparatur.find(r => r.record_id === top.id);
            if (w) { overlay.close(); setWartungDialog({ open: true, defaults: w.fields as WartungReparaturDialogDefaults, recordId: w.record_id }); }
          }
          if (top.type === 'handwerker') {
            const h = handwerker.find(r => r.record_id === top.id);
            if (h) { overlay.close(); setHandwerkerDialog({ open: true, defaults: h.fields as HandwerkerDialogDefaults, recordId: h.record_id }); }
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog.open}
        onClose={() => setWerkzeugDialog({ open: false })}
        onSubmit={async fields => {
          if (werkzeugDialog.recordId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugDialog.recordId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={werkzeugDialog.defaults}
        recordId={werkzeugDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog.open}
        onClose={() => setAusleiheDialog({ open: false })}
        onSubmit={async fields => {
          if (ausleiheDialog.recordId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheDialog.recordId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={ausleiheDialog.defaults}
        recordId={ausleiheDialog.recordId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog.open}
        onClose={() => setWartungDialog({ open: false })}
        onSubmit={async fields => {
          if (wartungDialog.recordId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungDialog.recordId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={wartungDialog.defaults}
        recordId={wartungDialog.recordId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialog.open}
        onClose={() => setHandwerkerDialog({ open: false })}
        onSubmit={async fields => {
          if (handwerkerDialog.recordId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerDialog.recordId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={handwerkerDialog.defaults}
        recordId={handwerkerDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
