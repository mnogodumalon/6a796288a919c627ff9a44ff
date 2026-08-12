import { useMemo, useState, useCallback } from 'react';
import { format, parseISO, isBefore, isToday } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import {
  useRecordOverlayStack,
  RecordOverlayHost,
  RecordHeader,
  RecordAttachments,
} from '@/components/widgets/RecordView';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconTools,
  IconUserCheck,
  IconClockExclamation,
  IconTool,
  IconPlus,
  IconArrowBack,
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

  const enrichedAusleihe = enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap });
  const enrichedWartungReparatur = enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap });

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [werkzeugDialogOpen, setWerkzeugDialogOpen] = useState(false);
  const [werkzeugDefaults, setWerkzeugDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [editingWerkzeug, setEditingWerkzeug] = useState<Werkzeuge | null>(null);

  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [editingAusleihe, setEditingAusleihe] = useState<EnrichedAusleihe | null>(null);

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [editingHandwerker, setEditingHandwerker] = useState<Handwerker | null>(null);

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [editingWartung, setEditingWartung] = useState<EnrichedWartungReparatur | null>(null);

  // Derived values
  const today = format(clock, 'yyyy-MM-dd');

  const ueberfaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => {
      const key = lookupKey(a.fields.status_ausleihe);
      if (key !== 'ausgeliehen') return false;
      if (!a.fields.geplantes_rueckgabedatum) return false;
      return isBefore(parseISO(a.fields.geplantes_rueckgabedatum), clock);
    }),
    [enrichedAusleihe, clock],
  );

  const heuteFaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => {
      const key = lookupKey(a.fields.status_ausleihe);
      if (key !== 'ausgeliehen') return false;
      if (!a.fields.geplantes_rueckgabedatum) return false;
      try { return isToday(parseISO(a.fields.geplantes_rueckgabedatum)); } catch { return false; }
    }),
    [enrichedAusleihe],
  );

  const aktiveWartungen = useMemo(
    () => enrichedWartungReparatur.filter(w => {
      const key = lookupKey(w.fields.status_wartung);
      return key === 'geplant' || key === 'in_bearbeitung';
    }),
    [enrichedWartungReparatur],
  );

  const verfuegbareWerkzeuge = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar').length,
    [werkzeuge],
  );

  const ausgeliehenWerkzeuge = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'ausgeliehen').length,
    [werkzeuge],
  );

  const inServiceWerkzeuge = useMemo(
    () => werkzeuge.filter(w => {
      const k = lookupKey(w.fields.zustand);
      return k === 'in_reparatur' || k === 'in_wartung';
    }).length,
    [werkzeuge],
  );

  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv').length,
    [handwerker],
  );

  // Kanban columns from schema
  const WERKZEUG_COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  function toneForZustand(z: string | undefined): KanbanTone {
    if (z === 'verfuegbar') return 'success';
    if (z === 'ausgeliehen') return 'primary';
    if (z === 'in_reparatur' || z === 'in_wartung') return 'warning';
    if (z === 'defekt' || z === 'ausgemustert') return 'destructive';
    return 'default';
  }

  const werkzeugCards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const z = lookupKey(w.fields.zustand) ?? WERKZEUG_COLUMNS[0]?.key ?? '';
      const ausleiheFuerWerkzeug = enrichedAusleihe.filter(
        a => extractRecordId(a.fields.werkzeug) === w.record_id && lookupKey(a.fields.status_ausleihe) === 'ausgeliehen',
      );
      const handwerkerName = ausleiheFuerWerkzeug[0]?.handwerkerName;
      return {
        id: `werkzeug:${w.record_id}`,
        column: z,
        title: w.fields.werkzeugname ?? tx('Unbekannt'),
        subtitle: handwerkerName
          ? tx`bei ${handwerkerName}`
          : (w.fields.standort ?? w.fields.inventarnummer ?? undefined),
        tone: toneForZustand(z),
      };
    }),
    [werkzeuge, enrichedAusleihe, WERKZEUG_COLUMNS],
  );

  // Return Ausleihe (mark as returned)
  const returnAusleihe = useCallback(async (a: EnrichedAusleihe) => {
    const prev = a.fields.status_ausleihe;
    setAusleihe(list =>
      list.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status_ausleihe: lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben'), tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } }
          : x,
      ),
    );
    undoToast(tx`${a.werkzeugName} — zurückgegeben`, async () => {
      setAusleihe(list =>
        list.map(x =>
          x.record_id === a.record_id
            ? { ...x, fields: { ...x.fields, status_ausleihe: prev, tatsaechliches_rueckgabedatum: undefined } }
            : x,
        ),
      );
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm"),
      });
    } catch {
      await fetchAll();
    }
  }, [clock, fetchAll, setAusleihe]);

  // Wartung abschließen
  const abschliessenWartung = useCallback(async (w: EnrichedWartungReparatur) => {
    const prev = w.fields.status_wartung;
    setWartungReparatur(list =>
      list.map(x =>
        x.record_id === w.record_id
          ? { ...x, fields: { ...x.fields, status_wartung: lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen'), tatsaechliches_enddatum: today } }
          : x,
      ),
    );
    undoToast(tx`${w.werkzeug_wartungName} — Wartung abgeschlossen`, async () => {
      setWartungReparatur(list =>
        list.map(x =>
          x.record_id === w.record_id
            ? { ...x, fields: { ...x.fields, status_wartung: prev, tatsaechliches_enddatum: undefined } }
            : x,
        ),
      );
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, {
        status_wartung: 'abgeschlossen',
        tatsaechliches_enddatum: today,
      });
    } catch {
      await fetchAll();
    }
  }, [today, fetchAll, setWartungReparatur]);

  // Werkzeug Kanban move
  const moveWerkzeug = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    setWerkzeuge(prev =>
      prev.map(w =>
        w.record_id === rid
          ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', newColumn) } }
          : w,
      ),
    );
    const w = werkzeuge.find(x => x.record_id === rid);
    undoToast(tx`${w?.fields.werkzeugname ?? ''} — Status geändert`);
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch {
      await fetchAll();
    }
  }, [werkzeuge, fetchAll, setWerkzeuge]);

  // ─── Every hook above this line ────────────────────────────────────────────
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;
  // ─── Below this line: plain derivations only ────────────────────────────────

  const contextLine = (() => {
    if (ueberfaelligeAusleihen.length > 0) {
      const names = ueberfaelligeAusleihen.map(a => a.werkzeugName).filter(Boolean);
      return tx`${namen(names)} überfällig — sofort zurückfordern`;
    }
    if (heuteFaelligeAusleihen.length > 0) {
      const names = heuteFaelligeAusleihen.map(a => a.werkzeugName).filter(Boolean);
      return tx`${namen(names)} heute zurückgeben`;
    }
    if (aktiveWartungen.length > 0) {
      const names = aktiveWartungen.map(w => w.werkzeug_wartungName).filter(Boolean);
      return tx`${namen(names)} in Wartung oder Reparatur`;
    }
    return tx`${verfuegbareWerkzeuge} Werkzeuge verfügbar — alles im grünen Bereich`;
  })();

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
            <p className="mt-1 text-muted-foreground">{contextLine}</p>
          </div>
          <div className="flex gap-2 flex-wrap shrink-0">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              onClick={() => { setEditingWerkzeug(null); setWerkzeugDefaults(undefined); setWerkzeugDialogOpen(true); }}
            >
              <IconPlus size={16} className="shrink-0" />
              {tx('Werkzeug aufnehmen')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
              onClick={() => { setEditingAusleihe(null); setAusleiheDefaults(undefined); setAusleiheDialogOpen(true); }}
            >
              <IconArrowBack size={16} className="shrink-0" />
              {tx('Ausleihe erfassen')}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors"
              onClick={() => { setEditingHandwerker(null); setHandwerkerDialogOpen(true); }}
            >
              <IconUserCheck size={16} className="shrink-0" />
              {tx('Handwerker anlegen')}
            </button>
          </div>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          ueberfaelligeAusleihen.length > 0
            ? (
              <HeroBanner
                icon={<IconAlertTriangle size={18} />}
                action={{
                  label: tx('Rückgabe erfassen'),
                  onClick: () => {
                    const a = ueberfaelligeAusleihen[0];
                    if (a) void returnAusleihe(a);
                  },
                }}
              >
                <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName))}</b>
                {' '}{tx('überfällig')} — {tx('geplante Rückgabe')}: <b>{formatDateTime(ueberfaelligeAusleihen[0]?.fields.geplantes_rueckgabedatum)}</b>
              </HeroBanner>
            )
            : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbareWerkzeuge}
              icon={<IconTools size={16} />}
              tone={verfuegbareWerkzeuge > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={ausgeliehenWerkzeuge}
              icon={<IconArrowBack size={16} />}
              tone={ausgeliehenWerkzeuge > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('In Service')}
              value={inServiceWerkzeuge}
              icon={<IconTool size={16} />}
              tone={inServiceWerkzeuge > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Handwerker aktiv')}
              value={aktiveHandwerker}
              icon={<IconUserCheck size={16} />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={werkzeugCards}
            columns={WERKZEUG_COLUMNS}
            defaultCollapsed={['defekt', 'ausgemustert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={moveWerkzeug}
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
              title={tx('Ausleihen — heute fällig & überfällig')}
              items={[
                ...ueberfaelligeAusleihen.map(a => ({
                  id: a.record_id,
                  title: a.werkzeugName || tx('Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-destructive">{tx('Überfällig')}</span>
                      <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                    </>
                  ),
                  action: {
                    label: tx('↩ Zurück'),
                    onClick: () => void returnAusleihe(a),
                  },
                })),
                ...heuteFaelligeAusleihen.map(a => ({
                  id: a.record_id,
                  title: a.werkzeugName || tx('Werkzeug'),
                  secondLine: (
                    <>
                      <span className="font-medium text-warning">{tx('Heute fällig')}</span>
                      <span className="text-muted-foreground"> · {a.handwerkerName}</span>
                    </>
                  ),
                  action: {
                    label: tx('↩ Zurück'),
                    onClick: () => void returnAusleihe(a),
                  },
                })),
              ]}
              onItemClick={id => {
                const a = enrichedAusleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Keine offenen Ausleihen — alles pünktlich zurückgegeben'),
                action: { label: tx('Ausleihe erfassen'), onClick: () => setAusleiheDialogOpen(true) },
              }}
            />
            <WorkList
              title={tx('Aktive Wartungen & Reparaturen')}
              items={aktiveWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.vorgangsart?.label ?? ''}
                    </span>
                    <span className="text-muted-foreground"> · {w.verantwortlicherName || tx('kein Verantwortlicher')}</span>
                  </>
                ),
                action: {
                  label: tx('✓ Abschließen'),
                  onClick: () => void abschliessenWartung(w),
                },
              }))}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(x => x.record_id === id);
                if (w) overlay.replace({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine aktiven Wartungen oder Reparaturen'),
                action: {
                  label: tx('Wartung/Reparatur anlegen'),
                  onClick: () => { setEditingWartung(null); setWartungDefaults(undefined); setWartungDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Overlays */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeuge') {
            const w = top.record;
            return (
              <>
                <RecordHeader
                  title={w.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={w.fields.zustand?.label}
                  badges={
                    w.fields.kategorie
                      ? <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{w.fields.kategorie.label}</span>
                      : undefined
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
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: w.record_id });
                    setWartungDialogOpen(true);
                  }}
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
                  subtitle={h.fields.qualifikation?.label}
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
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => {
                    const ewr = enrichedWartungReparatur.find(x => x.record_id === wr.record_id);
                    if (ewr) overlay.push({ type: 'wartung_reparatur', record: ewr });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: h.record_id });
                    setWartungDialogOpen(true);
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
                  subtitle={a.fields.status_ausleihe?.label}
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
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen') {
            return { label: tx('Rückgabe erfassen'), onClick: () => void returnAusleihe(top.record as EnrichedAusleihe) };
          }
          if (top.type === 'wartung_reparatur') {
            const key = lookupKey(top.record.fields.status_wartung);
            if (key === 'geplant' || key === 'in_bearbeitung') {
              return { label: tx('Wartung abschließen'), onClick: () => void abschliessenWartung(top.record as EnrichedWartungReparatur) };
            }
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'werkzeuge') {
            setEditingWerkzeug(top.record as Werkzeuge);
            setWerkzeugDefaults(undefined);
            setWerkzeugDialogOpen(true);
          } else if (top.type === 'handwerker') {
            setEditingHandwerker(top.record as Handwerker);
            setHandwerkerDialogOpen(true);
          } else if (top.type === 'ausleihe') {
            setEditingAusleihe(top.record as EnrichedAusleihe);
            setAusleiheDefaults(undefined);
            setAusleiheDialogOpen(true);
          } else if (top.type === 'wartung_reparatur') {
            setEditingWartung(top.record as EnrichedWartungReparatur);
            setWartungDefaults(undefined);
            setWartungDialogOpen(true);
          }
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialogOpen}
        onClose={() => { setWerkzeugDialogOpen(false); setEditingWerkzeug(null); setWerkzeugDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingWerkzeug) {
            await LivingAppsService.updateWerkzeugeEntry(editingWerkzeug.record_id, fields as any);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingWerkzeug ? editingWerkzeug.fields : werkzeugDefaults}
        recordId={editingWerkzeug?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => { setAusleiheDialogOpen(false); setEditingAusleihe(null); setAusleiheDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingAusleihe) {
            await LivingAppsService.updateAusleiheEntry(editingAusleihe.record_id, fields as any);
          } else {
            await LivingAppsService.createAusleiheEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingAusleihe ? editingAusleihe.fields : ausleiheDefaults}
        recordId={editingAusleihe?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => { setHandwerkerDialogOpen(false); setEditingHandwerker(null); }}
        onSubmit={async fields => {
          if (editingHandwerker) {
            await LivingAppsService.updateHandwerkerEntry(editingHandwerker.record_id, fields as any);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingHandwerker?.fields}
        recordId={editingHandwerker?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />

      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => { setWartungDialogOpen(false); setEditingWartung(null); setWartungDefaults(undefined); }}
        onSubmit={async fields => {
          if (editingWartung) {
            await LivingAppsService.updateWartungReparaturEntry(editingWartung.record_id, fields as any);
          } else {
            await LivingAppsService.createWartungReparaturEntry(fields as any);
          }
          await fetchAll();
        }}
        defaultValues={editingWartung ? editingWartung.fields : wartungDefaults}
        recordId={editingWartung?.record_id}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />
    </>
  );
}
