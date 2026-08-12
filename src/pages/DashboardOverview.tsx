import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
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
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordOverlay,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconTool,
  IconAlertTriangle,
  IconClock,
  IconPlus,
  IconCheck,
  IconUsers,
} from '@tabler/icons-react';

// Pre-generated overlay union
export type OverlayItem =
  | { type: 'handwerker'; record: Handwerker }
  | { type: 'werkzeuge'; record: Werkzeuge }
  | { type: 'ausleihe'; record: EnrichedAusleihe }
  | { type: 'wartung_reparatur'; record: EnrichedWartungReparatur };

function toneForZustand(zustand: string | undefined): KanbanTone {
  if (zustand === 'verfuegbar') return 'success';
  if (zustand === 'ausgeliehen') return 'primary';
  if (zustand === 'in_reparatur' || zustand === 'in_wartung') return 'warning';
  if (zustand === 'defekt') return 'destructive';
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

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const clock = useClock();
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugeDialogOpen, setWerkzeugeDialogOpen] = useState(false);
  const [werkzeugeDefaults, setWerkzeugeDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [editingWerkzeug, setEditingWerkzeug] = useState<Werkzeuge | undefined>();

  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [editingAusleihe, setEditingAusleihe] = useState<EnrichedAusleihe | undefined>();

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [editingWartung, setEditingWartung] = useState<EnrichedWartungReparatur | undefined>();

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [editingHandwerker, setEditingHandwerker] = useState<Handwerker | undefined>();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Kanban columns for Werkzeuge.zustand
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Cards: werkzeuge → KanbanCard
  const cards = useMemo<KanbanCard[]>(
    () => werkzeuge
      .filter(w => !statusFilter || lookupKey(w.fields.zustand) === statusFilter)
      .map(w => {
        const zustand = lookupKey(w.fields.zustand) ?? 'verfuegbar';
        return {
          id: `werkzeug:${w.record_id}`,
          column: zustand,
          title: w.fields.werkzeugname ?? tx('Unbenanntes Werkzeug'),
          subtitle: [w.fields.kategorie?.label, w.fields.hersteller].filter(Boolean).join(' · ') || undefined,
          tone: toneForZustand(zustand),
        };
      }),
    [werkzeuge, statusFilter],
  );

  // KPIs
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'), [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen'), [werkzeuge]);
  const inWartungReparatur = useMemo(() => werkzeuge.filter(w => {
    const z = lookupKey(w.fields.zustand);
    return z === 'in_reparatur' || z === 'in_wartung';
  }), [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'), [werkzeuge]);

  // Überfällige Ausleihen
  const today = format(clock, 'yyyy-MM-dd');
  const ueberfaelligeAusleihen = useMemo(() => enrichedAusleihe.filter(a => {
    const status = lookupKey(a.fields.status_ausleihe);
    const geplant = a.fields.geplantes_rueckgabedatum;
    if (status !== 'ausgeliehen') return false;
    if (!geplant) return false;
    return geplant.slice(0, 10) < today;
  }), [enrichedAusleihe, today]);

  // Aktive Ausleihen (ausgeliehen, nicht überfällig)
  const aktiveAusleihen = useMemo(() => enrichedAusleihe.filter(a => {
    const status = lookupKey(a.fields.status_ausleihe);
    return status === 'ausgeliehen' && !ueberfaelligeAusleihen.some(u => u.record_id === a.record_id);
  }), [enrichedAusleihe, ueberfaelligeAusleihen]);

  // Laufende Wartungen
  const laufendeWartungen = useMemo(() => enrichedWartungReparatur.filter(w => {
    const status = lookupKey(w.fields.status_wartung);
    return status === 'geplant' || status === 'in_bearbeitung';
  }), [enrichedWartungReparatur]);

  // Rückgabe-Aktion (optimistisch)
  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = a.fields.status_ausleihe;
    const prevDatum = a.fields.tatsaechliches_rueckgabedatum;
    const nowStr = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(list => list.map(x => x.record_id === a.record_id
      ? { ...x, fields: { ...x.fields, status_ausleihe: lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben'), tatsaechliches_rueckgabedatum: nowStr } }
      : x
    ));
    undoToast(tx`${a.werkzeugName} — zurückgegeben`, async () => {
      setAusleihe(list => list.map(x => x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: prev, tatsaechliches_rueckgabedatum: prevDatum } }
        : x
      ));
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: lookupKey(prev), tatsaechliches_rueckgabedatum: prevDatum ?? undefined });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'zurueckgegeben', tatsaechliches_rueckgabedatum: nowStr });
    } catch {
      await fetchAll();
    }
  }, [clock, setAusleihe, fetchAll]);

  // Wartung abschließen
  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = w.fields.status_wartung;
    const prevEnd = w.fields.tatsaechliches_enddatum;
    const nowDate = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(list => list.map(x => x.record_id === w.record_id
      ? { ...x, fields: { ...x.fields, status_wartung: lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen'), tatsaechliches_enddatum: nowDate } }
      : x
    ));
    undoToast(tx`${w.werkzeug_wartungName} — Wartung abgeschlossen`, async () => {
      setWartungReparatur(list => list.map(x => x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: prev, tatsaechliches_enddatum: prevEnd } }
        : x
      ));
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: lookupKey(prev), tatsaechliches_enddatum: prevEnd ?? undefined });
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: nowDate });
    } catch {
      await fetchAll();
    }
  }, [clock, setWartungReparatur, fetchAll]);

  // Kanban card move
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const w = werkzeuge.find(x => x.record_id === rid);
    if (!w) return;
    const prevZustand = w.fields.zustand;
    setWerkzeuge(prev => prev.map(x => x.record_id === rid
      ? { ...x, fields: { ...x.fields, zustand: lookupOption('werkzeuge', 'zustand', newColumn) } }
      : x
    ));
    undoToast(tx`${w.fields.werkzeugname ?? ''} — Zustand geändert`);
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch {
      setWerkzeuge(prev => prev.map(x => x.record_id === rid
        ? { ...x, fields: { ...x.fields, zustand: prevZustand } }
        : x
      ));
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  // ─── ALL hooks ABOVE this line ───
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below: plain derivations only ───

  const aktiveHW = handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv');
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tx`${namen(ueberfaelligeAusleihen.map(a => a.werkzeugName))} überfällig — sofort zurückfordern.`
    : aktiveAusleihen.length > 0
      ? tx`${String(aktiveAusleihen.length)} Werkzeuge ausgeliehen, ${String(verfuegbar.length)} verfügbar.`
      : tx`Alle Werkzeuge verfügbar — Lager auf Stand.`;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="mt-1 text-muted-foreground text-sm">{contextLine}</p>
          </div>
          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            onClick={() => { setWerkzeugeDefaults(undefined); setEditingWerkzeug(undefined); setWerkzeugeDialogOpen(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Werkzeug aufnehmen')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Rückgabe erfassen'),
              onClick: () => handleRueckgabe(ueberfaelligeAusleihen[0]),
            }}
          >
            <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName))}</b>{' '}
            {tx('überfällig — geplante Rückgabe')}{' '}
            {formatDate(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}.
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone="success"
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehen.length}
              icon={<IconTool size={16} />}
              tone={ausgeliehen.length > 0 ? 'primary' : 'default'}
              onClick={() => setStatusFilter(f => f === 'ausgeliehen' ? null : 'ausgeliehen')}
              active={statusFilter === 'ausgeliehen'}
            />
            <StatStripItem
              title={tx('Wartung / Reparatur')}
              value={inWartungReparatur.length}
              icon={<IconTool size={16} />}
              tone={inWartungReparatur.length > 0 ? 'warning' : 'default'}
              onClick={() => setStatusFilter(f => (f === 'in_reparatur' || f === 'in_wartung') ? null : 'in_reparatur')}
              active={statusFilter === 'in_reparatur' || statusFilter === 'in_wartung'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
              onClick={() => setStatusFilter(f => f === 'defekt' ? null : 'defekt')}
              active={statusFilter === 'defekt'}
            />
            <StatStripItem
              title={appLabel('handwerker')}
              value={aktiveHW.length}
              icon={<IconUsers size={16} />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setWerkzeugeDefaults({ zustand: column });
              setEditingWerkzeug(undefined);
              setWerkzeugeDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={[...ueberfaelligeAusleihen, ...aktiveAusleihen].slice(0, 10).map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={ueberfaelligeAusleihen.some(u => u.record_id === a.record_id) ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                      {a.handwerkerName}
                    </span>
                    {a.fields.geplantes_rueckgabedatum && (
                      <span className="text-muted-foreground"> · {tx('bis')} {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Zurück'),
                  onClick: () => handleRueckgabe(a),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Keine Ausleihen aktiv — alle Werkzeuge im Lager'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => { setAusleiheDefaults(undefined); setEditingAusleihe(undefined); setAusleiheDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tx('Laufende Wartung & Reparatur')}
              items={laufendeWartungen.slice(0, 8).map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'font-medium text-warning' : 'text-muted-foreground'}>
                      {w.fields.vorgangsart?.label}
                    </span>
                    {w.fields.geplantes_enddatum && (
                      <span className="text-muted-foreground"> · {tx('bis')} {formatDate(w.fields.geplantes_enddatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Abschließen'),
                  onClick: () => handleWartungAbschliessen(w),
                },
              }))}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(x => x.record_id === id);
                if (w) overlay.replace({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine offenen Wartungen — alles erledigt'),
                action: { label: tx('Wartung erfassen'), onClick: () => { setWartungDefaults(undefined); setEditingWartung(undefined); setWartungDialogOpen(true); } },
              }}
            />
          </>
        }
      />

      {/* ─── Overlays ─── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record as Werkzeuge;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={w.fields.kategorie?.label}
                  badges={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      lookupKey(w.fields.zustand) === 'verfuegbar' ? 'bg-success/10 text-success' :
                      lookupKey(w.fields.zustand) === 'ausgeliehen' ? 'bg-primary/10 text-primary' :
                      lookupKey(w.fields.zustand) === 'defekt' ? 'bg-destructive/10 text-destructive' :
                      'bg-warning/10 text-warning'
                    }`}>
                      {w.fields.zustand?.label ?? '—'}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ werkzeug: w.record_id });
                    setEditingAusleihe(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: w.record_id });
                    setEditingWartung(undefined);
                    setWartungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = top.record as EnrichedAusleihe;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || tx('Ausleihe')}
                  subtitle={a.handwerkerName}
                  badges={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'
                    }`}>
                      {a.fields.status_ausleihe?.label ?? '—'}
                    </span>
                  }
                />
                <AusleiheDetails
                  record={a}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', record: w })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'wartung_reparatur') {
            const w = top.record as EnrichedWartungReparatur;
            return (
              <>
                <RecordHeader
                  title={w.werkzeug_wartungName || tx('Wartung & Reparatur')}
                  subtitle={w.fields.vorgangsart?.label}
                  badges={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      lookupKey(w.fields.status_wartung) === 'abgeschlossen' ? 'bg-success/10 text-success' :
                      lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'bg-warning/10 text-warning' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {w.fields.status_wartung?.label ?? '—'}
                    </span>
                  }
                />
                <WartungReparaturDetails
                  record={w}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={wz => overlay.push({ type: 'werkzeuge', record: wz })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = top.record as Handwerker;
            return (
              <>
                <RecordHeader
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || tx('Handwerker')}
                  subtitle={h.fields.qualifikation?.label}
                  badges={
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      lookupKey(h.fields.status) === 'aktiv' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {h.fields.status?.label ?? '—'}
                    </span>
                  }
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ handwerker: h.record_id });
                    setEditingAusleihe(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: h.record_id });
                    setEditingWartung(undefined);
                    setWartungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record as Werkzeuge;
            return {
              label: tx('Bearbeiten'),
              onClick: () => { setEditingWerkzeug(w); setWerkzeugeDefaults(w.fields as WerkzeugeDialogDefaults); setWerkzeugeDialogOpen(true); },
            };
          }
          if (top.type === 'ausleihe') {
            const a = top.record as EnrichedAusleihe;
            if (lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tx('Rückgabe erfassen'), onClick: () => handleRueckgabe(a) };
            }
            return undefined;
          }
          if (top.type === 'wartung_reparatur') {
            const w = top.record as EnrichedWartungReparatur;
            const status = lookupKey(w.fields.status_wartung);
            if (status === 'geplant' || status === 'in_bearbeitung') {
              return { label: tx('Abschließen'), onClick: () => handleWartungAbschliessen(w) };
            }
            return undefined;
          }
          if (top.type === 'handwerker') {
            const h = top.record as Handwerker;
            return {
              label: tx('Bearbeiten'),
              onClick: () => { setEditingHandwerker(h); setHandwerkerDialogOpen(true); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record as Werkzeuge;
            setEditingWerkzeug(w);
            setWerkzeugeDefaults(w.fields as WerkzeugeDialogDefaults);
            setWerkzeugeDialogOpen(true);
          }
          if (top.type === 'ausleihe') {
            const a = top.record as EnrichedAusleihe;
            setEditingAusleihe(a);
            setAusleiheDefaults(a.fields as unknown as AusleiheDialogDefaults);
            setAusleiheDialogOpen(true);
          }
          if (top.type === 'wartung_reparatur') {
            const w = top.record as EnrichedWartungReparatur;
            setEditingWartung(w);
            setWartungDefaults(w.fields as unknown as WartungReparaturDialogDefaults);
            setWartungDialogOpen(true);
          }
          if (top.type === 'handwerker') {
            setEditingHandwerker(top.record as Handwerker);
            setHandwerkerDialogOpen(true);
          }
        }}
      />

      {/* ─── Dialogs ─── */}
      <WerkzeugeDialog
        open={werkzeugeDialogOpen}
        onClose={() => { setWerkzeugeDialogOpen(false); setEditingWerkzeug(undefined); }}
        onSubmit={async fields => {
          if (editingWerkzeug) {
            await LivingAppsService.updateWerkzeugeEntry(editingWerkzeug.record_id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={werkzeugeDefaults}
        recordId={editingWerkzeug?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setEditingAusleihe(undefined); }}
        onSubmit={async fields => {
          if (editingAusleihe) {
            await LivingAppsService.updateAusleiheEntry(editingAusleihe.record_id, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={ausleiheDefaults}
        recordId={editingAusleihe?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => { setWartungDialogOpen(false); setEditingWartung(undefined); }}
        onSubmit={async fields => {
          if (editingWartung) {
            await LivingAppsService.updateWartungReparaturEntry(editingWartung.record_id, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={wartungDefaults}
        recordId={editingWartung?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => { setHandwerkerDialogOpen(false); setEditingHandwerker(undefined); }}
        onSubmit={async fields => {
          if (editingHandwerker) {
            await LivingAppsService.updateHandwerkerEntry(editingHandwerker.record_id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingHandwerker?.fields}
        recordId={editingHandwerker?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
