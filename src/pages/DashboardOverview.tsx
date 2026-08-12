import { useMemo, useState, useCallback } from 'react';
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
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import { format } from 'date-fns';
import {
  IconTool,
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconPackage,
  IconUsers,
  IconClock,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'handwerker'; record: Handwerker }
  | { type: 'werkzeuge'; record: Werkzeuge }
  | { type: 'ausleihe'; record: EnrichedAusleihe }
  | { type: 'wartung_reparatur'; record: EnrichedWartungReparatur };

function toneForZustand(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt') return 'destructive';
  return 'default';
}

export default function DashboardOverview() {
  const {
    handwerker, werkzeuge, ausleihe, wartungReparatur,
    setWerkzeuge, setAusleihe, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();
  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Werkzeuge Kanban columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Kanban cards from Werkzeuge
  const cards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const status = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      return {
        id: `werkzeug:${w.record_id}`,
        column: status,
        title: w.fields.werkzeugname ?? tx('Unbenannt'),
        subtitle: [w.fields.hersteller, w.fields.modell].filter(Boolean).join(' ') || w.fields.inventarnummer,
        tone: toneForZustand(status),
      };
    }),
    [werkzeuge],
  );

  // Dialogs
  const [werkzeugDialog, setWerkzeugDialog] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [editWerkzeug, setEditWerkzeug] = useState<Werkzeuge | undefined>();

  const [ausleiheDialog, setAusleiheDialog] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [editAusleihe, setEditAusleihe] = useState<EnrichedAusleihe | undefined>();

  const [wartungDialog, setWartungDialog] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [editWartung, setEditWartung] = useState<EnrichedWartungReparatur | undefined>();

  const [handwerkerDialog, setHandwerkerDialog] = useState(false);
  const [editHandwerker, setEditHandwerker] = useState<Handwerker | undefined>();

  // KPI derived values
  const today = format(clock, 'yyyy-MM-dd');
  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'), [werkzeuge]);
  const ausgeliehen = useMemo(() => ausleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'), [ausleihe]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'), [werkzeuge]);

  // Überfällige Ausleihen: geplantes Rückgabedatum in der Vergangenheit
  const ueberfaellig = useMemo(() => enrichedAusleihe.filter(a =>
    lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
    a.fields.geplantes_rueckgabedatum &&
    a.fields.geplantes_rueckgabedatum < format(clock, "yyyy-MM-dd'T'HH:mm")
  ), [enrichedAusleihe, clock]);

  // Active Wartungen/Reparaturen
  const aktivWartung = useMemo(() => enrichedWartungReparatur.filter(w =>
    lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ||
    lookupKey(w.fields.status_wartung) === 'geplant'
  ), [enrichedWartungReparatur]);

  // Ausleihen von heute
  const heuteAusgeliehen = useMemo(() => enrichedAusleihe.filter(a => {
    const d = a.fields.ausleihdatum;
    return d && d.startsWith(today);
  }), [enrichedAusleihe, today]);

  // Active handwerker
  const aktivHandwerker = useMemo(() => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'), [handwerker]);

  // Context greeting line
  const contextLine = useMemo(() => {
    if (ueberfaellig.length > 0) {
      const names = namen(ueberfaellig.map(a => a.handwerkerName));
      return tx`${names} — überfällige Rückgabe`;
    }
    if (heuteAusgeliehen.length > 0) {
      const wnames = namen(heuteAusgeliehen.map(a => a.werkzeugName));
      return tx`Heute ausgeliehen: ${wnames}`;
    }
    return tx`${String(verfuegbar.length)} Werkzeuge verfügbar — Lager im grünen Bereich`;
  }, [ueberfaellig, heuteAusgeliehen, verfuegbar]);

  // Rückgabe-Handler (Ausleihe abschließen)
  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const snap = [...ausleihe];
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    // Optimistic
    setAusleihe(prev => prev.map(r => r.record_id === a.record_id
      ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: tx('Zurückgegeben') }, tatsaechliches_rueckgabedatum: now } }
      : r));
    // Optimistic: update Werkzeug auf verfügbar
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(w => w.record_id === werkzeugId
        ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
        : w));
    }
    undoToast(tx`${a.werkzeugName} — zurückgegeben`, async () => {
      setAusleihe(snap);
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'zurueckgegeben', tatsaechliches_rueckgabedatum: now });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
    } catch {
      setAusleihe(snap);
      fetchAll();
    }
  }, [ausleihe, clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Wartung abschließen
  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const snap = [...wartungReparatur];
    const today2 = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(prev => prev.map(r => r.record_id === w.record_id
      ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: tx('Abgeschlossen') }, tatsaechliches_enddatum: today2 } }
      : r));
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(wz => wz.record_id === werkzeugId
        ? { ...wz, fields: { ...wz.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
        : wz));
    }
    undoToast(tx`${w.werkzeug_wartungName} — Wartung abgeschlossen`, async () => {
      setWartungReparatur(snap);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
      if (werkzeugId) {
        const art = lookupKey(w.fields.vorgangsart);
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: art === 'reparatur' ? 'in_reparatur' : 'in_wartung' });
      }
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: today2 });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
    } catch {
      setWartungReparatur(snap);
      fetchAll();
    }
  }, [wartungReparatur, clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  // Kanban: drag a Werkzeug into another status
  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    // Get current label from LOOKUP_OPTIONS
    const labelObj = (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).find(o => o.key === newColumn);
    const label = labelObj?.label ?? newColumn;
    setWerkzeuge(prev => prev.map(w => w.record_id === rid
      ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label } } }
      : w));
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
      undoToast(tx`Zustand geändert zu ${label}`);
    } catch {
      fetchAll();
    }
  }, [setWerkzeuge, fetchAll]);

  // ─── All hooks above ───────────────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below: plain derivations only ────────────────────────────────────────

  const heroBanner = ueberfaellig.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{ label: tx('Rückgabe buchen'), onClick: () => {
        const a = ueberfaellig[0];
        setEditAusleihe(a);
        setAusleiheDefaults({ status_ausleihe: 'zurueckgegeben' });
        setAusleiheDialog(true);
      }}}
    >
      <b>{namen(ueberfaellig.map(a => a.werkzeugName))}</b> {tx('— Rückgabe überfällig')}
      {ueberfaellig[0].fields.geplantes_rueckgabedatum && (
        <> {tx('seit')} {formatDateTime(ueberfaellig[0].fields.geplantes_rueckgabedatum)}</>
      )}
    </HeroBanner>
  ) : undefined;

  return (
    <>
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="mt-1 text-muted-foreground">{contextLine}</p>
          </div>
          <button
            onClick={() => { setEditWerkzeug(undefined); setWerkzeugDefaults(undefined); setWerkzeugDialog(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <IconPlus size={16} className="shrink-0" />
            {tx('Werkzeug anlegen')}
          </button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroBanner}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              icon={<IconCheck size={16} />}
              tone={verfuegbar.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehen.length}
              icon={<IconPackage size={16} />}
              tone="primary"
            />
            <StatStripItem
              title={tx('In Wartung/Reparatur')}
              value={aktivWartung.length}
              icon={<IconTool size={16} />}
              tone={aktivWartung.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              icon={<IconAlertTriangle size={16} />}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={appLabel('handwerker')}
              value={aktivHandwerker.length}
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
              const rid = card.id.split(':')[1] ?? '';
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={handleCardMove}
            onAddCard={column => {
              setEditWerkzeug(undefined);
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={ausgeliehen.slice(0, 8).map(a => {
                const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
                return {
                  id: a.record_id,
                  title: ea?.werkzeugName ?? tx('Unbekanntes Werkzeug'),
                  secondLine: (
                    <>
                      <span className="text-muted-foreground">{ea?.handwerkerName}</span>
                      {a.fields.geplantes_rueckgabedatum && (
                        <span className="text-muted-foreground"> · {tx('bis')} {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                      )}
                    </>
                  ),
                  action: ea ? {
                    label: tx('Rückgabe'),
                    onClick: () => handleRueckgabe(ea),
                  } : undefined,
                };
              })}
              onItemClick={id => {
                const ea = enrichedAusleihe.find(a => a.record_id === id);
                if (ea) overlay.replace({ type: 'ausleihe', record: ea });
              }}
              empty={{
                text: tx('Keine aktiven Ausleihen — alle Werkzeuge im Lager'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => { setEditAusleihe(undefined); setAusleiheDefaults(undefined); setAusleiheDialog(true); } },
              }}
            />
            <WorkList
              title={tx('Wartung & Reparatur')}
              items={aktivWartung.slice(0, 6).map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Unbekanntes Werkzeug'),
                secondLine: (
                  <>
                    <span className={lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'font-medium text-destructive' : 'font-medium text-warning'}>
                      {w.fields.vorgangsart?.label}
                    </span>
                    {w.fields.startdatum && (
                      <span className="text-muted-foreground"> · {tx('seit')} {formatDate(w.fields.startdatum)}</span>
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
                text: tx('Keine laufenden Wartungen oder Reparaturen'),
                action: { label: tx('Vorgang anlegen'), onClick: () => { setEditWartung(undefined); setWartungDefaults(undefined); setWartungDialog(true); } },
              }}
            />
          </>
        }
      />

      {/* ── Dialogs ── */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => setWerkzeugDialog(false)}
        onSubmit={async fields => {
          if (editWerkzeug) {
            await LivingAppsService.updateWerkzeugeEntry(editWerkzeug.record_id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editWerkzeug?.fields ?? werkzeugDefaults}
        recordId={editWerkzeug?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => setAusleiheDialog(false)}
        onSubmit={async fields => {
          if (editAusleihe) {
            await LivingAppsService.updateAusleiheEntry(editAusleihe.record_id, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAusleihe?.fields ?? ausleiheDefaults}
        recordId={editAusleihe?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog}
        onClose={() => setWartungDialog(false)}
        onSubmit={async fields => {
          if (editWartung) {
            await LivingAppsService.updateWartungReparaturEntry(editWartung.record_id, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editWartung?.fields ?? wartungDefaults}
        recordId={editWartung?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialog}
        onClose={() => setHandwerkerDialog(false)}
        onSubmit={async fields => {
          if (editHandwerker) {
            await LivingAppsService.updateHandwerkerEntry(editHandwerker.record_id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editHandwerker?.fields}
        recordId={editHandwerker?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      {/* ── Overlay Stack ── */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            return (
              <>
                <RecordHeader
                  title={top.record.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={top.record.fields.zustand?.label}
                  badges={
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {top.record.fields.inventarnummer}
                    </span>
                  }
                  actions={
                    <button
                      onClick={() => { setEditWerkzeug(top.record); setWerkzeugDefaults(undefined); setWerkzeugDialog(true); }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <WerkzeugeDetails
                  record={top.record}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setEditAusleihe(undefined);
                    setAusleiheDefaults({ werkzeug: top.record.record_id });
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => {
                    const ew = enrichedWartungReparatur.find(e => e.record_id === w.record_id);
                    if (ew) overlay.push({ type: 'wartung_reparatur', record: ew });
                  }}
                  onAddWartungReparatur={() => {
                    setEditWartung(undefined);
                    setWartungDefaults({ werkzeug_wartung: top.record.record_id });
                    setWartungDialog(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            return (
              <>
                <RecordHeader
                  title={top.record.werkzeugName || tx('Ausleihe')}
                  subtitle={top.record.handwerkerName}
                  badges={
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {top.record.fields.status_ausleihe?.label}
                    </span>
                  }
                  actions={
                    <button
                      onClick={() => { setEditAusleihe(top.record); setAusleiheDefaults(undefined); setAusleiheDialog(true); }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <AusleiheDetails
                  record={top.record}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', record: w })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'wartung_reparatur') {
            return (
              <>
                <RecordHeader
                  title={top.record.werkzeug_wartungName || tx('Wartung/Reparatur')}
                  subtitle={top.record.fields.vorgangsart?.label}
                  badges={
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(top.record.fields.status_wartung) === 'in_bearbeitung' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                      {top.record.fields.status_wartung?.label}
                    </span>
                  }
                  actions={
                    <button
                      onClick={() => { setEditWartung(top.record); setWartungDefaults(undefined); setWartungDialog(true); }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <WartungReparaturDetails
                  record={top.record}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={w => overlay.push({ type: 'werkzeuge', record: w })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            return (
              <>
                <RecordHeader
                  title={[top.record.fields.vorname, top.record.fields.nachname].filter(Boolean).join(' ') || tx('Handwerker')}
                  subtitle={top.record.fields.qualifikation?.label}
                  actions={
                    <button
                      onClick={() => { setEditHandwerker(top.record); setHandwerkerDialog(true); }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {tx('Bearbeiten')}
                    </button>
                  }
                />
                <HandwerkerDetails
                  record={top.record}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setEditAusleihe(undefined);
                    setAusleiheDefaults({ handwerker: top.record.record_id });
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => {
                    const ew = enrichedWartungReparatur.find(e => e.record_id === w.record_id);
                    if (ew) overlay.push({ type: 'wartung_reparatur', record: ew });
                  }}
                  onAddWartungReparatur={() => {
                    setEditWartung(undefined);
                    setWartungDefaults({ verantwortlicher: top.record.record_id });
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
            return { label: tx('Rückgabe buchen'), onClick: () => handleRueckgabe(top.record as EnrichedAusleihe) };
          }
          if (top.type === 'wartung_reparatur' && (
            lookupKey(top.record.fields.status_wartung) === 'in_bearbeitung' ||
            lookupKey(top.record.fields.status_wartung) === 'geplant'
          )) {
            return { label: tx('Abschließen'), onClick: () => handleWartungAbschliessen(top.record as EnrichedWartungReparatur) };
          }
          return undefined;
        }}
      />
    </>
  );
}
