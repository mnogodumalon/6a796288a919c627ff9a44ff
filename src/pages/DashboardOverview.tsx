import { useState, useMemo, useCallback } from 'react';
import { format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
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
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import type { WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import type { AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import type { WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconTool,
  IconPlus,
  IconCheck,
  IconUsers,
  IconArrowBack,
} from '@tabler/icons-react';

// Pre-generated overlay union
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

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );
  const enrichedWartungReparatur = useMemo(
    () => enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap }),
    [wartungReparatur, werkzeugeMap, handwerkerMap]
  );

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; recordId?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; recordId?: string }>({ open: false });
  const [handwerkerDialog, setHandwerkerDialog] = useState<{ open: boolean; recordId?: string }>({ open: false });

  // Derived data (all hooks above, derivations below early returns)
  // All hooks must be before any early return
  const today = format(clock, 'yyyy-MM-dd');

  // Kanban columns for Werkzeuge.zustand
  const zustandColumns = useMemo((): KanbanColumn[] =>
    (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'verfuegbar' ? 'success'
        : o.key === 'ausgeliehen' ? 'primary'
        : o.key === 'in_reparatur' ? 'warning'
        : o.key === 'in_wartung' ? 'warning'
        : o.key === 'defekt' ? 'destructive'
        : 'default',
    } as KanbanColumn)),
    []
  );

  // Kanban cards for Werkzeuge
  const werkzeugCards = useMemo((): KanbanCard[] =>
    werkzeuge.map(w => {
      const activeAusleihe = ausleihe.find(
        a => extractRecordId(a.fields.werkzeug) === w.record_id &&
             lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'
      );
      const handwerkerName = activeAusleihe
        ? handwerkerMap.get(extractRecordId(activeAusleihe.fields.handwerker) ?? '')?.fields.vorname ?? ''
        : '';
      return {
        id: w.record_id,
        column: lookupKey(w.fields.zustand) ?? 'verfuegbar',
        title: w.fields.werkzeugname ?? '—',
        subtitle: activeAusleihe
          ? tx`Ausgeliehen an ${handwerkerName || tx('Unbekannt')}`
          : w.fields.hersteller
            ? `${w.fields.hersteller}${w.fields.modell ? ` · ${w.fields.modell}` : ''}`
            : w.fields.inventarnummer ?? undefined,
      };
    }),
    [werkzeuge, ausleihe, handwerkerMap]
  );

  // Überfällige Ausleihen (today > geplantes_rueckgabedatum AND still ausgeliehen)
  const ueberfaelligeAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      a.fields.geplantes_rueckgabedatum &&
      isBefore(parseISO(a.fields.geplantes_rueckgabedatum), startOfDay(clock))
    ).sort((a, b) =>
      (a.fields.geplantes_rueckgabedatum ?? '').localeCompare(b.fields.geplantes_rueckgabedatum ?? '')
    ),
    [enrichedAusleihe, clock]
  );

  // Aktive Ausleihen (ausgeliehen, nicht überfällig)
  const aktiveAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      !ueberfaelligeAusleihen.some(u => u.record_id === a.record_id)
    ).sort((a, b) =>
      (a.fields.geplantes_rueckgabedatum ?? '').localeCompare(b.fields.geplantes_rueckgabedatum ?? '')
    ),
    [enrichedAusleihe, ueberfaelligeAusleihen]
  );

  // Offene Wartungen & Reparaturen
  const offeneWartungen = useMemo(() =>
    enrichedWartungReparatur.filter(w =>
      lookupKey(w.fields.status_wartung) !== 'abgeschlossen' &&
      lookupKey(w.fields.status_wartung) !== 'abgebrochen'
    ).sort((a, b) =>
      (a.fields.geplantes_enddatum ?? '').localeCompare(b.fields.geplantes_enddatum ?? '')
    ),
    [enrichedWartungReparatur]
  );

  // KPI counts
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length, [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length, [werkzeuge]);
  const inWartung = useMemo(() => werkzeuge.filter(w =>
    lookupKey(w.fields.zustand) === 'in_reparatur' || lookupKey(w.fields.zustand) === 'in_wartung'
  ).length, [werkzeuge]);
  const aktiveHandwerker = useMemo(() => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv').length, [handwerker]);

  // Context line
  const contextLine = useMemo(() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const namen_ = namen(ueberfaelligeAusleihen.map(a => a.handwerkerName));
      return tx`${namen_} — überfällige Rückgabe`;
    }
    if (aktiveAusleihen.length > 0) {
      const namen_ = namen(aktiveAusleihen.map(a => a.werkzeugName));
      return tx`${namen_} aktuell ausgeliehen`;
    }
    return tx('Alle Werkzeuge verfügbar — guter Tag!');
  }, [ueberfaelligeAusleihen, aktiveAusleihen]);

  // Optimistic Rückgabe
  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const snap = ausleihe.map(r => r.record_id === a.record_id
      ? { ...r, fields: { ...r.fields, status_ausleihe: lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben'), tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } }
      : r
    );
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    const werkzeugSnap = werkzeuge.map(w => w.record_id === werkzeugId
      ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', 'verfuegbar') } }
      : w
    );
    setAusleihe(snap);
    setWerkzeuge(werkzeugSnap);
    undoToast(tx`${a.werkzeugName} — zurückgegeben`, async () => {
      setAusleihe(ausleihe);
      setWerkzeuge(werkzeuge);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: lookupKey(a.fields.werkzeug ? werkzeugeMap.get(werkzeugId ?? '')?.fields.zustand : undefined) ?? 'ausgeliehen' });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm"),
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
      }
    } catch {
      fetchAll();
    }
  }, [ausleihe, werkzeuge, werkzeugeMap, setAusleihe, setWerkzeuge, fetchAll, clock]);

  // Optimistic Wartung abschließen
  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const snap = wartungReparatur.map(r => r.record_id === w.record_id
      ? { ...r, fields: { ...r.fields, status_wartung: lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen'), tatsaechliches_enddatum: today } }
      : r
    );
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
    const werkzeugSnap = werkzeuge.map(wz => wz.record_id === werkzeugId
      ? { ...wz, fields: { ...wz.fields, zustand: lookupOption('werkzeuge', 'zustand', 'verfuegbar') } }
      : wz
    );
    setWartungReparatur(snap);
    setWerkzeuge(werkzeugSnap);
    undoToast(tx`${w.werkzeug_wartungName} — Wartung abgeschlossen`, async () => {
      setWartungReparatur(wartungReparatur);
      setWerkzeuge(werkzeuge);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
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
      fetchAll();
    }
  }, [wartungReparatur, werkzeuge, setWartungReparatur, setWerkzeuge, fetchAll, today]);

  // Kanban card move
  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const w = werkzeuge.find(r => r.record_id === cardId);
    if (!w) return;
    const snap = werkzeuge.map(r => r.record_id === cardId
      ? { ...r, fields: { ...r.fields, zustand: lookupOption('werkzeuge', 'zustand', newColumn) } }
      : r
    );
    setWerkzeuge(snap);
    const col = zustandColumns.find(c => c.key === newColumn);
    undoToast(tx`${w.fields.werkzeugname ?? ''} — ${col?.label ?? newColumn}`, async () => {
      setWerkzeuge(werkzeuge);
      await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: lookupKey(w.fields.zustand) ?? 'verfuegbar' });
    });
    try {
      await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: newColumn });
    } catch {
      fetchAll();
    }
  }, [werkzeuge, zustandColumns, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ─── Plain derivations only below ───

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setAusleiheDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Ausleihe erfassen')}
          </button>
          <button
            onClick={() => setWerkzeugDialog({ open: true })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <IconTool size={16} className="shrink-0" />
            {tx('Werkzeug hinzufügen')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Rückgabe buchen'),
              onClick: () => handleRueckgabe(ueberfaelligeAusleihen[0]),
            }}
          >
            <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName))}</b>
            {' '}{tx('— Rückgabe überfällig seit')}{' '}
            {formatDate(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}{' '}
            ({tx('ausgeliehen an')} {ueberfaelligeAusleihen[0].handwerkerName || tx('Unbekannt')})
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar}
              icon={<IconCheck size={14} />}
              tone={verfuegbar > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehen}
              icon={<IconArrowBack size={14} />}
              tone={ausgeliehen > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('In Wartung/Reparatur')}
              value={inWartung}
              icon={<IconTool size={14} />}
              tone={inWartung > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Aktive Handwerker')}
              value={aktiveHandwerker}
              icon={<IconUsers size={14} />}
            />
          </StatStrip>
        }
        primary={
          werkzeuge.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-xl border border-dashed border-border">
              <IconTool size={48} className="text-muted-foreground" />
              <p className="text-muted-foreground text-sm">{tx('Noch keine Werkzeuge vorhanden.')}</p>
              <button
                onClick={() => setWerkzeugDialog({ open: true })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <IconPlus size={16} className="shrink-0" />
                {tx('Erstes Werkzeug aufnehmen')}
              </button>
            </div>
          ) : (
            <KanbanWidget
              columns={zustandColumns}
              cards={werkzeugCards}
              defaultCollapsed={['ausgemustert']}
              onCardClick={card => {
                const w = werkzeuge.find(r => r.record_id === card.id);
                if (w) overlay.replace({ type: 'werkzeuge', record: w });
              }}
              onCardMove={handleCardMove}
              onAddCard={column => setWerkzeugDialog({ open: true, defaults: { zustand: column } })}
            />
          )
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={[...ueberfaelligeAusleihen, ...aktiveAusleihen].map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <>
                    {ueberfaelligeAusleihen.some(u => u.record_id === a.record_id) ? (
                      <span className="font-medium text-destructive">{tx('Überfällig')}</span>
                    ) : (
                      <span className="text-muted-foreground">{tx('Fällig')}: {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                    )}
                    {a.handwerkerName ? (
                      <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                    ) : null}
                  </>
                ),
                action: {
                  label: tx('Zurückgeben'),
                  onClick: () => handleRueckgabe(a),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihe.find(r => r.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Keine aktiven Ausleihen — alle Werkzeuge im Lager'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => setAusleiheDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tx('Offene Wartungen & Reparaturen')}
              items={offeneWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <>
                    <span className={lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'font-medium text-warning' : 'text-muted-foreground'}>
                      {w.fields.vorgangsart?.label ?? '—'}
                    </span>
                    {w.verantwortlicherName ? (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                    ) : null}
                    {w.fields.geplantes_enddatum ? (
                      <span className="text-muted-foreground"> · {tx('bis')} {formatDate(w.fields.geplantes_enddatum)}</span>
                    ) : null}
                  </>
                ),
                action: {
                  label: tx('Abschließen'),
                  onClick: () => handleWartungAbschliessen(w),
                },
              }))}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(r => r.record_id === id);
                if (w) overlay.replace({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine offenen Wartungen — alle Werkzeuge in Ordnung'),
                action: { label: tx('Wartung erfassen'), onClick: () => setWartungDialog({ open: true }) },
              }}
            />
          </>
        }
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
        recordId={handwerkerDialog.recordId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      {/* Overlay host — ONE shell for the whole stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={[w.fields.hersteller, w.fields.modell].filter(Boolean).join(' · ')}
                  badges={w.fields.zustand ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                      {w.fields.zustand.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => setWerkzeugDialog({ open: true, defaults: undefined, recordId: w.record_id })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(r => r.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: w.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(r => r.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { werkzeug_wartung: w.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = top.record;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || appLabel('ausleihe')}
                  subtitle={a.handwerkerName ? tx`Ausgeliehen an ${a.handwerkerName}` : undefined}
                  badges={a.fields.status_ausleihe ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-success/10 text-success'
                    }`}>
                      {a.fields.status_ausleihe.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => setAusleiheDialog({ open: true, defaults: undefined, recordId: a.record_id })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
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
            const wr = top.record;
            return (
              <>
                <RecordHeader
                  title={wr.werkzeug_wartungName || appLabel('wartung_reparatur')}
                  subtitle={wr.fields.vorgangsart?.label}
                  badges={wr.fields.status_wartung ? (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                      {wr.fields.status_wartung.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => setWartungDialog({ open: true, defaults: undefined, recordId: wr.record_id })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <WartungReparaturDetails
                  record={wr}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', record: w })}
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
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || appLabel('handwerker')}
                  subtitle={h.fields.qualifikation?.label}
                  badges={h.fields.status ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      lookupKey(h.fields.status) === 'aktiv'
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {h.fields.status.label}
                    </span>
                  ) : undefined}
                  actions={
                    <button
                      onClick={() => setHandwerkerDialog({ open: true, recordId: h.record_id })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(r => r.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: h.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(r => r.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: h.record_id } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen') {
            return {
              label: tx('Werkzeug zurückgeben'),
              onClick: () => { handleRueckgabe(top.record); overlay.close(); },
            };
          }
          if (top.type === 'wartung_reparatur' &&
            lookupKey(top.record.fields.status_wartung) !== 'abgeschlossen' &&
            lookupKey(top.record.fields.status_wartung) !== 'abgebrochen') {
            return {
              label: tx('Wartung abschließen'),
              onClick: () => { handleWartungAbschliessen(top.record); overlay.close(); },
            };
          }
          return undefined;
        }}
      />
    </div>
  );
}
