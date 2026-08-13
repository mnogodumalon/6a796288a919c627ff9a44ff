/**
 * Wartung Abschließen — 2-Schritt-Wizard.
 * Steps: 1) Laufenden Vorgang wählen (status_wartung: geplant|in_bearbeitung)
 *        → 2) Abschlussdaten erfassen & speichern (update WartungReparatur + update Werkzeuge zustand).
 * Reads: wartungReparatur, werkzeuge (via useDashboardData + enrichWartungReparatur).
 * Writes: updateWartungReparaturEntry, updateWerkzeugeEntry.
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IconTool, IconCalendarCheck, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichWartungReparatur } from '@/lib/enrich';
import type { EnrichedWartungReparatur } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { tx } from '@/i18n';

const WARTUNG_STATUS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];
const WERKZEUG_ZUSTAND = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];

const ABSCHLUSS_STATUS_KEYS = ['abgeschlossen', 'abgebrochen'] as const;
const WERKZEUG_ZUSTAND_RESULT_KEYS = ['verfuegbar', 'defekt', 'ausgemustert'] as const;

export default function WartungAbschliessenPage() {
  const { wartungReparatur, werkzeuge, werkzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedVorgang, setSelectedVorgang] = useState<EnrichedWartungReparatur | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 2 form state
  const [tatsaechlichesEnddatum, setTatsaechlichesEnddatum] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [statusWartung, setStatusWartung] = useState<string>('abgeschlossen');
  const [kosten, setKosten] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [bemerkungenWartung, setBemerkungenWartung] = useState('');
  const [neuerWerkzeugZustand, setNeuerWerkzeugZustand] = useState<string>('verfuegbar');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const enrichedVorgaenge = useMemo(() => {
    const maps = { werkzeugeMap, handwerkerMap: new Map() };
    return enrichWartungReparatur(wartungReparatur, maps);
  }, [wartungReparatur, werkzeugeMap]);

  const eligibleVorgaenge = useMemo(() => {
    return enrichedVorgaenge.filter(v => {
      const key = v.fields.status_wartung?.key;
      return key === 'geplant' || key === 'in_bearbeitung';
    });
  }, [enrichedVorgaenge]);

  const handleSelectVorgang = (id: string) => {
    const vorgang = eligibleVorgaenge.find(v => v.record_id === id);
    if (!vorgang) return;
    setSelectedVorgang(vorgang);
    const werkzeugId = extractRecordId(vorgang.fields.werkzeug_wartung);
    setSelectedWerkzeugId(werkzeugId);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedVorgang) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const kostenNum = kosten.trim() !== '' ? parseFloat(kosten) : undefined;

      await LivingAppsService.updateWartungReparaturEntry(selectedVorgang.record_id, {
        tatsaechliches_enddatum: tatsaechlichesEnddatum,
        status_wartung: statusWartung,
        ...(kostenNum !== undefined && !isNaN(kostenNum) ? { kosten: kostenNum } : {}),
        ...(beschreibung.trim() ? { beschreibung: beschreibung.trim() } : {}),
        ...(bemerkungenWartung.trim() ? { bemerkungen_wartung: bemerkungenWartung.trim() } : {}),
      });

      if (selectedWerkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
          zustand: neuerWerkzeugZustand,
        });
      }

      await fetchAll();
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedVorgang(null);
    setSelectedWerkzeugId(null);
    setTatsaechlichesEnddatum(format(new Date(), 'yyyy-MM-dd'));
    setStatusWartung('abgeschlossen');
    setKosten('');
    setBeschreibung('');
    setBemerkungenWartung('');
    setNeuerWerkzeugZustand('verfuegbar');
    setSubmitError(null);
    setDone(false);
    setStep(1);
  };

  const selectedWerkzeug = selectedWerkzeugId
    ? werkzeuge.find(w => w.record_id === selectedWerkzeugId)
    : null;

  const abschlussStatusOptions = WARTUNG_STATUS.filter(o =>
    (ABSCHLUSS_STATUS_KEYS as readonly string[]).includes(o.key)
  );

  const werkzeugZustandOptions = WERKZEUG_ZUSTAND.filter(o =>
    (WERKZEUG_ZUSTAND_RESULT_KEYS as readonly string[]).includes(o.key)
  );

  return (
    <IntentWizardShell
      title={tx('Wartung/Reparatur abschließen')}
      subtitle={tx('Vorgang auswählen, Abschlussdaten erfassen und Werkzeugstatus wiederherstellen')}
      steps={[
        { label: tx('Vorgang wählen') },
        { label: tx('Abschluss erfassen') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select Vorgang */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleVorgaenge.map(v => ({
            id: v.record_id,
            title: `${v.fields.vorgangsart?.label ?? tx('Vorgang')} — ${v.werkzeug_wartungName || tx('Kein Werkzeug')}`,
            subtitle: [
              v.fields.startdatum ? `${tx('Start')}: ${formatDate(v.fields.startdatum)}` : null,
              v.fields.geplantes_enddatum ? `${tx('Geplant bis')}: ${formatDate(v.fields.geplantes_enddatum)}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: v.fields.status_wartung
              ? { key: v.fields.status_wartung.key, label: v.fields.status_wartung.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectVorgang}
          searchPlaceholder={tx('Vorgang suchen …')}
          emptyText={tx('Keine laufenden Vorgänge gefunden')}
          emptyIcon={<IconCalendarCheck size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Abschluss erfassen */}
      {step === 2 && (
        selectedVorgang ? (
          <div className="space-y-6">
            {/* Context card */}
            <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary shrink-0" stroke={1.5} />
                <p className="font-semibold text-foreground truncate">
                  {selectedVorgang.fields.vorgangsart?.label ?? tx('Vorgang')}
                  {selectedVorgang.werkzeug_wartungName
                    ? ` — ${selectedVorgang.werkzeug_wartungName}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {selectedVorgang.fields.startdatum && (
                  <span>{tx('Start')}: {formatDate(selectedVorgang.fields.startdatum)}</span>
                )}
                {selectedVorgang.fields.status_wartung && (
                  <StatusBadge
                    statusKey={selectedVorgang.fields.status_wartung.key}
                    label={selectedVorgang.fields.status_wartung.label}
                  />
                )}
              </div>
            </div>

            {done ? (
              <div className="rounded-2xl border bg-card p-6 text-center space-y-4 overflow-hidden">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-3">
                    <IconCheck size={28} className="text-primary" stroke={1.5} />
                  </div>
                </div>
                <p className="font-semibold text-foreground">{tx('Vorgang erfolgreich abgeschlossen')}</p>
                {selectedWerkzeug && (
                  <p className="text-sm text-muted-foreground">
                    {tx('Werkzeug')}{' '}
                    <span className="font-medium">{selectedWerkzeug.fields.werkzeugname}</span>{' '}
                    {tx('wurde als')}{' '}
                    <span className="font-medium">
                      {werkzeugZustandOptions.find(o => o.key === neuerWerkzeugZustand)?.label ?? neuerWerkzeugZustand}
                    </span>{' '}
                    {tx('markiert')}.
                  </p>
                )}
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                  <Button variant="outline" onClick={handleReset}>
                    {tx('Weiteren Vorgang abschließen')}
                  </Button>
                  <Button asChild>
                    <a href="#/">{tx('Zurück zum Dashboard')}</a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                <h3 className="font-semibold text-foreground">{tx('Abschlussdaten')}</h3>

                {/* tatsaechliches_enddatum */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Tatsächliches Enddatum')}
                  </label>
                  <Input
                    type="date"
                    value={tatsaechlichesEnddatum}
                    onChange={e => setTatsaechlichesEnddatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* status_wartung */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Abschlussstatus')}
                  </label>
                  <Select value={statusWartung} onValueChange={setStatusWartung}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {abschlussStatusOptions.map(o => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* kosten */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Kosten (optional)')}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={kosten}
                    onChange={e => setKosten(e.target.value)}
                    placeholder="0.00"
                    className="w-full"
                  />
                </div>

                {/* beschreibung */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Beschreibung (optional)')}
                  </label>
                  <textarea
                    value={beschreibung}
                    onChange={e => setBeschreibung(e.target.value)}
                    placeholder={tx('Durchgeführte Arbeiten …')}
                    rows={3}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                {/* bemerkungen_wartung */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Bemerkungen (optional)')}
                  </label>
                  <textarea
                    value={bemerkungenWartung}
                    onChange={e => setBemerkungenWartung(e.target.value)}
                    placeholder={tx('Weitere Hinweise …')}
                    rows={2}
                    className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>

                {/* Werkzeug Zustand */}
                {selectedWerkzeugId && (
                  <div className="space-y-1 rounded-xl border border-dashed p-4 bg-secondary/40">
                    <label className="text-sm font-medium text-foreground flex items-center gap-2">
                      <IconTool size={15} stroke={1.5} />
                      {tx('Neuer Werkzeugzustand')}
                      {selectedWerkzeug && (
                        <span className="text-muted-foreground font-normal">
                          ({selectedWerkzeug.fields.werkzeugname})
                        </span>
                      )}
                    </label>
                    <Select value={neuerWerkzeugZustand} onValueChange={setNeuerWerkzeugZustand}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {werkzeugZustandOptions.map(o => (
                          <SelectItem key={o.key} value={o.key}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {submitError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <IconAlertCircle size={16} className="shrink-0 mt-0.5" stroke={1.5} />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
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
                    disabled={submitting || !tatsaechlichesEnddatum}
                    className="w-full sm:w-auto"
                  >
                    {submitting
                      ? tx('Wird gespeichert …')
                      : tx('Abschließen')}
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
