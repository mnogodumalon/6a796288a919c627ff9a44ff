/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe erfassen (Zustand, Datum, Bemerkung) →
 *        3) Wartung/Reparatur einleiten (optional, nur wenn Zustand 'in_reparatur' oder 'defekt').
 * Reads: ausleihe (filter status_ausleihe=ausgeliehen), handwerker, werkzeuge.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry, optional).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IconArrowRight, IconCheck, IconTool, IconAlertTriangle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, handwerkerMap, werkzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2 form state
  const [rueckgabedatum, setRueckgabedatum] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [zustand, setZustand] = useState<'verfuegbar' | 'in_reparatur' | 'defekt'>('verfuegbar');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');
  const [submitting2, setSubmitting2] = useState(false);
  const [errorMsg2, setErrorMsg2] = useState<string | null>(null);

  // Step 3 form state
  const [vorgangsart, setVorgangsart] = useState<string>('');
  const [selectedVerantwortlicherId, setSelectedVerantwortlicherId] = useState<string>('');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [submitting3, setSubmitting3] = useState(false);
  const [errorMsg3, setErrorMsg3] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  const offeneAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihen.find(a => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);
    setStep(2);
  }

  async function handleSubmitRueckgabe() {
    if (!selectedAusleihe) return;
    setSubmitting2(true);
    setErrorMsg2(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum || undefined,
        bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
      });

      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustand,
        });
      }

      await fetchAll();

      if (zustand === 'in_reparatur' || zustand === 'defekt') {
        // Pre-select vorgangsart based on zustand
        setVorgangsart(zustand === 'defekt' ? 'reparatur' : 'wartung');
        setStep(3);
      } else {
        setDone(true);
        setStep(3);
      }
    } catch (err) {
      setErrorMsg2(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting2(false);
    }
  }

  async function handleSubmitWartung() {
    if (!selectedAusleihe) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) return;
    setSubmitting3(true);
    setErrorMsg3(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart: vorgangsart || 'wartung',
        verantwortlicher: selectedVerantwortlicherId
          ? createRecordUrl(APP_IDS.HANDWERKER, selectedVerantwortlicherId)
          : undefined,
        startdatum: startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: 'geplant',
      });
      await fetchAll();
      setDone(true);
    } catch (err) {
      setErrorMsg3(err instanceof Error ? err.message : tx('Fehler beim Anlegen'));
    } finally {
      setSubmitting3(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustand('verfuegbar');
    setBemerkungenAusleihe('');
    setErrorMsg2(null);
    setVorgangsart('');
    setSelectedVerantwortlicherId('');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setErrorMsg3(null);
    setDone(false);
  }

  const needsWartung = zustand === 'in_reparatur' || zustand === 'defekt';

  const wizardSteps = needsWartung
    ? [{ label: tx('Ausleihe wählen') }, { label: tx('Rückgabe erfassen') }, { label: tx('Wartung einleiten') }]
    : [{ label: tx('Ausleihe wählen') }, { label: tx('Rückgabe erfassen') }, { label: tx('Abschluss') }];

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Werkzeugzustand erfassen')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Ausleihe wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
            subtitle: [
              a.handwerkerName,
              a.fields.ausleihdatum ? tx('seit') + ' ' + a.fields.ausleihdatum.substring(0, 10) : '',
              a.fields.geplantes_rueckgabedatum ? tx('Rückgabe geplant: ') + a.fields.geplantes_rueckgabedatum.substring(0, 10) : '',
            ].filter(Boolean).join(' · '),
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen gefunden')}
        />
      )}

      {/* Step 2: Rückgabe erfassen */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Context card */}
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" />
                <span className="font-semibold text-foreground truncate">{selectedAusleihe.werkzeugName}</span>
                <StatusBadge statusKey={selectedAusleihe.fields.status_ausleihe?.key} label={selectedAusleihe.fields.status_ausleihe?.label} />
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedAusleihe.handwerkerName && <span>{tx('Ausgeliehen von: ')}{selectedAusleihe.handwerkerName}</span>}
                {selectedAusleihe.fields.ausleihdatum && (
                  <span className="ml-3">{tx('Seit: ')}{selectedAusleihe.fields.ausleihdatum.substring(0, 10)}</span>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{tx('Tatsächliches Rückgabedatum')}</Label>
                <Input
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={e => setRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{tx('Zustand nach Rückgabe')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    { key: 'verfuegbar', label: tx('Verfügbar'), icon: <IconCheck size={16} />, color: 'border-green-500 bg-green-50 text-green-700' },
                    { key: 'in_reparatur', label: tx('In Reparatur'), icon: <IconTool size={16} />, color: 'border-amber-500 bg-amber-50 text-amber-700' },
                    { key: 'defekt', label: tx('Defekt'), icon: <IconAlertTriangle size={16} />, color: 'border-red-500 bg-red-50 text-red-700' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setZustand(opt.key)}
                      className={`flex items-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                        zustand === opt.key ? opt.color + ' border-2' : 'border-border bg-card text-foreground hover:bg-secondary'
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{tx('Bemerkungen')}</Label>
                <Textarea
                  value={bemerkungenAusleihe}
                  onChange={e => setBemerkungenAusleihe(e.target.value)}
                  placeholder={tx('Optionale Anmerkungen zur Rückgabe …')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {errorMsg2 && (
              <p className="text-sm text-destructive">{errorMsg2}</p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Zurück')}</Button>
              <Button onClick={handleSubmitRueckgabe} disabled={submitting2} className="flex-1">
                {submitting2 ? tx('Wird gespeichert …') : (
                  <>
                    {needsWartung ? tx('Rückgabe speichern & Wartung einleiten') : tx('Rückgabe abschließen')}
                    <IconArrowRight size={16} className="ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Wartung/Reparatur einleiten ODER Abschluss */}
      {step === 3 && (
        selectedAusleihe ? (
          done && !needsWartung ? (
            /* Success — no maintenance needed */
            <div className="text-center py-12 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <IconCheck size={28} className="text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">{tx('Rückgabe erfolgreich')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {tx('Das Werkzeug wurde als verfügbar markiert und die Ausleihe abgeschlossen.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>{tx('Weitere Rückgabe erfassen')}</Button>
                <a href="#/" className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                  {tx('Zurück zum Dashboard')}
                </a>
              </div>
            </div>
          ) : done ? (
            /* Success — maintenance created */
            <div className="text-center py-12 space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <IconCheck size={28} className="text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">{tx('Rückgabe & Wartungsvorgang angelegt')}</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {tx('Die Ausleihe wurde abgeschlossen und ein Wartungs-/Reparaturauftrag eingerichtet.')}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>{tx('Weitere Rückgabe erfassen')}</Button>
                <a href="#/" className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                  {tx('Zurück zum Dashboard')}
                </a>
              </div>
            </div>
          ) : (
            /* Wartung/Reparatur form */
            <div className="space-y-6">
              {/* Summary card */}
              <div className="rounded-2xl border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <IconTool size={18} className="text-primary" />
                  <span className="font-semibold text-foreground truncate">{selectedAusleihe.werkzeugName}</span>
                  <StatusBadge statusKey={zustand} label={zustand === 'in_reparatur' ? tx('In Reparatur') : tx('Defekt')} />
                </div>
                {selectedAusleihe.handwerkerName && (
                  <p className="text-sm text-muted-foreground">{tx('Zurückgegeben von: ')}{selectedAusleihe.handwerkerName}</p>
                )}
              </div>

              {/* Vorgangsart tiles */}
              <div className="space-y-1.5">
                <Label>{tx('Vorgangsart')} *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                        vorgangsart === opt.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verantwortlicher */}
              <div className="space-y-1.5">
                <Label>{tx('Verantwortlicher Handwerker')}</Label>
                <select
                  value={selectedVerantwortlicherId}
                  onChange={e => setSelectedVerantwortlicherId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{tx('— Keiner ausgewählt —')}</option>
                  {handwerker.map(h => (
                    <option key={h.record_id} value={h.record_id}>
                      {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Startdatum */}
              <div className="space-y-1.5">
                <Label>{tx('Startdatum')} *</Label>
                <Input
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Geplantes Enddatum */}
              <div className="space-y-1.5">
                <Label>{tx('Geplantes Enddatum')}</Label>
                <Input
                  type="date"
                  value={geplantesEnddatum}
                  onChange={e => setGeplantesEnddatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Beschreibung */}
              <div className="space-y-1.5">
                <Label>{tx('Beschreibung')}</Label>
                <Textarea
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tx('Was soll gemacht werden? …')}
                  rows={3}
                  className="w-full"
                />
              </div>

              {errorMsg3 && (
                <p className="text-sm text-destructive">{errorMsg3}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDone(true);
                  }}
                >
                  {tx('Überspringen')}
                </Button>
                <Button
                  onClick={handleSubmitWartung}
                  disabled={submitting3 || !vorgangsart || !startdatum}
                  className="flex-1"
                >
                  {submitting3 ? tx('Wird angelegt …') : (
                    <>
                      {tx('Wartung/Reparatur anlegen')}
                      <IconArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
