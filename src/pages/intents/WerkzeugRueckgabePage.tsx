/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe erfassen & Werkzeugzustand setzen → 3) Optional Wartung/Reparatur anlegen.
 * Reads: ausleihe (filtered: status_ausleihe === 'ausgeliehen'), werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Ausleihe } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { IconArrowRight, IconCheck, IconTool, IconAlertTriangle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug zurückgeben',
    subtitle: 'Ausleihe abschließen und Zustand erfassen',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe erfassen',
    step3: 'Wartung / Reparatur',
    step4: 'Abgeschlossen',
    noOpenLoans: 'Keine offenen Ausleihen vorhanden.',
    noOpenLoansHint: 'Alle Werkzeuge wurden bereits zurückgegeben.',
    loanCard: 'Ausleihe',
    returnDateLabel: 'Tatsächliches Rückgabedatum',
    conditionLabel: 'Zustand nach Rückgabe',
    remarksLabel: 'Bemerkungen',
    conditionPlaceholder: 'Zustand auswählen...',
    submit2: 'Rückgabe abschließen',
    submitting: 'Wird gespeichert...',
    step3Title: 'Wartungs- oder Reparaturvorgang anlegen',
    step3Hint: 'Das Werkzeug wurde als "{zustand}" markiert. Soll direkt ein Vorgang angelegt werden?',
    skipStep3: 'Überspringen',
    vorgangsartLabel: 'Vorgangsart',
    startdatumLabel: 'Startdatum',
    enddatumLabel: 'Geplantes Enddatum',
    beschreibungLabel: 'Beschreibung',
    kostenLabel: 'Kosten (€)',
    createVorgang: 'Vorgang anlegen',
    successTitle: 'Rückgabe erfolgreich',
    successSubtitle: 'Das Werkzeug wurde zurückgegeben.',
    successVorgang: 'Wartungs-/Reparaturvorgang wurde angelegt.',
    newReturn: 'Weitere Rückgabe erfassen',
    backDashboard: 'Zurück zum Dashboard',
    noSelectionStep2: 'Kein Ausleihe-Datensatz ausgewählt.',
    restart: 'Neu starten',
    ausleihdatum: 'Ausgeliehen am',
    plannedReturn: 'Geplante Rückgabe',
    beschreibungPlaceholder: 'Problembeschreibung oder geplante Maßnahme...',
    remarkPlaceholder: 'Optionale Bemerkungen zur Rückgabe...',
    costsPlaceholder: '0.00',
    zurueck: 'Zurück',
  },
  en: {
    pageTitle: 'Return Tool',
    subtitle: 'Close checkout and record condition',
    step1: 'Select checkout',
    step2: 'Record return',
    step3: 'Maintenance / Repair',
    step4: 'Done',
    noOpenLoans: 'No open checkouts available.',
    noOpenLoansHint: 'All tools have already been returned.',
    loanCard: 'Checkout',
    returnDateLabel: 'Actual return date',
    conditionLabel: 'Condition after return',
    remarksLabel: 'Remarks',
    conditionPlaceholder: 'Select condition...',
    submit2: 'Complete return',
    submitting: 'Saving...',
    step3Title: 'Create maintenance or repair process',
    step3Hint: 'The tool was marked as "{zustand}". Would you like to create a process now?',
    skipStep3: 'Skip',
    vorgangsartLabel: 'Process type',
    startdatumLabel: 'Start date',
    enddatumLabel: 'Planned end date',
    beschreibungLabel: 'Description',
    kostenLabel: 'Cost (€)',
    createVorgang: 'Create process',
    successTitle: 'Return successful',
    successSubtitle: 'The tool has been returned.',
    successVorgang: 'Maintenance/repair process has been created.',
    newReturn: 'Record another return',
    backDashboard: 'Back to Dashboard',
    noSelectionStep2: 'No checkout record selected.',
    restart: 'Restart',
    ausleihdatum: 'Checked out on',
    plannedReturn: 'Planned return',
    beschreibungPlaceholder: 'Problem description or planned action...',
    remarkPlaceholder: 'Optional remarks about the return...',
    costsPlaceholder: '0.00',
    zurueck: 'Back',
  },
});

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];

function formatDateTime(val: string | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return format(d, 'dd.MM.yyyy, HH:mm');
  } catch {
    return val;
  }
}

