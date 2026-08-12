import { useCallback, useMemo, useState } from 'react';
import { format, parseISO, isBefore } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import { AusleiheDialog, type AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WerkzeugeDialog, type WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { HandwerkerDialog, type HandwerkerDialogDefaults } from '@/components/dialogs/HandwerkerDialog';
import { WartungReparaturDialog, type WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { tx, appLabel } from '@/i18n';
import {
  IconAlertTriangle,
  IconTool,
  IconUsers,
  IconArrowBack,
  IconCircleCheck,
} from '@tabler/icons-react';

export type OverlayItem =
  | { type: 'handwerker'; record: Handwerker }
  | { type: 'werkzeuge'; record: Werkzeuge }
  | { type: 'ausleihe'; record: EnrichedAusleihe }
  | { type: 'wartung_reparatur'; record: EnrichedWartungReparatur };

export default function DashboardOverview() {
  const clock = useClock();

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

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog state
  const [ausleiheDialogOpen, setAusleiheDialogOpen] = useState(false);
  const [ausleiheDefaults, setAusleiheDefaults] = useState<AusleiheDialogDefaults | undefined>();
  const [ausleiheEditId, setAusleiheEditId] = useState<string | undefined>();

  const [werkzeugeDialogOpen, setWerkzeugeDialogOpen] = useState(false);
  const [werkzeugeDefaults, setWerkzeugeDefaults] = useState<WerkzeugeDialogDefaults | undefined>();
  const [werkzeugeEditId, setWerkzeugeEditId] = useState<string | undefined>();

  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);
  const [handwerkerDefaults, setHandwerkerDefaults] = useState<HandwerkerDialogDefaults | undefined>();
  const [handwerkerEditId, setHandwerkerEditId] = useState<string | undefined>();

  const [wartungDialogOpen, setWartungDialogOpen] = useState(false);
  const [wartungDefaults, setWartungDefaults] = useState<WartungReparaturDialogDefaults | undefined>();
  const [wartungEditId, setWartungEditId] = useState<string | undefined>();

  // Kanban columns from schema (INSIDE component body — locale-aware getters)
  const WERKZEUG_COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Cards: Werkzeuge mapped by Zustand
  const werkzeugCards = useMemo<KanbanCard[]>(
    () => werkzeuge.map(w => {
      const zustand = lookupKey(w.fields.zustand) ?? 'verfuegbar';
      const tone: KanbanCard['tone'] =
        zustand === 'verfuegbar' ? 'success' :
        zustand === 'defekt' ? 'destructive' :
        zustand === 'ausgemustert' ? 'default' :
        'warning';
      return {
        id: `werkzeug:${w.record_id}`,
        column: zustand,
        title: w.fields.werkzeugname ?? tx('Unbekannt'),
        subtitle: [w.fields.hersteller, w.fields.inventarnummer].filter(Boolean).join(' · ') || undefined,
        tone,
      };
    }),
    [werkzeuge],
  );

  // Today string for overdue comparisons
  const todayStr = format(clock, 'yyyy-MM-dd');

  // Überfällige Ausleihen: ausgeliehen & geplantes_rueckgabedatum < heute
  const ueberfaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(a =>
      lookupKey(a.fields.status_ausleihe) === 'ausgeliehen' &&
      a.fields.geplantes_rueckgabedatum &&
      a.fields.geplantes_rueckgabedatum.slice(0, 16) < format(clock, "yyyy-MM-dd'T'HH:mm")
    ),
    [enrichedAusleihe, clock],
  );

  // Aktive Ausleihen gesamt
  const aktiveAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  // Wartungen in Bearbeitung
  const wartungenInBearbeitung = useMemo(
    () => enrichedWartungReparatur.filter(w =>
      lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ||
      lookupKey(w.fields.status_wartung) === 'geplant'
    ),
    [enrichedWartungReparatur],
  );

  // Aktive Handwerker
  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker],
  );

  // Verfügbare Werkzeuge
  const verfuegbareWerkzeuge = useMemo(
    () => werkzeuge.filter(w => lookupKey(w.fields.zustand) === 'verfuegbar'),
    [werkzeuge],
  );

  // Rückgabe-Handler: Ausleihe → zurückgegeben + Werkzeug → verfügbar
  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const prevAusleihe = [...ausleihe];
    const prevWerkzeuge = [...werkzeuge];
    const werkzeugId = extractRecordId(a.fields.werkzeug);
    // Optimistic
    setAusleihe(prev => prev.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status_ausleihe: lookupOption('ausleihe', 'status_ausleihe', 'zurueckgegeben'), tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm") } }
        : x,
    ));
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === werkzeugId
          ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', 'verfuegbar') } }
          : w,
      ));
    }
    const name = a.werkzeugName || tx('Werkzeug');
    undoToast(tx`${name} — zurückgegeben`, async () => {
      setAusleihe(prevAusleihe);
      setWerkzeuge(prevWerkzeuge);
      try {
        await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'ausgeliehen', tatsaechliches_rueckgabedatum: undefined });
        if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'ausgeliehen' });
      } catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: format(clock, "yyyy-MM-dd'T'HH:mm"),
      });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
    } catch { await fetchAll(); }
  }, [ausleihe, werkzeuge, clock, setAusleihe, setWerkzeuge, fetchAll]);

  // Wartung abschließen
  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const prevWartung = [...wartungReparatur];
    const prevWerkzeuge = [...werkzeuge];
    const werkzeugId = extractRecordId(w.fields.werkzeug_wartung);
    setWartungReparatur(prev => prev.map(x =>
      x.record_id === w.record_id
        ? { ...x, fields: { ...x.fields, status_wartung: lookupOption('wartung_reparatur', 'status_wartung', 'abgeschlossen'), tatsaechliches_enddatum: todayStr } }
        : x,
    ));
    if (werkzeugId) {
      setWerkzeuge(prev => prev.map(wz =>
        wz.record_id === werkzeugId
          ? { ...wz, fields: { ...wz.fields, zustand: lookupOption('werkzeuge', 'zustand', 'verfuegbar') } }
          : wz,
      ));
    }
    const name = w.werkzeug_wartungName || tx('Werkzeug');
    undoToast(tx`${name} — Wartung abgeschlossen`, async () => {
      setWartungReparatur(prevWartung);
      setWerkzeuge(prevWerkzeuge);
      try {
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'in_bearbeitung', tatsaechliches_enddatum: undefined });
        if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'in_wartung' });
      } catch { await fetchAll(); }
    });
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: todayStr });
      if (werkzeugId) await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
    } catch { await fetchAll(); }
  }, [wartungReparatur, werkzeuge, todayStr, setWartungReparatur, setWerkzeuge, fetchAll]);

  // Kanban move: Werkzeug-Zustand ändern
  const moveWerkzeugCard = useCallback(async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === rid
        ? { ...w, fields: { ...w.fields, zustand: lookupOption('werkzeuge', 'zustand', newColumn) } }
        : w,
    ));
    const w = werkzeuge.find(x => x.record_id === rid);
    const name = w?.fields.werkzeugname ?? tx('Werkzeug');
    undoToast(tx`${name} — Zustand geändert`);
    try {
      await LivingAppsService.updateWerkzeugeEntry(rid, { zustand: newColumn });
    } catch { await fetchAll(); }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Context line
  const ueberfaelligNames = namen(ueberfaelligeAusleihen.map(a => a.werkzeugName));
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tx`${ueberfaelligNames} — Rückgabe überfällig!`
    : aktiveAusleihen.length > 0
      ? tx`${String(aktiveAusleihen.length)} Werkzeuge aktuell ausgeliehen — alles im Plan.`
      : tx`Alle Werkzeuge verfügbar — bereit zum Einsatz.`;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{gruss(clock)}</h1>
        <p className="mt-1 text-muted-foreground">{contextLine}</p>
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
            <b>{ueberfaelligNames}</b> {tx('— Rückgabe überfällig seit')} {formatDateTime(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Verfügbar')}
              value={verfuegbareWerkzeuge.length}
              icon={<IconCircleCheck size={16} className="shrink-0" />}
              tone={verfuegbareWerkzeuge.length > 0 ? 'success' : 'warning'}
            />
            <StatStripItem
              title={tx('Ausgeliehen')}
              value={aktiveAusleihen.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={aktiveAusleihen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Wartung / Reparatur')}
              value={wartungenInBearbeitung.length}
              icon={<IconTool size={16} className="shrink-0" />}
              tone={wartungenInBearbeitung.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Aktive Handwerker')}
              value={aktiveHandwerker.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={werkzeugCards}
            columns={WERKZEUG_COLUMNS}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const w = werkzeuge.find(x => x.record_id === rid);
              if (w) overlay.replace({ type: 'werkzeuge', record: w });
            }}
            onCardMove={moveWerkzeugCard}
            onAddCard={column => {
              setWerkzeugeDefaults({ zustand: column });
              setWerkzeugeEditId(undefined);
              setWerkzeugeDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Überfällige Ausleihen')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{a.handwerkerName}</span>
                    <span className="text-muted-foreground"> · {tx('fällig')} {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: {
                  label: tx('Zurückgeben'),
                  onClick: () => handleRueckgabe(a),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAusleihe.find(x => x.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tx('Alle Rückgaben pünktlich — alles im Plan'),
                action: {
                  label: tx('Ausleihe erfassen'),
                  onClick: () => { setAusleiheDefaults(undefined); setAusleiheEditId(undefined); setAusleiheDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title={tx('Wartungen & Reparaturen')}
              items={wartungenInBearbeitung.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || tx('Werkzeug'),
                secondLine: (
                  <>
                    <span className={`font-medium ${lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? 'text-warning' : 'text-muted-foreground'}`}>
                      {w.fields.status_wartung?.label ?? tx('Geplant')}
                    </span>
                    <span className="text-muted-foreground"> · {w.fields.vorgangsart?.label} · {formatDate(w.fields.geplantes_enddatum)}</span>
                  </>
                ),
                action: lookupKey(w.fields.status_wartung) === 'in_bearbeitung' ? {
                  label: tx('Abschließen'),
                  onClick: () => handleWartungAbschliessen(w),
                } : undefined,
              }))}
              onItemClick={id => {
                const w = enrichedWartungReparatur.find(x => x.record_id === id);
                if (w) overlay.replace({ type: 'wartung_reparatur', record: w });
              }}
              empty={{
                text: tx('Keine laufenden Wartungen'),
                action: {
                  label: tx('Wartung planen'),
                  onClick: () => { setWartungDefaults(undefined); setWartungEditId(undefined); setWartungDialogOpen(true); },
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
            return (
              <>
                <RecordHeader
                  title={top.record.fields.werkzeugname ?? tx('Werkzeug')}
                  subtitle={top.record.fields.zustand?.label}
                  badges={
                    <span className="text-xs text-muted-foreground">
                      {top.record.fields.inventarnummer}
                    </span>
                  }
                />
                <WerkzeugeDetails
                  record={top.record}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ werkzeug: top.record.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => {
                    const ew = enrichedWartungReparatur.find(x => x.record_id === w.record_id);
                    if (ew) overlay.push({ type: 'wartung_reparatur', record: ew });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ werkzeug_wartung: top.record.record_id });
                    setWartungEditId(undefined);
                    setWartungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            return (
              <>
                <RecordHeader
                  title={top.record.werkzeugName || tx('Werkzeug')}
                  subtitle={top.record.handwerkerName}
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
          if (top.type === 'handwerker') {
            return (
              <>
                <RecordHeader
                  title={`${top.record.fields.vorname ?? ''} ${top.record.fields.nachname ?? ''}`.trim() || tx('Handwerker')}
                  subtitle={top.record.fields.qualifikation?.label}
                />
                <HandwerkerDetails
                  record={top.record}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => {
                    const ea = enrichedAusleihe.find(x => x.record_id === a.record_id);
                    if (ea) overlay.push({ type: 'ausleihe', record: ea });
                  }}
                  onAddAusleihe={() => {
                    setAusleiheDefaults({ handwerker: top.record.record_id });
                    setAusleiheEditId(undefined);
                    setAusleiheDialogOpen(true);
                  }}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={w => {
                    const ew = enrichedWartungReparatur.find(x => x.record_id === w.record_id);
                    if (ew) overlay.push({ type: 'wartung_reparatur', record: ew });
                  }}
                  onAddWartungReparatur={() => {
                    setWartungDefaults({ verantwortlicher: top.record.record_id });
                    setWartungEditId(undefined);
                    setWartungDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'wartung_reparatur') {
            return (
              <>
                <RecordHeader
                  title={top.record.werkzeug_wartungName || tx('Werkzeug')}
                  subtitle={top.record.fields.vorgangsart?.label}
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
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe' && lookupKey(top.record.fields.status_ausleihe) === 'ausgeliehen') {
            return {
              label: tx('Zurückgeben'),
              onClick: () => { handleRueckgabe(top.record as EnrichedAusleihe); overlay.close(); },
            };
          }
          if (top.type === 'wartung_reparatur' && lookupKey(top.record.fields.status_wartung) === 'in_bearbeitung') {
            return {
              label: tx('Wartung abschließen'),
              onClick: () => { handleWartungAbschliessen(top.record as EnrichedWartungReparatur); overlay.close(); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'ausleihe') {
            setAusleiheDefaults(top.record.fields as AusleiheDialogDefaults);
            setAusleiheEditId(top.record.record_id);
            setAusleiheDialogOpen(true);
          } else if (top.type === 'werkzeuge') {
            setWerkzeugeDefaults(top.record.fields as WerkzeugeDialogDefaults);
            setWerkzeugeEditId(top.record.record_id);
            setWerkzeugeDialogOpen(true);
          } else if (top.type === 'handwerker') {
            setHandwerkerDefaults(top.record.fields as HandwerkerDialogDefaults);
            setHandwerkerEditId(top.record.record_id);
            setHandwerkerDialogOpen(true);
          } else if (top.type === 'wartung_reparatur') {
            setWartungDefaults(top.record.fields as WartungReparaturDialogDefaults);
            setWartungEditId(top.record.record_id);
            setWartungDialogOpen(true);
          }
        }}
      />

      {/* Dialogs */}
      <AusleiheDialog
        open={ausleiheDialogOpen}
        onClose={() => setAusleiheDialogOpen(false)}
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
      <WerkzeugeDialog
        open={werkzeugeDialogOpen}
        onClose={() => setWerkzeugeDialogOpen(false)}
        onSubmit={async fields => {
          if (werkzeugeEditId) {
            await LivingAppsService.updateWerkzeugeEntry(werkzeugeEditId, fields);
          } else {
            await LivingAppsService.createWerkzeugeEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={werkzeugeDefaults}
        recordId={werkzeugeEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />
      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => setHandwerkerDialogOpen(false)}
        onSubmit={async fields => {
          if (handwerkerEditId) {
            await LivingAppsService.updateHandwerkerEntry(handwerkerEditId, fields);
          } else {
            await LivingAppsService.createHandwerkerEntry(fields);
          }
          await fetchAll();
        }}
        defaultValues={handwerkerDefaults}
        recordId={handwerkerEditId}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
      <WartungReparaturDialog
        open={wartungDialogOpen}
        onClose={() => setWartungDialogOpen(false)}
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
    </>
  );
}
