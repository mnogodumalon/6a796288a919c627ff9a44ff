/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker auswählen → 2) Werkzeug auswählen → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker (status=aktiv), werkzeuge (zustand=verfuegbar).
 * Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry → zustand=ausgeliehen).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconUser, IconTool, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug ausleihen',
    subtitle: 'Handwerker und Werkzeug wählen, dann Ausleihe anlegen',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    pickHandwerker: 'Handwerker auswählen',
    pickHandwerkerSub: 'Nur aktive Handwerker werden angezeigt',
    pickWerkzeug: 'Werkzeug auswählen',
    pickWerkzeugSub: 'Nur verfügbare Werkzeuge werden angezeigt',
    handwerkerEmpty: 'Keine aktiven Handwerker gefunden',
    werkzeugEmpty: 'Keine verfügbaren Werkzeuge gefunden',
    confirmTitle: 'Ausleihe bestätigen',
    selectedHandwerker: 'Handwerker',
    selectedWerkzeug: 'Werkzeug',
    ausleihdatum: 'Ausleihdatum und -uhrzeit',
    rueckgabedatum: 'Geplantes Rückgabedatum und -uhrzeit',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Optionale Anmerkungen zur Ausleihe…',
    submit: 'Ausleihe anlegen',
    submitting: 'Wird angelegt…',
    successTitle: 'Ausleihe erfolgreich angelegt',
    successDesc: 'Das Werkzeug wurde als ausgeliehen markiert.',
    newAusleihe: 'Weitere Ausleihe anlegen',
    backDashboard: 'Zurück zum Dashboard',
    errorTitle: 'Fehler beim Anlegen',
    step3NeedsStep1: 'Bitte wähle zuerst einen Handwerker aus.',
    step3NeedsStep2: 'Bitte wähle zuerst ein Werkzeug aus.',
    goToStep1: 'Zu Schritt 1',
    goToStep2: 'Zu Schritt 2',
    abteilung: 'Abteilung',
    personalnummer: 'Nr.',
    inventarnummer: 'Inventar-Nr.',
    kategorieLabel: 'Kategorie',
    standort: 'Standort',
    weiterZuWerkzeug: 'Weiter zu Schritt 2: Werkzeug',
    weiterZuBestaetigen: 'Weiter zu Schritt 3: Bestätigen',
    zurueck: 'Zurück',
  },
  en: {
    pageTitle: 'Check Out Tool',
    subtitle: 'Select a craftsman and tool, then create the lending record',
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Confirm',
    pickHandwerker: 'Select Craftsman',
    pickHandwerkerSub: 'Only active craftsmen are shown',
    pickWerkzeug: 'Select Tool',
    pickWerkzeugSub: 'Only available tools are shown',
    handwerkerEmpty: 'No active craftsmen found',
    werkzeugEmpty: 'No available tools found',
    confirmTitle: 'Confirm Lending',
    selectedHandwerker: 'Craftsman',
    selectedWerkzeug: 'Tool',
    ausleihdatum: 'Checkout Date & Time',
    rueckgabedatum: 'Planned Return Date & Time',
    bemerkungen: 'Remarks',
    bemerkungenPlaceholder: 'Optional remarks about this lending…',
    submit: 'Create Lending',
    submitting: 'Creating…',
    successTitle: 'Lending Created Successfully',
    successDesc: 'The tool has been marked as checked out.',
    newAusleihe: 'Add Another Lending',
    backDashboard: 'Back to Dashboard',
    errorTitle: 'Error Creating Lending',
    step3NeedsStep1: 'Please select a craftsman first.',
    step3NeedsStep2: 'Please select a tool first.',
    goToStep1: 'Go to Step 1',
    goToStep2: 'Go to Step 2',
    abteilung: 'Department',
    personalnummer: 'No.',
    inventarnummer: 'Inventory No.',
    kategorieLabel: 'Category',
    standort: 'Location',
    weiterZuWerkzeug: 'Continue to Step 2: Tool',
    weiterZuBestaetigen: 'Continue to Step 3: Confirm',
    zurueck: 'Back',
  },
});

