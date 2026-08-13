/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen (nur verfügbare) → 2) Handwerker wählen (nur aktive) → 3) Ausleihe bestätigen & anlegen.
 * Reads: werkzeuge, handwerker. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconTool, IconUser, IconClipboardCheck, IconCheck } from '@tabler/icons-react';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function WerkzeugAusleihenPage() {
  const { werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  // Step 1: only verfügbare Werkzeuge
  const verfuegbareWerkzeuge = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  // Step 2: only aktive Handwerker
  const aktiveHandwerker = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv'
  );

  const selectedWerkzeug = werkzeuge.find((w) => w.record_id === selectedWerkzeugId) ?? null;
  const selectedHandwerker = handwerker.find((h) => h.record_id === selectedHandwerkerId) ?? null;

  const handleSubmit = async () => {
    if (!selectedWerkzeugId || !selectedHandwerkerId || !ausleihdatum) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      let aid = ausleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Unbekannter Fehler'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedWerkzeugId(null);
    setSelectedHandwerkerId(null);
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
      subtitle={tx('Werkzeug einem Handwerker zuweisen')}
      steps={[
        { label: tx('Werkzeug') },
        { label: tx('Handwerker') },
        { label: tx('Bestätigen') },
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
            title: w.fields.werkzeugname ?? tx('Unbekanntes Werkzeug'),
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
          onSelect={(id) => {
            setSelectedWerkzeugId(id);
            setStep(2);
          }}
          searchPlaceholder={tx('Werkzeug suchen …')}
          emptyText={tx('Keine verfügbaren Werkzeuge gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Handwerker wählen */}
      {step === 2 && (
        selectedWerkzeugId ? (
          <div className="space-y-4">
            {selectedWerkzeug && (
              <div className="rounded-xl border bg-secondary p-3 flex items-center gap-3">
                <IconTool size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {selectedWerkzeug.fields.werkzeugname}
                  </p>
                  {selectedWerkzeug.fields.inventarnummer && (
                    <p className="text-xs text-muted-foreground">
                      {tx('Nr.')} {selectedWerkzeug.fields.inventarnummer}
                    </p>
                  )}
                </div>
                <StatusBadge
                  statusKey={selectedWerkzeug.fields.zustand?.key}
                  label={selectedWerkzeug.fields.zustand?.label}
                  className="ml-auto shrink-0"
                />
              </div>
            )}
            <EntitySelectStep
              items={aktiveHandwerker.map((h) => ({
                id: h.record_id,
                title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || tx('Unbekannter Handwerker'),
                subtitle: [
                  h.fields.personalnummer ? tx`Pers.-Nr. ${h.fields.personalnummer}` : null,
                  h.fields.abteilung ?? null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: h.fields.status
                  ? { key: h.fields.status.key, label: h.fields.status.label }
                  : undefined,
                stats: h.fields.qualifikation
                  ? [{ label: tx('Qualifikation'), value: h.fields.qualifikation.label }]
                  : [],
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedHandwerkerId(id);
                setStep(3);
              }}
              searchPlaceholder={tx('Handwerker suchen …')}
              emptyText={tx('Keine aktiven Handwerker gefunden')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
            />
          </div>
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
        selectedWerkzeugId && selectedHandwerkerId ? (
          done ? (
            <div className="flex flex-col items-center text-center py-12 space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-lg">
                  {tx('Ausleihe erfolgreich angelegt')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedWerkzeug?.fields.werkzeugname ?? ''}{' '}
                  {tx('wurde ausgeliehen an')}{' '}
                  {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button onClick={handleReset}>
                  {tx('Weitere Ausleihe anlegen')}
                </Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Context summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedWerkzeug && (
                  <div className="rounded-xl border bg-secondary p-3 flex items-center gap-3 overflow-hidden">
                    <IconTool size={18} className="text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Werkzeug')}</p>
                      <p className="text-sm font-medium truncate">
                        {selectedWerkzeug.fields.werkzeugname}
                      </p>
                    </div>
                  </div>
                )}
                {selectedHandwerker && (
                  <div className="rounded-xl border bg-secondary p-3 flex items-center gap-3 overflow-hidden">
                    <IconUser size={18} className="text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Handwerker')}</p>
                      <p className="text-sm font-medium truncate">
                        {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="rounded-2xl border p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <IconClipboardCheck size={18} className="text-primary" />
                  <h3 className="font-semibold">{tx('Ausleihdetails')}</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ausleihdatum">{tx('Ausleihdatum')} *</Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rueckgabedatum">{tx('Geplantes Rückgabedatum')}</Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
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

                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || !ausleihdatum}
                    className="sm:flex-1"
                  >
                    {submitting ? tx('Wird angelegt …') : tx('Ausleihe anlegen')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                  >
                    {tx('Zurück')}
                  </Button>
                </div>
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
