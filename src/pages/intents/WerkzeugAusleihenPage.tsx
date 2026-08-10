/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (aktiv) → 2) Werkzeug wählen (verfügbar) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker (status=aktiv), werkzeuge (zustand=verfuegbar).
 * Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconTool, IconUser, IconCheck, IconArrowRight } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    heading: 'Werkzeug ausleihen',
    subtitle: 'Handwerker und Werkzeug auswählen, dann Ausleihe anlegen',
    searchHandwerker: 'Handwerker suchen …',
    searchWerkzeug: 'Werkzeug suchen …',
    emptyHandwerker: 'Keine aktiven Handwerker gefunden',
    emptyWerkzeug: 'Kein verfügbares Werkzeug gefunden',
    ausleihdatum: 'Ausleihdatum',
    rueckgabedatum: 'Geplantes Rückgabedatum',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Optionale Anmerkungen zur Ausleihe …',
    weiterStep2: 'Weiter zu Schritt 2',
    weiterStep3: 'Weiter zu Schritt 3',
    zurueckStep1: 'Zurück zu Schritt 1',
    zurueckStep2: 'Zurück zu Schritt 2',
    ausleiheAnlegen: 'Ausleihe anlegen',
    submitting: 'Wird angelegt …',
    successTitle: 'Ausleihe erfolgreich angelegt',
    successHandwerker: 'Handwerker',
    successWerkzeug: 'Werkzeug',
    successDatum: 'Ausleihdatum',
    neueAusleihe: 'Neue Ausleihe anlegen',
    dashboard: 'Zurück zum Dashboard',
    confirmHeading: 'Ausleihe bestätigen',
    selectedHandwerker: 'Ausgewählter Handwerker',
    selectedWerkzeug: 'Ausgewähltes Werkzeug',
    requireMissing: 'Bitte wähle Handwerker und Werkzeug aus Schritt 1 und 2.',
    neuStart: 'Neu starten',
    errorSubmit: 'Fehler beim Anlegen der Ausleihe. Bitte erneut versuchen.',
  },
  en: {
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Confirm',
    heading: 'Borrow tool',
    subtitle: 'Select craftsman and tool, then create the loan',
    searchHandwerker: 'Search craftsman …',
    searchWerkzeug: 'Search tool …',
    emptyHandwerker: 'No active craftsmen found',
    emptyWerkzeug: 'No available tool found',
    ausleihdatum: 'Loan date',
    rueckgabedatum: 'Planned return date',
    bemerkungen: 'Remarks',
    bemerkungenPlaceholder: 'Optional remarks about the loan …',
    weiterStep2: 'Continue to step 2',
    weiterStep3: 'Continue to step 3',
    zurueckStep1: 'Back to step 1',
    zurueckStep2: 'Back to step 2',
    ausleiheAnlegen: 'Create loan',
    submitting: 'Creating …',
    successTitle: 'Loan successfully created',
    successHandwerker: 'Craftsman',
    successWerkzeug: 'Tool',
    successDatum: 'Loan date',
    neueAusleihe: 'Create new loan',
    dashboard: 'Back to dashboard',
    confirmHeading: 'Confirm loan',
    selectedHandwerker: 'Selected craftsman',
    selectedWerkzeug: 'Selected tool',
    requireMissing: 'Please select a craftsman and tool from steps 1 and 2.',
    neuStart: 'Restart',
    errorSubmit: 'Error creating the loan. Please try again.',
  },
  cs: {
    step1: 'Řemeslník',
    step2: 'Nástroj',
    step3: 'Potvrdit',
    heading: 'Půjčit nástroj',
    subtitle: 'Vyberte řemeslníka a nástroj, poté vytvořte půjčení',
    searchHandwerker: 'Hledat řemeslníka …',
    searchWerkzeug: 'Hledat nástroj …',
    emptyHandwerker: 'Žádní aktivní řemeslníci nenalezeni',
    emptyWerkzeug: 'Žádný dostupný nástroj nenalezen',
    ausleihdatum: 'Datum půjčení',
    rueckgabedatum: 'Plánované datum vrácení',
    bemerkungen: 'Poznámky',
    bemerkungenPlaceholder: 'Volitelné poznámky k půjčení …',
    weiterStep2: 'Pokračovat na krok 2',
    weiterStep3: 'Pokračovat na krok 3',
    zurueckStep1: 'Zpět na krok 1',
    zurueckStep2: 'Zpět na krok 2',
    ausleiheAnlegen: 'Vytvořit půjčení',
    submitting: 'Vytváření …',
    successTitle: 'Půjčení úspěšně vytvořeno',
    successHandwerker: 'Řemeslník',
    successWerkzeug: 'Nástroj',
    successDatum: 'Datum půjčení',
    neueAusleihe: 'Nové půjčení',
    dashboard: 'Zpět na přehled',
    confirmHeading: 'Potvrdit půjčení',
    selectedHandwerker: 'Vybraný řemeslník',
    selectedWerkzeug: 'Vybraný nástroj',
    requireMissing: 'Prosím vyberte řemeslníka a nástroj v krocích 1 a 2.',
    neuStart: 'Začít znovu',
    errorSubmit: 'Chyba při vytváření půjčení. Zkuste to prosím znovu.',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);
  const [ausleihdatum, setAusleihdatum] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ handwerkerName: string; werkzeugName: string; datum: string } | null>(null);

  const aktiveHandwerker = (handwerker as Handwerker[]).filter(h => h.fields.status?.key === 'aktiv');
  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(w => w.fields.zustand?.key === 'verfuegbar');

  const selectedHandwerker = aktiveHandwerker.find(h => h.record_id === selectedHandwerkerId) ?? null;
  const selectedWerkzeug = verfuegbareWerkzeuge.find(w => w.record_id === selectedWerkzeugId) ?? null;

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.createAusleiheEntry({
        werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
        handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
        ausleihdatum,
        geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
        status_ausleihe: 'ausgeliehen',
        bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
      });
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, { zustand: 'ausgeliehen' });
      const hw = selectedHandwerker;
      const wz = selectedWerkzeug;
      setSuccessData({
        handwerkerName: [hw?.fields.vorname, hw?.fields.nachname].filter(Boolean).join(' ') || selectedHandwerkerId,
        werkzeugName: wz?.fields.werkzeugname || selectedWerkzeugId,
        datum: ausleihdatum,
      });
      await fetchAll();
    } catch {
      setSubmitError(tt('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setSuccessData(null);
    setStep(1);
  };

  if (successData) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
          <IconCheck size={32} className="text-primary" stroke={2} />
        </div>
        <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
        <div className="rounded-2xl border bg-card p-6 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tt('successHandwerker')}</span>
            <span className="font-medium">{successData.handwerkerName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tt('successWerkzeug')}</span>
            <span className="font-medium">{successData.werkzeugName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tt('successDatum')}</span>
            <span className="font-medium">{successData.datum}</span>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={handleReset}>{tt('neueAusleihe')}</Button>
          <Button variant="outline" asChild>
            <a href="#/">{tt('dashboard')}</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tt('heading')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map(h => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [h.fields.abteilung, h.fields.qualifikation?.label].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" stroke={2} />,
            status: h.fields.status ? { key: h.fields.status.key, label: h.fields.status.label } : undefined,
          }))}
          onSelect={(id) => {
            setSelectedHandwerkerId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('searchHandwerker')}
          emptyText={tt('emptyHandwerker')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {step === 2 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map(w => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? w.record_id,
            subtitle: [
              w.fields.inventarnummer ? `Nr. ${w.fields.inventarnummer}` : null,
              w.fields.kategorie?.label,
              w.fields.standort,
              w.fields.zustand?.label,
            ].filter(Boolean).join(' · '),
            icon: <IconTool size={20} className="text-primary" stroke={2} />,
            status: w.fields.zustand ? { key: w.fields.zustand.key, label: w.fields.zustand.label } : undefined,
          }))}
          onSelect={(id) => {
            setSelectedWerkzeugId(id);
            setStep(3);
          }}
          searchPlaceholder={tt('searchWerkzeug')}
          emptyText={tt('emptyWerkzeug')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {step === 3 && (
        <div className="space-y-6 max-w-lg mx-auto">
          {!selectedHandwerkerId || !selectedWerkzeugId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('requireMissing')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold">{tt('confirmHeading')}</h2>

              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tt('selectedHandwerker')}</span>
                  <span className="font-medium">
                    {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname].filter(Boolean).join(' ') || selectedHandwerkerId}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tt('selectedWerkzeug')}</span>
                  <span className="font-medium">{selectedWerkzeug?.fields.werkzeugname || selectedWerkzeugId}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tt('ausleihdatum')} *</label>
                  <Input
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={e => setAusleihdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tt('rueckgabedatum')}</label>
                  <Input
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={e => setGeplantesRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tt('bemerkungen')}</label>
                  <Textarea
                    value={bemerkungenAusleihe}
                    onChange={e => setBemerkungenAusleihe(e.target.value)}
                    placeholder={tt('bemerkungenPlaceholder')}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="w-full sm:w-auto"
                >
                  {tt('zurueckStep2')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                  className="w-full sm:flex-1"
                >
                  {submitting ? tt('submitting') : tt('ausleiheAnlegen')}
                  {!submitting && <IconArrowRight size={16} stroke={2} className="ml-2" />}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
