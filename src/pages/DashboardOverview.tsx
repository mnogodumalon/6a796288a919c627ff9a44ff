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
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
} from '@/components/widgets/RecordView';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import {
  IconTools,
  IconAlertTriangle,
  IconPlus,
  IconTool,
  IconUserCheck,
} from '@tabler/icons-react';

type OverlayItem =
  | { type: 'werkzeug'; id: string }
  | { type: 'ausleihe'; id: string }
  | { type: 'wartung'; id: string }
  | { type: 'handwerker'; id: string };

function toneForZustand(key: string | undefined): KanbanTone {
  if (key === 'verfuegbar') return 'success';
  if (key === 'ausgeliehen') return 'primary';
  if (key === 'in_reparatur' || key === 'in_wartung') return 'warning';
  if (key === 'defekt') return 'destructive';
  return 'default';
}

export default function DashboardOverview() {
  const {
    handwerker, setHandwerker, werkzeuge, setWerkzeuge, ausleihe, setAusleihe,
    wartungReparatur, setWartungReparatur,
    handwerkerMap, werkzeugeMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const clock = useClock();

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog states
  const [werkzeugDialogOpen, setWerkzeugDialogOpen] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>(undefined);
  const [editingWerkzeug, setEditingWerkzeug] = useState<Werkzeuge | null>(null);

  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>(undefined);
  const [editingAusleihe, setEditingAusleihe] = useState<Ausleihe | null>(null);

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>(undefined);
  const [editingWartung, setEditingWartung] = useState<WartungReparatur | null>(null);

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [editingHandwerker, setEditingHandwerker] = useState<Handwerker | null>(null);

  // KPI filter
  const [filter, setFilter] = useState<'all' | 'ueberfaellig' | 'defekt'>('all');

  // Kanban columns from schema
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Derived metrics
  const today = format(clock, 'yyyy-MM-dd');

  const ueberfaelligeAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a => {
      const key = lookupKey(a.fields.status_ausleihe);
      if (key !== 'ausgeliehen') return false;
      const ret = a.fields.geplantes_rueckgabedatum;
      if (!ret) return false;
      return ret.slice(0, 10) < today;
    }),
    [enrichedAusleihe, today],
  );

  const aktivAusleihen = useMemo(() =>
    enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  const laufendeWartungen = useMemo(() =>
    enrichedWartungReparatur.filter(w => {
      const st = lookupKey(w.fields.status_wartung);
      return st === 'in_bearbeitung' || st === 'geplant';
    }),
    [enrichedWartungReparatur],
  );

  const defekteWerkzeuge = useMemo(() =>
    werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'defekt'),
    [werkzeuge],
  );

  const aktiveHandwerker = useMemo(() =>
    handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker],
  );

  // Kanban cards — filtered by KPI
  const cards = useMemo<KanbanCard[]>(() => {
    let list = werkzeuge;
    if (filter === 'ueberfaellig') {
      const ueberfaelligIds = new Set(ueberfaelligeAusleihen.map(a => extractRecordId(a.fields.werkzeug)).filter(Boolean) as string[]);
      list = werkzeuge.filter(w => ueberfaelligIds.has(w.record_id));
    } else if (filter === 'defekt') {
      list = defekteWerkzeuge;
    }
    return list.map(w => {
      const key = lookupKey(w.fields.zustand) ?? '';
      return {
        id: `werkzeug:${w.record_id}`,
        column: key || (COLUMNS[0]?.key ?? ''),
        title: w.fields.werkzeugname ?? tx('Unbekanntes Werkzeug'),
        subtitle: [w.fields.hersteller, w.fields.inventarnummer].filter(Boolean).join(' · ') || undefined,
        tone: toneForZustand(key),
      };
    });
  }, [werkzeuge, filter, ueberfaelligeAusleihen, defekteWerkzeuge, COLUMNS]);

  // Move card = optimistic Zustand-Write
  const moveCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const w = werkzeuge.find(x => x.record_id === rid);
    if (!w) return;
    const col = COLUMNS.find(c => c.key === newColumn);
    // Validation: nur verfügbare Werkzeuge können ausgeliehen werden
    if (newColumn === 'ausgeliehen') {
      const current = lookupKey(w.fields.zustand);
      if (current !== 'verfuegbar') {
        return tx('Nur verfügbare Werkzeuge können ausgeliehen werden');
      }
    }
    const prevWerkzeuge = werkzeuge;
    setWerkzeuge(prev =>
      prev.map(x =>
        x.record_id === rid
          ? { ...x, fields: { ...x.fields, zustand: { key: newColumn, label: col?.label ?? newColumn } } }
          : x,
      ),
    );
    undoToast(tx`${w.fields.werkzeugname ?? ''} — ${col?.label ?? newColumn}`, async () => {
      const prevZustand = w.fields.zustand;
      setWerkzeuge(prev =>
        prev.map(x =>
          x.record_id === rid
            ? { ...x, fields: { ...x.fields, zustand: prevZustand } }
            : x,
        ),
      );
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: lookupKey(w.fields.zustand) });
    });
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch {
      setWerkzeuge(prevWerkzeuge);
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, COLUMNS, fetchAll]);

  // Ausleihe zurückgeben
  const returnTool = useCallback(async (a: EnrichedAusleihe) => {
    const prev = ausleihe;
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    setAusleihe(prevList =>
      prevList.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status_ausleihe: { key: 'zurueckgegeben', label: tx('Zurückgegeben') }, tatsaechliches_rueckgabedatum: now } }
          : x,
      ),
    );
    const wId = extractRecordId(a.fields.werkzeug);
    if (wId) {
      setWerkzeuge(prev =>
        prev.map(w =>
          w.record_id === wId
            ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
            : w,
        ),
      );
    }
    undoToast(tx`${a.werkzeugName} — zurückgegeben`, async () => {
      setAusleihe(prev);
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'ausgeliehen' });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: now,
      });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
    } catch {
      setAusleihe(prev);
      await fetchAll();
    }
  }, [ausleihe, setAusleihe, setWerkzeuge, clock, fetchAll]);

  // Wartung abschließen
  const closeWartung = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = wartungReparatur;
    const heute = format(clock, 'yyyy-MM-dd');
    setWartungReparatur(prevList =>
      prevList.map(x =>
        x.record_id === w.record_id
          ? { ...x, fields: { ...x.fields, status_wartung: { key: 'abgeschlossen', label: tx('Abgeschlossen') }, tatsaechliches_enddatum: heute } }
          : x,
      ),
    );
    const wId = extractRecordId(w.fields.werkzeug_wartung);
    if (wId) {
      setWerkzeuge(prev =>
        prev.map(x =>
          x.record_id === wId
            ? { ...x, fields: { ...x.fields, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } }
            : x,
        ),
      );
    }
    undoToast(tx`${w.werkzeug_wartungName} — abgeschlossen`, async () => {
      setWartungReparatur(prev);
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: heute,
      });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
    } catch {
      setWartungReparatur(prev);
      await fetchAll();
    }
  }, [wartungReparatur, setWartungReparatur, setWerkzeuge, clock, fetchAll]);

  // Overlay helpers
  const openWerkzeugOverlay = useCallback((w: Werkzeuge) => {
    overlay.replace({ type: 'werkzeug', id: w.record_id });
  }, [overlay]);

  const openAusleiheOverlay = useCallback((a: Ausleihe) => {
    overlay.push({ type: 'ausleihe', id: a.record_id });
  }, [overlay]);

  const openWartungOverlay = useCallback((w: WartungReparatur) => {
    overlay.push({ type: 'wartung', id: w.record_id });
  }, [overlay]);

  const openHandwerkerOverlay = useCallback((h: Handwerker) => {
    overlay.push({ type: 'handwerker', id: h.record_id });
  }, [overlay]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const contextLine = (() => {
    const aus = aktivAusleihen.length;
    const warn = laufendeWartungen.length;
    const parts: string[] = [];
    if (aus > 0) {
      const names = namen(aktivAusleihen.slice(0, 3).map(a => a.werkzeugName).filter(Boolean));
      parts.push(`${names} ${aus === 1 ? tx('ausgeliehen') : tx('ausgeliehen')}`);
    }
    if (warn > 0) parts.push(`${warn} ${tx('in Wartung/Reparatur')}`);
    if (parts.length === 0) return tx('Alle Werkzeuge verfügbar.');
    return parts.join(' · ');
  })();

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => { setEditingWerkzeug(null); setWerkzeugDefaults(undefined); setWerkzeugDialogOpen(true); }}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <IconPlus size={16} className="shrink-0" />
          <span>{tx('Werkzeug')}</span>
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeAusleihen.length > 0 ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Zurückgeben'),
                onClick: () => returnTool(ueberfaelligeAusleihen[0]),
              }}
            >
              <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName).filter(Boolean))}</b>
              {' '}{tx('überfällig — geplante Rückgabe war')}{' '}
              {formatDate(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}.
            </HeroBanner>
          ) : null
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Werkzeuge gesamt')}
              value={werkzeuge.length}
              icon={<IconTools size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={aktivAusleihen.length}
              icon={<IconTools size={16} className="shrink-0" />}
              tone={aktivAusleihen.length > 0 ? 'primary' : 'default'}
              onClick={() => setFilter(f => f === 'ueberfaellig' ? 'all' : 'ueberfaellig')}
              active={filter === 'ueberfaellig'}
            />
            <StatStripItem
              title={tx('Überfällig')}
              value={ueberfaelligeAusleihen.length}
              icon={<IconAlertTriangle size={16} className="shrink-0" />}
              tone={ueberfaelligeAusleihen.length > 0 ? 'destructive' : 'default'}
              onClick={() => setFilter(f => f === 'ueberfaellig' ? 'all' : 'ueberfaellig')}
              active={filter === 'ueberfaellig'}
            />
            <StatStripItem
              title={tx('Defekt')}
              value={defekteWerkzeuge.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={defekteWerkzeuge.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => f === 'defekt' ? 'all' : 'defekt')}
              active={filter === 'defekt'}
            />
            <StatStripItem
              title={tx('Aktive Handwerker')}
              value={aktiveHandwerker.length}
              icon={<IconUserCheck size={16} className="shrink-0" />}
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
              overlay.replace({ type: 'werkzeug', id: rid });
            }}
            onCardMove={moveCard}
            onAddCard={column => {
              setEditingWerkzeug(null);
              setWerkzeugDefaults({ zustand: column });
              setWerkzeugDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Aktive Ausleihen')}
              items={aktivAusleihen.slice(0, 8).map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' && a.fields.geplantes_rueckgabedatum && a.fields.geplantes_rueckgabedatum.slice(0, 10) < today ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                      {a.handwerkerName}
                    </span>
                    {a.fields.geplantes_rueckgabedatum && (
                      <span className="text-muted-foreground"> · {tx('bis')} {formatDate(a.fields.geplantes_rueckgabedatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('✓ Zurückgeben'),
                  onClick: () => returnTool(a),
                },
              }))}
              onItemClick={id => {
                const a = ausleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', id: a.record_id });
              }}
              empty={{
                text: tx('Keine Ausleihen aktiv — alle Werkzeuge verfügbar'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => { setEditingAusleihe(null); setAusleiheDefaults(undefined); setAusleiheDialogOpen(true); } },
              }}
            />
            <WorkList
              title={tx('Wartung & Reparatur')}
              items={laufendeWartungen.slice(0, 6).map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={lookupKey(w.fields.vorgangsart) === 'reparatur' ? 'font-medium text-warning' : 'text-muted-foreground'}>
                      {w.fields.vorgangsart?.label ?? ''}
                    </span>
                    {w.verantwortlicherName && (
                      <span className="text-muted-foreground"> · {w.verantwortlicherName}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('✓ Abschließen'),
                  onClick: () => closeWartung(w),
                },
              }))}
              onItemClick={id => {
                const w = wartungReparatur.find(x => x.record_id === id);
                if (w) overlay.replace({ type: 'wartung', id: w.record_id });
              }}
              empty={{
                text: tx('Keine laufenden Wartungen oder Reparaturen'),
                action: { label: tx('Wartung erfassen'), onClick: () => { setEditingWartung(null); setWartungDefaults(undefined); setWartungDialogOpen(true); } },
              }}
            />
          </>
        }
      />

      {/* Overlays */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const w = werkzeuge.find(x => x.record_id === top.id);
            if (!w) return null;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? '—'}
                  subtitle={w.fields.zustand?.label}
                  badges={
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {w.fields.inventarnummer}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={w}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={openAusleiheOverlay}
                  onAddAusleihe={() => { setAusleiheDefaults({ werkzeug: w.record_id }); setAusleiheDialogOpen(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={openWartungOverlay}
                  onAddWartungReparatur={() => { setWartungDefaults({ werkzeug_wartung: w.record_id }); setWartungDialogOpen(true); }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = ausleihe.find(x => x.record_id === top.id);
            if (!a) return null;
            const ea = enrichedAusleihe.find(x => x.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={ea?.werkzeugName ?? '—'}
                  subtitle={ea?.handwerkerName}
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
            const w = wartungReparatur.find(x => x.record_id === top.id);
            if (!w) return null;
            const ew = enrichedWartungReparatur.find(x => x.record_id === top.id);
            return (
              <>
                <RecordHeader
                  title={ew?.werkzeug_wartungName ?? '—'}
                  subtitle={w.fields.vorgangsart?.label}
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
            const h = handwerker.find(x => x.record_id === top.id);
            if (!h) return null;
            return (
              <>
                <RecordHeader
                  title={[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ')}
                  subtitle={h.fields.qualifikation?.label}
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={openAusleiheOverlay}
                  onAddAusleihe={() => { setAusleiheDefaults({ handwerker: h.record_id }); setAusleiheDialogOpen(true); }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={openWartungOverlay}
                  onAddWartungReparatur={() => { setWartungDefaults({ verantwortlicher: h.record_id }); setWartungDialogOpen(true); }}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const ea = enrichedAusleihe.find(x => x.record_id === top.id);
            if (ea && lookupKey(ea.fields.status_ausleihe) === 'ausgeliehen') {
              return { label: tx('Werkzeug zurückgeben'), onClick: () => returnTool(ea) };
            }
          }
          if (top.type === 'wartung') {
            const ew = enrichedWartungReparatur.find(x => x.record_id === top.id);
            if (ew && (lookupKey(ew.fields.status_wartung) === 'in_bearbeitung' || lookupKey(ew.fields.status_wartung) === 'geplant')) {
              return { label: tx('Abschließen'), onClick: () => closeWartung(ew) };
            }
          }
          return null;
        }}
        onEdit={top => {
          if (top.type === 'werkzeug') {
            const w = werkzeuge.find(x => x.record_id === top.id);
            if (w) { setEditingWerkzeug(w); setWerkzeugDefaults(w.fields as WerkzeugeDialogDefaults); setWerkzeugDialogOpen(true); }
          } else if (top.type === 'ausleihe') {
            const a = ausleihe.find(x => x.record_id === top.id);
            if (a) { setEditingAusleihe(a); setAusleiheDefaults(a.fields as AusleiheDialogDefaults); setAusleiheDialogOpen(true); }
          } else if (top.type === 'wartung') {
            const w = wartungReparatur.find(x => x.record_id === top.id);
            if (w) { setEditingWartung(w); setWartungDefaults(w.fields as WartungReparaturDialogDefaults); setWartungDialogOpen(true); }
          } else if (top.type === 'handwerker') {
            const h = handwerker.find(x => x.record_id === top.id);
            if (h) { setEditingHandwerker(h); setHandwerkerDialogOpen(true); }
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialogOpen}
        onClose={() => { setWerkzeugDialogOpen(false); setEditingWerkzeug(null); setWerkzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingWerkzeug) {
            await LivingAppsService.updateWerkzeugeEntry(editingWerkzeug.record_id, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={werkzeugDefaults}
        recordId={editingWerkzeug?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setEditingAusleihe(null); setAusleiheDefaults(undefined); }}
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
        onClose={() => { setWartungDialogOpen(false); setEditingWartung(null); setWartungDefaults(undefined); }}
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
        onClose={() => { setHandwerkerDialogOpen(false); setEditingHandwerker(null); }}
        onSubmit={async fields => {
          if (editingHandwerker) {
            await LivingAppsService.updateHandwerkerEntry(editingHandwerker.record_id, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={editingHandwerker?.fields as HandwerkerDialogDefaults | undefined}
        recordId={editingHandwerker?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