function formatDate(val: string | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return format(d, 'dd.MM.yyyy');
  } catch {
    return val;
  }
}

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<Ausleihe | null>(null);
  const [returnDatetime, setReturnDatetime] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [zustandKey, setZustandKey] = useState('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting2, setSubmitting2] = useState(false);
  const [submitError2, setSubmitError2] = useState<string | null>(null);

  // Step 3 state
  const [vorgangsart, setVorgangsart] = useState('');
  const [startdatum, setStartdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [kosten, setKosten] = useState('');
  const [submitting3, setSubmitting3] = useState(false);
  const [submitError3, setSubmitError3] = useState<string | null>(null);
  const [vorgangCreated, setVorgangCreated] = useState(false);

  const openLoans = ausleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen');

  const handleSelectAusleihe = (id: string) => {
    const found = openLoans.find(a => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    if (found) {
      // Pre-fill vorgangsart based on nothing yet — will be set when condition is known
      setZustandKey('verfuegbar');
      setBemerkungen('');
      setReturnDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setStep(2);
    }
  };

  const handleSubmitReturn = async () => {
    if (!selectedAusleihe) return;
    setSubmitting2(true);
    setSubmitError2(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: returnDatetime,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey,
        });
      }

      await fetchAll();

      // If condition requires maintenance or repair, go to step 3; otherwise success
      if (zustandKey === 'in_reparatur' || zustandKey === 'in_wartung') {
        setVorgangsart(zustandKey === 'in_reparatur' ? 'reparatur' : 'wartung');
        setStep(3);
      } else {
        setStep(4);
      }
    } catch (err) {
      setSubmitError2(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setSubmitting2(false);
    }
  };

  const handleSubmitVorgang = async () => {
    if (!selectedAusleihe) return;
    setSubmitting3(true);
    setSubmitError3(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: werkzeugId ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId) : undefined,
        vorgangsart: vorgangsart,
        startdatum: startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: 'geplant',
        kosten: kosten ? parseFloat(kosten) : undefined,
      });
      await fetchAll();
      setVorgangCreated(true);
      setStep(4);
    } catch (err) {
      setSubmitError3(err instanceof Error ? err.message : 'Fehler beim Anlegen des Vorgangs.');
    } finally {
      setSubmitting3(false);
    }
  };

  const handleReset = () => {
    setSelectedAusleihe(null);
    setReturnDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey('verfuegbar');
    setBemerkungen('');
    setVorgangsart('');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setKosten('');
    setVorgangCreated(false);
    setSubmitError2(null);
    setSubmitError3(null);
    setStep(1);
  };

  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select open checkout */}
      {step === 1 && (
        <EntitySelectStep
          items={openLoans.map(a => {
            const werkzeug = a.fields.werkzeug ? werkzeugeMap.get(extractRecordId(a.fields.werkzeug) ?? '') : undefined;
            const handwerker = a.fields.handwerker ? handwerkerMap.get(extractRecordId(a.fields.handwerker) ?? '') : undefined;
            const werkzeugName = werkzeug?.fields.werkzeugname ?? a.fields.werkzeug ?? '—';
            const handwerkerName = handwerker
              ? `${handwerker.fields.vorname ?? ''} ${handwerker.fields.nachname ?? ''}`.trim()
              : '—';
            return {
              id: a.record_id,
              title: werkzeugName,
              subtitle: `${handwerkerName} · ${tt('ausleihdatum')}: ${formatDateTime(a.fields.ausleihdatum)}${a.fields.geplantes_rueckgabedatum ? ` · ${tt('plannedReturn')}: ${formatDateTime(a.fields.geplantes_rueckgabedatum)}` : ''}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={handleSelectAusleihe}
          emptyText={tt('noOpenLoans')}
        />
      )}

      {/* Step 2: Record return details */}
      {step === 2 && (
        <div className="space-y-6">
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelectionStep2')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Context card */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2">
                  <IconTool size={18} className="text-primary shrink-0" stroke={1.5} />
                  <span className="font-semibold truncate">
                    {(() => {
                      const werkzeug = selectedAusleihe.fields.werkzeug
                        ? werkzeugeMap.get(extractRecordId(selectedAusleihe.fields.werkzeug) ?? '')
                        : undefined;
                      return werkzeug?.fields.werkzeugname ?? '—';
                    })()}
                  </span>
                  {selectedAusleihe.fields.status_ausleihe && (
                    <StatusBadge
                      statusKey={selectedAusleihe.fields.status_ausleihe.key}
                      label={selectedAusleihe.fields.status_ausleihe.label}
                    />
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {tt('ausleihdatum')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}
                  {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                    <span> · {tt('plannedReturn')}: {formatDateTime(selectedAusleihe.fields.geplantes_rueckgabedatum)}</span>
                  )}
                </div>
              </div>

              {/* Return form */}
              <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
                <div className="space-y-2">
                  <Label htmlFor="returnDatetime">{tt('returnDateLabel')}</Label>
                  <Input
                    id="returnDatetime"
                    type="datetime-local"
                    value={returnDatetime}
                    onChange={e => setReturnDatetime(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zustand">{tt('conditionLabel')}</Label>
                  <Select value={zustandKey} onValueChange={setZustandKey}>
                    <SelectTrigger id="zustand" className="w-full">
                      <SelectValue placeholder={tt('conditionPlaceholder')} />
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

                <div className="space-y-2">
                  <Label htmlFor="bemerkungen">{tt('remarksLabel')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={e => setBemerkungen(e.target.value)}
                    placeholder={tt('remarkPlaceholder')}
                    className="w-full min-h-[80px]"
                  />
                </div>

                {submitError2 && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <IconAlertTriangle size={16} stroke={1.5} />
                    <span>{submitError2}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="shrink-0">
                    {tt('zurueck')}
                  </Button>
                  <Button
                    onClick={handleSubmitReturn}
                    disabled={submitting2 || !returnDatetime || !zustandKey}
                    className="flex-1"
                  >
                    {submitting2 ? tt('submitting') : tt('submit2')}
                    {!submitting2 && <IconArrowRight size={16} className="ml-2" stroke={1.5} />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Optional maintenance/repair */}
      {step === 3 && (
        <div className="space-y-6">
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelectionStep2')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
                {tt('step3Hint', { zustand: ZUSTAND_OPTIONS.find(o => o.key === zustandKey)?.label ?? zustandKey })}
              </div>

              <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
                <h3 className="font-semibold">{tt('step3Title')}</h3>

                <div className="space-y-2">
                  <Label htmlFor="vorgangsart">{tt('vorgangsartLabel')}</Label>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startdatum">{tt('startdatumLabel')}</Label>
                    <Input
                      id="startdatum"
                      type="date"
                      value={startdatum}
                      onChange={e => setStartdatum(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="enddatum">{tt('enddatumLabel')}</Label>
                    <Input
                      id="enddatum"
                      type="date"
                      value={geplantesEnddatum}
                      onChange={e => setGeplantesEnddatum(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="beschreibung">{tt('beschreibungLabel')}</Label>
                  <Textarea
                    id="beschreibung"
                    value={beschreibung}
                    onChange={e => setBeschreibung(e.target.value)}
                    placeholder={tt('beschreibungPlaceholder')}
                    className="w-full min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="kosten">{tt('kostenLabel')}</Label>
                  <Input
                    id="kosten"
                    type="number"
                    min="0"
                    step="0.01"
                    value={kosten}
                    onChange={e => setKosten(e.target.value)}
                    placeholder={tt('costsPlaceholder')}
                    className="w-full"
                  />
                </div>

                {submitError3 && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <IconAlertTriangle size={16} stroke={1.5} />
                    <span>{submitError3}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(4)}
                    className="shrink-0"
                  >
                    {tt('skipStep3')}
                  </Button>
                  <Button
                    onClick={handleSubmitVorgang}
                    disabled={submitting3 || !vorgangsart || !startdatum}
                    className="flex-1"
                  >
                    {submitting3 ? tt('submitting') : tt('createVorgang')}
                    {!submitting3 && <IconArrowRight size={16} className="ml-2" stroke={1.5} />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="text-center py-12 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={32} className="text-green-600" stroke={1.5} />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-muted-foreground">{tt('successSubtitle')}</p>
            {vorgangCreated && (
              <p className="text-sm text-muted-foreground">{tt('successVorgang')}</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button variant="outline" onClick={handleReset}>
              {tt('newReturn')}
            </Button>
            <a href="#/">
              <Button className="w-full sm:w-auto">{tt('backDashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
