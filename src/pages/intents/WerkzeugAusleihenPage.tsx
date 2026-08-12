/**
 * Werkzeug ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (nur aktive) → 2) Werkzeug wählen (nur verfügbare) → 3) Ausleihe anlegen & bestätigen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconUser,
  IconTool,
  IconCircleCheck,
  IconCalendar,
  IconMapPin,
  IconAlertCircle,
} from '@tabler/icons-react';

export default function WerkzeugAusleihenPage() {
  const WIZARD_STEPS = [
  { label: tx('Handwerker') },
  { label: tx('Werkzeug') },
  { label: tx('Ausleihe') },
];

  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  );
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  const activeHandwerker = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv',
  );

  const verfuegbareWerkzeuge = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar',
  );

  const handleSelectHandwerker = (id: string) => {
    const found = handwerker.find((h) => h.record_id === id) ?? null;
    setSelectedHandwerker(found);
    setStep(2);
  };

  const handleSelectWerkzeug = (id: string) => {
    const found = werkzeuge.find((w) => w.record_id === id) ?? null;
    setSelectedWerkzeug(found);
    setStep(3);
  };

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
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
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
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerker(null);
    setSelectedWerkzeug(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplantesRueckgabedatum('');
    setBemerkungen('');
    setDone(false);
    setAusleiheId(null);
    setSubmitError(null);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Werkzeug in 3 Schritten an einen Handwerker ausleihen')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={activeHandwerker.map((h) => ({
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
          onSelect={handleSelectHandwerker}
          searchPlaceholder={tx('Handwerker suchen …')}
          emptyText={tx('Keine aktiven Handwerker gefunden')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerker ? (
          <EntitySelectStep
            items={verfuegbareWerkzeuge.map((w) => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? w.record_id,
              subtitle: [
                w.fields.inventarnummer ? tx`Nr. ${w.fields.inventarnummer}` : null,
                w.fields.kategorie?.label,
                w.fields.standort ? `${tx('Standort')}: ${w.fields.standort}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: w.fields.zustand
                ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" />,
              stats: w.fields.standort
                ? [{ label: tx('Standort'), value: w.fields.standort }]
                : undefined,
            }))}
            onSelect={handleSelectWerkzeug}
            searchPlaceholder={tx('Werkzeug suchen …')}
            emptyText={tx('Keine verfügbaren Werkzeuge gefunden')}
            emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
          />
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Ausleihe anlegen */}
      {step === 3 && (
        selectedHandwerker && selectedWerkzeug ? (
          done ? (
            /* Erfolgszustand */
            <div className="flex flex-col items-center gap-6 py-10">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
                <IconCircleCheck size={36} className="text-green-600 dark:text-green-400" stroke={1.5} />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">{tx('Ausleihe gespeichert')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Das Werkzeug wurde erfolgreich ausgeliehen.')}
                </p>
              </div>

              {/* Zusammenfassung */}
              <div className="w-full max-w-md rounded-2xl border bg-card p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <IconUser size={18} className="mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                    <p className="font-medium truncate">
                      {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IconTool size={18} className="mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                    <p className="font-medium truncate">
                      {selectedWerkzeug.fields.werkzeugname}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IconCalendar size={18} className="mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Ausleihdatum')}</p>
                    <p className="font-medium">{ausleihdatum.replace('T', ' ')}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <Button className="flex-1" onClick={handleReset}>
                  {tx('Neue Ausleihe anlegen')}
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            /* Formular */
            <div className="space-y-6">
              {/* Kontext-Zusammenfassung */}
              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tx('Ausleihe für')}
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <IconUser size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <IconTool size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {selectedWerkzeug.fields.werkzeugname}
                    </span>
                  </div>
                  {selectedWerkzeug.fields.standort && (
                    <div className="flex items-center gap-2 min-w-0">
                      <IconMapPin size={16} className="text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">
                        {selectedWerkzeug.fields.standort}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Felder */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ausleihdatum">
                    {tx('Ausleihdatum')}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rueckgabe">
                    {tx('Geplantes Rückgabedatum')}
                    <span className="text-muted-foreground text-xs ml-2">
                      {tx('(optional)')}
                    </span>
                  </Label>
                  <Input
                    id="rueckgabe"
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bemerkungen">
                    {tx('Bemerkungen')}
                    <span className="text-muted-foreground text-xs ml-2">
                      {tx('(optional)')}
                    </span>
                  </Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tx('Hinweise zur Ausleihe …')}
                    rows={3}
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
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                  className="flex-1"
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Ausleihe anlegen')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  {tx('Zurück')}
                </Button>
              </div>
            </div>
          )
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
    </IntentWizardShell>
  );
}
