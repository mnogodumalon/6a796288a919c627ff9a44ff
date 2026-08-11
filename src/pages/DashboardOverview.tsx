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
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
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
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconArrowBack,
  IconPlus,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    greeting_context_tools: 'Werkzeugverwaltung Elektroabteilung',
    all_ok: 'Alles im Zeitplan — keine überfälligen Ausleihen.',
    overdue_hero: '{n} Ausleihe überfällig',
    overdue_hero_pl: '{n} Ausleihen überfällig',
    return_action: 'Als zurückgegeben markieren',
    ausleihe_board: 'Ausleihen',
    wartung_liste: 'Aktive Wartungen & Reparaturen',
    werkzeuge_status: 'Werkzeugstatus',
    verfuegbar: 'Verfügbar',
    ausgeliehen_label: 'Ausgeliehen',
    in_service: 'In Service',
    defekt_label: 'Defekt',
    handwerker_label: 'Handwerker',
    neue_ausleihe: 'Neue Ausleihe',
    neues_werkzeug: 'Neues Werkzeug',
    neuer_handwerker: 'Neuer Handwerker',
    neue_wartung: 'Neue Wartung',
    abschliessen: 'Abschließen',
    context_line_no_data: 'Noch keine Ausleihen erfasst — lege jetzt los.',
    ist_ueberfaellig: '{p0} ist überfällig.',
    sind_ueberfaellig: '{p0} sind überfällig.',
    werkzeuge_ausgeliehen: '{p0} Werkzeuge ausgeliehen — {p1}',
    werkzeug_ausgeliehen: '{p0} Werkzeug ausgeliehen — {p1}',
    zurueckgegeben: 'Zurückgegeben',
    abgeschlossen: 'Abgeschlossen',
    lege_zuerst_deine_werkzeuge_und: 'Lege zuerst deine Werkzeuge und Handwerker an, dann kannst du Ausleihen und Wartungen verwalten.',
    geplante_rueckgabe_war: 'geplante Rückgabe war',
    bis: '· bis',
    keine_aktiven_wartungen_oder_rep: 'Keine aktiven Wartungen oder Reparaturen.',
  },
  en: {
    greeting_context_tools: 'Electrical department tool management',
    all_ok: 'All on schedule — no overdue loans.',
    overdue_hero: '{n} loan overdue',
    overdue_hero_pl: '{n} loans overdue',
    return_action: 'Mark as returned',
    ausleihe_board: 'Tool loans',
    wartung_liste: 'Active maintenance & repairs',
    werkzeuge_status: 'Tool status',
    verfuegbar: 'Available',
    ausgeliehen_label: 'On loan',
    in_service: 'In service',
    defekt_label: 'Defective',
    handwerker_label: 'Craftsmen',
    neue_ausleihe: 'New loan',
    neues_werkzeug: 'New tool',
    neuer_handwerker: 'New craftsman',
    neue_wartung: 'New maintenance',
    abschliessen: 'Complete',
    context_line_no_data: 'No loans recorded yet — get started now.',
    ist_ueberfaellig: '{p0} is overdue.',
    sind_ueberfaellig: '{p0} are overdue.',
    werkzeuge_ausgeliehen: '{p0} tools checked out — {p1}',
    werkzeug_ausgeliehen: '{p0} tool checked out — {p1}',
    zurueckgegeben: 'Returned',
    abgeschlossen: 'Completed',
    lege_zuerst_deine_werkzeuge_und: 'First add your tools and technicians, then you can manage checkouts and maintenance.',
    geplante_rueckgabe_war: 'scheduled return was',
    bis: '· until',
    keine_aktiven_wartungen_oder_rep: 'No active maintenance or repairs.',
  },
});

type OverlayItem =
  | { type: 'ausleihe'; id: string }
  | { type: 'werkzeuge'; id: string }
  | { type: 'handwerker'; id: string }
  | { type: 'wartung_reparatur'; id: string };

