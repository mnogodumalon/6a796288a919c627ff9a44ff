/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (nur aktive) → 2) Werkzeug wählen (nur verfügbare) →
 *        3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker (status=aktiv), werkzeuge (zustand=verfuegbar).
 * Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry → zustand=ausgeliehen).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconUser, IconTool, IconClipboardCheck, IconCheck } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug Ausleihen',
    pageSubtitle: 'Handwerker, Werkzeug und Ausleihdaten in 3 Schritten erfassen',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    searchHandwerker: 'Handwerker suchen...',
    searchWerkzeug: 'Werkzeug suchen...',
    emptyHandwerker: 'Keine aktiven Handwerker gefunden',
    emptyWerkzeug: 'Keine verfügbaren Werkzeuge gefunden',
    ausleihdatum: 'Ausleihdatum und -uhrzeit',
    geplantesRueckgabedatum: 'Geplantes Rückgabedatum und -uhrzeit',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Optionale Anmerkungen zur Ausleihe...',
    summaryTitle: 'Zusammenfassung',
    handwerker: 'Handwerker',
    werkzeug: 'Werkzeug',
    confirmButton: 'Ausleihe anlegen',
    submitting: 'Wird gespeichert...',
    successTitle: 'Ausleihe erfolgreich angelegt!',
    successDesc: 'Das Werkzeug wurde dem Handwerker zugewiesen und als ausgeliehen markiert.',
    newAusleihe: 'Neue Ausleihe anlegen',
    backToDashboard: 'Zurück zum Dashboard',
    selectHandwerkerFirst: 'Dieser Schritt benötigt die Handwerker-Auswahl aus Schritt 1.',
    selectWerkzeugFirst: 'Dieser Schritt benötigt Handwerker und Werkzeug aus den vorherigen Schritten.',
    restart: 'Neu starten',
    ausleihdatumRequired: 'Bitte ein Ausleihdatum angeben.',
    inventarnummer: 'Inventarnr.',
    standort: 'Standort',
    personalnummer: 'Personalnr.',
    abteilung: 'Abteilung',
    kategorieLabel: 'Kategorie',
    weiter: 'Weiter zu Schritt',
    zurueck: 'Zurück',
    errorTitle: 'Fehler beim Anlegen der Ausleihe',
  },
  en: {
    pageTitle: 'Lend Tool',
    pageSubtitle: 'Assign a tool to a craftsman in 3 steps',
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Confirm',
    searchHandwerker: 'Search craftsmen...',
    searchWerkzeug: 'Search tools...',
    emptyHandwerker: 'No active craftsmen found',
    emptyWerkzeug: 'No available tools found',
    ausleihdatum: 'Checkout date and time',
    geplantesRueckgabedatum: 'Planned return date and time',
    bemerkungen: 'Remarks',
    bemerkungenPlaceholder: 'Optional notes about this loan...',
    summaryTitle: 'Summary',
    handwerker: 'Craftsman',
    werkzeug: 'Tool',
    confirmButton: 'Create loan',
    submitting: 'Saving...',
    successTitle: 'Loan created successfully!',
    successDesc: 'The tool has been assigned to the craftsman and marked as checked out.',
    newAusleihe: 'New loan',
    backToDashboard: 'Back to dashboard',
    selectHandwerkerFirst: 'This step requires the craftsman selection from step 1.',
    selectWerkzeugFirst: 'This step requires craftsman and tool from the previous steps.',
    restart: 'Start over',
    ausleihdatumRequired: 'Please provide a checkout date.',
    inventarnummer: 'Inv. no.',
    standort: 'Location',
    personalnummer: 'Employee no.',
    abteilung: 'Department',
    kategorieLabel: 'Category',
    weiter: 'Continue to step',
    zurueck: 'Back',
    errorTitle: 'Error creating loan',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Derived data — eligible records
  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv'
  );
  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = selectedHandwerkerId
    ? (handwerker as Handwerker[]).find((h) => h.record_id === selectedHandwerkerId) ?? null
    : null;
  const selectedWerkzeug = selectedWerkzeugId
    ? (werkzeuge as Werkzeuge[]).find((w) => w.record_id === selectedWerkzeugId) ?? null
    : null;

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId) return;
    if (!ausleihdatum) {
      setSubmitError(tt('ausleihdatumRequired'));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Idempotency guard: only create if not yet created
      let pid = ausleiheId;
      if (!pid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        pid = result.record_id;
        setAusleiheId(pid);
      }

      // Update tool status to 'ausgeliehen'
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
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setAusleiheId(null);
    setSuccess(false);
    setStep(1);
  };

  // Default ausleihdatum to now when entering step 3
  const handleGoToStep3 = () => {
    if (!ausleihdatum) {
      setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    }
    setStep(3);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('pageSubtitle')}
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
      {/* Step 1 — Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map((h) => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [
              h.fields.personalnummer ? `${tt('personalnummer')} ${h.fields.personalnummer}` : null,
              h.fields.abteilung ? h.fields.abteilung : null,
            ]
              .filter(Boolean)
              .join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedHandwerkerId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('searchHandwerker')}
          emptyText={tt('emptyHandwerker')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2 — Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerkerId ? (
          <EntitySelectStep
            items={verfuegbareWerkzeuge.map((w) => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? w.record_id,
              subtitle: [
                w.fields.inventarnummer ? `${tt('inventarnummer')} ${w.fields.inventarnummer}` : null,
                w.fields.kategorie?.label ?? null,
                w.fields.standort ? w.fields.standort : null,
              ]
                .filter(Boolean)
                .join(' · '),
              icon: <IconTool size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedWerkzeugId(id);
              handleGoToStep3();
            }}
            searchPlaceholder={tt('searchWerkzeug')}
            emptyText={tt('emptyWerkzeug')}
            emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
          />
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('selectHandwerkerFirst')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Ausleihe bestätigen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          success ? (
            <div className="flex flex-col items-center py-16 space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-muted-foreground max-w-sm">{tt('successDesc')}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button onClick={handleReset} className="w-full">{tt('newAusleihe')}</Button>
                <Button variant="outline" asChild className="w-full">
                  <a href="#/">{tt('backToDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Summary card */}
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <IconClipboardCheck size={18} className="text-primary" />
                  {tt('summaryTitle')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-secondary p-3 space-y-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('handwerker')}</p>
                    <p className="font-medium truncate">
                      {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                        .filter(Boolean)
                        .join(' ') || selectedHandwerkerId}
                    </p>
                    {selectedHandwerker?.fields.abteilung && (
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedHandwerker.fields.abteilung}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-secondary p-3 space-y-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('werkzeug')}</p>
                    <p className="font-medium truncate">
                      {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                    </p>
                    {selectedWerkzeug?.fields.inventarnummer && (
                      <p className="text-xs text-muted-foreground truncate">
                        {tt('inventarnummer')} {selectedWerkzeug.fields.inventarnummer}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Date & remarks form */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ausleihdatum">{tt('ausleihdatum')} *</Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="geplantes_rueckgabedatum">{tt('geplantesRueckgabedatum')}</Label>
                  <Input
                    id="geplantes_rueckgabedatum"
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bemerkungen_ausleihe">{tt('bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen_ausleihe"
                    value={bemerkungenAusleihe}
                    onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                    placeholder={tt('bemerkungenPlaceholder')}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {submitError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-sm text-destructive font-medium">{tt('errorTitle')}</p>
                  <p className="text-xs text-destructive/80 mt-1">{submitError}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="sm:w-auto"
                >
                  {tt('zurueck')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                  className="flex-1"
                >
                  {submitting ? tt('submitting') : tt('confirmButton')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('selectWerkzeugFirst')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
