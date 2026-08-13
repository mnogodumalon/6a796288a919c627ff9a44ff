/**
 * Werkzeug-Rückgabe — 2-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe erfassen & optional Wartung/Reparatur auslösen.
 * Reads: ausleihe (gefiltert auf status_ausleihe='ausgeliehen'), werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry, optional).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IconArrowRight, IconCheck, IconTool, IconAlertTriangle } from '@tabler/icons-react';

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];

export default function WerkzeugRueckgabePage() {
  const { ausleihe, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string>('');

  // Step 2 form state
  const [rueckgabedatum, setRueckgabedatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [werkzeugZustandKey, setWerkzeugZustandKey] = useState(
    ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar'
  );
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const offeneAusleihen = (ausleihe as EnrichedAusleihe[]).filter(
    (a) => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihen.find((a) => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);
    const wId = found.fields.werkzeug ? extractRecordId(found.fields.werkzeug) : '';
    setSelectedWerkzeugId(wId ?? '');
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setWerkzeugZustandKey(ZUSTAND_OPTIONS.find((o) => o.key === 'verfuegbar')?.key ?? ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
    setBemerkungen('');
    setSubmitError(null);
    setStep(2);
  }

  async function handleSubmit() {
    if (!selectedAusleihe || !selectedWerkzeugId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: werkzeugZustandKey,
      });

      if (werkzeugZustandKey === 'in_wartung' || werkzeugZustandKey === 'in_reparatur') {
        await LivingAppsService.createWartungReparaturEntry({
          werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          vorgangsart: werkzeugZustandKey === 'in_wartung' ? 'wartung' : 'reparatur',
          startdatum: format(new Date(), 'yyyy-MM-dd'),
          status_wartung: 'geplant',
        });
      }

      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedAusleihe(null);
    setSelectedWerkzeugId('');
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setWerkzeugZustandKey(ZUSTAND_OPTIONS.find((o) => o.key === 'verfuegbar')?.key ?? ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
    setBemerkungen('');
    setSubmitError(null);
    setDone(false);
    setStep(1);
  }

  const triggersMaintenance = werkzeugZustandKey === 'in_wartung' || werkzeugZustandKey === 'in_reparatur';

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Werkzeugzustand aktualisieren')}
      steps={[{ label: tx('Ausleihe wählen') }, { label: tx('Rückgabe erfassen') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map((a) => ({
            id: a.record_id,
            title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
            subtitle: `${tx('Ausgeliehen von')}: ${a.handwerkerName || tx('Unbekannt')}${a.fields.ausleihdatum ? ` · ${a.fields.ausleihdatum.slice(0, 10)}` : ''}${a.fields.geplantes_rueckgabedatum ? ` → ${a.fields.geplantes_rueckgabedatum.slice(0, 10)}` : ''}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Rückgabe erfassen ── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg">
            {/* Kontext-Karte */}
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" stroke={1.5} />
                <span className="font-semibold text-foreground">
                  {selectedAusleihe.werkzeugName || tx('Werkzeug')}
                </span>
                {selectedAusleihe.fields.status_ausleihe && (
                  <StatusBadge
                    statusKey={selectedAusleihe.fields.status_ausleihe.key}
                    label={selectedAusleihe.fields.status_ausleihe.label}
                  />
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <div>{tx('Handwerker')}: <span className="text-foreground">{selectedAusleihe.handwerkerName || '—'}</span></div>
                {selectedAusleihe.fields.ausleihdatum && (
                  <div>{tx('Ausgeliehen am')}: <span className="text-foreground">{selectedAusleihe.fields.ausleihdatum.slice(0, 10)}</span></div>
                )}
                {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                  <div>{tx('Geplante Rückgabe')}: <span className="text-foreground">{selectedAusleihe.fields.geplantes_rueckgabedatum.slice(0, 10)}</span></div>
                )}
              </div>
            </div>

            {done ? (
              /* Erfolgszustand */
              <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
                <div className="flex justify-center">
                  <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
                    <IconCheck size={28} className="text-primary" stroke={2} />
                  </span>
                </div>
                <h2 className="font-semibold text-lg text-foreground">
                  {tx('Rückgabe erfasst')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {triggersMaintenance
                    ? tx('Das Werkzeug wurde zurückgegeben und ein Wartungs-/Reparaturauftrag angelegt.')
                    : tx('Das Werkzeug wurde erfolgreich zurückgegeben.')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
                    {tx('Weitere Rückgabe erfassen')}
                  </Button>
                  <a href="#/" className="w-full sm:w-auto">
                    <Button className="w-full">{tx('Zurück zum Dashboard')}</Button>
                  </a>
                </div>
              </div>
            ) : (
              /* Formular */
              <div className="rounded-2xl border bg-card p-5 space-y-5">
                <h3 className="font-semibold text-foreground">{tx('Rückgabe erfassen')}</h3>

                {/* Tatsächliches Rückgabedatum */}
                <div className="space-y-1.5">
                  <Label htmlFor="rueckgabedatum">{tx('Tatsächliches Rückgabedatum')}</Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={rueckgabedatum}
                    onChange={(e) => setRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Werkzeugzustand */}
                <div className="space-y-2">
                  <Label>{tx('Werkzeugzustand nach Rückgabe')}</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ZUSTAND_OPTIONS.filter((o) =>
                      ['verfuegbar', 'defekt', 'in_wartung', 'in_reparatur'].includes(o.key)
                    ).map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setWerkzeugZustandKey(option.key)}
                        className={[
                          'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors text-left',
                          werkzeugZustandKey === option.key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-secondary text-foreground hover:border-primary/50',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {triggersMaintenance && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mt-1">
                      <IconAlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" stroke={2} />
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        {tx('Es wird automatisch ein Wartungs-/Reparaturauftrag mit Status „Geplant" angelegt.')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Bemerkungen */}
                <div className="space-y-1.5">
                  <Label htmlFor="bemerkungen">{tx('Bemerkungen (optional)')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tx('Zustand, Schäden, Hinweise …')}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>

                {submitError && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    {submitError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    {tx('Zurück')}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting || !rueckgabedatum}
                    className="w-full sm:w-auto sm:ml-auto"
                  >
                    {submitting ? tx('Wird gespeichert …') : (
                      <span className="flex items-center gap-1.5">
                        {tx('Rückgabe bestätigen')}
                        <IconArrowRight size={16} stroke={2} />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}
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
    </IntentWizardShell>
  );
}