function toneForAusleiheStatus(status: string | undefined, overdue: boolean): KanbanTone {
  if (overdue) return 'destructive';
  if (status === 'zurueckgegeben') return 'success';
  if (status === 'ausgeliehen') return 'primary';
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

  // Dialog states
  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>(undefined);
  const [ausleiheEditId, setAusleiheEditId] = useState<string | undefined>(undefined);

  const [werkzeugeDialogOpen, setWerkzeugeDialogOpen] = useState(false);
  const [werkzeugeDefaults, setWerkzeugeDefaults] = useState<WerkzeugeDialogDefaults | undefined>(undefined);
  const [werkzeugeEditId, setWerkzeugeEditId] = useState<string | undefined>(undefined);

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [handwerkerDefaults, setHandwerkerDefaults] = useState<HandwerkerDialogDefaults | undefined>(undefined);
  const [handwerkerEditId, setHandwerkerEditId] = useState<string | undefined>(undefined);

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>(undefined);
  const [wartungEditId, setWartungEditId] = useState<string | undefined>(undefined);

  const todayStr = format(clock, 'yyyy-MM-dd');

  // Derived data — all before early returns
  const ausleiheColumns = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['ausleihe']?.['status_ausleihe'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const isOverdue = useCallback((a: Ausleihe) => {
    if (lookupKey(a.fields.status_ausleihe) === 'zurueckgegeben') return false;
    const due = a.fields.geplantes_rueckgabedatum;
    if (!due) return false;
    try { return isBefore(parseISO(due.slice(0, 16)), clock); } catch { return false; }
  }, [clock]);

  const ausleiheCards = useMemo<KanbanCard[]>(
    () => enrichedAusleihe.map(a => {
      const status = lookupKey(a.fields.status_ausleihe) ?? ausleiheColumns[0]?.key ?? '';
      const overdue = isOverdue(a);
      return {
        id: `ausleihe:${a.record_id}`,
        column: status,
        title: a.werkzeugName || '—',
        subtitle: a.handwerkerName + (a.fields.geplantes_rueckgabedatum ? ` · bis ${formatDateTime(a.fields.geplantes_rueckgabedatum)}` : ''),
        tone: toneForAusleiheStatus(status, overdue),
      };
    }),
    [enrichedAusleihe, ausleiheColumns, isOverdue],
  );

  const overdueAusleihe = useMemo(
    () => enrichedAusleihe.filter(a => isOverdue(a)),
    [enrichedAusleihe, isOverdue],
  );

  const verfuegbarCount = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length,
    [werkzeuge],
  );
  const ausgeliehenCount = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length,
    [werkzeuge],
  );
  const inServiceCount = useMemo(
    () => werkzeuge.filter(w => {
      const k = lookupKey(w.fields.zustand);
      return k === 'in_reparatur' || k === 'in_wartung';
    }).length,
    [werkzeuge],
  );
  const defektCount = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt').length,
    [werkzeuge],
  );
  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv').length,
    [handwerker],
  );

  const activeWartung = useMemo(
    () => enrichedWartungReparatur.filter(w => {
      const s = lookupKey(w.fields.status_wartung);
      return s === 'geplant' || s === 'in_bearbeitung';
    }),
    [enrichedWartungReparatur],
  );

  const contextLine = useMemo(() => {
    if (enrichedAusleihe.length === 0) return tt('context_line_no_data');
    if (overdueAusleihe.length > 0) {
      const names = namen(overdueAusleihe.map(a => a.werkzeugName));
      return (overdueAusleihe.length === 1 ? tt('ist_ueberfaellig', { p0: names }) : tt('sind_ueberfaellig', { p0: names }));
    }
    const ausgeliehen = enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen');
    if (ausgeliehen.length > 0) {
      return (ausgeliehen.length > 1 ? tt('werkzeuge_ausgeliehen', { p0: ausgeliehen.length, p1: tt('all_ok') }) : tt('werkzeug_ausgeliehen', { p0: ausgeliehen.length, p1: tt('all_ok') }));
    }
    return tt('all_ok');
  }, [enrichedAusleihe, overdueAusleihe]);

  // Action handlers
  const handleReturnAusleihe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = ausleihe.map(x => x);
    const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(ausleihe.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: tt('zurueckgegeben') }, tatsaechliches_rueckgabedatum: nowStr } }
        : x
    ));
    undoToast(`${a.werkzeugName} — ${tc('zurueckgegeben')}`, async () => {
      setAusleihe(prev);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: nowStr,
      });
    } catch {
      setAusleihe(prev);
      fetchAll();
    }
  }, [ausleihe, setAusleihe, clock, fetchAll]);

  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = wartungReparatur.map(x => x);
    const todayFmt = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(wartungReparatur.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: tt('abgeschlossen') }, tatsaechliches_enddatum: todayFmt } }
        : x
    ));
    undoToast(`${w.werkzeug_wartungName} — ${tc('abgeschlossen')}`, async () => {
      setWartungReparatur(prev);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: todayFmt,
      });
    } catch {
      setWartungReparatur(prev);
      fetchAll();
    }
  }, [wartungReparatur, setWartungReparatur, clock, fetchAll]);

  const handleMoveAusleiheCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const newLabel = ausleiheColumns.find(c => c.key === newColumn)?.label ?? newColumn;
    const prevAusleihe = ausleihe.map(x => x);
    setAusleihe(ausleihe.map(a =>
      a.record_id === rid
        ? { ...a, fields: { ...a.fields, status_ausleihe: { key: newColumn, label: newLabel }, ...(newColumn === 'zurueckgegeben' ? { tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } : {}) } }
        : a
    ));
    try {
      await LivingAppsService.updateAusleiheEntry(rid, { status_ausleihe: newColumn, ...(newColumn === 'zurueckgegeben' ? { tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } : {}) });
      const w = werkzeuge.find(x => {
        const a2 = ausleihe.find(a => a.record_id === rid);
        return a2 ? x.record_id === extractRecordId(a2.fields.werkzeug) : false;
      });
      if (w && newColumn === 'zurueckgegeben') {
        setWerkzeuge(werkzeuge.map(x =>
          x.record_id === w.record_id
            ? { ...x, fields: { ...x.fields, zustand: { key: 'verfuegbar', label: tt('verfuegbar') } } }
            : x
        ));
        await LivingAppsService.updateWerkzeugeEntry(w.record_id, { zustand: 'verfuegbar' });
      }
    } catch {
      setAusleihe(prevAusleihe);
      fetchAll();
    }
  }, [ausleihe, setAusleihe, ausleiheColumns, werkzeuge, setWerkzeuge, clock, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Empty state
  if (werkzeuge.length === 0 && ausleihe.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <IconTool size={48} className="text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Werkzeugverwaltung einrichten</h2>{/* i18n-exempt: onboarding only shown once */}
          <p className="text-muted-foreground text-sm max-w-xs">{tt('lege_zuerst_deine_werkzeuge_und')}</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={() => { setWerkzeugeDefaults(undefined); setWerkzeugeEditId(undefined); setWerkzeugeDialogOpen(true); }}
        >
          <IconPlus size={16} />
          {tt('neues_werkzeug')}
        </button>
      </div>
    );
  }

  const firstOverdue = overdueAusleihe[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">{contextLine}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setAusleiheDefaults({ status_ausleihe: 'ausgeliehen' }); setAusleiheEditId(undefined); setAusleiheDialogOpen(true); }}
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('neue_ausleihe')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setWerkzeugeDefaults(undefined); setWerkzeugeEditId(undefined); setWerkzeugeDialogOpen(true); }}
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('neues_werkzeug')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            onClick={() => { setHandwerkerDefaults(undefined); setHandwerkerEditId(undefined); setHandwerkerDialogOpen(true); }}
          >
            <IconPlus size={15} className="shrink-0" />
            {tt('neuer_handwerker')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={overdueAusleihe.length > 0 && firstOverdue ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('return_action'),
              onClick: () => handleReturnAusleihe(firstOverdue),
            }}
          >
            <b>{namen(overdueAusleihe.map(a => a.werkzeugName))}</b>
            {' '}{overdueAusleihe.length === 1 ? 'ist überfällig' : 'sind überfällig'} — {/* i18n-exempt: composed phrase */}
            {tt('geplante_rueckgabe_war')} {formatDateTime(firstOverdue.fields.geplantes_rueckgabedatum)}.
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('verfuegbar')}
              value={verfuegbarCount}
              icon={<IconTool size={16} />}
              tone="success"
            />
            <StatStripItem
              title={tt('ausgeliehen_label')}
              value={ausgeliehenCount}
              icon={<IconArrowBack size={16} />}
              tone={ausgeliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('in_service')}
              value={inServiceCount}
              icon={<IconTool size={16} />}
              tone={inServiceCount > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('defekt_label')}
              value={defektCount}
              tone={defektCount > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('handwerker_label')}
              value={aktiveHandwerker}
              icon={<IconUsers size={16} />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={ausleiheColumns}
            cards={ausleiheCards}
            defaultCollapsed={['zurueckgegeben']}
            onCardClick={card => overlay.replace({ type: 'ausleihe', id: card.id.split(':')[1] })}
            onCardMove={handleMoveAusleiheCard}
            onAddCard={column => {
              setAusleiheDefaults({ status_ausleihe: column });
              setAusleiheEditId(undefined);
              setAusleiheDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('wartung_liste')}
              items={activeWartung.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.vorgangsart?.label ?? '—'}
                    </span>
                    {w.verantwortlicherName ? <span className="text-muted-foreground"> · {w.verantwortlicherName}</span> : null}
                    {w.fields.geplantes_enddatum ? <span className="text-muted-foreground"> {tt('bis')} {formatDate(w.fields.geplantes_enddatum)}</span> : null}
                  </>
                ),
                action: {
                  label: tt('abschliessen'),
                  onClick: () => handleWartungAbschliessen(w),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung_reparatur', id })}
              empty={{
                text: tt('keine_aktiven_wartungen_oder_rep'),
                action: { label: tt('neue_wartung'), onClick: () => { setWartungDefaults(undefined); setWartungEditId(undefined); setWartungDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tc('ueberfaellig')}
              items={overdueAusleihe.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tc('ueberfaellig')}</span>
                    {a.handwerkerName ? <span className="text-muted-foreground"> · {a.handwerkerName}</span> : null}
                    {a.fields.geplantes_rueckgabedatum ? <span className="text-muted-foreground"> · {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span> : null}
                  </>
                ),
                action: {
                  label: tt('return_action'),
                  onClick: () => handleReturnAusleihe(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('all_ok'),
              }}
            />
          </>
        }
      />

      {/* Overlays */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (!rec) return null;
            const enriched = enrichedAusleihe.find(a => a.record_id === top.id)!;
            return (
              <>
                <RecordHeader
                  title={enriched.werkzeugName || '—'}
                  subtitle={rec.fields.status_ausleihe?.label}
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
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (!rec) return null;
            return (
              <>
                <RecordHeader
                  title={rec.fields.werkzeugname || '—'}
                  subtitle={rec.fields.zustand?.label}
                />
                <WerkzeugeDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ werkzeug: rec.record_id, status_ausleihe: 'ausgeliehen' });
                    setAusleiheEditId(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung_reparatur', id: w.record_id })}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: rec.record_id });
                    setWartungEditId(undefined);
                    setWartungDialogOpen(true);
                  }}
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
                />
                <HandwerkerDetails
                  record={rec}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ handwerker: rec.record_id, status_ausleihe: 'ausgeliehen' });
                    setAusleiheEditId(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => overlay.push({ type: 'wartung_reparatur', id: w.record_id })}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: rec.record_id });
                    setWartungEditId(undefined);
                    setWartungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'wartung_reparatur') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (!rec) return null;
            const enriched = enrichedWartungReparatur.find(w => w.record_id === top.id)!;
            return (
              <>
                <RecordHeader
                  title={enriched.werkzeug_wartungName || '—'}
                  subtitle={rec.fields.vorgangsart?.label}
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
            const a = enrichedAusleihe.find(x => x.record_id === top.id);
            if (a && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tt('return_action'), onClick: () => { handleReturnAusleihe(a); overlay.close(); } };
            }
          }
          if (top.type === 'wartung_reparatur') {
            const w = enrichedWartungReparatur.find(x => x.record_id === top.id);
            if (w) {
              const s = lookupKey(w.fields.status_wartung);
              if (s === 'geplant' || s === 'in_bearbeitung') {
                return { label: tt('abschliessen'), onClick: () => { handleWartungAbschliessen(w); overlay.close(); } };
              }
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'ausleihe') {
            const rec = ausleihe.find(a => a.record_id === top.id);
            if (rec) { setAusleiheDefaults(rec.fields as AusleiheDialogDefaults); setAusleiheEditId(rec.record_id); setAusleiheDialogOpen(true); }
          } else if (top.type === 'werkzeuge') {
            const rec = werkzeuge.find(w => w.record_id === top.id);
            if (rec) { setWerkzeugeDefaults(rec.fields as WerkzeugeDialogDefaults); setWerkzeugeEditId(rec.record_id); setWerkzeugeDialogOpen(true); }
          } else if (top.type === 'handwerker') {
            const rec = handwerker.find(h => h.record_id === top.id);
            if (rec) { setHandwerkerDefaults(rec.fields as HandwerkerDialogDefaults); setHandwerkerEditId(rec.record_id); setHandwerkerDialogOpen(true); }
          } else if (top.type === 'wartung_reparatur') {
            const rec = wartungReparatur.find(w => w.record_id === top.id);
            if (rec) { setWartungDefaults(rec.fields as WartungReparaturDialogDefaults); setWartungEditId(rec.record_id); setWartungDialogOpen(true); }
          }
        }}
      />

      {/* Dialogs */}
      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setAusleiheDefaults(undefined); setAusleiheEditId(undefined); }}
        onSubmit={async fields => {
          if (ausleiheEditId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheEditId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={ausleiheDefaults}
        recordId={ausleiheEditId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WerkzeugeDialog
        open={werkzeugeDialogOpen}
        onClose={() => { setWerkzeugeDialogOpen(false); setWerkzeugeDefaults(undefined); setWerkzeugeEditId(undefined); }}
        onSubmit={async fields => {
          if (werkzeugeEditId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugeEditId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={werkzeugeDefaults}
        recordId={werkzeugeEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => { setHandwerkerDialogOpen(false); setHandwerkerDefaults(undefined); setHandwerkerEditId(undefined); }}
        onSubmit={async fields => {
          if (handwerkerEditId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerEditId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={handwerkerDefaults}
        recordId={handwerkerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => { setWartungDialogOpen(false); setWartungDefaults(undefined); setWartungEditId(undefined); }}
        onSubmit={async fields => {
          if (wartungEditId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungEditId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={wartungDefaults}
        recordId={wartungEditId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />
    </>
  );
}
