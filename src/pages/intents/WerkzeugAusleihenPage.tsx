/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status=aktiv) → 2) Werkzeug wählen (zustand=verfuegbar)
 *        → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { tx } from '@/i18n';
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
import {
  IconUser,
  IconTool,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

export default function WerkzeugAusleihenPage() {
  const WIZARD_STEPS = [
  { label: tx('Handwerker') },
  { label: tx('Werkzeug') },
  { label: tx('Bestätigen') },
];

  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  const nowFormatted = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const [ausleihdatum, setAusleihdatum] = useState(nowFormatted);
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  // Derived data
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

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setAusleiheId(null);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      // Idempotency guard: only create if not already created
      let aid = ausleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        aid = result.record_id;
        setAusleiheId(aid);
      }
      // Always update werkzeug status (idempotent)
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });
      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : tx('Unbekannter Fehler beim Speichern.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Schritt für Schritt zur Ausleihe')}
      steps={WIZARD_STEPS}
      currentStep={Math.min(step, 3)}
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
          emptyText={tx('Keine aktiven Handwerker gefunden.')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerkerId ? (
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
            emptyText={tx('Kein verfügbares Werkzeug gefunden.')}
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

      {/* Step 3: Ausleihe bestätigen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          <div className="space-y-6">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                {tx('Zusammenfassung')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary">
                  <IconUser size={18} className="text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                    <p className="font-medium truncate">
                      {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                    {selectedHandwerker?.fields.abteilung && (
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedHandwerker.fields.abteilung}
                      </p>
                    )}
                    {selectedHandwerker?.fields.qualifikation && (
                      <StatusBadge
                        statusKey={selectedHandwerker.fields.qualifikation.key}
                        label={selectedHandwerker.fields.qualifikation.label}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary">
                  <IconTool size={18} className="text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                    <p className="font-medium truncate">
                      {selectedWerkzeug?.fields.werkzeugname}
                    </p>
                    {selectedWerkzeug?.fields.inventarnummer && (
                      <p className="text-xs text-muted-foreground truncate">
                        {tx('Nr.')} {selectedWerkzeug.fields.inventarnummer}
                      </p>
                    )}
                    {selectedWerkzeug?.fields.kategorie && (
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedWerkzeug.fields.kategorie.label}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Mini-Formular */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                {tx('Ausleihdetails')}
              </h3>

              <div className="space-y-2">
                <Label htmlFor="ausleihdatum">
                  {tx('Ausleihdatum')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ausleihdatum"
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={(e) => setAusleihdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rueckgabedatum">
                  {tx('Geplantes Rückgabedatum')}
                </Label>
                <Input
                  id="rueckgabedatum"
                  type="datetime-local"
                  value={geplantesRueckgabedatum}
                  onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bemerkungen">
                  {tx('Bemerkungen')}
                </Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungenAusleihe}
                  onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                  placeholder={tx('Optionale Anmerkungen zur Ausleihe …')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
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
                {submitting ? tx('Wird gespeichert …') : tx('Ausleihe bestätigen')}
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
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={40} className="text-primary" stroke={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">
              {tx('Ausleihe erfolgreich angelegt!')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                .filter(Boolean)
                .join(' ')}{' '}
              {tx('hat')}{' '}
              <span className="font-medium">{selectedWerkzeug?.fields.werkzeugname}</span>{' '}
              {tx('ausgeliehen.')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tx('Weitere Ausleihe anlegen')}
            </Button>
            <a href="#/">
              <Button className="w-full">{tx('Zurück zum Dashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
