/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (nur aktive) → 2) Werkzeug wählen (nur verfügbare) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker (status=aktiv), werkzeuge (zustand=verfuegbar).
 * Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry → zustand=ausgeliehen).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconUser,
  IconTool,
  IconClipboardCheck,
  IconAlertCircle,
  IconCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Werkzeug ausleihen', /* i18n-exempt */
    subtitle: 'In 3 Schritten ein Werkzeug an einen Handwerker ausgeben',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    selectHandwerker: 'Handwerker auswählen',
    selectWerkzeug: 'Werkzeug auswählen',
    searchHandwerker: 'Handwerker suchen...',
    searchWerkzeug: 'Werkzeug suchen...',
    noHandwerker: 'Keine aktiven Handwerker gefunden.',
    noWerkzeug: 'Keine verfügbaren Werkzeuge gefunden.',
    weiterWerkzeug: 'Weiter: Werkzeug wählen',
    weiterBestaetigen: 'Weiter: Bestätigen',
    zurueckHandwerker: 'Zurück: Handwerker',
    zurueckWerkzeug: 'Zurück: Werkzeug',
    summaryTitle: 'Zusammenfassung',
    handwerker: 'Handwerker',
    werkzeug: 'Werkzeug',
    ausleihdatum: 'Ausleihdatum',
    rueckgabedatum: 'Geplantes Rückgabedatum',
    bemerkungen: 'Bemerkungen',
    jetzt_ausleihen: 'Jetzt ausleihen',
    ausleihen_läuft: 'Ausleihe wird gespeichert...',
    erfolg_titel: 'Ausleihe erfolgreich!',
    erfolg_text: 'Das Werkzeug wurde erfolgreich ausgeliehen.',
    neue_ausleihe: 'Neue Ausleihe anlegen',
    zurueck_dashboard: 'Zurück zum Dashboard',
    step3_missing: 'Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.',
    neu_starten: 'Neu starten',
    inventarnummer: 'Inventarnummer',
    standort: 'Standort',
    kategorieLabel: 'Kategorie',
    abteilung: 'Abteilung',
    personalnummer: 'Personalnummer',
    erforderlich: 'Bitte alle Pflichtfelder ausfüllen.',
  },
  en: {
    title: 'Borrow tool', /* i18n-exempt */
    subtitle: 'Issue a tool to a craftsman in 3 steps',
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Confirm',
    selectHandwerker: 'Select craftsman',
    selectWerkzeug: 'Select tool',
    searchHandwerker: 'Search craftsman...',
    searchWerkzeug: 'Search tool...',
    noHandwerker: 'No active craftsmen found.',
    noWerkzeug: 'No available tools found.',
    weiterWerkzeug: 'Next: Select tool',
    weiterBestaetigen: 'Next: Confirm',
    zurueckHandwerker: 'Back: Craftsman',
    zurueckWerkzeug: 'Back: Tool',
    summaryTitle: 'Summary',
    handwerker: 'Craftsman',
    werkzeug: 'Tool',
    ausleihdatum: 'Loan date',
    rueckgabedatum: 'Planned return date',
    bemerkungen: 'Notes',
    jetzt_ausleihen: 'Issue now',
    ausleihen_läuft: 'Saving loan...',
    erfolg_titel: 'Loan successful!',
    erfolg_text: 'The tool has been issued successfully.',
    neue_ausleihe: 'New loan',
    zurueck_dashboard: 'Back to dashboard',
    step3_missing: 'This step requires a selection from step 1 and 2.',
    neu_starten: 'Restart',
    inventarnummer: 'Inventory number',
    standort: 'Location',
    kategorieLabel: 'Category',
    abteilung: 'Department',
    personalnummer: 'Staff number',
    erforderlich: 'Please fill in all required fields.',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Filtered lists
  const aktiveHandwerker = handwerker.filter(h => h.fields.status?.key === 'aktiv');
  const verfuegbareWerkzeuge = werkzeuge.filter(w => w.fields.zustand?.key === 'verfuegbar');

  // Resolved selections for display
  const selectedHandwerker = handwerker.find(h => h.record_id === selectedHandwerkerId) ?? null;
  const selectedWerkzeug = werkzeuge.find(w => w.record_id === selectedWerkzeugId) ?? null;

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) {
      setSubmitError(tt('erforderlich'));
      return;
    }
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
      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
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
    setDone(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Success state */}
      {done && (
        <div className="flex flex-col items-center gap-6 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <IconCheck size={40} className="text-primary" stroke={1.5} />
          </div>
          <div>
            <h2 className="text-xl font-semibold">{tt('erfolg_titel')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tt('erfolg_text')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleReset} variant="default">
              {tt('neue_ausleihe')}
            </Button>
            <Button asChild variant="outline">
              <a href="#/">{tt('zurueck_dashboard')}</a>
            </Button>
          </div>
        </div>
      )}

      {/* Step 1 — Handwerker wählen */}
      {!done && step === 1 && (
        <div className="space-y-4">
          <EntitySelectStep
            items={aktiveHandwerker.map(h => ({
              id: h.record_id,
              title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
              subtitle: [
                h.fields.personalnummer ? `${tt('personalnummer')}: ${h.fields.personalnummer}` : null,
                h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
              ].filter(Boolean).join(' · '),
              status: h.fields.status
                ? { key: h.fields.status.key, label: h.fields.status.label }
                : undefined,
              icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
            }))}
            onSelect={(id) => {
              setSelectedHandwerkerId(id);
              setStep(2);
            }}
            searchPlaceholder={tt('searchHandwerker')}
            emptyText={tt('noHandwerker')}
            emptyIcon={<IconAlertCircle size={32} className="text-muted-foreground" stroke={1.5} />}
          />
        </div>
      )}

      {/* Step 2 — Werkzeug wählen */}
      {!done && step === 2 && (
        selectedHandwerkerId ? (
          <div className="space-y-4">
            <EntitySelectStep
              items={verfuegbareWerkzeuge.map(w => ({
                id: w.record_id,
                title: w.fields.werkzeugname ?? w.record_id,
                subtitle: [
                  w.fields.inventarnummer ? `${tt('inventarnummer')}: ${w.fields.inventarnummer}` : null,
                  w.fields.kategorie ? `${tt('kategorieLabel')}: ${w.fields.kategorie.label}` : null,
                  w.fields.standort ? `${tt('standort')}: ${w.fields.standort}` : null,
                ].filter(Boolean).join(' · '),
                status: w.fields.zustand
                  ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                  : undefined,
                icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={(id) => {
                setSelectedWerkzeugId(id);
                setStep(3);
              }}
              searchPlaceholder={tt('searchWerkzeug')}
              emptyText={tt('noWerkzeug')}
              emptyIcon={<IconAlertCircle size={32} className="text-muted-foreground" stroke={1.5} />}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueckHandwerker')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{tt('step3_missing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neu_starten')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Bestätigen */}
      {!done && step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          <div className="space-y-6">
            {/* Summary card */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium">
                <IconClipboardCheck size={18} className="text-primary" stroke={1.5} />
                <span>{tt('summaryTitle')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{tt('handwerker')}</span>
                  <p className="font-medium truncate">
                    {selectedHandwerker
                      ? [selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname].filter(Boolean).join(' ')
                      : selectedHandwerkerId}
                  </p>
                  {selectedHandwerker?.fields.abteilung && (
                    <p className="text-xs text-muted-foreground">{selectedHandwerker.fields.abteilung}</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">{tt('werkzeug')}</span>
                  <p className="font-medium truncate">
                    {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                  </p>
                  {selectedWerkzeug?.fields.inventarnummer && (
                    <p className="text-xs text-muted-foreground">
                      {tt('inventarnummer')}: {selectedWerkzeug.fields.inventarnummer}
                    </p>
                  )}
                  {selectedWerkzeug?.fields.zustand && (
                    <StatusBadge
                      statusKey={selectedWerkzeug.fields.zustand.key}
                      label={selectedWerkzeug.fields.zustand.label}
                      className="mt-1"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ausleihdatum">{tt('ausleihdatum')} *</Label>
                <Input
                  id="ausleihdatum"
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={e => setAusleihdatum(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rueckgabedatum">{tt('rueckgabedatum')}</Label>
                <Input
                  id="rueckgabedatum"
                  type="datetime-local"
                  value={geplantesRueckgabedatum}
                  onChange={e => setGeplantesRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungenAusleihe}
                  onChange={e => setBemerkungenAusleihe(e.target.value)}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive flex items-start gap-2">
                <IconAlertCircle size={16} stroke={1.5} className="mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !ausleihdatum}
                className="flex-1"
              >
                {submitting ? tt('ausleihen_läuft') : tt('jetzt_ausleihen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tt('zurueckWerkzeug')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{tt('step3_missing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neu_starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
