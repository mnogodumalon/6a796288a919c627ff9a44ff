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
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import type { WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import type { AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import type { WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT, appLabel } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconClockExclamation,
  IconPlus,
  IconCheck,
  IconArrowBack,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    contextLine: 'Werkzeugmanagement der Elektroabteilung.',
    verfuegbar: 'Verfügbar',
    ausgeliehen: 'Ausgeliehen',
    inReparatur: 'In Reparatur',
    defekt: 'Defekt',
    aktiveAusleihen: 'Aktive Ausleihen',
    laufendeWartungen: 'Laufende Wartungen',
    ueberfaelligBanner: '{names} — Rückgabe überfällig',
    werkzeugZurueck: 'Werkzeug zurückgenommen',
    werkzeugStatus: 'Zustand geändert',
    neueAusleihe: 'Neue Ausleihe',
    neueWartung: 'Neue Wartung',
    neuesWerkzeug: 'Neues Werkzeug',
    neuerHandwerker: 'Neuer Handwerker',
    ausleihAbschliessen: 'Zurückgegeben',
    wartungAbschliessen: 'Abschließen',
    keinAusleihen: 'Keine aktiven Ausleihen — alle Werkzeuge verfügbar',
    keineWartungen: 'Keine laufenden Wartungen',
    gesamtWerkzeuge: 'Werkzeuge gesamt',
    aktivHandwerker: 'Aktive Handwerker',
    ueberfaelligAusleihen: 'Überfällige Rückgaben',
    handwerkerVerwalten: 'Handwerker verwalten',
    erstesWerkzeug: 'Erstes Werkzeug aufnehmen',
    einrichtenText: 'Richte das Werkzeugmanagement ein — beginne mit dem ersten Werkzeug.',
    abgeschlossen: 'Abgeschlossen',
    rueckgabe_ueberfaellig: '{p0} — Rückgabe überfällig.',
    rueckgabe: '— Rückgabe',
    werkzeuge: '{p0} Werkzeuge',
    faellig: 'fällig',
    bis: '· bis',
  },
  en: {
    contextLine: 'Tool management for the electrical department.',
    verfuegbar: 'Available',
    ausgeliehen: 'Checked Out',
    inReparatur: 'In Repair',
    defekt: 'Defective',
    aktiveAusleihen: 'Active Loans',
    laufendeWartungen: 'Ongoing Maintenance',
    ueberfaelligBanner: '{names} — return overdue',
    werkzeugZurueck: 'Tool returned',
    werkzeugStatus: 'Condition updated',
    neueAusleihe: 'New Loan',
    neueWartung: 'New Maintenance',
    neuesWerkzeug: 'New Tool',
    neuerHandwerker: 'New Craftsman',
    ausleihAbschliessen: 'Return',
    wartungAbschliessen: 'Complete',
    keinAusleihen: 'No active loans — all tools available',
    keineWartungen: 'No ongoing maintenance',
    gesamtWerkzeuge: 'Total Tools',
    aktivHandwerker: 'Active Craftsmen',
    ueberfaelligAusleihen: 'Overdue Returns',
    handwerkerVerwalten: 'Manage Craftsmen',
    erstesWerkzeug: 'Add First Tool',
    einrichtenText: 'Set up tool management — start with the first tool.',
    abgeschlossen: 'Completed',
    rueckgabe_ueberfaellig: '{p0} — Return overdue.',
    rueckgabe: '— Return',
    werkzeuge: '{p0} Tools',
    faellig: 'due',
    bis: '· until',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; record: Werkzeuge }
  | { type: 'ausleihe'; record: Ausleihe }
  | { type: 'wartung'; record: WartungReparatur }
  | { type: 'handwerker'; record: Handwerker };

export default function DashboardOverview() {
  const {
    handwerker, setHandwerker, werkzeuge, setWerkzeuge,
    ausleihe, setAusleihe, wartungReparatur, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; editId?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; editId?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; editId?: string }>({ open: false });
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const today = format(clock, 'yyyy-MM-dd');
  const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");

  // Derived data
  const aktiveAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe]);

  const ueberfaelligeAusleihen = useMemo(() =>
    aktiveAusleihen.filter(a =>
      a.fields.geplantes_rueckgabedatum && a.fields.geplantes_rueckgabedatum < nowStr
    ),
    [aktiveAusleihen, nowStr]);

  const laufendeWartungen = useMemo(() =>
    enrichedWartungReparatur.filter(w => {
      const s = lookupKey(w.fields.status_wartung);
      return s === 'geplant' || s === 'in_bearbeitung';
    }),
    [enrichedWartungReparatur]);

  const aktivHandwerker = useMemo(() =>
    handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker]);

  const verfuegbareWerkzeuge = useMemo(() =>
    werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length,
    [werkzeuge]);

  // Kanban: Werkzeuge by Zustand
  const kanbanColumns = useMemo((): KanbanColumn[] =>
    (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []);

  const filteredWerkzeuge = useMemo(() =>
    statusFilter ? werkzeuge.filter(w => lookupKey(w.fields.zustand) === statusFilter) : werkzeuge,
    [werkzeuge, statusFilter]);

  const kanbanCards = useMemo((): KanbanCard[] =>
    filteredWerkzeuge.map(w => ({
      id: w.record_id,
      column: lookupKey(w.fields.zustand) ?? '',
      title: w.fields.werkzeugname ?? '—',
      subtitle: [w.fields.inventarnummer, w.fields.hersteller].filter(Boolean).join(' · ') || undefined,
      tone: lookupKey(w.fields.zustand) === 'defekt' ? 'destructive' as const
        : lookupKey(w.fields.zustand) === 'in_reparatur' || lookupKey(w.fields.zustand) === 'in_wartung' ? 'warning' as const
        : undefined,
    })),
    [filteredWerkzeuge]);

  // Advance Ausleihe → zurückgegeben
  const returnAusleihe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = [...ausleihe];
    const prevWerkzeuge = [...werkzeuge];
    const werkzeugId = extractRecordId(a.fields.werkzeug);

    setAusleihe(ausleihe.map(r => r.record_id === a.record_id
      ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: tt('ausleihAbschliessen') }, tatsaechliches_rueckgabedatum: nowStr } }
      : r
    ));
    if (werkzeugId) {
      setWerkzeuge(werkzeuge.map(w => w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
        : w
      ));
    }

    undoToast(`${a.werkzeugName} — ${tc('zurueckgegeben')}`, async () => {
      setAusleihe(prev);
      setWerkzeuge(prevWerkzeuge);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
    });

    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: nowStr,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setAusleihe(prev);
      setWerkzeuge(prevWerkzeuge);
      await fetchAll();
    }
  }, [ausleihe, werkzeuge, setAusleihe, setWerkzeuge, nowStr, fetchAll]);

  // Advance Wartung → abgeschlossen
  const completeWartung = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = [...wartungReparatur];
    const prevWerkzeuge = [...werkzeuge];
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);

    setWartungReparatur(wartungReparatur.map(r => r.record_id === w.record_id
      ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: tt('abgeschlossen') }, tatsaechliches_enddatum: today } }
      : r
    ));
    if (werkzeugId) {
      setWerkzeuge(werkzeuge.map(wz => wz.record_id === werkzeugId
        ? { ...wz, fields: { ...wz.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
        : wz
      ));
    }

    undoToast(`${w.werkzeug_wartungName} — ${tc('abgeschlossen')}`, async () => {
      setWartungReparatur(prev);
      setWerkzeuge(prevWerkzeuge);
      const prevKey = lookupKey(w.fields.status_wartung) ?? 'in_bearbeitung';
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: prevKey });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'in_wartung' });
    });

    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: today,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      setWartungReparatur(prev);
      setWerkzeuge(prevWerkzeuge);
      await fetchAll();
    }
  }, [wartungReparatur, werkzeuge, setWartungReparatur, setWerkzeuge, today, fetchAll]);

  // Kanban drag → Zustand change
  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const wz = werkzeuge.find(w => w.record_id === cardId);
    if (!wz) return;
    const prev = [...werkzeuge];
    const newLabel = LOOKUP_OPTIONS['werkzeuge']?.['zustand']?.find(o => o.key === newColumn)?.label ?? newColumn;
    setWerkzeuge(werkzeuge.map(w => w.record_id === cardId
      ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: newLabel } } }
      : w
    ));
    undoToast(`${wz.fields.werkzeugname} — ${tt('werkzeugStatus')}`, async () => {
      setWerkzeuge(prev);
      await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: lookupKey(wz.fields.zustand) ?? '' });
    });
    try {
      await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: newColumn });
    } catch {
      setWerkzeuge(prev);
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Greeting context line
  const ueberfaelligNames = ueberfaelligeAusleihen.map(a => a.werkzeugName);
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tt('rueckgabe_ueberfaellig', { p0: namen(ueberfaelligNames) })
    : werkzeuge.length === 0
    ? tt('einrichtenText')
    : tt('contextLine');

  // Empty state
  if (werkzeuge.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <IconTool size={48} className="text-primary" stroke={1.5} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{gruss(clock)}</h1>
          <p className="text-muted-foreground max-w-sm">{tt('einrichtenText')}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          onClick={() => setWerkzeugDialog({ open: true })}
        >
          <IconPlus size={16} />
          {tt('erstesWerkzeug')}
        </button>
        <WerkzeugeDialog
          open={werkzeugDialog.open}
          onClose={() => setWerkzeugDialog({ open: false })}
          onSubmit={async fields => { await LivingAppsService.createWerkzeugeEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{contextLine}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            onClick={() => setHandwerkerDialog({ open: true })}
          >
            <IconUsers size={15} />
            <span className="hidden sm:inline">{tt('neuerHandwerker')}</span>
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            onClick={() => setWerkzeugDialog({ open: true })}
          >
            <IconPlus size={15} />
            <span className="hidden sm:inline">{tt('neuesWerkzeug')}</span>
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 && (
          <HeroBanner
            icon={<IconClockExclamation size={18} />}
            action={{
              label: tt('ausleihAbschliessen'),
              onClick: () => returnAusleihe(ueberfaelligeAusleihen[0]),
            }}
          >
            <b>{namen(ueberfaelligNames)}</b> {tt('rueckgabe')}{' '}
            {(ueberfaelligeAusleihen.length > 1 ? tt('werkzeuge', { p0: ueberfaelligeAusleihen.length }) : tt('faellig'))}
            {ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum &&
              ` seit ${formatDateTime(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}`}.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('gesamtWerkzeuge')}
              value={werkzeuge.length}
              icon={<IconTool size={15} />}
            />
            <StatStripItem
              title={tt('verfuegbar')}
              value={verfuegbareWerkzeuge}
              tone={verfuegbareWerkzeuge > 0 ? 'success' : 'default'}
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tt('ausgeliehen')}
              value={aktiveAusleihen.length}
              tone={aktiveAusleihen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'ausgeliehen' ? null : 'ausgeliehen')}
              active={statusFilter === 'ausgeliehen'}
            />
            <StatStripItem
              title={tt('ueberfaelligAusleihen')}
              value={ueberfaelligeAusleihen.length}
              icon={<IconClockExclamation size={15} />}
              tone={ueberfaelligeAusleihen.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('aktivHandwerker')}
              value={aktivHandwerker.length}
              icon={<IconUsers size={15} />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const wz = werkzeuge.find(w => w.record_id === card.id);
              if (wz) overlay.replace({ type: 'werkzeug', record: wz });
            }}
            onCardMove={handleCardMove}
            onAddCard={col => setWerkzeugDialog({ open: true, defaults: { zustand: col } })}
          />
        }
        aside={<>
          <WorkList
            title={tt('aktiveAusleihen')}
            items={aktiveAusleihen.slice(0, 8).map(a => ({
              id: a.record_id,
              title: a.werkzeugName || '—',
              secondLine: (
                <>
                  <span className="font-medium text-foreground">{a.handwerkerName}</span>
                  {a.fields.geplantes_rueckgabedatum && (
                    <span className={`text-muted-foreground ml-1 ${a.fields.geplantes_rueckgabedatum < nowStr ? 'text-destructive' : ''}`}>
                      {tt('bis')} {formatDateTime(a.fields.geplantes_rueckgabedatum)}
                    </span>
                  )}
                </>
              ),
              action: { label: tc('zurueckgeben'), onClick: () => returnAusleihe(a) },
            }))}
            onItemClick={id => {
              const a = ausleihe.find(r => r.record_id === id);
              if (a) overlay.replace({ type: 'ausleihe', record: a });
            }}
            empty={{
              text: tt('keinAusleihen'),
              action: { label: tt('neueAusleihe'), onClick: () => setAusleiheDialog({ open: true }) },
            }}
          />
          <WorkList
            title={tt('laufendeWartungen')}
            items={laufendeWartungen.slice(0, 6).map(w => ({
              id: w.record_id,
              title: w.werkzeug_wartungName || '—',
              secondLine: (
                <>
                  <span className={`font-medium ${lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'text-destructive' : 'text-warning'}`}>
                    {w.fields.vorgangsart?.label}
                  </span>
                  {w.verantwortlicherName && (
                    <span className="text-muted-foreground ml-1">· {w.verantwortlicherName}</span>
                  )}
                </>
              ),
              action: { label: tt('wartungAbschliessen'), onClick: () => completeWartung(w) },
            }))}
            onItemClick={id => {
              const w = wartungReparatur.find(r => r.record_id === id);
              if (w) overlay.replace({ type: 'wartung', record: w });
            }}
            empty={{
              text: tt('keineWartungen'),
              action: { label: tt('neueWartung'), onClick: () => setWartungDialog({ open: true }) },
            }}
          />
        </>}
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const wz = top.record;
            return (
              <>
                <RecordHeader
                  title={wz.fields.werkzeugname ?? '—'}
                  subtitle={[wz.fields.hersteller, wz.fields.modell].filter(Boolean).join(' ')}
                  badges={wz.fields.zustand && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      lookupKey(wz.fields.zustand) === 'verfuegbar' ? 'bg-success/10 text-success ring-success/20'
                      : lookupKey(wz.fields.zustand) === 'defekt' ? 'bg-destructive/10 text-destructive ring-destructive/20'
                      : 'bg-warning/10 text-warning ring-warning/20'
                    }`}>{wz.fields.zustand.label}</span>
                  )}
                  actions={
                    <div className="flex gap-2">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={() => setAusleiheDialog({ open: true, defaults: { werkzeug: wz.record_id } })}
                      >
                        <IconArrowBack size={14} />
                        {tt('neueAusleihe')}
                      </button>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                        onClick={() => setWerkzeugDialog({ open: true, defaults: wz.fields as WerkzeugeDialogDefaults, editId: wz.record_id })}
                      >
                        {tc('bearbeiten')}
                      </button>
                    </div>
                  }
                />
                <WerkzeugeDetails
                  record={wz}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={r => overlay.push({ type: 'ausleihe', record: r })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: wz.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={r => overlay.push({ type: 'wartung', record: r })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { werkzeug_wartung: wz.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = top.record;
            const enriched = enrichedAusleihe.find(e => e.record_id === a.record_id) ?? { ...a, werkzeugName: '', handwerkerName: '' };
            return (
              <>
                <RecordHeader
                  title={enriched.werkzeugName || a.record_id}
                  subtitle={enriched.handwerkerName}
                  badges={a.fields.status_ausleihe && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' ? 'bg-primary/10 text-primary ring-primary/20' : 'bg-success/10 text-success ring-success/20'
                    }`}>{a.fields.status_ausleihe.label}</span>
                  )}
                />
                <AusleiheDetails
                  record={a}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={r => overlay.push({ type: 'werkzeug', record: r })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={r => overlay.push({ type: 'handwerker', record: r })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const w = top.record;
            const enriched = enrichedWartungReparatur.find(e => e.record_id === w.record_id) ?? { ...w, werkzeug_wartungName: '', verantwortlicherName: '' };
            return (
              <>
                <RecordHeader
                  title={enriched.werkzeug_wartungName || w.record_id}
                  subtitle={w.fields.vorgangsart?.label}
                  badges={w.fields.status_wartung && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      lookupKey(w.fields.status_wartung) === 'abgeschlossen' ? 'bg-success/10 text-success ring-success/20'
                      : lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'bg-warning/10 text-warning ring-warning/20'
                      : 'bg-muted/50 text-muted-foreground ring-border'
                    }`}>{w.fields.status_wartung.label}</span>
                  )}
                />
                <WartungReparaturDetails
                  record={w}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={r => overlay.push({ type: 'werkzeug', record: r })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={r => overlay.push({ type: 'handwerker', record: r })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = top.record;
            return (
              <>
                <RecordHeader
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={h.fields.qualifikation?.label}
                  badges={h.fields.status && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      lookupKey(h.fields.status) === 'aktiv' ? 'bg-success/10 text-success ring-success/20' : 'bg-muted/50 text-muted-foreground ring-border'
                    }`}>{h.fields.status.label}</span>
                  )}
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={r => overlay.push({ type: 'ausleihe', record: r })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: h.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={r => overlay.push({ type: 'wartung', record: r })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: h.record_id } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen') {
            const enriched = enrichedAusleihe.find(e => e.record_id === top.record.record_id) ?? { ...top.record, werkzeugName: '', handwerkerName: '' };
            return { label: tt('ausleihAbschliessen'), onClick: () => returnAusleihe(enriched as EnrichedAusleihe) };
          }
          if (top.type === 'wartung') {
            const s = lookupKey(top.record.fields.status_wartung);
            if (s === 'geplant' || s === 'in_bearbeitung') {
              const enriched = enrichedWartungReparatur.find(e => e.record_id === top.record.record_id) ?? { ...top.record, werkzeug_wartungName: '', verantwortlicherName: '' };
              return { label: tt('wartungAbschliessen'), onClick: () => completeWartung(enriched as EnrichedWartungReparatur) };
            }
          }
          return undefined;
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog.open}
        onClose={() => setWerkzeugDialog({ open: false })}
        recordId={werkzeugDialog.editId}
        defaultValues={werkzeugDialog.defaults}
        onSubmit={async fields => {
          if (werkzeugDialog.editId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugDialog.editId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog.open}
        onClose={() => setAusleiheDialog({ open: false })}
        recordId={ausleiheDialog.editId}
        defaultValues={ausleiheDialog.defaults}
        onSubmit={async fields => {
          if (ausleiheDialog.editId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheDialog.editId, fields);
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
        open={wartungDialog.open}
        onClose={() => setWartungDialog({ open: false })}
        recordId={wartungDialog.editId}
        defaultValues={wartungDialog.defaults}
        onSubmit={async fields => {
          if (wartungDialog.editId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungDialog.editId, fields);
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
        open={handwerkerDialog.open}
        onClose={() => setHandwerkerDialog({ open: false })}
        recordId={handwerkerDialog.editId}
        onSubmit={async fields => {
          await LivingAppsService.createHandwerkerEntry(fields);
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
