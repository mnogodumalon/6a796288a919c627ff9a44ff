/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen (nur zustand=verfuegbar) → 2) Handwerker wählen (nur status=aktiv) → 3) Ausleihe bestätigen & anlegen.
 * Reads: werkzeuge, handwerker. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconTool, IconUser, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Werkzeuge, Handwerker } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';

export default function WerkzeugAusleihenPage() {
  const { werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [geplanteRueckgabe, setGeplanteRueckgabe] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);
  const [successWerkzeugName, setSuccessWerkzeugName] = useState('');
  const [successHandwerkerName, setSuccessHandwerkerName] = useState('');

  // Filtered lists
  const verfuegbareWerkzeuge = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );
  const aktiveHandwerker = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv'
  );

  const handleWerkzeugSelect = (id: string) => {
    const found = verfuegbareWerkzeuge.find((w) => w.record_id === id) ?? null;
    setSelectedWerkzeug(found);
    setStep(2);
  };

  const handleHandwerkerSelect = (id: string) => {
    const found = aktiveHandwerker.find((h) => h.record_id === id) ?? null;
    setSelectedHandwerker(found);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedWerkzeug || !selectedHandwerker) return;
    setSubmitting(true);
    setSubmitError(null);

    // Idempotency guard: if we already created the ausleihe record, skip re-creating
    let ausleiheId = createdAusleiheId;
    try {
      if (!ausleiheId) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeug.record_id),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerker.record_id),
          ausleihdatum,
          geplantes_rueckgabedatum: geplanteRueckgabe || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        ausleiheId = result.record_id;
        setCreatedAusleiheId(ausleiheId);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeug.record_id, {
        zustand: 'ausgeliehen',
      });

      setSuccessWerkzeugName(selectedWerkzeug.fields.werkzeugname ?? selectedWerkzeug.record_id);
      setSuccessHandwerkerName(
        `${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()
      );
      await fetchAll();
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedWerkzeug(null);
    setSelectedHandwerker(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplanteRueckgabe('');
    setBemerkungen('');
    setSubmitting(false);
    setSubmitError(null);
    setCreatedAusleiheId(null);
    setSuccessWerkzeugName('');
    setSuccessHandwerkerName('');
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Werkzeug und Handwerker in 3 Schritten zuordnen')}
      steps={[
        { label: tx('Werkzeug') },
        { label: tx('Handwerker') },
        { label: tx('Bestätigen') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Werkzeug wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map((w) => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? w.record_id,
            subtitle: [
              w.fields.inventarnummer ? tx`Nr. ${w.fields.inventarnummer}` : null,
              w.fields.standort ?? null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: w.fields.zustand
              ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
              : undefined,
            stats: w.fields.kategorie
              ? [{ label: tx('Kategorie'), value: w.fields.kategorie.label }]
              : [],
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleWerkzeugSelect}
          searchPlaceholder={tx('Werkzeug suchen …')}
          emptyText={tx('Keine verfügbaren Werkzeuge gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Handwerker wählen */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedWerkzeug && (
            <div className="rounded-xl border bg-secondary/40 px-4 py-3 flex items-center gap-3 text-sm overflow-hidden">
              <IconTool size={16} className="text-primary shrink-0" />
              <span className="font-medium truncate">{selectedWerkzeug.fields.werkzeugname}</span>
              {selectedWerkzeug.fields.zustand && (
                <StatusBadge
                  statusKey={selectedWerkzeug.fields.zustand.key}
                  label={selectedWerkzeug.fields.zustand.label}
                />
              )}
            </div>
          )}
          <EntitySelectStep
            items={aktiveHandwerker.map((h) => ({
              id: h.record_id,
              title: `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || h.record_id,
              subtitle: [
                h.fields.abteilung ?? null,
                h.fields.qualifikation?.label ?? null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: h.fields.status
                ? { key: h.fields.status.key, label: h.fields.status.label }
                : undefined,
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={handleHandwerkerSelect}
            searchPlaceholder={tx('Handwerker suchen …')}
            emptyText={tx('Keine aktiven Handwerker gefunden')}
            emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          />
        </div>
      )}

      {/* Step 3: Ausleihe bestätigen & anlegen */}
      {step === 3 && (
        selectedWerkzeug && selectedHandwerker ? (
          <div className="space-y-6">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-secondary/30">
                <p className="text-sm font-semibold text-foreground">{tx('Ausleihe-Zusammenfassung')}</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center gap-3 px-4 py-3">
                  <IconTool size={18} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                    <p className="font-medium truncate">{selectedWerkzeug.fields.werkzeugname}</p>
                    {selectedWerkzeug.fields.inventarnummer && (
                      <p className="text-xs text-muted-foreground">{tx('Inventar-Nr.')}: {selectedWerkzeug.fields.inventarnummer}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <IconUser size={18} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                    <p className="font-medium truncate">
                      {`${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()}
                    </p>
                    {selectedHandwerker.fields.abteilung && (
                      <p className="text-xs text-muted-foreground">{selectedHandwerker.fields.abteilung}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mini-Formular */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden p-4 space-y-4">
              <p className="text-sm font-semibold text-foreground">{tx('Ausleih-Details')}</p>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{tx('Ausleihdatum')} *</label>
                <Input
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={(e) => setAusleihdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{tx('Geplante Rückgabe')}</label>
                <Input
                  type="datetime-local"
                  value={geplanteRueckgabe}
                  onChange={(e) => setGeplanteRueckgabe(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{tx('Bemerkungen')}</label>
                <Textarea
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Anmerkungen zur Ausleihe …')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 flex items-start gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="w-full sm:w-auto"
                disabled={submitting}
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !ausleihdatum}
                className="w-full sm:flex-1"
              >
                {submitting ? tx('Wird angelegt …') : tx('Ausleihe anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <IconCheck size={32} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{tx('Ausleihe erfolgreich angelegt')}</h2>
            <p className="text-sm text-muted-foreground">
              {tx('Das Werkzeug')} <span className="font-medium text-foreground">{successWerkzeugName}</span>{' '}
              {tx('wurde an')} <span className="font-medium text-foreground">{successHandwerkerName}</span>{' '}
              {tx('ausgeliehen.')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tx('Weitere Ausleihe anlegen')}
            </Button>
            <Button asChild>
              <a href="#/">{tx('Zurück zum Dashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
