import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
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
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { makeT } from '@/i18n';
import { tc } from '@/i18n/common';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconClipboardList,
  IconPlus,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    ctx_ok: 'Alle Werkzeuge verfügbar — kein Handlungsbedarf.',
    ctx_overdue: '{n} Ausleihe(n) überfällig — sofort handeln!',
    ctx_names: '{names} hat Werkzeug nicht rechtzeitig zurückgegeben.',
    verfuegbar: 'Verfügbar',
    ausgeliehen: 'Ausgeliehen',
    in_service: 'In Wartung/Reparatur',
    defekt: 'Defekt/Ausgemustert',
    overdue_title: 'Überfällige Rückgaben',
    maintenance_title: 'Laufende Wartungen & Reparaturen',
    return_action: 'Zurückgegeben',
    finish_action: 'Abschließen',
    new_werkzeug: 'Neues Werkzeug',
    new_ausleihe: 'Neue Ausleihe',
    new_wartung: 'Neue Wartung',
    new_handwerker: 'Neuer Handwerker',
    hero_msg: '{names} — Rückgabe war {date}',
    hero_action: 'Als zurückgegeben markieren',
    keine_ausleihen: 'Keine überfälligen Ausleihen',
    keine_wartung: 'Keine laufenden Vorgänge',
    bearbeiten: 'Bearbeiten',
  },
  en: {
    ctx_ok: 'All tools available — no action needed.',
    ctx_overdue: '{n} loan(s) overdue — immediate action required!',
    ctx_names: '{names} has not returned the tool on time.',
    verfuegbar: 'Available',
    ausgeliehen: 'Lent out',
    in_service: 'In Maintenance/Repair',
    defekt: 'Defective/Retired',
    overdue_title: 'Overdue Returns',
    maintenance_title: 'Ongoing Maintenance & Repairs',
    return_action: 'Returned',
    finish_action: 'Complete',
    new_werkzeug: 'New Tool',
    new_ausleihe: 'New Loan',
    new_wartung: 'New Maintenance',
    new_handwerker: 'New Craftsman',
    hero_msg: '{names} — due {date}',
    hero_action: 'Mark as returned',
    keine_ausleihen: 'No overdue loans',
    keine_wartung: 'No ongoing processes',
    bearbeiten: 'Edit',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

type WerkzeugDialogDefaults = { zustand?: string; [k: string]: unknown };
type AusleiheDialogDefaults = { werkzeug?: string; handwerker?: string; status_ausleihe?: string; [k: string]: unknown };
type WartungDialogDefaults = { werkzeug_wartung?: string; verantwortlicher?: string; [k: string]: unknown };

function zustandTone(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt' || key === 'ausgemustert') return 'default';
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
  const [werkzeugDialogOpen, setWerkzeugDialogOpen] = useState(false);
  const [werkzeugEdit, setWerkzeugEdit] = useState<Werkzeuge | undefined>(undefined);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugDialogDefaults | undefined>(undefined);

  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheEdit, setAusleiheEdit] = useState<EnrichedAusleihe | undefined>(undefined);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>(undefined);

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungEdit, setWartungEdit] = useState<EnrichedWartungReparatur | undefined>(undefined);
  const [wartungDefaults, setWartungDefaults] = useState<WartungDialogDefaults | undefined>(undefined);

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [handwerkerEdit, setHandwerkerEdit] = useState<Handwerker | undefined>(undefined);

  // Today key
  const today = format(clock, 'yyyy-MM-dd');

  // KPI counts
  const verfuegbarCount = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length, [werkzeuge]);
  const ausgeliehenCount = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length, [werkzeuge]);
  const inServiceCount = useMemo(() => werkzeuge.filter(w => {
    const k = lookupKey(w.fields.zustand);
    return k === 'in_reparatur' || k === 'in_wartung';
  }).length, [werkzeuge]);
  const defektCount = useMemo(() => werkzeuge.filter(w => {
    const k = lookupKey(w.fields.zustand);
    return k === 'defekt' || k === 'ausgemustert';
  }).length, [werkzeuge]);

  // Overdue loans: ausgeliehen & geplantes_rueckgabedatum < today
  const ueberfaelligeAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      a.fields.geplantes_rueckgabedatum &&
      a.fields.geplantes_rueckgabedatum < today
    ).sort((a, b) => (a.fields.geplantes_rueckgabedatum ?? '') < (b.fields.geplantes_rueckgabedatum ?? '') ? -1 : 1),
    [enrichedAusleihe, today]
  );

  // Active maintenance / repair
  const aktiveWartungen = useMemo(() =>
    enrichedWartung.filter(w => {
      const k = lookupKey(w.fields.status_wartung);
      return k === 'geplant' || k === 'in_bearbeitung';
    }).sort((a, b) => (a.fields.startdatum ?? '') < (b.fields.startdatum ?? '') ? -1 : 1),
    [enrichedWartung]
  );

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const names = namen(ueberfaelligeAusleihen.map(a => a.handwerkerName));
      return tt('ctx_names', { names });
    }
    return tt('ctx_ok');
  }, [ueberfaelligeAusleihen]);

  // Kanban columns for Werkzeuge.zustand
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const defaultCollapsed = useMemo(() => ['ausgemustert'], []);

  // Kanban cards
  const cards = useMemo<KanbanCard[]>(() =>
    werkzeuge.map(w => {
      const status = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.werkzeugname ?? '—',
        subtitle: [w.fields.inventarnummer, w.fields.hersteller].filter(Boolean).join(' · ') || undefined,
        tone: zustandTone(status),
      };
    }),
    [werkzeuge]
  );

  // Advance: mark ausleihe as zurückgegeben
  const markZurueckgegeben = useCallback(async (a: EnrichedAusleihe) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const prev = { ...a.fields };
    setAusleihe(xs => xs.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: 'Zurückgegeben' }, tatsaechliches_rueckgabedatum: now } }
        : x
    ));
    undoToast(`${a.werkzeugName} — ${tc('zurueckgegeben')}`, async () => {
      setAusleihe(xs => xs.map(x => x.record_id === a.record_id ? { ...x, fields: prev } : x));
      await LivingAppsService.updateAusleiheEntry(a.record_id, prev).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: now,
      });
    } catch {
      fetchAll();
    }
  }, [clock, setAusleihe, fetchAll]);

  // Advance: mark Wartung as abgeschlossen
  const markAbgeschlossen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prevKey = lookupKey(w.fields.status_wartung);
    const prevLabel = w.fields.status_wartung?.label ?? '';
    setWartungReparatur(xs => xs.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: 'Abgeschlossen' }, tatsaechliches_enddatum: today } }
        : x
    ));
    undoToast(`${w.werkzeug_wartungName} — ${tc('abgeschlossen')}`, async () => {
      setWartungReparatur(xs => xs.map(x =>
        x.record_id === w.record_id
          ? { ...x, fields: { ...x.fields, status_wartung: { key: prevKey ?? '', label: prevLabel } } }
          : x
      ));
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: prevKey ?? '' }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: today });
    } catch {
      fetchAll();
    }
  }, [today, setWartungReparatur, fetchAll]);

  // Kanban card move = update Werkzeuge.zustand
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === rid
        ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: LOOKUP_OPTIONS['werkzeuge']?.['zustand']?.find(o => o.key === newColumn)?.label ?? newColumn } } }
        : w
    ));
    const prevW = werkzeuge.find(w => w.record_id === rid);
    const prevKey = lookupKey(prevW?.fields.zustand);
    undoToast(`${prevW?.fields.werkzeugname ?? ''} — ${tc('geaendert')}`, async () => {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === rid
          ? { ...w, fields: { ...w.fields, zustand: prevW?.fields.zustand ?? w.fields.zustand } }
          : w
      ));
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: prevKey ?? '' }).catch(() => fetchAll());
    });
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch {
      fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Hero: first overdue loan
  const firstOverdue = ueberfaelligeAusleihen[0];

  // Helpers for overlay navigation
  const findWerkzeug = (id: string) => werkzeuge.find(w => w.record_id === id);
  const findAusleihe = (id: string) => enrichedAusleihe.find(a => a.record_id === id);
  const findWartung = (id: string) => enrichedWartung.find(w => w.record_id === id);
  const findHandwerker = (id: string) => handwerker.find(h => h.record_id === id);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            onClick={() => { setWerkzeugEdit(undefined); setWerkzeugDefaults(undefined); setWerkzeugDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('new_werkzeug')}
          </button>
          <button
            onClick={() => { setAusleiheEdit(undefined); setAusleiheDefaults(undefined); setAusleiheDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('new_ausleihe')}
          </button>
          <button
            onClick={() => { setWartungEdit(undefined); setWartungDefaults(undefined); setWartungDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('new_wartung')}
          </button>
          <button
            onClick={() => { setHandwerkerEdit(undefined); setHandwerkerDialogOpen(true); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tt('new_handwerker')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={firstOverdue ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => markZurueckgegeben(firstOverdue),
            }}
          >
            <b>{namen(ueberfaelligeAusleihen.map(a => a.handwerkerName))}</b>
            {' '}{tt('hero_msg', { names: '', date: formatDate(firstOverdue.fields.geplantes_rueckgabedatum) }).replace('{names} — ', '')}
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
              title={tt('ausgeliehen')}
              value={ausgeliehenCount}
              icon={<IconUsers size={16} />}
              tone={ausgeliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tt('in_service')}
              value={inServiceCount}
              icon={<IconTool size={16} />}
              tone={inServiceCount > 0 ? 'warning' : 'default'}
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
            defaultCollapsed={defaultCollapsed}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              if (rid) overlay.replace({ type: 'werkzeug', id: rid });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugEdit(undefined);
              setWerkzeugDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('overdue_title')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{a.handwerkerName}</span>
                    <span className="text-muted-foreground"> · {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tc('zurueckgeben'),
                  onClick: () => markZurueckgegeben(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'ausleihe', id })}
              empty={{
                text: tt('keine_ausleihen'),
                action: { label: tt('new_ausleihe'), onClick: () => { setAusleiheEdit(undefined); setAusleiheDefaults(undefined); setAusleiheDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tt('maintenance_title')}
              items={aktiveWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.vorgangsart?.label ?? '—'}
                    </span>
                    <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                  </>
                ),
                action: {
                  label: tt('finish_action'),
                  onClick: () => markAbgeschlossen(w),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'wartung', id })}
              empty={{
                text: tt('keine_wartung'),
                action: { label: tt('new_wartung'), onClick: () => { setWartungEdit(undefined); setWartungDefaults(undefined); setWartungDialogOpen(true); } },
              }}
            />
          </>
        }
      />

      {/* ── Overlay stack ── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const w = findWerkzeug(top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={w.fields.inventarnummer}
                  badges={
                    w.fields.zustand ? (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                        {w.fields.zustand.label}
                      </span>
                    ) : undefined
                  }
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ werkzeug: w.record_id }); setAusleiheEdit(undefined); setAusleiheDialogOpen(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', id: wr.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ werkzeug_wartung: w.record_id }); setWartungEdit(undefined); setWartungDialogOpen(true); }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = findAusleihe(top.id);
            if (!a) return null;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || '—'}
                  subtitle={a.handwerkerName}
                  badges={
                    a.fields.status_ausleihe ? (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                        {a.fields.status_ausleihe.label}
                      </span>
                    ) : undefined
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
            const w = findWartung(top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.werkzeug_wartungName || '—'}
                  subtitle={w.fields.vorgangsart?.label}
                  badges={
                    w.fields.status_wartung ? (
                      <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                        {w.fields.status_wartung.label}
                      </span>
                    ) : undefined
                  }
                />
                <WartungReparaturDetails
                  record={w}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={wz => overlay.push({ type: 'werkzeug', id: wz.record_id })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', id: h.record_id })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = findHandwerker(top.id);
            if (!h) return null;
            return (
              <>
                <RecordHeader
                  title={`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || '—'}
                  subtitle={h.fields.qualifikation?.label}
                  badges={
                    h.fields.status ? (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${lookupKey(h.fields.status) === 'aktiv' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                        {h.fields.status.label}
                      </span>
                    ) : undefined
                  }
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', id: a.record_id })}
                  onAddAusleihe={() => { setAusleiheDefaults({ handwerker: h.record_id }); setAusleiheEdit(undefined); setAusleiheDialogOpen(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', id: wr.record_id })}
                  onAddWartungReparatur={() => { setWartungDefaults({ verantwortlicher: h.record_id }); setWartungEdit(undefined); setWartungDialogOpen(true); }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const a = findAusleihe(top.id);
            if (a && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tc('zurueckgeben'), onClick: () => { markZurueckgegeben(a); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const w = findWartung(top.id);
            if (w) {
              const k = lookupKey(w.fields.status_wartung);
              if (k === 'geplant' || k === 'in_bearbeitung') {
                return { label: tt('finish_action'), onClick: () => { markAbgeschlossen(w); overlay.close(); } };
              }
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const w = findWerkzeug(top.id);
            if (w) { setWerkzeugEdit(w); setWerkzeugDefaults(undefined); setWerkzeugDialogOpen(true); }
          } else if (top.type === 'ausleihe') {
            const a = findAusleihe(top.id);
            if (a) { setAusleiheEdit(a); setAusleiheDefaults(undefined); setAusleiheDialogOpen(true); }
          } else if (top.type === 'wartung') {
            const w = findWartung(top.id);
            if (w) { setWartungEdit(w); setWartungDefaults(undefined); setWartungDialogOpen(true); }
          } else if (top.type === 'handwerker') {
            const h = findHandwerker(top.id);
            if (h) { setHandwerkerEdit(h); setHandwerkerDialogOpen(true); }
          }
        }}
      />

      {/* ── Dialogs ── */}
      <WerkzeugeDialog
        open={werkzeugDialogOpen}
        onClose={() => { setWerkzeugDialogOpen(false); setWerkzeugEdit(undefined); setWerkzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (werkzeugEdit) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugEdit.record_id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={werkzeugEdit ? werkzeugEdit.fields : werkzeugDefaults}
        recordId={werkzeugEdit?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setAusleiheEdit(undefined); setAusleiheDefaults(undefined); }}
        onSubmit={async fields => {
          if (ausleiheEdit) {
            await LivingAppsService.updateAusleiheEntry(ausleiheEdit.record_id, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={ausleiheEdit ? ausleiheEdit.fields : ausleiheDefaults}
        recordId={ausleiheEdit?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => { setWartungDialogOpen(false); setWartungEdit(undefined); setWartungDefaults(undefined); }}
        onSubmit={async fields => {
          if (wartungEdit) {
            await LivingAppsService.updateWartungReparaturEntry(wartungEdit.record_id, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={wartungEdit ? wartungEdit.fields : wartungDefaults}
        recordId={wartungEdit?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => { setHandwerkerDialogOpen(false); setHandwerkerEdit(undefined); }}
        onSubmit={async fields => {
          if (handwerkerEdit) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerEdit.record_id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={handwerkerEdit?.fields}
        recordId={handwerkerEdit?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </div>
  );
}
