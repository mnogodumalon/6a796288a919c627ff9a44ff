/**
 * Werkzeug-Rückgabe — 4-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (status_ausleihe = 'ausgeliehen') →
 *        2) Rückgabe erfassen (Datum, Zustand, Bemerkungen) →
 *        3) Wartung/Reparatur anlegen (optional, nur wenn Zustand ≠ verfuegbar) →
 *        4) Zusammenfassung.
 * Reads: ausleihe, werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartungReparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import {
  LivingAppsService,
  createRecordUrl,
  extractRecordId,
} from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconTool,
  IconCheck,
  IconAlertTriangle,
  IconCalendar,
  IconUser,
  IconClipboard,
} from '@tabler/icons-react';

// ── i18n ────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    title: 'Werkzeug zurückgeben', /* i18n-exempt */
    subtitle: 'Ausleihe abschliessen und Werkzeug-Status aktualisieren', /* i18n-exempt */
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe erfassen',
    step3: 'Wartung / Reparatur',
    step4: 'Zusammenfassung',
    searchPlaceholder: 'Werkzeug oder Handwerker suchen …',
    emptyText: 'Keine offenen Ausleihen gefunden', /* i18n-exempt */
    returnDate: 'Tatsächliches Rückgabedatum',
    condition: 'Zustand nach Rückgabe',
    conditionVerfuegbar: 'Verfügbar',
    conditionInReparatur: 'In Reparatur',
    conditionDefekt: 'Defekt',
    remarks: 'Bemerkungen',
    remarksPlaceholder: 'Optionale Anmerkungen zur Rückgabe …',
    continueToMaintenance: 'Weiter: Wartung/Reparatur erfassen',
    skipMaintenance: 'Überspringen — direkt zur Zusammenfassung',
    confirmReturn: 'Rückgabe bestätigen',
    vorgangsartLabel: 'Vorgangsart',
    startDate: 'Startdatum',
    endDate: 'Geplantes Enddatum',
    description: 'Beschreibung', /* i18n-exempt */
    descriptionPlaceholder: 'Was soll gewartet oder repariert werden?',
    statusWartung: 'Status',
    createMaintenance: 'Vorgang anlegen & abschliessen',
    skipAndFinish: 'Ohne Vorgang abschliessen',
    summaryTitle: 'Rückgabe abgeschlossen',
    summaryWerkzeug: 'Werkzeug',
    summaryHandwerker: 'Handwerker',
    summaryReturnDate: 'Rückgabedatum',
    summaryNewCondition: 'Neuer Zustand',
    summaryMaintenance: 'Wartung/Reparatur',
    summaryMaintenanceCreated: 'Vorgang angelegt',
    summaryNoMaintenance: 'Keinen Vorgang angelegt',
    newReturn: 'Weitere Rückgabe erfassen',
    backToDashboard: 'Zurück zum Dashboard',
    loanedSince: 'Ausgeliehen seit',
    requiredField: 'Pflichtfeld',
    saving: 'Wird gespeichert …',
    errorRetry: 'Erneut versuchen',
    stepGuard: 'Dieser Schritt benötigt die Auswahl aus Schritt 1.',
    stepGuardReturn: 'Dieser Schritt benötigt die Daten aus Schritt 2.',
    restart: 'Neu starten',
  },
  en: {
    title: 'Return Tool', /* i18n-exempt */
    subtitle: 'Close loan and update tool status', /* i18n-exempt */
    step1: 'Select loan',
    step2: 'Record return',
    step3: 'Maintenance / Repair',
    step4: 'Summary',
    searchPlaceholder: 'Search tool or craftsman …',
    emptyText: 'No open loans found', /* i18n-exempt */
    returnDate: 'Actual return date',
    condition: 'Condition after return',
    conditionVerfuegbar: 'Available',
    conditionInReparatur: 'In repair',
    conditionDefekt: 'Defective',
    remarks: 'Remarks',
    remarksPlaceholder: 'Optional remarks about the return …',
    continueToMaintenance: 'Continue: record maintenance/repair',
    skipMaintenance: 'Skip — go directly to summary',
    confirmReturn: 'Confirm return',
    vorgangsartLabel: 'Type',
    startDate: 'Start date',
    endDate: 'Planned end date',
    description: 'Description', /* i18n-exempt */
    descriptionPlaceholder: 'What needs to be maintained or repaired?',
    statusWartung: 'Status',
    createMaintenance: 'Create record & finish',
    skipAndFinish: 'Finish without record',
    summaryTitle: 'Return completed',
    summaryWerkzeug: 'Tool',
    summaryHandwerker: 'Craftsman',
    summaryReturnDate: 'Return date',
    summaryNewCondition: 'New condition',
    summaryMaintenance: 'Maintenance/Repair',
    summaryMaintenanceCreated: 'Record created',
    summaryNoMaintenance: 'No record created',
    newReturn: 'Record another return',
    backToDashboard: 'Back to dashboard',
    loanedSince: 'Loaned since',
    requiredField: 'Required field',
    saving: 'Saving …',
    errorRetry: 'Try again',
    stepGuard: 'This step requires the selection from step 1.',
    stepGuardReturn: 'This step requires the data from step 2.',
    restart: 'Restart',
  },
});

