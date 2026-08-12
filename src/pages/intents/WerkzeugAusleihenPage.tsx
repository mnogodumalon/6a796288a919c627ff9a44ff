/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (aktiv) → 2) Werkzeug wählen (verfügbar) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { IconUser, IconTool, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { tx } from '@/i18n';

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);

  const nowFormatted = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const [ausleihdatum, setAusleihdatum] = useState(nowFormatted);
  const [geplanteRueckgabe, setGeplanteRueckgabe] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const aktiveHandwerker = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv',
  );

  const verfuegbareWerkzeuge = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar',
  );

  const handleSubmit = async () => {
    if (!selectedHandwerker || !selectedWerkzeug || !ausleihdatum) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      let aid = ausleiheId;
      if (!aid) {
        const ausleihe = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeug.record_id),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerker.record_id),
          ausleihdatum,
          geplantes_rueckgabedatum: geplanteRueckgabe || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        aid = ausleihe.record_id;
        setAusleiheId(aid);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeug.record_id, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setDone(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerker(null);
    setSelectedWerkzeug(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplanteRueckgabe('');
    setBemerkungen('');
    setSubmitting(false);
    setSubmitError(null);
    setAusleiheId(null);
    setDone(false);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Werkzeug in 3 Schritten an einen Handwerker ausleihen')}
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
            subtitle: [h.fields.personalnummer, h.fields.abteilung].filter(Boolean).join(' · '),
            status: h.fields.qualifikation
              ? { key: h.fields.qualifikation.key, label: h.fields.qualifikation.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            const h = handwerker.find((x) => x.record_id === id) ?? null;
            setSelectedHandwerker(h);
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
            subtitle: [w.fields.inventarnummer, w.fields.standort].filter(Boolean).join(' · '),
            status: w.fields.zustand
              ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
              : undefined,
            stats: w.fields.kategorie
              ? [{ label: tx('Kategorie'), value: w.fields.kategorie.label }]
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            const w = werkzeuge.find((x) => x.record_id === id) ?? null;
            setSelectedWerkzeug(w);
            setStep(3);
          }}
          searchPlaceholder={tx('Werkzeug suchen …')}
          emptyText={tx('Keine verfügbaren Werkzeuge gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 3: Ausleihe bestätigen */}
      {step === 3 && (
        <>
          {!selectedHandwerker || !selectedWerkzeug ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          ) : done ? (
            <div className="text-center py-12 space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-4">
                  <IconCheck size={32} className="text-green-600" />
                </div>
              </div>
              <h3 className="text-lg font-semibold">{tx('Ausleihe erfolgreich angelegt')}</h3>
              <p className="text-sm text-muted-foreground">
                {tx('Das Werkzeug wurde erfolgreich ausgeliehen und der Status aktualisiert.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>{tx('Weitere Ausleihe anlegen')}</Button>
                <a href="#/">
                  <Button variant="outline">{tx('Zurück zum Dashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Zusammenfassungskarte */}
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  {tx('Ausgewählte Daten')}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <IconUser size={20} className="text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                      <p className="font-medium truncate">
                        {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      {selectedHandwerker.fields.personalnummer && (
                        <p className="text-xs text-muted-foreground">
                          {selectedHandwerker.fields.personalnummer}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <IconTool size={20} className="text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                      <p className="font-medium truncate">
                        {selectedWerkzeug.fields.werkzeugname}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {selectedWerkzeug.fields.zustand && (
                          <StatusBadge
                            statusKey={selectedWerkzeug.fields.zustand.key}
                            label={selectedWerkzeug.fields.zustand.label}
                          />
                        )}
                        {selectedWerkzeug.fields.inventarnummer && (
                          <span className="text-xs text-muted-foreground">
                            {selectedWerkzeug.fields.inventarnummer}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Formularfelder */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ausleihdatum">
                    {tx('Ausleihdatum')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rueckgabedatum">
                    {tx('Geplantes Rückgabedatum')}
                  </Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={geplanteRueckgabe}
                    onChange={(e) => setGeplanteRueckgabe(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tx('Optionale Hinweise zur Ausleihe …')}
                    rows={3}
                  />
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                  <IconAlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{submitError}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Ausleihe bestätigen')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
