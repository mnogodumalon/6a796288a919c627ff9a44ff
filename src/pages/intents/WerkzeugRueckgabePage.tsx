/**
 * Werkzeug Rückgabe — 4-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur status_ausleihe='ausgeliehen') →
 *        2) Rückgabe bestätigen (Datum, Zustand, Bemerkungen) →
 *        3) Wartung/Reparatur anlegen (bedingt, wenn Zustand in_wartung|in_reparatur) →
 *        4) Bestätigung.
 * Reads: ausleihe, handwerker, werkzeuge. Writes: ausleihe (updateAusleiheEntry),
 *        werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconTools,
  IconCircleCheck,
  IconTool,
  IconAlertTriangle,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Werkzeug Rückgabe', // i18n-exempt
    subtitle: 'Ausleihe abschließen und Werkzeug-Zustand aktualisieren',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe bestätigen',
    step3: 'Wartung / Reparatur',
    step4: 'Bestätigung',
    noLoans: 'Keine aktiven Ausleihen vorhanden.',
    loanedSince: 'Ausgeliehen seit',
    returnDate: 'Tatsächliches Rückgabedatum',
    newCondition: 'Neuer Zustand',
    remarks: 'Bemerkungen',
    remarksPlaceholder: 'Optionale Anmerkungen zur Rückgabe…',
    conditionVerfuegbar: 'Verfügbar',
    conditionInWartung: 'In Wartung',
    conditionInReparatur: 'In Reparatur',
    conditionDefekt: 'Defekt',
    confirmReturn: 'Rückgabe bestätigen',
    confirming: 'Wird verarbeitet…',
    processType: 'Vorgangsart',
    processWartung: 'Wartung',
    processReparatur: 'Reparatur',
    startDate: 'Startdatum',
    plannedEnd: 'Geplantes Enddatum',
    responsible: 'Verantwortlicher Handwerker',
    responsibleNone: 'Kein Handwerker',
    description: 'Beschreibung', // i18n-exempt
    descriptionPlaceholder: 'Beschreibung des Problems / der Maßnahme…',
    createMaintenance: 'Wartung / Reparatur anlegen',
    creating: 'Wird angelegt…',
    skipMaintenance: 'Überspringen',
    successTitle: 'Rückgabe abgeschlossen!',
    successDesc: 'Die Ausleihe wurde erfolgreich abgeschlossen.',
    conditionUpdated: 'Werkzeug-Zustand aktualisiert auf:',
    maintenanceCreated: 'Wartung / Reparatur wurde angelegt.',
    newReturn: 'Neue Rückgabe erfassen',
    backToDashboard: 'Zurück zum Dashboard',
    errorReturn: 'Fehler bei der Rückgabe. Bitte erneut versuchen.',
    errorMaintenance: 'Fehler beim Anlegen der Wartung/Reparatur.',
    selectCondition: 'Zustand auswählen…',
    returnRequired: 'Bitte Rückgabedatum angeben.',
    conditionRequired: 'Bitte Zustand auswählen.',
    selectedTool: 'Werkzeug',
    selectedWorker: 'Handwerker',
    prereqMsg: 'Dieser Schritt braucht die Auswahl aus Schritt 1.',
    restart: 'Neu starten',
  },
  en: {
    title: 'Tool Return', // i18n-exempt
    subtitle: 'Complete loan and update tool condition',
    step1: 'Select Loan',
    step2: 'Confirm Return',
    step3: 'Maintenance / Repair',
    step4: 'Confirmation',
    noLoans: 'No active loans found.',
    loanedSince: 'Checked out since',
    returnDate: 'Actual Return Date',
    newCondition: 'New Condition',
    remarks: 'Remarks',
    remarksPlaceholder: 'Optional notes about the return…',
    conditionVerfuegbar: 'Available',
    conditionInWartung: 'In Maintenance',
    conditionInReparatur: 'In Repair',
    conditionDefekt: 'Defective',
    confirmReturn: 'Confirm Return',
    confirming: 'Processing…',
    processType: 'Process Type',
    processWartung: 'Maintenance',
    processReparatur: 'Repair',
    startDate: 'Start Date',
    plannedEnd: 'Planned End Date',
    responsible: 'Responsible Craftsman',
    responsibleNone: 'No craftsman',
    description: 'Description', // i18n-exempt
    descriptionPlaceholder: 'Description of the problem / action…',
    createMaintenance: 'Create Maintenance / Repair',
    creating: 'Creating…',
    skipMaintenance: 'Skip',
    successTitle: 'Return Completed!',
    successDesc: 'The loan has been successfully completed.',
    conditionUpdated: 'Tool condition updated to:',
    maintenanceCreated: 'Maintenance / Repair has been created.',
    newReturn: 'Record New Return',
    backToDashboard: 'Back to Dashboard',
    errorReturn: 'Error processing return. Please try again.',
    errorMaintenance: 'Error creating maintenance / repair.',
    selectCondition: 'Select condition…',
    returnRequired: 'Please provide return date.',
    conditionRequired: 'Please select a condition.',
    selectedTool: 'Tool',
    selectedWorker: 'Craftsman',
    prereqMsg: 'This step requires a selection from step 1.',
    restart: 'Start over',
  },
});

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];

type NewConditionKey = 'verfuegbar' | 'in_wartung' | 'in_reparatur' | 'defekt';

const CONDITION_LABELS: Record<NewConditionKey, string> = {
  verfuegbar: 'conditionVerfuegbar',
  in_wartung: 'conditionInWartung',
  in_reparatur: 'conditionInReparatur',
  defekt: 'conditionDefekt',
} as const;

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, loading, error, fetchAll, handwerkerMap, werkzeugeMap } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 selection
  const [selectedAusleiheId, setSelectedAusleiheId] = useState<string | null>(null);

  // Step 2 form
  const [returnDatetime, setReturnDatetime] = useState(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [neuerZustandKey, setNeuerZustandKey] = useState<string>('none');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Step 3 form
  const [vorgangsart, setVorgangsart] = useState<string>('none');
  const [startdatum, setStartdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [geplantesDatum, setGeplantesDatum] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState<string>('none');
  const [beschreibung, setBeschreibung] = useState('');
  const [submittingMaintenance, setSubmittingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceCreated, setMaintenanceCreated] = useState(false);

  // Filter: only ausgeliehen loans
  const activeLeihen = useMemo(
    () => ausleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [ausleihe]
  );

  const selectedAusleihe = useMemo(
    () => (selectedAusleiheId ? activeLeihen.find(a => a.record_id === selectedAusleiheId) ?? null : null),
    [selectedAusleiheId, activeLeihen]
  );

  const werkzeugId = selectedAusleihe
    ? (extractRecordId(selectedAusleihe.fields.werkzeug) ?? null)
    : null;

  const handwerkerId = selectedAusleihe
    ? (extractRecordId(selectedAusleihe.fields.handwerker) ?? null)
    : null;

  const werkzeugRecord = werkzeugId ? werkzeugeMap.get(werkzeugId) ?? null : null;
  const handwerkerRecord = handwerkerId ? handwerkerMap.get(handwerkerId) ?? null : null;

  // Active craftsmen for step 3
  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => h.fields.status?.key === 'aktiv'),
    [handwerker]
  );

  // Determine display condition label for step 4
  const conditionDisplayLabel = useMemo(() => {
    if (!neuerZustandKey || neuerZustandKey === 'none') return '';
    const opt = ZUSTAND_OPTIONS.find(o => o.key === neuerZustandKey);
    return opt?.label ?? neuerZustandKey;
  }, [neuerZustandKey]);

  // Handle step 2 submit
  async function handleConfirmReturn() {
    if (!selectedAusleiheId || !werkzeugId) return;
    if (!returnDatetime) {
      setReturnError(tt('returnRequired'));
      return;
    }
    if (!neuerZustandKey || neuerZustandKey === 'none') {
      setReturnError(tt('conditionRequired'));
      return;
    }

    setSubmittingReturn(true);
    setReturnError(null);

    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleiheId, {
        tatsaechliches_rueckgabedatum: returnDatetime,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: neuerZustandKey,
      });

      await fetchAll();

      if (neuerZustandKey === 'in_wartung' || neuerZustandKey === 'in_reparatur') {
        // Pre-select vorgangsart based on condition
        const autoVorgangsart = neuerZustandKey === 'in_wartung' ? 'wartung' : 'reparatur';
        setVorgangsart(autoVorgangsart);
        setStep(3);
      } else {
        setStep(4);
      }
    } catch {
      setReturnError(tt('errorReturn'));
    } finally {
      setSubmittingReturn(false);
    }
  }

  // Handle step 3 submit
  async function handleCreateMaintenance() {
    if (!werkzeugId) return;
    if (!startdatum) return;

    setSubmittingMaintenance(true);
    setMaintenanceError(null);

    try {
      const actualVorgangsart = vorgangsart !== 'none' ? vorgangsart : 'wartung';
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart: actualVorgangsart,
        startdatum: startdatum,
        geplantes_enddatum: geplantesDatum || undefined,
        verantwortlicher:
          verantwortlicherId && verantwortlicherId !== 'none'
            ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
            : undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: 'geplant',
      });

      setMaintenanceCreated(true);
      setStep(4);
    } catch {
      setMaintenanceError(tt('errorMaintenance'));
    } finally {
      setSubmittingMaintenance(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedAusleiheId(null);
    setReturnDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNeuerZustandKey('none');
    setBemerkungen('');
    setReturnError(null);
    setVorgangsart('none');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesDatum('');
    setVerantwortlicherId('none');
    setBeschreibung('');
    setMaintenanceError(null);
    setMaintenanceCreated(false);
  }

  const werkzeugName = werkzeugRecord?.fields.werkzeugname ?? '—';
  const handwerkerName =
    handwerkerRecord
      ? `${handwerkerRecord.fields.vorname ?? ''} ${handwerkerRecord.fields.nachname ?? ''}`.trim() || '—'
      : '—';

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select active loan */}
      {step === 1 && (
        <EntitySelectStep
          items={activeLeihen.map(a => {
            const wId = extractRecordId(a.fields.werkzeug);
            const hId = extractRecordId(a.fields.handwerker);
            const w = wId ? werkzeugeMap.get(wId) : undefined;
            const h = hId ? handwerkerMap.get(hId) : undefined;
            const wName = w?.fields.werkzeugname ?? '—';
            const hName = h
              ? `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || '—'
              : '—';
            return {
              id: a.record_id,
              title: wName,
              subtitle: `${tt('selectedWorker')}: ${hName} · ${tt('loanedSince')}: ${formatDateTime(a.fields.ausleihdatum)}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              icon: <IconTools size={20} className="text-primary" />,
            };
          })}
          onSelect={(id) => {
            setSelectedAusleiheId(id);
            setStep(2);
          }}
          emptyText={tt('noLoans')}
          emptyIcon={<IconTools size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Confirm return */}
      {step === 2 && (
        selectedAusleiheId ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Selected context card */}
            <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconTools size={18} className="text-primary shrink-0" />
                <span className="font-semibold truncate">{werkzeugName}</span>
                {selectedAusleihe?.fields.status_ausleihe && (
                  <StatusBadge
                    statusKey={selectedAusleihe.fields.status_ausleihe.key}
                    label={selectedAusleihe.fields.status_ausleihe.label}
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {tt('selectedWorker')}: {handwerkerName}
              </p>
              {selectedAusleihe?.fields.ausleihdatum && (
                <p className="text-sm text-muted-foreground">
                  {tt('loanedSince')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}
                </p>
              )}
            </div>

            {/* Return datetime */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tt('returnDate')} <span className="text-destructive">*</span>
              </label>
              <Input
                type="datetime-local"
                value={returnDatetime}
                onChange={e => setReturnDatetime(e.target.value)}
                className="w-full"
              />
            </div>

            {/* New condition */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tt('newCondition')} <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['verfuegbar', 'in_wartung', 'in_reparatur', 'defekt'] as NewConditionKey[]).map(key => {
                  const opt = ZUSTAND_OPTIONS.find(o => o.key === key);
                  const label = opt?.label ?? key;
                  const isSelected = neuerZustandKey === key;
                  const isWarning = key === 'in_wartung' || key === 'in_reparatur';
                  const isDanger = key === 'defekt';
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setNeuerZustandKey(key)}
                      className={[
                        'rounded-xl border p-3 text-sm font-medium text-left transition-colors',
                        isSelected
                          ? isDanger
                            ? 'border-destructive bg-destructive/10 text-destructive'
                            : isWarning
                            ? 'border-amber-500 bg-amber-500/10 text-amber-700'
                            : 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card hover:bg-secondary',
                      ].join(' ')}
                    >
                      {label}
                      {(key === 'in_wartung' || key === 'in_reparatur') && (
                        <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                          → Wartung wird angelegt
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('remarks')}</label>
              <Textarea
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('remarksPlaceholder')}
                rows={3}
                className="w-full resize-none"
              />
            </div>

            {returnError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertTriangle size={16} className="shrink-0" />
                {returnError}
              </div>
            )}

            <Button
              onClick={handleConfirmReturn}
              disabled={submittingReturn || !returnDatetime || !neuerZustandKey || neuerZustandKey === 'none'}
              className="w-full"
            >
              {submittingReturn ? tt('confirming') : tt('confirmReturn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tt('prereqMsg')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Create maintenance/repair (conditional) */}
      {step === 3 && (
        werkzeugId ? (
          <div className="space-y-6 max-w-lg mx-auto">
            <div className="rounded-2xl border bg-amber-500/5 border-amber-500/30 p-4 space-y-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-amber-600 shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  {werkzeugName} — {conditionDisplayLabel}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Bitte Wartung / Reparatur anlegen oder überspringen.
              </p>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tt('processType')} <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                {VORGANGSART_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVorgangsart(opt.key)}
                    className={[
                      'flex-1 rounded-xl border p-3 text-sm font-medium transition-colors',
                      vorgangsart === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-secondary',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {tt('startDate')} <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Planned end date */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('plannedEnd')}</label>
              <Input
                type="date"
                value={geplantesDatum}
                onChange={e => setGeplantesDatum(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Responsible craftsman */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('responsible')}</label>
              <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tt('responsibleNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt('responsibleNone')}</SelectItem>
                  {aktiveHandwerker.map(h => (
                    <SelectItem key={h.record_id} value={h.record_id}>
                      {`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || h.record_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('description')}</label>
              <Textarea
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tt('descriptionPlaceholder')}
                rows={3}
                className="w-full resize-none"
              />
            </div>

            {maintenanceError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertTriangle size={16} className="shrink-0" />
                {maintenanceError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setStep(4); }}
                className="flex-1"
              >
                {tt('skipMaintenance')}
              </Button>
              <Button
                onClick={handleCreateMaintenance}
                disabled={submittingMaintenance || !startdatum || !vorgangsart || vorgangsart === 'none'}
                className="flex-1"
              >
                {submittingMaintenance ? tt('creating') : tt('createMaintenance')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tt('prereqMsg')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Confirmation */}
      {step === 4 && (
        <div className="flex flex-col items-center text-center py-12 space-y-6 max-w-md mx-auto">
          <div className="rounded-full bg-primary/10 p-5">
            <IconCircleCheck size={48} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-muted-foreground">{tt('successDesc')}</p>
          </div>

          <div className="w-full rounded-2xl border bg-card p-4 space-y-2 text-left overflow-hidden">
            {werkzeugName !== '—' && (
              <div className="flex items-center gap-2 text-sm">
                <IconTools size={16} className="text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{werkzeugName}</span>
              </div>
            )}
            {conditionDisplayLabel && (
              <p className="text-sm text-muted-foreground">
                {tt('conditionUpdated')} <span className="font-medium text-foreground">{conditionDisplayLabel}</span>
              </p>
            )}
            {maintenanceCreated && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <IconTool size={14} className="shrink-0" />
                {tt('maintenanceCreated')}
              </p>
            )}
          </div>

          <div className="flex flex-col w-full gap-3">
            <Button onClick={handleReset} className="w-full">
              {tt('newReturn')}
            </Button>
            <a href="#/" className="w-full">
              <Button variant="outline" className="w-full">
                {tt('backToDashboard')}
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
