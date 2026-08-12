/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status=aktiv) → 2) Werkzeug wählen (zustand=verfuegbar)
 *        → 3) Ausleihe bestätigen & anlegen (createAusleiheEntry + updateWerkzeugeEntry).
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
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
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';

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
  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    h => h.fields.status?.key === 'aktiv'
  );

  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    w => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = selectedHandwerkerId
    ? (handwerker as Handwerker[]).find(h => h.record_id === selectedHandwerkerId) ?? null
    : null;

  const selectedWerkzeug = selectedWerkzeugId
    ? (werkzeuge as Werkzeuge[]).find(w => w.record_id === selectedWerkzeugId) ?? null
    : null;

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum || !geplantesRueckgabedatum) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      let aid = ausleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        aid = result.record_id;
        setAusleiheId(aid);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Ein Fehler ist aufgetreten.'));
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
    setBemerkungen('');
    setSubmitError(null);
    setDone(false);
    setAusleiheId(null);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 p-8">
        <div className="rounded-full bg-green-100 p-4">
          <IconCheck size={40} className="text-green-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">{tx('Ausleihe erfolgreich angelegt')}</h2>
          <p className="text-muted-foreground">
            {tx('Das Werkzeug wurde ausgeliehen und der Status aktualisiert.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleReset} variant="outline">
            {tx('Neue Ausleihe anlegen')}
          </Button>
          <Button asChild>
            <a href="#/">{tx('Zurück zum Dashboard')}</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Handwerker und Werkzeug auswählen, Ausleihe bestätigen')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map(h => ({
            id: h.record_id,
            title: `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim(),
            subtitle: [h.fields.personalnummer, h.fields.abteilung].filter(Boolean).join(' · '),
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

      {/* Schritt 2: Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerkerId ? (
          <EntitySelectStep
            items={verfuegbareWerkzeuge.map(w => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? '',
              subtitle: [w.fields.inventarnummer, w.fields.kategorie?.label, w.fields.standort]
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

      {/* Schritt 3: Ausleihe bestätigen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          <div className="space-y-6">
            {/* Zusammenfassung der Auswahl */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tx('Handwerker')}
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <IconUser size={18} className="text-primary shrink-0" />
                  <p className="font-medium truncate">
                    {`${selectedHandwerker?.fields.vorname ?? ''} ${selectedHandwerker?.fields.nachname ?? ''}`.trim()}
                  </p>
                </div>
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tx('Werkzeug')}
                </p>
                <div className="flex items-center gap-2 min-w-0">
                  <IconTool size={18} className="text-primary shrink-0" />
                  <p className="font-medium truncate">
                    {selectedWerkzeug?.fields.werkzeugname ?? ''}
                  </p>
                </div>
                {selectedWerkzeug?.fields.inventarnummer && (
                  <p className="text-sm text-muted-foreground truncate">
                    {selectedWerkzeug.fields.inventarnummer}
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

            {/* Ausleih-Formular */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
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
                <label className="text-sm font-medium">
                  {tx('Geplantes Rückgabedatum')} <span className="text-destructive">*</span>
                </label>
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
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Hinweise zur Ausleihe …')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !ausleihdatum || !geplantesRueckgabedatum}
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
    </IntentWizardShell>
  );
}
