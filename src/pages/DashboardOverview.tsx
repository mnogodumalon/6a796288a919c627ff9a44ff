import { useState, useMemo, useCallback } from 'react';
import { format, isBefore, parseISO, isToday } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
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
  RecordKeyFacts,
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
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconCalendar,
  IconClipboardList,
  IconCircleCheck,
  IconArrowBack,
  IconPlus,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'handwerker'; record: Handwerker }
  | { type: 'werkzeuge'; record: Werkzeuge }
  | { type: 'ausleihe'; record: EnrichedAusleihe }
  | { type: 'wartung_reparatur'; record: EnrichedWartungReparatur };

export default function DashboardOverview() {
  const {
    handwerker, werkzeuge, ausleihe, wartungReparatur,
    handwerkerMap, werkzeugeMap,
    setWerkzeuge, setAusleihe, setWartungReparatur,
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
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; recordId?: string }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'werkzeug' } | null>(null);

  // KPI derivations
  const today = format(clock, 'yyyy-MM-dd');

  const verfuegbareWerkzeuge = useMemo(
    () => werkzeuge.filter(w => w.fields.zustand?.key === 'verfuegbar'),
    [werkzeuge]
  );

  const ausgeliehenCount = useMemo(
    () => werkzeuge.filter(w => w.fields.zustand?.key === 'ausgeliehen').length,
    [werkzeuge]
  );

  const defektCount = useMemo(
    () => werkzeuge.filter(w => w.fields.zustand?.key === 'defekt').length,
    [werkzeuge]
  );

  const aktivHandwerker = useMemo(
    () => handwerker.filter(h => h.fields.status?.key === 'aktiv'),
    [handwerker]
  );

  // Überfällige Ausleihen: ausgeliehen + geplantes Rückgabedatum in Vergangenheit
  const ueberfaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => {
      if (a.fields.status_ausleihe?.key !== 'ausgeliehen') return false;
      if (!a.fields.geplantes_rueckgabedatum) return false;
      return isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock);
    }),
    [enrichedAusleihe, clock]
  );

  // Laufende Wartungen (in_bearbeitung)
  const laufendeWartungen = useMemo(
    () => enrichedWartungReparatur.filter(w => w.fields.status_wartung?.key === 'in_bearbeitung'),
    [enrichedWartungReparatur]
  );

  // Heutige Ausleihen
  const heutigeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => {
      if (!a.fields.ausleihdatum) return false;
      return a.fields.ausleihdatum.startsWith(today);
    }),
    [enrichedAusleihe, today]
  );

  // Kanban columns from schema
  const kanbanColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'defekt' ? 'destructive' as const
        : o.key === 'verfuegbar' ? 'success' as const
        : o.key === 'ausgeliehen' ? 'primary' as const
        : o.key === 'in_reparatur' || o.key === 'in_wartung' ? 'warning' as const
        : 'default' as const,
    })),
    []
  );

  // Kanban cards
  const kanbanCards: KanbanCard[] = useMemo(() => werkzeuge.map(w => {
    const zustandKey = lookupKey(w.fields.zustand);
    const aktivAusleihe = ausleihe.filter(a =>
      extractRecordId(a.fields.werkzeug) === w.record_id &&
      a.fields.status_ausleihe?.key === 'ausgeliehen'
    );
    const handwerkerName = aktivAusleihe.length > 0
      ? (() => {
          const h = handwerkerMap.get(extractRecordId(aktivAusleihe[0].fields.handwerker) ?? '');
          return h ? `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() : '';
        })()
      : '';
    return {
      id: `werkzeug:${w.record_id}`,
      column: zustandKey ?? 'verfuegbar',
      title: w.fields.werkzeugname ?? '—',
      subtitle: handwerkerName
        ? handwerkerName
        : w.fields.kategorie?.label ?? w.fields.standort ?? undefined,
      tone: zustandKey === 'defekt' ? 'destructive' as const
        : zustandKey === 'verfuegbar' ? 'default' as const
        : zustandKey === 'ausgeliehen' ? 'primary' as const
        : 'warning' as const,
    };
  }), [werkzeuge, ausleihe, handwerkerMap]);

  // ─── Write helpers ───────────────────────────────────────────────────────

  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const wId = cardId.split(':')[1];
    const w = werkzeuge.find(x => x.record_id === wId);
    if (!w) return;

    const prevZustand = w.fields.zustand;
    const newLookup = lookupOption('werkzeuge', 'zustand', newColumn);

    // Optimistic
    setWerkzeuge(prev => prev.map(x =>
      x.record_id === wId ? { ...x, fields: { ...x.fields, zustand: newLookup } } : x
    ));

    undoToast(
      tx`${w.fields.werkzeugname ?? ''} — ${newLookup.label}`,
      async () => {
        setWerkzeuge(prev => prev.map(x =>
          x.record_id === wId ? { ...x, fields: { ...x.fields, zustand: prevZustand } } : x
        ));
        await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: prevZustand?.key });
      }
    );

    try {
      await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: newColumn });
    } catch {
      fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  const handleAusleiheReturn = useCallback(async (a: EnrichedAusleihe) => {
    const prevStatus = a.fields.status_ausleihe;
    const returnedLookup = lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben');
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");

    // Optimistic
    setAusleihe(prev => prev.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: returnedLookup, tatsaechliches_rueckgabedatum: now } }
        : x
    ));

    undoToast(
      tx`${a.werkzeugName} — zurückgegeben`,
      async () => {
        setAusleihe(prev => prev.map(x =>
          x.record_id === a.record_id
            ? { ...x, fields: { ...x.fields, status_ausleihe: prevStatus, tatsaechliches_rueckgabedatum: undefined } }
            : x
        ));
        await LivingAppsService.updateAusleiheEntry(a.record_id, {
          status_ausleihe: prevStatus?.key,
          tatsaechliches_rueckgabedatum: undefined,
        });
      }
    );

    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: now,
      });
    } catch {
      fetchAll();
    }
  }, [clock, setAusleihe, fetchAll]);

  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prevStatus = w.fields.status_wartung;
    const abgeschlossenLookup = lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen');
    const today2 = format(clock, 'yyyy-MM-dd');

    setWartungReparatur(prev => prev.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: abgeschlossenLookup, tatsaechliches_enddatum: today2 } }
        : x
    ));

    undoToast(
      tx`${w.werkzeug_wartungName} — abgeschlossen`,
      async () => {
        setWartungReparatur(prev => prev.map(x =>
          x.record_id === w.record_id
            ? { ...x, fields: { ...x.fields, status_wartung: prevStatus, tatsaechliches_enddatum: undefined } }
            : x
        ));
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
          status_wartung: prevStatus?.key,
          tatsaechliches_enddatum: undefined,
        });
      }
    );

    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: today2,
      });
    } catch {
      fetchAll();
    }
  }, [clock, setWartungReparatur, fetchAll]);

  // ─── Hooks must be above early returns ──────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Context line ─────────────────────────────────────────────────────────
  const ueberfaelligeNamen = namen(ueberfaelligeAusleihen.map(a => a.werkzeugName));
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tx`${ueberfaelligeNamen} überfällig — Rückgabe ausstehend.`
    : heutigeAusleihen.length > 0
      ? tx`Heute ${heutigeAusleihen.length} Ausleihe(n). ${verfuegbareWerkzeuge.length} Werkzeuge verfügbar.`
      : tx`${verfuegbareWerkzeuge.length} Werkzeuge verfügbar, ${aktivHandwerker.length} Handwerker aktiv.`;

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {gruss(clock)}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 truncate">{contextLine}</p>
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0 shrink-0 flex-wrap">
          <button
            onClick={() => setAusleiheDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Ausleihe erfassen')}
          </button>
          <button
            onClick={() => setWerkzeugDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Werkzeug')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Zurückgabe erfassen'),
              onClick: () => handleAusleiheReturn(ueberfaelligeAusleihen[0]),
            }}
          >
            <b>{ueberfaelligeNamen}</b>{' '}
            {tx('überfällig — Rückgabe noch ausstehend.')}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbareWerkzeuge.length}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
              tone="success"
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehenCount}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={ausgeliehenCount > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defektCount}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={defektCount > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={appLabel('handwerker')}
              value={aktivHandwerker.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Laufende Wartungen')}
              value={laufendeWartungen.length}
              icon={<IconCalendar size={16} className="shrink-0" />}
              tone={laufendeWartungen.length > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const wId = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === wId);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={handleCardMove}
            onAddCard={column => {
              setWerkzeugDialog({ open: true, defaults: { zustand: column } });
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige Ausleihen')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{a.handwerkerName}</span>
                    <span className="text-muted-foreground"> · {tx('fällig')} {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tx('Zurückgabe'),
                  onClick: () => handleAusleiheReturn(a),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Keine überfälligen Ausleihen — alles pünktlich zurückgegeben.'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => setAusleiheDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tx('Laufende Wartungen & Reparaturen')}
              items={laufendeWartungen.slice(0, 8).map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={`font-medium ${w.fields.vorgangsart?.key === 'reparatur' ? 'text-destructive' : 'text-warning'}`}>
                      {w.fields.vorgangsart?.label ?? ''}
                    </span>
                    {w.verantwortlicherName && (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
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
                text: tx('Keine laufenden Wartungen oder Reparaturen.'),
                action: { label: tx('Wartung anlegen'), onClick: () => setWartungDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* ─── Overlay Stack ─────────────────────────────────────────────── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={[w.fields.hersteller, w.fields.modell].filter(Boolean).join(' ')}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.fields.zustand?.key === 'verfuegbar' ? 'bg-success/15 text-success' :
                      w.fields.zustand?.key === 'defekt' ? 'bg-destructive/15 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {w.fields.zustand?.label ?? '—'}
                    </span>
                  }
                  meta={
                    <span className="text-xs text-muted-foreground">
                      {tx('Inv.-Nr.')} {w.fields.inventarnummer ?? '—'}
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
                    overlay.close();
                    setAusleiheDialog({ open: true, defaults: { werkzeug: w.record_id } });
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    overlay.close();
                    setWartungDialog({ open: true, defaults: { werkzeug_wartung: w.record_id } });
                  }}
                />
              </>
            );
          }

          if (top.type === 'ausleihe') {
            const a = top.record;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || tx('Ausleihe')}
                  subtitle={a.handwerkerName}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.fields.status_ausleihe?.key === 'ausgeliehen' ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success'
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
            const w = top.record;
            return (
              <>
                <RecordHeader
                  title={w.werkzeug_wartungName || tx('Wartung / Reparatur')}
                  subtitle={w.fields.vorgangsart?.label}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      w.fields.status_wartung?.key === 'in_bearbeitung' ? 'bg-warning/15 text-warning' :
                      w.fields.status_wartung?.key === 'abgeschlossen' ? 'bg-success/15 text-success' :
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
            const h = top.record;
            return (
              <>
                <RecordHeader
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || '—'}
                  subtitle={h.fields.qualifikation?.label}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      h.fields.status?.key === 'aktiv' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
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
                    overlay.close();
                    setAusleiheDialog({ open: true, defaults: { handwerker: h.record_id } });
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    overlay.close();
                    setWartungDialog({ open: true, defaults: { verantwortlicher: h.record_id } });
                  }}
                />
              </>
            );
          }

          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && top.record.fields.status_ausleihe?.key === 'ausgeliehen') {
            return {
              label: tx('Werkzeug zurückgeben'),
              onClick: () => {
                handleAusleiheReturn(top.record as EnrichedAusleihe);
                overlay.close();
              },
            };
          }
          if (top.type === 'wartung_reparatur' && top.record.fields.status_wartung?.key === 'in_bearbeitung') {
            return {
              label: tx('Wartung abschließen'),
              onClick: () => {
                handleWartungAbschliessen(top.record as EnrichedWartungReparatur);
                overlay.close();
              },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeuge') {
            setWerkzeugDialog({ open: true, defaults: top.record.fields as WerkzeugeDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'ausleihe') {
            setAusleiheDialog({ open: true, defaults: top.record.fields as AusleiheDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'wartung_reparatur') {
            setWartungDialog({ open: true, defaults: top.record.fields as WartungReparaturDialogDefaults, recordId: top.record.record_id });
            overlay.close();
          } else if (top.type === 'handwerker') {
            setHandwerkerDialog({ open: true, recordId: top.record.record_id });
            overlay.close();
          }
        }}
      />

      {/* ─── Dialogs ───────────────────────────────────────────────────── */}
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
        recordId={handwerkerDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={tx('Werkzeug löschen')}
        description={tx('Dieses Werkzeug wirklich löschen?')}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await LivingAppsService.deleteWerkzeugeEntry(deleteTarget.id);
          setDeleteTarget(null);
          fetchAll();
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