// ── Lookup option constants ──────────────────────────────────────────────────
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

// ── Component ────────────────────────────────────────────────────────────────
export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  // ── Step state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);

  // Step 1 — selected loan
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2 — return form
  const [returnDate, setReturnDate] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  // conditionKey controls step 3 visibility; named differently from the werkzeuge 'zustand' field
  const [conditionKey, setConditionKey] = useState<'verfuegbar' | 'in_reparatur' | 'defekt'>('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [isSavingReturn, setIsSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  // idempotency: store ids of records already created so retry doesn't duplicate
  const [returnDone, setReturnDone] = useState(false);

  // Step 3 — maintenance form
  const [vorgangsartKey, setVorgangsartKey] = useState(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartungKey, setStatusWartungKey] = useState('geplant');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [createdWartungId, setCreatedWartungId] = useState<string | null>(null);

  // ── Derived: enriched ausleihe with werkzeug/handwerker names ───────────
  const werkzeugeMap = useMemo(() => {
    const m = new Map<string, string>();
    werkzeuge.forEach(w => m.set(w.record_id, w.fields.werkzeugname ?? w.record_id));
    return m;
  }, [werkzeuge]);

  const handwerkerMap = useMemo(() => {
    const m = new Map<string, string>();
    handwerker.forEach(h =>
      m.set(h.record_id, [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id)
    );
    return m;
  }, [handwerker]);

  const offeneAusleihen = useMemo(
    () =>
      ausleihe
        .filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen')
        .map(a => {
          const werkzeugId = a.fields.werkzeug ? (extractRecordId(a.fields.werkzeug) ?? '') : '';
          const handwerkerId = a.fields.handwerker ? (extractRecordId(a.fields.handwerker) ?? '') : '';
          return {
            ...a,
            werkzeugName: werkzeugeMap.get(werkzeugId) ?? '',
            handwerkerName: handwerkerMap.get(handwerkerId) ?? '',
          } as EnrichedAusleihe;
        }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihen.find(a => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    // reset downstream state when a new ausleihe is picked
    setReturnDone(false);
    setCreatedWartungId(null);
    setConditionKey('verfuegbar');
    setBemerkungen('');
    setReturnDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setStep(2);
  }

  async function handleConfirmReturn() {
    if (!selectedAusleihe || returnDone) {
      if (returnDone) {
        // already saved; just move forward
        setStep(conditionKey !== 'verfuegbar' ? 3 : 4);
      }
      return;
    }
    setIsSavingReturn(true);
    setReturnError(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug ?? '') ?? '';

      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: returnDate,
        status_ausleihe: 'zurueckgegeben',
        ...(bemerkungen.trim() ? { bemerkungen_ausleihe: bemerkungen.trim() } : {}),
      });

      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: conditionKey,
      });

      await fetchAll();
      setReturnDone(true);
      setStep(conditionKey !== 'verfuegbar' ? 3 : 4);
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setIsSavingReturn(false);
    }
  }

  async function handleCreateMaintenance() {
    if (!selectedAusleihe) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug ?? '') ?? '';

    setIsSavingMaintenance(true);
    setMaintenanceError(null);
    try {
      // idempotency guard — only create once
      let wId = createdWartungId;
      if (!wId) {
        const result = await LivingAppsService.createWartungReparaturEntry({
          werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
          vorgangsart: vorgangsartKey,
          startdatum: startdatum,
          ...(geplantesEnddatum ? { geplantes_enddatum: geplantesEnddatum } : {}),
          ...(beschreibung.trim() ? { beschreibung: beschreibung.trim() } : {}),
          status_wartung: statusWartungKey,
        });
        wId = result.record_id;
        setCreatedWartungId(wId);
      }
      await fetchAll();
      setStep(4);
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : 'Fehler beim Anlegen');
    } finally {
      setIsSavingMaintenance(false);
    }
  }

  function handleReset() {
    setSelectedAusleihe(null);
    setReturnDone(false);
    setCreatedWartungId(null);
    setConditionKey('verfuegbar');
    setBemerkungen('');
    setReturnDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setVorgangsartKey(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setStatusWartungKey('geplant');
    setReturnError(null);
    setMaintenanceError(null);
    setStep(1);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const wizardSteps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe wählen ─────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || a.record_id,
            subtitle: `${tt('loanedSince')}: ${a.fields.ausleihdatum ? a.fields.ausleihdatum.slice(0, 10) : '—'} · ${a.handwerkerName}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('emptyText')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Rückgabe erfassen ────────────────────────────────────── */}
      {step === 2 && (
        <>
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepGuard')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg">
              {/* Context card */}
              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <IconTool size={16} className="text-primary" />
                  <span>{selectedAusleihe.werkzeugName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconUser size={14} />
                  <span>{selectedAusleihe.handwerkerName}</span>
                </div>
                {selectedAusleihe.fields.ausleihdatum && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconCalendar size={14} />
                    <span>{tt('loanedSince')}: {selectedAusleihe.fields.ausleihdatum.slice(0, 10)}</span>
                  </div>
                )}
              </div>

              {/* Return date */}
              <div className="space-y-1.5">
                <Label htmlFor="returnDate">
                  {tt('returnDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="returnDate"
                  type="datetime-local"
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)}
                />
              </div>

              {/* Condition selector */}
              <div className="space-y-2">
                <Label>{tt('condition')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'verfuegbar', label: tt('conditionVerfuegbar'), icon: <IconCheck size={18} /> },
                      { key: 'in_reparatur', label: tt('conditionInReparatur'), icon: <IconTool size={18} /> },
                      { key: 'defekt', label: tt('conditionDefekt'), icon: <IconAlertTriangle size={18} /> },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setConditionKey(opt.key)}
                      className={[
                        'flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors w-full',
                        conditionKey === opt.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground hover:bg-secondary/60',
                      ].join(' ')}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tt('remarks')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tt('remarksPlaceholder')}
                  rows={3}
                />
              </div>

              {returnError && (
                <p className="text-sm text-destructive">{returnError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="w-full sm:w-auto"
                  disabled={!returnDate || isSavingReturn}
                  onClick={handleConfirmReturn}
                >
                  {isSavingReturn ? tt('saving') : conditionKey !== 'verfuegbar' ? tt('continueToMaintenance') : tt('confirmReturn')}
                </Button>
                {returnDone && (
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => setStep(conditionKey !== 'verfuegbar' ? 3 : 4)}
                  >
                    {tt('skipMaintenance')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step 3: Wartung / Reparatur (optional) ───────────────────────── */}
      {step === 3 && (
        <>
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepGuard')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : !returnDone ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepGuardReturn')}</p>
              <Button variant="outline" onClick={() => setStep(2)}>{tt('restart')}</Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg">
              {/* Context */}
              <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-2">
                <IconTool size={16} className="text-primary" />
                <span className="text-sm font-medium">{selectedAusleihe.werkzeugName}</span>
                <StatusBadge statusKey={conditionKey} label={
                  conditionKey === 'in_reparatur' ? tt('conditionInReparatur') : tt('conditionDefekt')
                } />
              </div>

              {/* Vorgangsart */}
              <div className="space-y-1.5">
                <Label htmlFor="vorgangsart">
                  {tt('vorgangsartLabel')} <span className="text-destructive">*</span>
                </Label>
                <div className="flex gap-2">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsartKey(opt.key)}
                      className={[
                        'flex-1 rounded-xl border p-3 text-sm font-medium transition-colors',
                        vorgangsartKey === opt.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground hover:bg-secondary/60',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start date */}
              <div className="space-y-1.5">
                <Label htmlFor="startdatum">
                  {tt('startDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startdatum"
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                />
              </div>

              {/* Planned end date */}
              <div className="space-y-1.5">
                <Label htmlFor="geplantesEnddatum">{tt('endDate')}</Label>
                <Input
                  id="geplantesEnddatum"
                  type="date"
                  value={geplantesEnddatum}
                  onChange={e => setGeplantesEnddatum(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="beschreibung">{tt('description')}</Label>
                <Textarea
                  id="beschreibung"
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tt('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Status Wartung */}
              <div className="space-y-1.5">
                <Label htmlFor="statusWartung">
                  {tt('statusWartung')} <span className="text-destructive">*</span>
                </Label>
                <Select value={statusWartungKey} onValueChange={setStatusWartungKey}>
                  <SelectTrigger id="statusWartung" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_WARTUNG_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {maintenanceError && (
                <p className="text-sm text-destructive">{maintenanceError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="w-full sm:w-auto"
                  disabled={!startdatum || isSavingMaintenance}
                  onClick={handleCreateMaintenance}
                >
                  {isSavingMaintenance ? tt('saving') : tt('createMaintenance')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep(4)}
                >
                  {tt('skipAndFinish')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Step 4: Zusammenfassung ──────────────────────────────────────── */}
      {step === 4 && (
        <>
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepGuard')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg">
              {/* Success icon */}
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="rounded-full bg-primary/10 p-4">
                  <IconCheck size={32} className="text-primary" stroke={2} />
                </div>
                <h2 className="text-lg font-semibold">{tt('summaryTitle')}</h2>
              </div>

              {/* Details card */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="divide-y">
                  <div className="flex items-start gap-3 p-4">
                    <IconTool size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('summaryWerkzeug')}</p>
                      <p className="text-sm font-medium truncate">{selectedAusleihe.werkzeugName}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('summaryHandwerker')}</p>
                      <p className="text-sm font-medium truncate">{selectedAusleihe.handwerkerName}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <IconCalendar size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('summaryReturnDate')}</p>
                      <p className="text-sm font-medium">{returnDate.replace('T', ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <IconTool size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('summaryNewCondition')}</p>
                      <div className="mt-0.5">
                        <StatusBadge
                          statusKey={conditionKey}
                          label={
                            conditionKey === 'verfuegbar'
                              ? tt('conditionVerfuegbar')
                              : conditionKey === 'in_reparatur'
                              ? tt('conditionInReparatur')
                              : tt('conditionDefekt')
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4">
                    <IconClipboard size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('summaryMaintenance')}</p>
                      <p className="text-sm font-medium">
                        {createdWartungId ? tt('summaryMaintenanceCreated') : tt('summaryNoMaintenance')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={handleReset}
                >
                  {tt('newReturn')}
                </Button>
                <a href="#/" className="w-full sm:w-auto">
                  <Button className="w-full">{tt('backToDashboard')}</Button>
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
