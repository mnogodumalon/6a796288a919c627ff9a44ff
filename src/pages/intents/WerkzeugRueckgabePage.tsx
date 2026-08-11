/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe auswählen (status_ausleihe = 'ausgeliehen')
 *        → 2) Rückgabe bestätigen (tatsaechliches_rueckgabedatum, zustand, bemerkungen)
 *        → 3) Optional: Wartung / Reparatur anlegen.
 * Reads: ausleihe, werkzeuge, handwerker. Writes: ausleihe (updateAusleiheEntry),
 *        werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format, parseISO, isAfter } from 'date-fns';
import { makeT } from '@/i18n';
import { LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconArrowLeft,
  IconCheck,
  IconTool,
  IconAlertTriangle,
  IconCircleCheck,
} from '@tabler/icons-react';

const HANDWERKER_APP_ID = '6a796265ef74b1aaf76e20d0';
const WERKZEUGE_APP_ID = '6a79626b47fc8732b877c8c3';

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug zurückgeben',
    subtitle: 'Ausleihe abschließen und optional Wartung anlegen',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe bestätigen',
    step3: 'Wartung / Reparatur',
    noOpenLoans: 'Keine offenen Ausleihen vorhanden.',
    noOpenLoansDesc: 'Alle Werkzeuge wurden bereits zurückgegeben.',
    rueckgabeDatum: 'Tatsächliches Rückgabedatum',
    zustandNachRueckgabe: 'Zustand nach Rückgabe',
    bemerkungen: 'Bemerkungen',
    confirm: 'Rückgabe bestätigen',
    confirming: 'Wird gespeichert…',
    lateReturn: 'Verspätete Rückgabe',
    lateReturnDesc: 'Das geplante Rückgabedatum wurde überschritten.',
    plannedReturn: 'Geplante Rückgabe',
    checkoutDate: 'Ausleihdatum',
    handwerker: 'Handwerker',
    werkzeug: 'Werkzeug',
    askMaintenance: 'Soll ein Wartungs- oder Reparaturvorgang angelegt werden?',
    yes: 'Ja, Vorgang anlegen',
    no: 'Nein, direkt abschließen',
    vorgangsartLabel: 'Vorgangsart',
    startdatum: 'Startdatum',
    enddatum: 'Geplantes Enddatum',
    beschreibung: 'Beschreibung',
    statusWartung: 'Status',
    verantwortlicher: 'Verantwortlicher Handwerker',
    verantwortlicherPlaceholder: 'Handwerker auswählen (optional)',
    createMaintenance: 'Vorgang anlegen',
    creating: 'Wird angelegt…',
    successTitle: 'Rückgabe abgeschlossen',
    successDesc: 'Das Werkzeug wurde erfolgreich zurückgegeben.',
    maintenanceCreated: 'Wartungs-/Reparaturvorgang wurde angelegt.',
    newReturn: 'Neue Rückgabe erfassen',
    backToDashboard: 'Zurück zum Dashboard',
    selectHandwerker: 'Handwerker wählen (optional)',
    noHandwerker: 'Keiner',
    requiredField: 'Pflichtfeld',
    bemerkungenPlaceholder: 'Optionale Bemerkungen zur Rückgabe…',
    beschreibungPlaceholder: 'Beschreibung des Problems oder der Maßnahme…',
    pleaseSelectAusleihe: 'Bitte wähle zuerst eine Ausleihe aus.',
  },
  en: {
    pageTitle: 'Return Tool',
    subtitle: 'Complete lending and optionally create a maintenance record',
    step1: 'Select Lending',
    step2: 'Confirm Return',
    step3: 'Maintenance / Repair',
    noOpenLoans: 'No open lendings found.',
    noOpenLoansDesc: 'All tools have already been returned.',
    rueckgabeDatum: 'Actual Return Date',
    zustandNachRueckgabe: 'Condition After Return',
    bemerkungen: 'Remarks',
    confirm: 'Confirm Return',
    confirming: 'Saving…',
    lateReturn: 'Late Return',
    lateReturnDesc: 'The planned return date has been exceeded.',
    plannedReturn: 'Planned Return',
    checkoutDate: 'Checkout Date',
    handwerker: 'Craftsman',
    werkzeug: 'Tool',
    askMaintenance: 'Should a maintenance or repair process be created?',
    yes: 'Yes, create process',
    no: 'No, finish directly',
    vorgangsartLabel: 'Process Type',
    startdatum: 'Start Date',
    enddatum: 'Planned End Date',
    beschreibung: 'Description',
    statusWartung: 'Status',
    verantwortlicher: 'Responsible Craftsman',
    verantwortlicherPlaceholder: 'Select craftsman (optional)',
    createMaintenance: 'Create Process',
    creating: 'Creating…',
    successTitle: 'Return Completed',
    successDesc: 'The tool has been returned successfully.',
    maintenanceCreated: 'Maintenance/repair process has been created.',
    newReturn: 'Record New Return',
    backToDashboard: 'Back to Dashboard',
    selectHandwerker: 'Select craftsman (optional)',
    noHandwerker: 'None',
    requiredField: 'Required',
    bemerkungenPlaceholder: 'Optional remarks about the return…',
    beschreibungPlaceholder: 'Description of the problem or maintenance action…',
    pleaseSelectAusleihe: 'Please select a lending first.',
  },
});

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1: selection
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2: return form
  const nowStr = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const [rueckgabeDatum, setRueckgabeDatum] = useState(nowStr);
  const [zustandKey, setZustandKey] = useState<string>(ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 2 idempotency: track whether we already wrote step2
  const [step2Done, setStep2Done] = useState(false);

  // Step 3: maintenance form
  const [wantsMaintenance, setWantsMaintenance] = useState<boolean | null>(null);
  const [vorgangsart, setVorgangsart] = useState<string>(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung] = useState<string>('geplant');
  const [verantwortlicherId, setVerantwortlicherId] = useState<string>('none');
  const [creatingMaintenance, setCreatingMaintenance] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceCreated, setMaintenanceCreated] = useState(false);
  const [success, setSuccess] = useState(false);

  // Enrich ausleihe with display names
  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  // Filter: only status 'ausgeliehen'
  const offeneAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  // Derived info from selected ausleihe
  const werkzeugId = useMemo(() => {
    if (!selectedAusleihe) return null;
    return extractRecordId(selectedAusleihe.fields.werkzeug);
  }, [selectedAusleihe]);

  const isLate = useMemo(() => {
    if (!selectedAusleihe?.fields.geplantes_rueckgabedatum) return false;
    try {
      return isAfter(new Date(), parseISO(selectedAusleihe.fields.geplantes_rueckgabedatum));
    } catch {
      return false;
    }
  }, [selectedAusleihe]);

  const handleSelectAusleihe = (id: string) => {
    const found = offeneAusleihen.find(a => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    // Reset downstream state when a new ausleihe is picked
    setStep2Done(false);
    setWantsMaintenance(null);
    setMaintenanceCreated(false);
    setSuccess(false);
    setSubmitError(null);
    setStep(2);
  };

  const handleConfirmReturn = async () => {
    if (!selectedAusleihe || !werkzeugId) return;
    if (step2Done) {
      // Already written — just advance
      setStep(3);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: zustandKey,
      });
      setStep2Done(true);
      await fetchAll();
      setStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateMaintenance = async () => {
    if (!werkzeugId) return;
    setCreatingMaintenance(true);
    setMaintenanceError(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(WERKZEUGE_APP_ID, werkzeugId),
        vorgangsart: vorgangsart,
        startdatum: startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
        verantwortlicher: verantwortlicherId !== 'none'
          ? createRecordUrl(HANDWERKER_APP_ID, verantwortlicherId)
          : undefined,
      });
      setMaintenanceCreated(true);
      setSuccess(true);
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : 'Fehler beim Anlegen.');
    } finally {
      setCreatingMaintenance(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey(ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
    setBemerkungen('');
    setSubmitError(null);
    setStep2Done(false);
    setWantsMaintenance(null);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setVerantwortlicherId('none');
    setMaintenanceError(null);
    setMaintenanceCreated(false);
    setSuccess(false);
    setCreatingMaintenance(false);
    setSubmitting(false);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select an open Ausleihe */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => {
            const ausleihdatum = a.fields.ausleihdatum
              ? format(parseISO(a.fields.ausleihdatum), 'dd.MM.yyyy HH:mm')
              : '—';
            const geplant = a.fields.geplantes_rueckgabedatum
              ? format(parseISO(a.fields.geplantes_rueckgabedatum), 'dd.MM.yyyy HH:mm')
              : '—';
            const late = a.fields.geplantes_rueckgabedatum
              ? isAfter(new Date(), parseISO(a.fields.geplantes_rueckgabedatum))
              : false;
            return {
              id: a.record_id,
              title: a.werkzeugName || a.record_id,
              subtitle: `${tt('handwerker')}: ${a.handwerkerName || '—'} · ${tt('checkoutDate')}: ${ausleihdatum}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              stats: [
                { label: tt('plannedReturn'), value: geplant },
                ...(late ? [{ label: tt('lateReturn'), value: '!' }] : []),
              ],
              icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={handleSelectAusleihe}
          emptyText={tt('noOpenLoans')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Confirm return */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Summary card */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{selectedAusleihe.werkzeugName || '—'}</p>
                  <p className="text-sm text-muted-foreground">{tt('handwerker')}: {selectedAusleihe.handwerkerName || '—'}</p>
                  {selectedAusleihe.fields.ausleihdatum && (
                    <p className="text-sm text-muted-foreground">
                      {tt('checkoutDate')}: {format(parseISO(selectedAusleihe.fields.ausleihdatum), 'dd.MM.yyyy HH:mm')}
                    </p>
                  )}
                </div>
                {selectedAusleihe.fields.status_ausleihe && (
                  <StatusBadge
                    statusKey={selectedAusleihe.fields.status_ausleihe.key}
                    label={selectedAusleihe.fields.status_ausleihe.label}
                  />
                )}
              </div>
              {isLate && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                  <IconAlertTriangle size={16} stroke={2} />
                  <span className="text-sm font-medium">{tt('lateReturn')}: {tt('lateReturnDesc')}</span>
                </div>
              )}
              {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                <p className="text-sm text-muted-foreground">
                  {tt('plannedReturn')}: {format(parseISO(selectedAusleihe.fields.geplantes_rueckgabedatum), 'dd.MM.yyyy HH:mm')}
                </p>
              )}
            </div>

            {/* Return form */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {tt('rueckgabeDatum')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="datetime-local"
                  value={rueckgabeDatum}
                  onChange={e => setRueckgabeDatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {tt('zustandNachRueckgabe')} <span className="text-destructive">*</span>
                </label>
                <Select value={zustandKey} onValueChange={setZustandKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZUSTAND_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{tt('bemerkungen')}</label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  rows={3}
                  className="w-full"
                  placeholder={tt('bemerkungenPlaceholder')}
                />
              </div>

              {submitError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2"
                >
                  <IconArrowLeft size={16} stroke={2} />
                  {tt('step1')}
                </Button>
                <Button
                  onClick={handleConfirmReturn}
                  disabled={submitting || !rueckgabeDatum}
                  className="flex-1 min-w-0"
                >
                  {submitting ? tt('confirming') : (step2Done ? tt('step3') : tt('confirm'))}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('pleaseSelectAusleihe')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              <IconArrowLeft size={16} stroke={2} className="mr-2" />
              {tt('step1')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Optional maintenance */}
      {step === 3 && (
        selectedAusleihe && step2Done ? (
          success ? (
            // Success screen
            <div className="text-center py-12 space-y-4">
              <div className="flex justify-center">
                <IconCircleCheck size={56} className="text-green-500" stroke={1.5} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">{tt('successTitle')}</h3>
                <p className="text-sm text-muted-foreground">{tt('successDesc')}</p>
                {maintenanceCreated && (
                  <p className="text-sm text-muted-foreground">{tt('maintenanceCreated')}</p>
                )}
              </div>
              <div className="flex gap-3 flex-wrap justify-center pt-2">
                <Button onClick={handleReset} variant="outline">
                  {tt('newReturn')}
                </Button>
                <a href="#/">
                  <Button>{tt('backToDashboard')}</Button>
                </a>
              </div>
            </div>
          ) : wantsMaintenance === null ? (
            // Ask user
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <IconCheck size={18} className="text-green-500" stroke={2} />
                  <span className="font-medium">{tt('successDesc')}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {tt('werkzeug')}: <span className="font-medium">{selectedAusleihe.werkzeugName}</span>
                </p>
              </div>
              <p className="text-sm font-medium text-foreground">{tt('askMaintenance')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1"
                  onClick={() => setWantsMaintenance(true)}
                >
                  <IconTool size={16} stroke={2} className="mr-2" />
                  {tt('yes')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSuccess(true)}
                >
                  {tt('no')}
                </Button>
              </div>
            </div>
          ) : wantsMaintenance ? (
            // Maintenance form
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {tt('vorgangsartLabel')} <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        vorgangsart === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-border hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {tt('startdatum')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{tt('enddatum')}</label>
                <Input
                  type="date"
                  value={geplantesEnddatum}
                  onChange={e => setGeplantesEnddatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{tt('beschreibung')}</label>
                <Textarea
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  rows={3}
                  className="w-full"
                  placeholder={tt('beschreibungPlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{tt('statusWartung')}</label>
                <Select value={statusWartung} onValueChange={() => {}}>
                  <SelectTrigger className="w-full" disabled>
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

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{tt('verantwortlicher')}</label>
                <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('verantwortlicherPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('noHandwerker')}</SelectItem>
                    {handwerker.map(h => (
                      <SelectItem key={h.record_id} value={h.record_id}>
                        {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {maintenanceError && (
                <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                  {maintenanceError}
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => setWantsMaintenance(null)}
                >
                  <IconArrowLeft size={16} stroke={2} className="mr-2" />
                  {tt('askMaintenance').slice(0, 10)}…
                </Button>
                <Button
                  onClick={handleCreateMaintenance}
                  disabled={creatingMaintenance || !vorgangsart || !startdatum}
                  className="flex-1 min-w-0"
                >
                  {creatingMaintenance ? tt('creating') : tt('createMaintenance')}
                </Button>
              </div>
            </div>
          ) : null
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!selectedAusleihe ? 'Bitte wähle zuerst eine Ausleihe aus.' : 'Bitte bestätige zuerst die Rückgabe.'}
            </p>
            <Button variant="outline" onClick={() => setStep(!selectedAusleihe ? 1 : 2)}>
              <IconArrowLeft size={16} stroke={2} className="mr-2" />
              {!selectedAusleihe ? tt('step1') : tt('step2')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
