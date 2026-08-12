import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
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
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel, fieldLabel } from '@/i18n';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconTools,
  IconPlus,
  IconAlertTriangle,
  IconTool,
  IconArrowRight,
  IconUserCheck,
} from '@tabler/icons-react';

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
    handwerker, werkzeuge, ausleihe, wartungReparatur,
    setWerkzeuge, setAusleihe, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap],
  );
  const enrichedWartungReparatur = useMemo(
    () => enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap }),
    [wartungReparatur, werkzeugeMap, handwerkerMap],
  );

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

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'ausleihe' | 'werkzeuge'; id: string } | null>(null);

  // Derived data
  const today = format(clock, 'yyyy-MM-dd');

  const verfuegbar = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'), [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen'), [werkzeuge]);
  const inReparatur = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'in_reparatur' || lookupKey(w.fields.zustand) === 'in_wartung'), [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'), [werkzeuge]);

  // Überfällige Ausleihen (geplantes Rückgabedatum überschritten, noch ausgeliehen)
  const ueberfaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      a.fields.geplantes_rueckgabedatum &&
      a.fields.geplantes_rueckgabedatum.slice(0, 10) < today
    ),
    [enrichedAusleihe, today],
  );

  // Laufende Wartungen / Reparaturen (in_bearbeitung)
  const laufendeWartungen = useMemo(
    () => enrichedWartungReparatur.filter(w => lookupKey(w.fields.status_wartung) === 'in_bearbeitung'),
    [enrichedWartungReparatur],
  );

  // Aktive Handwerker
  const aktiveHandwerker = useMemo(() => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'), [handwerker]);

  // Kanban columns — inside component body (locale-aware getters)
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [])
      .filter(o => o.key !== 'ausgemustert')
      .map(o => ({ key: o.key, label: o.label, tone: toneForZustand(o.key) })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const zustand = lookupKey(w.fields.zustand);
      const activeAusleihe = enrichedAusleihe.find(
        a => extractRecordId(a.fields.werkzeug) === w.record_id && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'
      );
      return {
        id: `werkzeuge:${w.record_id}`,
        column: zustand ?? 'verfuegbar',
        title: w.fields.werkzeugname ?? tx('Ohne Name'),
        subtitle: activeAusleihe
          ? tx`Ausgeliehen von ${activeAusleihe.handwerkerName || '—'}`
          : w.fields.inventarnummer
            ? `${w.fields.inventarnummer}${w.fields.hersteller ? ` · ${w.fields.hersteller}` : ''}`
            : w.fields.kategorie?.label ?? '',
        tone: toneForZustand(zustand),
      };
    }),
    [werkzeuge, enrichedAusleihe],
  );

  // Optimistic status change
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const wid = cardId.split(':')[1];
    if (!wid) return;
    const werkzeug = werkzeuge.find(w => w.record_id === wid);
    if (!werkzeug) return;

    const oldZustand = werkzeug.fields.zustand;
    const newLabel = LOOKUP_OPTIONS['werkzeuge']?.['zustand']?.find(o => o.key === newColumn)?.label ?? newColumn;

    setWerkzeuge(prev =>
      prev.map(w =>
        w.record_id === wid
          ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: newLabel } } }
          : w
      )
    );

    const undo = async () => {
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wid
            ? { ...w, fields: { ...w.fields, zustand: oldZustand } }
            : w
        )
      );
      try {
        await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: oldZustand ? lookupKey(oldZustand) : undefined });
      } catch {
        await fetchAll();
      }
    };

    try {
      await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: newColumn });
      undoToast(tx`${werkzeug.fields.werkzeugname ?? ''} — ${newLabel}`, undo);
    } catch {
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll, COLUMNS]);

  // Ausleihe zurückgeben
  const ausleiheZurueckgeben = useCallback(async (a: EnrichedAusleihe) => {
    const oldStatus = a.fields.status_ausleihe;
    const returnDate = format(clock, "yyyy-MM-dd'T'HH:mm");

    setAusleihe(prev =>
      prev.map(r =>
        r.record_id === a.record_id
          ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: tx('Zurückgegeben') }, tatsaechliches_rueckgabedatum: returnDate } }
          : r
      )
    );

    // Werkzeug zurück auf verfügbar
    const wid = extractRecordId(a.fields.werkzeug);
    if (wid) {
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wid
            ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
            : w
        )
      );
    }

    const undo = async () => {
      setAusleihe(prev =>
        prev.map(r =>
          r.record_id === a.record_id
            ? { ...r, fields: { ...r.fields, status_ausleihe: oldStatus, tatsaechliches_rueckgabedatum: undefined } }
            : r
        )
      );
      if (wid) {
        setWerkzeuge(prev =>
          prev.map(w =>
            w.record_id === wid
              ? { ...w, fields: { ...w.fields, zustand: { key: 'ausgeliehen', label: tx('Ausgeliehen') } } }
              : w
          )
        );
      }
      try {
        await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
        if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: 'ausgeliehen' });
      } catch {
        await fetchAll();
      }
    };

    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'zurueckgegeben', tatsaechliches_rueckgabedatum: returnDate });
      if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: 'verfuegbar' });
      undoToast(tx`${a.werkzeugName || '—'} — zurückgegeben`, undo);
    } catch {
      await fetchAll();
    }
  }, [clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Wartung abschließen
  const wartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const oldStatus = w.fields.status_wartung;
    const endDate = format(clock, 'yyyy-MM-dd');

    setWartungReparatur(prev =>
      prev.map(r =>
        r.record_id === w.record_id
          ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: tx('Abgeschlossen') }, tatsaechliches_enddatum: endDate } }
          : r
      )
    );

    // Werkzeug wieder verfügbar
    const wid = extractRecordId(w.fields.werkzeug_wartung);
    if (wid) {
      setWerkzeuge(prev =>
        prev.map(r =>
          r.record_id === wid
            ? { ...r, fields: { ...r.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
            : r
        )
      );
    }

    const undo = async () => {
      setWartungReparatur(prev =>
        prev.map(r =>
          r.record_id === w.record_id
            ? { ...r, fields: { ...r.fields, status_wartung: oldStatus, tatsaechliches_enddatum: undefined } }
            : r
        )
      );
      if (wid) {
        setWerkzeuge(prev =>
          prev.map(r =>
            r.record_id === wid
              ? { ...r, fields: { ...r.fields, zustand: { key: lookupKey(w.fields.vorgangsart) === 'wartung' ? 'in_wartung' : 'in_reparatur', label: lookupKey(w.fields.vorgangsart) === 'wartung' ? tx('In Wartung') : tx('In Reparatur') } } }
              : r
          )
        );
      }
      try {
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
        if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: lookupKey(w.fields.vorgangsart) === 'wartung' ? 'in_wartung' : 'in_reparatur' });
      } catch {
        await fetchAll();
      }
    };

    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: endDate });
      if (wid) await LivingAppsService.updateWerkzeugeEntry(wid, { zustand: 'verfuegbar' });
      undoToast(tx`${w.werkzeug_wartungName || '—'} — Wartung abgeschlossen`, undo);
    } catch {
      await fetchAll();
    }
  }, [clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const contextNames = namen(ueberfaelligeAusleihen.map(a => a.handwerkerName || a.werkzeugName).filter(Boolean));
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tx`${contextNames} — überfällige Rückgabe`
    : laufendeWartungen.length > 0
      ? tx`${laufendeWartungen.length} Vorgänge in Bearbeitung`
      : tx`Alle Werkzeuge im Überblick`;

  // Hero: überfällige Ausleihen
  const oldest = ueberfaelligeAusleihen[0];

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => { setWerkzeugDefaults(undefined); setWerkzeugEditId(undefined); setWerkzeugDialog(true); }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Werkzeug aufnehmen')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 && oldest ? (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tx('Jetzt zurückgeben'),
              onClick: () => ausleiheZurueckgeben(oldest),
            }}
          >
            <b>{oldest.werkzeugName || tx('Werkzeug')}</b>
            {' '}{tx('überfällig seit')}{' '}
            <b>{formatDate(oldest.fields.geplantes_rueckgabedatum)}</b>
            {oldest.handwerkerName ? tx` — bei ${oldest.handwerkerName}` : ''}
          </HeroBanner>
        ) : undefined}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbar.length}
              tone={verfuegbar.length > 0 ? 'success' : 'default'}
              icon={<IconTools size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehen.length}
              tone={ausgeliehen.length > 0 ? 'primary' : 'default'}
              icon={<IconArrowRight size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('In Reparatur / Wartung')}
              value={inReparatur.length}
              tone={inReparatur.length > 0 ? 'warning' : 'default'}
              icon={<IconTool size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekt.length}
              tone={defekt.length > 0 ? 'destructive' : 'default'}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Aktive Handwerker')}
              value={aktiveHandwerker.length}
              icon={<IconUserCheck size={16} className="shrink-0" />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const wid = card.id.split(':')[1];
              const w = werkzeuge.find(r => r.record_id === wid);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugEditId(undefined);
              setWerkzeugDialog(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige Rückgaben')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tx('Überfällig')}</span>
                    <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                    <span className="text-muted-foreground"> · {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tx('Zurückgeben'),
                  onClick: () => ausleiheZurueckgeben(a),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihe.find(r => r.record_id === id);
                if (a) overlay.push({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Alle Rückgaben pünktlich — nächste Ausleihe buchen'),
                action: {
                  label: tx('Neue Ausleihe'),
                  onClick: () => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialog(true); },
                },
              }}
            />
            <WorkList
              title={tx('Aktive Wartungen & Reparaturen')}
              items={laufendeWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'text-warning' : 'text-primary'}`}>
                      {w.fields.vorgangsart?.label ?? tx('Vorgang')}
                    </span>
                    {w.verantwortlicherName ? <span className="text-muted-foreground"> · {w.verantwortlicherName}</span> : null}
                    {w.fields.geplantes_enddatum ? <span className="text-muted-foreground"> · {tx('bis')} {formatDate(w.fields.geplantes_enddatum)}</span> : null}
                  </>
                ),
                action: {
                  label: tx('Abschließen'),
                  onClick: () => wartungAbschliessen(w),
                },
              }))}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(r => r.record_id === id);
                if (w) overlay.push({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine laufenden Wartungen oder Reparaturen'),
                action: {
                  label: tx('Wartung erfassen'),
                  onClick: () => { setWartungDefaults(undefined); setWartungEditId(undefined); setWartungDialog(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Overlay stack */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record as Werkzeuge;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={w.fields.zustand?.label}
                  badges={w.fields.kategorie ? <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{w.fields.kategorie.label}</span> : undefined}
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ werkzeug: w.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(e => e.record_id === wr.record_id);
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
            const a = top.record as EnrichedAusleihe;
            return (
              <>
                <RecordHeader
                  title={a.werkzeugName || tx('Werkzeug')}
                  subtitle={a.handwerkerName ? tx`bei ${a.handwerkerName}` : undefined}
                  badges={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>{a.fields.status_ausleihe?.label}</span>}
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
            const wr = top.record as EnrichedWartungReparatur;
            return (
              <>
                <RecordHeader
                  title={wr.werkzeug_wartungName || tx('Werkzeug')}
                  subtitle={wr.fields.vorgangsart?.label}
                  badges={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(wr.fields.status_wartung) === 'in_bearbeitung' ? 'bg-warning/10 text-warning' : lookupKey(wr.fields.status_wartung) === 'abgeschlossen' ? 'bg-success/10 text-success' : 'bg-secondary/50 text-secondary-foreground'}`}>{wr.fields.status_wartung?.label}</span>}
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
            const h = top.record as Handwerker;
            return (
              <>
                <RecordHeader
                  title={`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || tx('Handwerker')}
                  subtitle={h.fields.qualifikation?.label}
                  badges={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lookupKey(h.fields.status) === 'aktiv' ? 'bg-success/10 text-success' : 'bg-secondary/50 text-secondary-foreground'}`}>{h.fields.status?.label}</span>}
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ handwerker: h.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialog(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(e => e.record_id === wr.record_id);
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
          if (top.type === 'ausleihe') {
            const a = top.record as EnrichedAusleihe;
            if (lookupKey(a.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tx('Zurückgeben'), onClick: () => { ausleiheZurueckgeben(a); overlay.close(); } };
            }
          }
          if (top.type === 'wartung_reparatur') {
            const wr = top.record as EnrichedWartungReparatur;
            if (lookupKey(wr.fields.status_wartung) === 'in_bearbeitung') {
              return { label: tx('Abschließen'), onClick: () => { wartungAbschliessen(wr); overlay.close(); } };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record as Werkzeuge;
            setWerkzeugDefaults(w.fields as WerkzeugeDialogDefaults);
            setWerkzeugEditId(w.record_id);
            setWerkzeugDialog(true);
            overlay.close();
          } else if (top.type === 'ausleihe') {
            const a = top.record as EnrichedAusleihe;
            setAusleiheDefaults(a.fields as AusleiheDialogDefaults);
            setAusleiheEditId(a.record_id);
            setAusleiheDialog(true);
            overlay.close();
          } else if (top.type === 'wartung_reparatur') {
            const wr = top.record as EnrichedWartungReparatur;
            setWartungDefaults(wr.fields as WartungReparaturDialogDefaults);
            setWartungEditId(wr.record_id);
            setWartungDialog(true);
            overlay.close();
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog}
        onClose={() => setWerkzeugDialog(false)}
        onSubmit={async fields => {
          if (werkzeugEditId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugEditId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={werkzeugDefaults}
        recordId={werkzeugEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog}
        onClose={() => setAusleiheDialog(false)}
        onSubmit={async fields => {
          if (ausleiheEditId) {
            await LivingAppsService.updateAusleiheEntry(ausleiheEditId, fields);
          } else {
            await LivingAppsService.createAusleiheEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={ausleiheDefaults}
        recordId={ausleiheEditId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog}
        onClose={() => setWartungDialog(false)}
        onSubmit={async fields => {
          if (wartungEditId) {
            await LivingAppsService.updateWartungReparaturEntry(wartungEditId, fields);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={wartungDefaults}
        recordId={wartungEditId}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={tx('Eintrag löschen')}
        description={tx('Wirklich löschen?')}
        onConfirm={async () => {
          if (!deleteTarget) return;
          if (deleteTarget.type === 'ausleihe') await LivingAppsService.deleteAusleiheEntry(deleteTarget.id);
          setDeleteTarget(null);
          await fetchAll();
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