function getWizardSteps() {
  return [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
  ];
}

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  const nowFormatted = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const [ausleihdatum, setAusleihdatum] = useState(nowFormatted);
  const [rueckgabedatum, setRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  // Filtered data — only eligible records
  const activeHandwerker: Handwerker[] = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv'
  );
  const availableWerkzeuge: Werkzeuge[] = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = handwerker.find((h) => h.record_id === selectedHandwerkerId) ?? null;
  const selectedWerkzeug = werkzeuge.find((w) => w.record_id === selectedWerkzeugId) ?? null;

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Idempotency guard: only create once even on retry
      let ausleiheId = createdAusleiheId;
      if (!ausleiheId) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: rueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        ausleiheId = result.record_id;
        setCreatedAusleiheId(ausleiheId);
      }

      // Update tool status — update is repeatable, no guard needed
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setRueckgabedatum('');
    setBemerkungen('');
    setSubmitting(false);
    setSubmitError(null);
    setSuccess(false);
    setCreatedAusleiheId(null);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={getWizardSteps()}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select Handwerker */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{tt('pickHandwerker')}</h2>
            <p className="text-sm text-muted-foreground">{tt('pickHandwerkerSub')}</p>
          </div>
          <EntitySelectStep
            items={activeHandwerker.map((h) => ({
              id: h.record_id,
              title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
              subtitle: [
                h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
                h.fields.personalnummer ? `${tt('personalnummer')} ${h.fields.personalnummer}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: h.fields.status
                ? { key: h.fields.status.key, label: h.fields.status.label }
                : undefined,
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedHandwerkerId(id);
              setStep(2);
            }}
            emptyText={tt('handwerkerEmpty')}
            emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          />
          {selectedHandwerkerId && (
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)}>{tt('weiterZuWerkzeug')}</Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Werkzeug */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{tt('pickWerkzeug')}</h2>
            <p className="text-sm text-muted-foreground">{tt('pickWerkzeugSub')}</p>
          </div>
          <EntitySelectStep
            items={availableWerkzeuge.map((w) => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? w.record_id,
              subtitle: [
                w.fields.inventarnummer ? `${tt('inventarnummer')} ${w.fields.inventarnummer}` : null,
                w.fields.kategorie?.label ? `${tt('kategorieLabel')}: ${w.fields.kategorie.label}` : null,
                w.fields.standort ? `${tt('standort')}: ${w.fields.standort}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: w.fields.zustand
                ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedWerkzeugId(id);
              setStep(3);
            }}
            emptyText={tt('werkzeugEmpty')}
            emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
          />
          <div className="flex items-center gap-3 justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('zurueck')}
            </Button>
            {selectedWerkzeugId && (
              <Button onClick={() => setStep(3)}>{tt('weiterZuBestaetigen')}</Button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && (
        <div className="space-y-6">
          {success ? (
            <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-3">
                  <IconCheck size={28} className="text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-lg font-semibold">{tt('successTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tt('successDesc')}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>{tt('newAusleihe')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('backDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : !selectedHandwerkerId ? (
            <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">{tt('step3NeedsStep1')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('goToStep1')}
              </Button>
            </div>
          ) : !selectedWerkzeugId ? (
            <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">{tt('step3NeedsStep2')}</p>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('goToStep2')}
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{tt('confirmTitle')}</h2>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconUser size={16} />
                    <span>{tt('selectedHandwerker')}</span>
                  </div>
                  <p className="font-semibold truncate">
                    {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                      .filter(Boolean)
                      .join(' ') || selectedHandwerkerId}
                  </p>
                  {selectedHandwerker?.fields.abteilung && (
                    <p className="text-sm text-muted-foreground truncate">
                      {selectedHandwerker.fields.abteilung}
                    </p>
                  )}
                  {selectedHandwerker?.fields.status && (
                    <StatusBadge
                      statusKey={selectedHandwerker.fields.status.key}
                      label={selectedHandwerker.fields.status.label}
                    />
                  )}
                </div>

                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconTool size={16} />
                    <span>{tt('selectedWerkzeug')}</span>
                  </div>
                  <p className="font-semibold truncate">
                    {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                  </p>
                  {selectedWerkzeug?.fields.inventarnummer && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('inventarnummer')} {selectedWerkzeug.fields.inventarnummer}
                    </p>
                  )}
                  {selectedWerkzeug?.fields.zustand && (
                    <StatusBadge
                      statusKey={selectedWerkzeug.fields.zustand.key}
                      label={selectedWerkzeug.fields.zustand.label}
                    />
                  )}
                </div>
              </div>

              {/* Ausleihe form fields */}
              <div className="rounded-2xl border bg-card p-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ausleihdatum">
                    {tt('ausleihdatum')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rueckgabedatum">{tt('rueckgabedatum')}</Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={rueckgabedatum}
                    onChange={(e) => setRueckgabedatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tt('bemerkungenPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                  <IconAlertCircle size={18} className="text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">{tt('errorTitle')}</p>
                    <p className="text-sm text-destructive/80 mt-0.5">{submitError}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 justify-between">
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  {tt('zurueck')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                >
                  {submitting ? tt('submitting') : tt('submit')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
