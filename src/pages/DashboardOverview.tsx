import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { useState, useMemo, useCallback } from 'react';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format, parseISO, isBefore } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatCardRow, StatCard } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
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
  IconTool,
  IconAlertTriangle,
  IconPlus,
  IconCheck,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'handwerker'; record: Handwerker }
  | { type: 'werkzeuge'; record: Werkzeuge }
  | { type: 'ausleihe'; record: EnrichedAusleihe }
  | { type: 'wartung_reparatur'; record: EnrichedWartungReparatur };

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
  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [werkzeugEditId, setWerkzeugEditId] = useState<string | undefined>();

  const [ausleiheDialog, setAusleiheDialog] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [ausleiheEditId, setAusleiheEditId] = useState<string | undefined>();

  const [wartungDialog, setWartungDialog] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [wartungEditId, setWartungEditId] = useState<string | undefined>();

  const [handwerkerDialog, setHandwerkerDialog] = useState(false);
  const [handwerkerDefaults, setHandwerkerDefaults] = useState<HandwerkerDialogDefaults | undefined>();
  const [handwerkerEditId, setHandwerkerEditId] = useState<string | undefined>();

  // KPI filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const today = format(clock, 'yyyy-MM-dd');

  // Kanban columns from schema — inside component, not module scope
  const WERKZEUG_COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Map werkzeuge → kanban cards
  const werkzeugCards = useMemo<KanbanCard[]>(() => {
    const filtered = statusFilter
      ? werkzeuge.filter(w => lookupKey(w.fields.zustand) === statusFilter)
      : werkzeuge;
    return filtered.map(w => {
      const zustand = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      let tone: KanbanCard['tone'] = 'default';
      if (zustand === 'verfuegbar') tone = 'success';
      else if (zustand === 'ausgeliehen') tone = 'primary';
      else if (zustand === 'defekt') tone = 'destructive';
      else if (zustand === 'in_reparatur' || zustand === 'in_wartung') tone = 'warning';
      return {
        id: `werkzeug:${w.record_id}`,
        column: zustand,
        title: w.fields.werkzeugname ?? tx('Unbekannt'),
        subtitle: [w.fields.hersteller, w.fields.inventarnummer].filter(Boolean).join(' · ') || undefined,
        tone,
      };
    });
  }, [werkzeuge, statusFilter]);

  // Overdue: ausgeliehen + geplantes_rueckgabedatum in the past and no actual return
  const ueberfaellig = useMemo(
    () => enrichedAusleihe.filter(a => {
      const key = lookupKey(a.fields.status_ausleihe);
      if (key !== 'ausgeliehen') return false;
      if (!a.fields.geplantes_rueckgabedatum) return false;
      return isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock);
    }),
    [enrichedAusleihe, clock],
  );

  // Active loans
  const aktivAusleihe = useMemo(
    () => enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  // Active/open maintenance
  const offeneWartung = useMemo(
    () => enrichedWartungReparatur.filter(w => {
      const key = lookupKey(w.fields.status_wartung);
      return key === 'geplant' || key === 'in_bearbeitung';
    }),
    [enrichedWartungReparatur],
  );

  // Available tool count
  const verfuegbarCount = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length,
    [werkzeuge],
  );

  // Return a loan (optimistic)
  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = [...ausleihe];
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(list => list.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben'), tatsaechliches_rueckgabedatum: now } }
        : x,
    ));
    // Also update the tool's status back to verfuegbar
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    if (werkzeugId) {
      setWerkzeuge(list => list.map(w =>
        w.record_id === werkzeugId
          ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', 'verfuegbar') } }
          : w,
      ));
    }
    undoToast(
      tx`${a.werkzeugName} — zurückgegeben`,
      async () => {
        setAusleihe(prev);
        await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
        if (werkzeugId) {
          await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
        }
      },
    );
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'zurueckgegeben', tatsaechliches_rueckgabedatum: now });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      fetchAll();
    }
  }, [ausleihe, clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Close a maintenance entry (optimistic)
  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const now = today;
    setWartungReparatur(list => list.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen'), tatsaechliches_enddatum: now } }
        : x,
    ));
    undoToast(tx`${w.werkzeug_wartungName} — Wartung abgeschlossen`);
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: now });
    } catch {
      fetchAll();
    }
  }, [today, setWartungReparatur, fetchAll]);

  // Move a kanban card (tool status change)
  const moveWerkzeugCard = useCallback(async (cardId: string, newColumn: string) => {
    const werkzeugId = cardId.split(':')[1];
    if (!werkzeugId) return;
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', newColumn) } }
        : w,
    ));
    undoToast(tx`Zustand aktualisiert`);
    try {
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: newColumn });
    } catch {
      fetchAll();
    }
  }, [setWerkzeuge, fetchAll]);

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaellig.length > 0) {
      const names = namen(ueberfaellig.map(a => a.werkzeugName));
      return tx`${names} überfällig zurück`;
    }
    if (aktivAusleihe.length > 0) {
      const names = namen(aktivAusleihe.map(a => a.handwerkerName));
      return tx`${names} ${aktivAusleihe.length > 1 ? tx('haben Werkzeuge ausgeliehen') : tx('hat ein Werkzeug ausgeliehen')}`;
    }
    return verfuegbarCount > 0
      ? tx`${verfuegbarCount} Werkzeuge verfügbar`
      : tx`Alle Werkzeuge sind im Einsatz`;
  }, [ueberfaellig, aktivAusleihe, verfuegbarCount]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Plain derivations below ─────────────────────────────────────────────

  const defektCount = werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt').length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-muted-foreground">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialog(true); }}
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Ausleihe erfassen')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            onClick={() => { setWerkzeugDefaults(undefined); setWerkzeugEditId(undefined); setWerkzeugDialog(true); }}
          >
            <IconTool size={16} className="shrink-0" />
            {tx('Werkzeug hinzufügen')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaellig.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Rückgabe buchen'),
              onClick: () => handleRueckgabe(ueberfaellig[0]),
            }}
          >
            <b>{namen(ueberfaellig.map(a => a.werkzeugName))}</b>
            {' '}{tx('überfällig zur Rückgabe')}{' — '}
            {tx('fällig war')}{' '}{formatDateTime(ueberfaellig[0].fields.geplantes_rueckgabedatum)}
            {ueberfaellig.length > 1 && ` (+${ueberfaellig.length - 1})`}
          </HeroBanner>
        )}
        kpis={
          <StatCardRow>
            <StatCard
              title={tx('Verfügbar')}
              value={verfuegbarCount}
              description={verfuegbarCount > 0 ? tx('Einsatzbereit') : tx('Alle im Einsatz')}
              tone={verfuegbarCount > 0 ? 'success' : 'default'}
              icon={<IconCheck size={18} className="text-muted-foreground" />}
              onClick={() => setStatusFilter(f => f === 'verfuegbar' ? null : 'verfuegbar')}
              active={statusFilter === 'verfuegbar'}
            />
            <StatCard
              title={tx('Ausgeliehen')}
              value={aktivAusleihe.length}
              description={aktivAusleihe.length > 0 ? tx('Aktuell im Einsatz') : tx('Alles zurückgegeben')}
              tone={aktivAusleihe.length > 0 ? 'primary' : 'default'}
              icon={<IconTool size={18} className="text-muted-foreground" />}
              onClick={() => setStatusFilter(f => f === 'ausgeliehen' ? null : 'ausgeliehen')}
              active={statusFilter === 'ausgeliehen'}
            />
            <StatCard
              title={tx('Überfällig')}
              value={ueberfaellig.length}
              description={ueberfaellig.length > 0 ? tx('Sofort zurückfordern') : tx('Alles pünktlich')}
              tone={ueberfaellig.length > 0 ? 'destructive' : 'default'}
              icon={<IconAlertTriangle size={18} className="text-muted-foreground" />}
            />
            <StatCard
              title={tx('Defekt / Wartung')}
              value={defektCount + offeneWartung.length}
              description={defektCount > 0 ? tx('Werkzeuge defekt') : tx('Alles in Ordnung')}
              tone={(defektCount + offeneWartung.length) > 0 ? 'warning' : 'default'}
              icon={<IconTool size={18} className="text-muted-foreground" />}
              onClick={() => setStatusFilter(f => f === 'defekt' ? null : 'defekt')}
              active={statusFilter === 'defekt'}
            />
          </StatCardRow>
        }
        primary={
          <KanbanWidget
            cards={werkzeugCards}
            columns={WERKZEUG_COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const id = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === id);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={moveWerkzeugCard}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugEditId(undefined);
              setWerkzeugDialog(true);
            }}
          >
            {statusFilter && (
              <div className="flex items-center gap-2 pb-2">
                <span className="text-sm text-muted-foreground">
                  {tx('Filter aktiv:')} <b>{WERKZEUG_COLUMNS.find(c => c.key === statusFilter)?.label}</b>
                </span>
                <button
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                  onClick={() => setStatusFilter(null)}
                >
                  {tx('Zurücksetzen')}
                </button>
              </div>
            )}
          </KanbanWidget>
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={aktivAusleihe
                .sort((a, b) => (a.fields.geplantes_rueckgabedatum ?? '').localeCompare(b.fields.geplantes_rueckgabedatum ?? ''))
                .slice(0, 8)
                .map(a => {
                  const isOverdue = ueberfaellig.some(u => u.record_id === a.record_id);
                  return {
                    id: a.record_id,
                    title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <>
                        <span className={isOverdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                          {isOverdue ? tx('Überfällig') : a.handwerkerName}
                        </span>
                        {a.fields.geplantes_rueckgabedatum && (
                          <span className="text-muted-foreground"> · {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                        )}
                      </>
                    ),
                    action: {
                      label: tx('Zurück'),
                      onClick: () => handleRueckgabe(a),
                    },
                  };
                })}
              onItemClick={id => {
                const a = enrichedAusleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Keine aktiven Ausleihen — alles zurückgegeben'),
                action: {
                  label: tx('Werkzeug ausleihen'),
                  onClick: () => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialog(true); },
                },
              }}
            />
            <WorkList
              title={tx('Wartung & Reparatur')}
              items={offeneWartung
                .sort((a, b) => (a.fields.startdatum ?? '').localeCompare(b.fields.startdatum ?? ''))
                .slice(0, 6)
                .map(w => {
                  const art = lookupKey(w.fields.vorgangsart);
                  const status = lookupKey(w.fields.status_wartung);
                  return {
                    id: w.record_id,
                    title: w.werkzeug_wartungName || tx('Unbekanntes Werkzeug'),
                    secondLine: (
                      <>
                        <span className={status === 'in_bearbeitung' ? 'font-medium text-warning' : 'text-muted-foreground'}>
                          {art === 'reparatur' ? tx('Reparatur') : tx('Wartung')}
                        </span>
                        {w.fields.geplantes_enddatum && (
                          <span className="text-muted-foreground"> · {tx('bis')} {formatDate(w.fields.geplantes_enddatum)}</span>
                        )}
                      </>
                    ),
                    action: {
                      label: tx('Erledigt'),
                      onClick: () => handleWartungAbschliessen(w),
                    },
                  };
                })}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(x => x.record_id === id);
                if (w) overlay.replace({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine offene Wartung oder Reparatur'),
                action: {
                  label: tx('Vorgang erfassen'),
                  onClick: () => { setWartungDefaults(undefined); setWartungEditId(undefined); setWartungDialog(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Overlay host */}
      <RecordOverlayHost
        overlay={overlay}
        onEdit={top => {
          if (top.type === 'werkzeuge') {
            setWerkzeugDefaults(top.record.fields as WerkzeugeDialogDefaults);
            setWerkzeugEditId(top.record.record_id);
            setWerkzeugDialog(true);
          } else if (top.type === 'ausleihe') {
            setAusleiheDefaults(top.record.fields as AusleiheDialogDefaults);
            setAusleiheEditId(top.record.record_id);
            setAusleiheDialog(true);
          } else if (top.type === 'wartung_reparatur') {
            setWartungDefaults(top.record.fields as WartungReparaturDialogDefaults);
            setWartungEditId(top.record.record_id);
            setWartungDialog(true);
          } else if (top.type === 'handwerker') {
            setHandwerkerDefaults(top.record.fields as HandwerkerDialogDefaults);
            setHandwerkerEditId(top.record.record_id);
            setHandwerkerDialog(true);
          }
        }}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={[w.fields.hersteller, w.fields.modell].filter(Boolean).join(' · ') || undefined}
                  badges={w.fields.zustand && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {w.fields.zustand.label}
                    </span>
                  )}
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
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: w.record_id });
                    setWartungEditId(undefined);
                    setWartungDialog(true);
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
                  subtitle={a.handwerkerName || undefined}
                  badges={a.fields.status_ausleihe && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {a.fields.status_ausleihe.label}
                    </span>
                  )}
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
                  subtitle={[w.fields.vorgangsart?.label, w.verantwortlicherName].filter(Boolean).join(' · ') || undefined}
                  badges={w.fields.status_wartung && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      {w.fields.status_wartung.label}
                    </span>
                  )}
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
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || tx('Handwerker')}
                  subtitle={[h.fields.qualifikation?.label, h.fields.abteilung].filter(Boolean).join(' · ') || undefined}
                  badges={h.fields.status && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${h.fields.status.key === 'aktiv' ? 'bg-success/10 text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {h.fields.status.label}
                    </span>
                  )}
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
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: h.record_id });
                    setWartungEditId(undefined);
                    setWartungDialog(true);
                  }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen') {
            return {
              label: tx('Rückgabe buchen'),
              onClick: () => { handleRueckgabe(top.record as EnrichedAusleihe); overlay.close(); },
            };
          }
          if (top.type === 'wartung_reparatur') {
            const key = lookupKey(top.record.fields.status_wartung);
            if (key === 'geplant' || key === 'in_bearbeitung') {
              return {
                label: tx('Abschließen'),
                onClick: () => { handleWartungAbschliessen(top.record as EnrichedWartungReparatur); overlay.close(); },
              };
            }
          }
          return undefined;
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => setWerkzeugDialog(false)}
        defaultValues={werkzeugDefaults}
        recordId={werkzeugEditId}
        onSubmit={async fields => {
          if (werkzeugEditId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugEditId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => setAusleiheDialog(false)}
        defaultValues={ausleiheDefaults}
        recordId={ausleiheEditId}
        onSubmit={async fields => {
          if (ausleiheEditId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheEditId, fields);
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
        open={wartungDialog}
        onClose={() => setWartungDialog(false)}
        defaultValues={wartungDefaults}
        recordId={wartungEditId}
        onSubmit={async fields => {
          if (wartungEditId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungEditId, fields);
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
        open={handwerkerDialog}
        onClose={() => setHandwerkerDialog(false)}
        defaultValues={handwerkerDefaults}
        recordId={handwerkerEditId}
        onSubmit={async fields => {
          if (handwerkerEditId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerEditId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </div>
  );
}
