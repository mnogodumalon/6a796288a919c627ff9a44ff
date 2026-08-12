/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status=aktiv) → 2) Werkzeug wählen (zustand=verfuegbar) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTool,
  IconCalendar,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { tx } from '@/i18n';

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  const aktiveHandwerker = handwerker.filter(h => h.fields.status?.key === 'aktiv');
  const verfuegbareWerkzeuge = werkzeuge.filter(w => w.fields.zustand?.key === 'verfuegbar');

  const wizardSteps = [
    { label: selectedHandwerker ? `${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim() || tx('Handwerker') : tx('Handwerker') },
    { label: selectedWerkzeug ? (selectedWerkzeug.fields.werkzeugname ?? tx('Werkzeug')) : tx('Werkzeug') },
    { label: tx('Bestätigen') },
  ];

  const handleSelectHandwerker = (id: string) => {
    const found = handwerker.find(h => h.record_id === id) ?? null;
    setSelectedHandwerker(found);
    setStep(2);
  };

  const handleSelectWerkzeug = (id: string) => {
    const found = werkzeuge.find(w => w.record_id === id) ?? null;
    setSelectedWerkzeug(found);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerker || !selectedWerkzeug || !ausleihdatum) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Guard against duplicate create on retry
      let ausleiheId = createdAusleiheId;
      if (!ausleiheId) {
        const created = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeug.record_id),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerker.record_id),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        ausleiheId = created.record_id;
        setCreatedAusleiheId(ausleiheId);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeug.record_id, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerker(null);
    setSelectedWerkzeug(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setCreatedAusleiheId(null);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Handwerker und Werkzeug in 3 Schritten zuweisen')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map(h => ({
            id: h.record_id,
            title: `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || h.record_id,
            subtitle: [h.fields.personalnummer, h.fields.abteilung].filter(Boolean).join(' · '),
            status: h.fields.status
              ? { key: h.fields.status.key, label: h.fields.status.label }
              : undefined,
            stats: h.fields.qualifikation
              ? [{ label: tx('Qualifikation'), value: h.fields.qualifikation.label }]
              : [],
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectHandwerker}
          searchPlaceholder={tx('Handwerker suchen …')}
          emptyText={tx('Keine aktiven Handwerker gefunden')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedHandwerker ? (
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
              <IconUser size={16} />
              <span>
                {tx('Handwerker')}: <strong className="text-foreground">{`${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()}</strong>
              </span>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
            </div>
          )}
          <EntitySelectStep
            items={verfuegbareWerkzeuge.map(w => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? w.record_id,
              subtitle: [w.fields.inventarnummer, w.fields.standort].filter(Boolean).join(' · '),
              status: w.fields.zustand
                ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                : undefined,
              stats: w.fields.kategorie
                ? [{ label: tx('Kategorie'), value: w.fields.kategorie.label }]
                : [],
              icon: <IconTool size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectWerkzeug}
            searchPlaceholder={tx('Werkzeug suchen …')}
            emptyText={tx('Keine verfügbaren Werkzeuge gefunden')}
            emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
          />
        </div>
      )}

      {/* Step 3: Ausleihe bestätigen */}
      {step === 3 && (
        selectedHandwerker && selectedWerkzeug ? (
          <div className="space-y-6">
            {/* Summary of selections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-card p-4 space-y-1 overflow-hidden">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{tx('Handwerker')}</p>
                <p className="font-semibold truncate">{`${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()}</p>
                {selectedHandwerker.fields.personalnummer && (
                  <p className="text-sm text-muted-foreground truncate">{selectedHandwerker.fields.personalnummer}</p>
                )}
                {selectedHandwerker.fields.abteilung && (
                  <p className="text-sm text-muted-foreground truncate">{selectedHandwerker.fields.abteilung}</p>
                )}
              </div>
              <div className="rounded-2xl border bg-card p-4 space-y-1 overflow-hidden">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{tx('Werkzeug')}</p>
                <p className="font-semibold truncate">{selectedWerkzeug.fields.werkzeugname ?? ''}</p>
                {selectedWerkzeug.fields.inventarnummer && (
                  <p className="text-sm text-muted-foreground truncate">{selectedWerkzeug.fields.inventarnummer}</p>
                )}
                {selectedWerkzeug.fields.standort && (
                  <p className="text-sm text-muted-foreground truncate">{selectedWerkzeug.fields.standort}</p>
                )}
                {selectedWerkzeug.fields.zustand && (
                  <StatusBadge statusKey={selectedWerkzeug.fields.zustand.key} label={selectedWerkzeug.fields.zustand.label} />
                )}
              </div>
            </div>

            {/* Ausleihe form */}
            <div className="rounded-2xl border bg-card p-6 space-y-4 overflow-hidden">
              <h3 className="font-semibold">{tx('Ausleihdetails')}</h3>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {tx('Ausleihdatum')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={e => setAusleihdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tx('Geplantes Rückgabedatum')}</label>
                <Input
                  type="datetime-local"
                  value={geplantesRueckgabedatum}
                  onChange={e => setGeplantesRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tx('Bemerkungen')}</label>
                <Textarea
                  value={bemerkungenAusleihe}
                  onChange={e => setBemerkungenAusleihe(e.target.value)}
                  placeholder={tx('Optionale Bemerkungen zur Ausleihe …')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="w-full sm:w-auto"
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !ausleihdatum}
                className="w-full sm:w-auto"
              >
                {submitting ? tx('Wird angelegt …') : tx('Ausleihe anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolgsmeldung */}
      {step === 4 && (
        createdAusleiheId && selectedHandwerker && selectedWerkzeug ? (
          <div className="space-y-6 text-center py-8">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">{tx('Ausleihe erfolgreich angelegt')}</h3>
              <p className="text-muted-foreground">
                {tx('Das Werkzeug wurde erfolgreich ausgeliehen.')}
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6 text-left space-y-3 overflow-hidden mx-auto max-w-sm">
              <div className="flex items-center gap-3">
                <IconUser size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                  <p className="font-medium truncate">{`${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconTool size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                  <p className="font-medium truncate">{selectedWerkzeug.fields.werkzeugname ?? ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconCalendar size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Ausleihdatum')}</p>
                  <p className="font-medium">{ausleihdatum}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Neue Ausleihe anlegen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Keine abgeschlossene Ausleihe gefunden.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
