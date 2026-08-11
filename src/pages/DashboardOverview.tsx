import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe, enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedAusleihe, EnrichedWartungReparatur } from '@/types/enriched';
import type { Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { makeT, appLabel, fieldLabel, lookupLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { useRecordOverlayStack } from '@/components/widgets/RecordView';
import {
  RecordOverlayHost, RecordHeader, RecordOverlay,
} from '@/components/widgets/RecordView';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import type { WerkzeugeDialogDefaults } from '@/components/dialogs/WerkzeugeDialog';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import type { AusleiheDialogDefaults } from '@/components/dialogs/AusleiheDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import type { WartungReparaturDialogDefaults } from '@/components/dialogs/WartungReparaturDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { WerkzeugeDetails } from '@/components/details/WerkzeugeDetails';
import { AusleiheDetails } from '@/components/details/AusleiheDetails';
import { WartungReparaturDetails } from '@/components/details/WartungReparaturDetails';
import { HandwerkerDetails } from '@/components/details/HandwerkerDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { IconPlus, IconAlertTriangle, IconTool, IconUsers, IconArrowBack } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

const tt = makeT({
  de: {
    title: 'Werkzeugverwaltung', /* i18n-exempt */
    context_none: 'Alle Werkzeuge verfügbar — guter Tag für Wartungsarbeiten.',
    context_overdue: '{n} Ausleihe(n) überfällig — jetzt abklären.',
    context_active: '{handwerker} hat gerade Werkzeuge ausgeliehen.',
    strip_verfuegbar: 'Verfügbar',
    strip_ausgeliehen: 'Ausgeliehen',
    strip_service: 'In Service',
    strip_defekt: 'Defekt',
    strip_handwerker: 'Handwerker',
    hero_title: 'Überfällige Rückgabe',
    hero_action: 'Rückgabe buchen',
    worklist_ueberfaellig: 'Überfällige Ausleihen',
    worklist_wartung: 'Laufende Wartungen & Reparaturen',
    empty_ausleihe: 'Alle Ausleihen pünktlich',
    empty_wartung: 'Keine laufenden Vorgänge',
    btn_neue_ausleihe: 'Neue Ausleihe',
    btn_neues_werkzeug: 'Neues Werkzeug',
    btn_neuer_handwerker: 'Neuer Handwerker',
    abschliessen: 'Abschließen',
    rueckgabe: 'Rückgabe',
    add_werkzeug: 'Werkzeug hinzufügen',
    ueberfaellig: 'Überfällig',
    btn_neuer_vorgang: 'Neuer Vorgang',
  },
  en: {
    title: 'Tool Management', /* i18n-exempt */
    context_none: 'All tools available — great day for maintenance work.',
    context_overdue: '{n} loan(s) overdue — follow up now.',
    context_active: '{handwerker} currently has tools borrowed.',
    strip_verfuegbar: 'Available',
    strip_ausgeliehen: 'Borrowed',
    strip_service: 'In Service',
    strip_defekt: 'Defective',
    strip_handwerker: 'Craftsmen',
    hero_title: 'Overdue Return',
    hero_action: 'Book Return',
    worklist_ueberfaellig: 'Overdue Loans',
    worklist_wartung: 'Active Maintenance & Repairs',
    empty_ausleihe: 'All loans on time',
    empty_wartung: 'No active service orders',
    btn_neue_ausleihe: 'New Loan',
    btn_neues_werkzeug: 'New Tool',
    btn_neuer_handwerker: 'New Craftsman',
    abschliessen: 'Complete',
    rueckgabe: 'Return',
    add_werkzeug: 'Add Tool',
    ueberfaellig: 'Overdue',
    btn_neuer_vorgang: 'New Service Order',
  },
});

type OverlayItem =
  | { type: 'werkzeug'; record: Werkzeuge }
  | { type: 'ausleihe'; record: Ausleihe }
  | { type: 'wartung'; record: WartungReparatur }
  | { type: 'handwerker'; record: import('@/types/app').Handwerker };

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

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap],
  );
  const enrichedWartungReparatur = useMemo(
    () => enrichWartungReparatur(wartungReparatur, { werkzeugeMap, handwerkerMap }),
    [wartungReparatur, werkzeugeMap, handwerkerMap],
  );

  // Dialog state
  const [werkzeugDialog, setWerkzeugDialog] = useState<{ open: boolean; defaults?: WerkzeugeDialogDefaults; recordId?: string }>({ open: false });
  const [ausleiheDialog, setAusleiheDialog] = useState<{ open: boolean; defaults?: AusleiheDialogDefaults; recordId?: string }>({ open: false });
  const [wartungDialog, setWartungDialog] = useState<{ open: boolean; defaults?: WartungReparaturDialogDefaults; recordId?: string }>({ open: false });
  const [handwerkerDialogOpen, setHandwerkerDialogOpen] = useState(false);

  // ── Derived values ───────────────────────────────────────────────────────────
  const today = format(clock, 'yyyy-MM-dd');

  const ueberfaelligeAusleihen = useMemo(
    () => enrichedAusleihe.filter(
      a => a.fields.status_ausleihe?.key === 'ausgeliehen' &&
           a.fields.geplantes_rueckgabedatum &&
           a.fields.geplantes_rueckgabedatum.slice(0, 10) < today,
    ),
    [enrichedAusleihe, today],
  );

  const aktiveAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [enrichedAusleihe],
  );

  const laufendeWartungen = useMemo(
    () => enrichedWartungReparatur.filter(
      w => w.fields.status_wartung?.key === 'in_bearbeitung' || w.fields.status_wartung?.key === 'geplant',
    ),
    [enrichedWartungReparatur],
  );

  // KPIs
  const verfuegbar = useMemo(() => werkzeuge.filter(w => w.fields.zustand?.key === 'verfuegbar').length, [werkzeuge]);
  const ausgeliehen = useMemo(() => werkzeuge.filter(w => w.fields.zustand?.key === 'ausgeliehen').length, [werkzeuge]);
  const inService = useMemo(() => werkzeuge.filter(w => w.fields.zustand?.key === 'in_reparatur' || w.fields.zustand?.key === 'in_wartung').length, [werkzeuge]);
  const defekt = useMemo(() => werkzeuge.filter(w => w.fields.zustand?.key === 'defekt').length, [werkzeuge]);
  const aktiveHandwerker = useMemo(() => handwerker.filter(h => h.fields.status?.key === 'aktiv').length, [handwerker]);

  // Kanban
  const kanbanColumns: KanbanColumn[] = useMemo(
    () => (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const kanbanCards: KanbanCard[] = useMemo(
    () => werkzeuge.map(w => {
      const col = w.fields.zustand?.key ?? '';
      const tone = col === 'defekt' ? 'destructive' as const
        : col === 'ausgeliehen' ? 'warning' as const
        : col === 'in_reparatur' || col === 'in_wartung' ? 'warning' as const
        : col === 'ausgemustert' ? 'default' as const
        : 'success' as const;
      // Find current borrower
      const currentLoan = ausleihe.find(
        a => extractRecordId(a.fields.werkzeug) === w.record_id && a.fields.status_ausleihe?.key === 'ausgeliehen',
      );
      const borrowerName = currentLoan ? (handwerkerMap.get(extractRecordId(currentLoan.fields.handwerker) ?? '')?.fields.vorname ?? '') : '';
      return {
        id: w.record_id,
        column: col,
        title: w.fields.werkzeugname ?? '—',
        subtitle: borrowerName ? `${borrowerName} · ${w.fields.kategorie?.label ?? ''}` : (w.fields.kategorie?.label ?? w.fields.standort ?? ''),
        tone,
      };
    }),
    [werkzeuge, ausleihe, handwerkerMap],
  );

  // ── Write helpers ────────────────────────────────────────────────────────────
  const handleCardMove = useCallback(async (cardId: string, newColumn: string) => {
    const wz = werkzeuge.find(w => w.record_id === cardId);
    if (!wz) return;
    const oldKey = wz.fields.zustand?.key ?? '';
    const newLabel = LOOKUP_OPTIONS['werkzeuge']?.['zustand']?.find(o => o.key === newColumn)?.label ?? newColumn;
    const oldLabel = wz.fields.zustand?.label ?? oldKey;
    // Optimistic
    setWerkzeuge(prev => prev.map(w =>
      w.record_id === cardId ? { ...w, fields: { ...w.fields, zustand: { key: newColumn, label: newLabel } } } : w,
    ));
    try {
      await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: newColumn });
      undoToast(`${wz.fields.werkzeugname} → ${newLabel}`, async () => {
        setWerkzeuge(prev => prev.map(w =>
          w.record_id === cardId ? { ...w, fields: { ...w.fields, zustand: { key: oldKey, label: oldLabel } } } : w,
        ));
        await LivingAppsService.updateWerkzeugeEntry(cardId, { zustand: oldKey });
      });
    } catch {
      await fetchAll();
    }
  }, [werkzeuge, setWerkzeuge, fetchAll]);

  const handleRueckgabe = useCallback(async (a: EnrichedAusleihe) => {
    const now = format(clock, "yyyy-MM-dd'T'HH:mm");
    const wId = extractRecordId(a.fields.werkzeug);
    const oldStatus = a.fields.status_ausleihe?.key ?? 'ausgeliehen';
    // Optimistic ausleihe
    setAusleihe(prev => prev.map(r =>
      r.record_id === a.record_id
        ? { ...r, fields: { ...r.fields, status_ausleihe: { key: 'zurueckgegeben', label: lookupLabel('ausleihe', 'status_ausleihe', 'zurueckgegeben') ?? 'Zurückgegeben' /* i18n-exempt */ }, tatsaechliches_rueckgabedatum: now } }
        : r,
    ));
    // Optimistic werkzeug zustand → verfügbar
    if (wId) {
      setWerkzeuge(prev => prev.map(w =>
        w.record_id === wId ? { ...w, fields: { ...w.fields, zustand: { key: 'verfuegbar', label: lookupLabel('werkzeuge', 'zustand', 'verfuegbar') ?? 'Verfügbar' /* i18n-exempt */ } } } : w,
      ));
    }
    try {
      await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: 'zurueckgegeben', tatsaechliches_rueckgabedatum: now });
      if (wId) await LivingAppsService.updateWerkzeugeEntry(wId, { zustand: 'verfuegbar' });
      undoToast(`${a.werkzeugName} zurückgegeben`, async () => {
        setAusleihe(prev => prev.map(r =>
          r.record_id === a.record_id ? { ...r, fields: { ...r.fields, status_ausleihe: { key: oldStatus, label: lookupLabel('ausleihe', 'status_ausleihe', oldStatus) ?? oldStatus /* i18n-exempt */ } } } : r,
        ));
        await LivingAppsService.updateAusleiheEntry(a.record_id, { status_ausleihe: oldStatus });
      });
    } catch {
      await fetchAll();
    }
  }, [clock, setAusleihe, setWerkzeuge, fetchAll]);

  const handleWartungAbschliessen = useCallback(async (w: EnrichedWartungReparatur) => {
    const today2 = format(clock, 'yyyy-MM-dd');
    const oldStatus = w.fields.status_wartung?.key ?? 'in_bearbeitung';
    setWartungReparatur(prev => prev.map(r =>
      r.record_id === w.record_id
        ? { ...r, fields: { ...r.fields, status_wartung: { key: 'abgeschlossen', label: lookupLabel('wartung_reparatur', 'status_wartung', 'abgeschlossen') ?? 'Abgeschlossen' /* i18n-exempt */ }, tatsaechliches_enddatum: today2 } }
        : r,
    ));
    const wzId = extractRecordId(w.fields.werkzeug_wartung);
    if (wzId) {
      setWerkzeuge(prev => prev.map(wz =>
        wz.record_id === wzId ? { ...wz, fields: { ...wz.fields, zustand: { key: 'verfuegbar', label: lookupLabel('werkzeuge', 'zustand', 'verfuegbar') ?? 'Verfügbar' /* i18n-exempt */ } } } : wz,
      ));
    }
    try {
      await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: 'abgeschlossen', tatsaechliches_enddatum: today2 });
      if (wzId) await LivingAppsService.updateWerkzeugeEntry(wzId, { zustand: 'verfuegbar' });
      undoToast(`${w.werkzeug_wartungName} Wartung abgeschlossen`, async () => {
        setWartungReparatur(prev => prev.map(r =>
          r.record_id === w.record_id ? { ...r, fields: { ...r.fields, status_wartung: { key: oldStatus, label: lookupLabel('wartung_reparatur', 'status_wartung', oldStatus) ?? oldStatus /* i18n-exempt */ } } } : r,
        ));
        await LivingAppsService.updateWartungReparaturEntry(w.record_id, { status_wartung: oldStatus });
      });
    } catch {
      await fetchAll();
    }
  }, [clock, setWartungReparatur, setWerkzeuge, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // ── Context line ─────────────────────────────────────────────────────────────
  const borrowerNames = namen(aktiveAusleihen.map(a => enrichedAusleihe.find(e => e.record_id === a.record_id)?.handwerkerName ?? '').filter(Boolean));
  const contextLine = ueberfaelligeAusleihen.length > 0
    ? tt('context_overdue', { n: ueberfaelligeAusleihen.length })
    : aktiveAusleihen.length > 0
      ? tt('context_active', { handwerker: borrowerNames })
      : tt('context_none');

  // Empty-state CTA
  if (werkzeuge.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <IconTool size={48} className="text-muted-foreground" stroke={1.5} />
        <h2 className="text-lg font-semibold">{tt('add_werkzeug')}</h2>
        <p className="text-muted-foreground max-w-sm">{tt('context_none')}</p>
        <Button onClick={() => setWerkzeugDialog({ open: true })}>
          <IconPlus size={16} className="mr-2 shrink-0" />{tt('btn_neues_werkzeug')}
        </Button>
        <WerkzeugeDialog
          open={werkzeugDialog.open}
          onClose={() => setWerkzeugDialog({ open: false })}
          onSubmit={async (fields) => { await LivingAppsService.createWerkzeugeEntry(fields); fetchAll(); }}
          enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
        />
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)} {tt('title')}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setHandwerkerDialogOpen(true)}>
            <IconUsers size={14} className="mr-1.5 shrink-0" />{tt('btn_neuer_handwerker')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAusleiheDialog({ open: true })}>
            <IconArrowBack size={14} className="mr-1.5 shrink-0" />{tt('btn_neue_ausleihe')}
          </Button>
          <Button size="sm" onClick={() => setWerkzeugDialog({ open: true })}>
            <IconPlus size={14} className="mr-1.5 shrink-0" />{tt('btn_neues_werkzeug')}
          </Button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={ueberfaelligeAusleihen.length > 0 && (
          <HeroBanner
            icon={<IconAlertTriangle size={18} />}
            action={{
              label: tt('hero_action'),
              onClick: () => handleRueckgabe(ueberfaelligeAusleihen[0]),
            }}
          >
            <b>{namen(ueberfaelligeAusleihen.map(a => a.werkzeugName).filter(Boolean))}</b>
            {' '}— {tt('hero_title')}: geplant {formatDateTime(ueberfaelligeAusleihen[0].fields.geplantes_rueckgabedatum)}, ausgeliehen an {ueberfaelligeAusleihen[0].handwerkerName}.
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tt('strip_verfuegbar')}
              value={verfuegbar}
              tone={verfuegbar > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tt('strip_ausgeliehen')}
              value={ausgeliehen}
              tone={ausgeliehen > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('strip_service')}
              value={inService}
              tone={inService > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tt('strip_defekt')}
              value={defekt}
              tone={defekt > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tt('strip_handwerker')}
              value={aktiveHandwerker}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['ausgemustert']}
            onCardClick={card => {
              const wz = werkzeuge.find(w => w.record_id === card.id);
              if (wz) overlay.replace({ type: 'werkzeug', record: wz });
            }}
            onCardMove={handleCardMove}
            onAddCard={col => setWerkzeugDialog({ open: true, defaults: { zustand: col } })}
          />
        }
        aside={
          <>
            <WorkList
              title={tt('worklist_ueberfaellig')}
              items={ueberfaelligeAusleihen.map(a => ({
                id: a.record_id,
                title: a.werkzeugName || '—',
                secondLine: (
                  <>
                    <span className="font-medium text-destructive">{tt('ueberfaellig')}</span>
                    <span className="text-muted-foreground"> · {a.handwerkerName} · {formatDateTime(a.fields.geplantes_rueckgabedatum)}</span>
                  </>
                ),
                action: { label: tt('rueckgabe'), onClick: () => handleRueckgabe(a) },
              }))}
              onItemClick={id => {
                const a = ausleihe.find(r => r.record_id === id);
                if (a) overlay.replace({ type: 'ausleihe', record: a });
              }}
              empty={{
                text: tt('empty_ausleihe'),
                action: { label: tt('btn_neue_ausleihe'), onClick: () => setAusleiheDialog({ open: true }) },
              }}
            />
            <WorkList
              title={tt('worklist_wartung')}
              items={laufendeWartungen.map(w => ({
                id: w.record_id,
                title: w.werkzeug_wartungName || '—',
                secondLine: (
                  <>
                    <span className={w.fields.status_wartung?.key === 'in_bearbeitung' ? 'font-medium text-warning' : 'text-muted-foreground'}>
                      {w.fields.status_wartung?.label ?? '—'}
                    </span>
                    <span className="text-muted-foreground"> · {w.fields.vorgangsart?.label ?? ''} · {w.verantwortlicherName}</span>
                  </>
                ),
                action: { label: tt('abschliessen'), onClick: () => handleWartungAbschliessen(w) },
              }))}
              onItemClick={id => {
                const wr = wartungReparatur.find(r => r.record_id === id);
                if (wr) overlay.replace({ type: 'wartung', record: wr });
              }}
              empty={{
                text: tt('empty_wartung'),
                action: { label: tt('btn_neuer_vorgang'), onClick: () => setWartungDialog({ open: true }) },
              }}
            />
          </>
        }
      />

      {/* Record Overlay Host — one shell for all entity types */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'werkzeug') {
            const wz = top.record as Werkzeuge;
            return (
              <>
                <RecordHeader
                  title={wz.fields.werkzeugname ?? '—'}
                  subtitle={[wz.fields.kategorie?.label, wz.fields.hersteller, wz.fields.standort].filter(Boolean).join(' · ')}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      wz.fields.zustand?.key === 'verfuegbar' ? 'bg-success/10 text-success' :
                      wz.fields.zustand?.key === 'defekt' ? 'bg-destructive/10 text-destructive' :
                      'bg-warning/10 text-warning'
                    }`}>{wz.fields.zustand?.label ?? '—'}</span>
                  }
                />
                <WerkzeugeDetails
                  record={wz}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', record: a })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { werkzeug: wz.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', record: wr })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { werkzeug_wartung: wz.record_id } })}
                />
              </>
            );
          }
          if (top.type === 'ausleihe') {
            const a = top.record as Ausleihe;
            const ea = enrichedAusleihe.find(e => e.record_id === a.record_id) ?? { ...a, werkzeugName: '', handwerkerName: '' };
            return (
              <>
                <RecordHeader
                  title={ea.werkzeugName || appLabel('ausleihe')}
                  subtitle={ea.handwerkerName}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.fields.status_ausleihe?.key === 'ausgeliehen' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                    }`}>{a.fields.status_ausleihe?.label ?? '—'}</span>
                  }
                />
                <AusleiheDetails
                  record={a}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={wz => overlay.push({ type: 'werkzeug', record: wz })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'wartung') {
            const wr = top.record as WartungReparatur;
            const ewr = enrichedWartungReparatur.find(e => e.record_id === wr.record_id) ?? { ...wr, werkzeug_wartungName: '', verantwortlicherName: '' };
            return (
              <>
                <RecordHeader
                  title={ewr.werkzeug_wartungName || appLabel('wartung_reparatur')}
                  subtitle={[wr.fields.vorgangsart?.label, ewr.verantwortlicherName].filter(Boolean).join(' · ')}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      wr.fields.status_wartung?.key === 'abgeschlossen' ? 'bg-success/10 text-success' :
                      wr.fields.status_wartung?.key === 'in_bearbeitung' ? 'bg-warning/10 text-warning' :
                      wr.fields.status_wartung?.key === 'abgebrochen' ? 'bg-destructive/10 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>{wr.fields.status_wartung?.label ?? '—'}</span>
                  }
                />
                <WartungReparaturDetails
                  record={wr}
                  werkzeugeList={werkzeuge}
                  onOpenWerkzeuge={wz => overlay.push({ type: 'werkzeug', record: wz })}
                  handwerkerList={handwerker}
                  onOpenHandwerker={h => overlay.push({ type: 'handwerker', record: h })}
                />
              </>
            );
          }
          if (top.type === 'handwerker') {
            const h = top.record as import('@/types/app').Handwerker;
            return (
              <>
                <RecordHeader
                  title={`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || '—'}
                  subtitle={[h.fields.qualifikation?.label, h.fields.abteilung].filter(Boolean).join(' · ')}
                  badges={
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      h.fields.status?.key === 'aktiv' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    }`}>{h.fields.status?.label ?? '—'}</span>
                  }
                />
                <HandwerkerDetails
                  record={h}
                  ausleiheList={ausleihe}
                  onOpenAusleihe={a => overlay.push({ type: 'ausleihe', record: a })}
                  onAddAusleihe={() => setAusleiheDialog({ open: true, defaults: { handwerker: h.record_id } })}
                  wartungReparaturList={wartungReparatur}
                  onOpenWartungReparatur={wr => overlay.push({ type: 'wartung', record: wr })}
                  onAddWartungReparatur={() => setWartungDialog({ open: true, defaults: { verantwortlicher: h.record_id } })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'ausleihe') {
            const a = top.record as Ausleihe;
            if (a.fields.status_ausleihe?.key === 'ausgeliehen') {
              const ea = enrichedAusleihe.find(e => e.record_id === a.record_id);
              if (ea) return { label: tt('rueckgabe'), onClick: () => { handleRueckgabe(ea); overlay.close(); } };
            }
          }
          if (top.type === 'wartung') {
            const wr = top.record as WartungReparatur;
            if (wr.fields.status_wartung?.key === 'in_bearbeitung' || wr.fields.status_wartung?.key === 'geplant') {
              const ewr = enrichedWartungReparatur.find(e => e.record_id === wr.record_id);
              if (ewr) return { label: tt('abschliessen'), onClick: () => { handleWartungAbschliessen(ewr); overlay.close(); } };
            }
          }
          return undefined;
        }}
      />

      {/* Dialogs */}
      <WerkzeugeDialog
        open={werkzeugDialog.open}
        onClose={() => setWerkzeugDialog({ open: false })}
        defaultValues={werkzeugDialog.defaults}
        recordId={werkzeugDialog.recordId}
        onSubmit={async (fields) => { await LivingAppsService.createWerkzeugeEntry(fields); fetchAll(); }}
        enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
      />

      <AusleiheDialog
        open={ausleiheDialog.open}
        onClose={() => setAusleiheDialog({ open: false })}
        defaultValues={ausleiheDialog.defaults}
        recordId={ausleiheDialog.recordId}
        onSubmit={async (fields) => { await LivingAppsService.createAusleiheEntry(fields); fetchAll(); }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
      />

      <WartungReparaturDialog
        open={wartungDialog.open}
        onClose={() => setWartungDialog({ open: false })}
        defaultValues={wartungDialog.defaults}
        recordId={wartungDialog.recordId}
        onSubmit={async (fields) => { await LivingAppsService.createWartungReparaturEntry(fields); fetchAll(); }}
        werkzeugeList={werkzeuge}
        handwerkerList={handwerker}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <HandwerkerDialog
        open={handwerkerDialogOpen}
        onClose={() => setHandwerkerDialogOpen(false)}
        onSubmit={async (fields) => { await LivingAppsService.createHandwerkerEntry(fields); fetchAll(); }}
        enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
      />
    </>
  );
}
