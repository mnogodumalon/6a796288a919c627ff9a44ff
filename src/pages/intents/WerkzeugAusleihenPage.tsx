/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status == 'aktiv') → 2) Werkzeug wählen (zustand == 'verfuegbar') → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconUser, IconTool, IconClipboardCheck, IconCheck } from '@tabler/icons-react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) return;
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
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setDone(false);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Handwerker und Werkzeug wählen, dann Ausleihe anlegen')}
      steps={[
        { label: tx('Handwerker') },
        { label: tx('Werkzeug') },
        { label: tx('Bestätigen') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map((h) => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [h.fields.abteilung, h.fields.qualifikation?.label]
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
          searchPlaceholder={tx('Handwerker suchen …')}
          emptyText={tx('Keine aktiven Handwerker gefunden')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map((w) => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? w.record_id,
            subtitle: [
              w.fields.inventarnummer ? tx`Nr. ${w.fields.inventarnummer}` : null,
              w.fields.kategorie?.label,
              w.fields.standort,
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
          searchPlaceholder={tx('Werkzeug suchen …')}
          emptyText={tx('Kein verfügbares Werkzeug gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 3: Ausleihe bestätigen */}
      {step === 3 && (
        <>
          {!selectedHandwerkerId || !selectedWerkzeugId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center py-12 space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold">{tx('Ausleihe erfolgreich angelegt')}</h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {tx('Das Werkzeug wurde als ausgeliehen markiert und die Ausleihe gespeichert.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button onClick={handleReset} variant="outline">
                  {tx('Neue Ausleihe anlegen')}
                </Button>
                <a href="#/">
                  <Button>{tx('Zurück zum Dashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Zusammenfassung */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-3 bg-secondary/40 border-b">
                  <h3 className="text-sm font-semibold text-foreground">
                    {tx('Zusammenfassung')}
                  </h3>
                </div>
                <div className="p-4 space-y-3">
                  {selectedHandwerker && (
                    <div className="flex items-start gap-3">
                      <IconUser size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                        <p className="font-medium truncate">
                          {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                            .filter(Boolean)
                            .join(' ')}
                        </p>
                        {selectedHandwerker.fields.abteilung && (
                          <p className="text-sm text-muted-foreground truncate">
                            {selectedHandwerker.fields.abteilung}
                          </p>
                        )}
                        {selectedHandwerker.fields.qualifikation && (
                          <StatusBadge
                            statusKey={selectedHandwerker.fields.qualifikation.key}
                            label={selectedHandwerker.fields.qualifikation.label}
                          />
                        )}
                      </div>
                    </div>
                  )}
                  {selectedWerkzeug && (
                    <div className="flex items-start gap-3">
                      <IconTool size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                        <p className="font-medium truncate">
                          {selectedWerkzeug.fields.werkzeugname ?? selectedWerkzeugId}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {[
                            selectedWerkzeug.fields.inventarnummer
                              ? tx`Nr. ${selectedWerkzeug.fields.inventarnummer}`
                              : null,
                            selectedWerkzeug.fields.kategorie?.label,
                            selectedWerkzeug.fields.standort,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Ausleihdaten */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-3 bg-secondary/40 border-b flex items-center gap-2">
                  <IconClipboardCheck size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {tx('Ausleihdetails')}
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      {tx('Ausleihdatum')} *
                    </label>
                    <Input
                      type="datetime-local"
                      value={ausleihdatum}
                      onChange={(e) => setAusleihdatum(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      {tx('Geplantes Rückgabedatum')}
                    </label>
                    <Input
                      type="datetime-local"
                      value={geplantesRueckgabedatum}
                      onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      {tx('Bemerkungen')}
                    </label>
                    <Textarea
                      value={bemerkungenAusleihe}
                      onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                      placeholder={tx('Optionale Hinweise zur Ausleihe …')}
                      className="w-full min-h-[80px]"
                    />
                  </div>
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2">
                  {submitError}
                </p>
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
                  className="w-full sm:flex-1"
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Ausleihe anlegen')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
