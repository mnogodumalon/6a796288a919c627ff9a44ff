/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe bestätigen → 3) Wartung/Reparatur melden (optional).
 * Reads: ausleihe (filter: status_ausleihe == 'ausgeliehen'), werkzeuge, handwerker.
 * Writes: updateAusleiheEntry (status_ausleihe, tatsaechliches_rueckgabedatum), updateWerkzeugeEntry (zustand),
 *         createWartungReparaturEntry (optional, wenn Schaden/Wartungsbedarf gemeldet).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format, differenceInDays, parseISO } from 'date-fns';
import {
  IconArrowRight,
  IconCheck,
  IconTool,
  IconAlertTriangle,
  IconRefresh,
  IconCircleCheck,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Ausleihe } from '@/types/app';
import { tx } from '@/i18n';

export default function WerkzeugRueckgabePage() {
  const WIZARD_STEPS = [
  { label: tx('Ausleihe wählen') },
  { label: tx('Rückgabe') },
  { label: tx('Wartung melden') },
];

  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<Ausleihe | null>(null);

  // Step 2 form state
  const [rueckgabedatum, setRueckgabedatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 3 state
  const [meldeSchaden, setMeldeSchaden] = useState(false);
  const [vorgangsart, setVorgangsart] = useState<'wartung' | 'reparatur'>('wartung');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung] = useState<'geplant'>('geplant');
  const [wartungSubmitting, setWartungSubmitting] = useState(false);
  const [wartungError, setWartungError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Filter: only ausgeliehen records
  const offeneAusleihen = ausleihe.filter(
    (a) => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  const werkzeugeMap = new Map(werkzeuge.map((w) => [w.record_id, w]));
  const handwerkerMap = new Map(handwerker.map((h) => [h.record_id, h]));

  function getWerkzeugName(a: Ausleihe): string {
    const wId = extractRecordId(a.fields.werkzeug);
    if (!wId) return tx('Unbekanntes Werkzeug');
    return werkzeugeMap.get(wId)?.fields.werkzeugname ?? tx('Unbekanntes Werkzeug');
  }

  function getHandwerkerName(a: Ausleihe): string {
    const hId = extractRecordId(a.fields.handwerker);
    if (!hId) return tx('Unbekannter Handwerker');
    const hw = handwerkerMap.get(hId);
    if (!hw) return tx('Unbekannter Handwerker');
    const { vorname, nachname } = hw.fields;
    return [vorname, nachname].filter(Boolean).join(' ') || tx('Unbekannter Handwerker');
  }

  function formatDatum(val: string | undefined): string {
    if (!val) return '—';
    try {
      return format(parseISO(val), 'dd.MM.yyyy HH:mm');
    } catch {
      return val;
    }
  }

  function getDauer(): number | null {
    if (!selectedAusleihe?.fields.ausleihdatum) return null;
    try {
      const start = parseISO(selectedAusleihe.fields.ausleihdatum);
      const end = parseISO(rueckgabedatum);
      return differenceInDays(end, start);
    } catch {
      return null;
    }
  }

  async function handleRueckgabe() {
    if (!selectedAusleihe) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: 'verfuegbar',
        });
      }
      await fetchAll();
      setStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWartungMelden() {
    if (!selectedAusleihe) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) {
      setWartungError(tx('Werkzeug-ID nicht gefunden'));
      return;
    }
    setWartungSubmitting(true);
    setWartungError(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart,
        startdatum,
        geplantes_enddatum: geplanteEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
      });
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: vorgangsart === 'wartung' ? 'in_wartung' : 'in_reparatur',
      });
      await fetchAll();
      setDone(true);
    } catch (err) {
      setWartungError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setWartungSubmitting(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setBemerkungen('');
    setSubmitError(null);
    setMeldeSchaden(false);
    setVorgangsart('wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setBeschreibung('');
    setWartungError(null);
    setDone(false);
  }

  const dauer = getDauer();

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Zustand dokumentieren')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map((a) => ({
            id: a.record_id,
            title: getWerkzeugName(a),
            subtitle: tx`Ausgeliehen von: ${getHandwerkerName(a)} · seit ${formatDatum(a.fields.ausleihdatum)}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            stats: [
              {
                label: tx('Geplante Rückgabe'),
                value: formatDatum(a.fields.geplantes_rueckgabedatum),
              },
            ],
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={(id) => {
            const found = offeneAusleihen.find((a) => a.record_id === id) ?? null;
            setSelectedAusleihe(found);
            setStep(2);
          }}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen vorhanden')}
          emptyIcon={<IconCheck size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Rückgabe bestätigen ── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Ausleihe-Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{getWerkzeugName(selectedAusleihe)}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {tx`Handwerker: ${getHandwerkerName(selectedAusleihe)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tx`Ausgeliehen am: ${formatDatum(selectedAusleihe.fields.ausleihdatum)}`}
                  </p>
                  {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                    <p className="text-sm text-muted-foreground">
                      {tx`Geplante Rückgabe: ${formatDatum(selectedAusleihe.fields.geplantes_rueckgabedatum)}`}
                    </p>
                  )}
                </div>
                <StatusBadge
                  statusKey={selectedAusleihe.fields.status_ausleihe?.key}
                  label={selectedAusleihe.fields.status_ausleihe?.label}
                />
              </div>
              {dauer !== null && (
                <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-foreground">
                  {tx`Ausleihdauer: ${dauer} ${dauer === 1 ? tx('Tag') : tx('Tage')}`}
                </div>
              )}
            </div>

            {/* Rückgabe-Formular */}
            <div className="space-y-4">
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
              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tx('Übergabe-Notiz (optional)')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  placeholder={tx('Zustand bei Rückgabe, Besonderheiten …')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto"
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleRueckgabe}
                disabled={submitting || !rueckgabedatum}
                className="w-full sm:w-auto flex items-center gap-2"
              >
                {submitting ? (
                  <IconRefresh size={16} stroke={1.5} className="animate-spin" />
                ) : (
                  <IconCheck size={16} stroke={1.5} />
                )}
                {submitting ? tx('Wird gespeichert …') : tx('Rückgabe bestätigen')}
              </Button>
            </div>
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

      {/* ── Step 3: Wartung/Reparatur melden ── */}
      {step === 3 && (
        selectedAusleihe ? (
          done ? (
            /* Erfolgsbildschirm */
            <div className="text-center py-12 space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-6">
                  <IconCircleCheck size={48} stroke={1.5} className="text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{tx('Alles erledigt!')}</h2>
                <p className="text-sm text-muted-foreground">
                  {meldeSchaden
                    ? tx('Rückgabe und Wartungs-/Reparaturmeldung wurden gespeichert.')
                    : tx('Die Rückgabe wurde erfolgreich abgeschlossen.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleReset} variant="outline" className="w-full sm:w-auto">
                  {tx('Weitere Rückgabe')}
                </Button>
                <a href="#/">
                  <Button className="w-full sm:w-auto">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Erfolgsmeldung Rückgabe */}
              <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
                <IconCheck size={20} stroke={1.5} className="text-primary shrink-0" />
                <p className="text-sm text-foreground">
                  {tx`Rückgabe von „${getWerkzeugName(selectedAusleihe)}" wurde gespeichert.`}
                </p>
              </div>

              {/* Toggle: Schaden/Wartungsbedarf */}
              <div className="rounded-2xl border bg-card p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <IconAlertTriangle size={20} stroke={1.5} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{tx('Schaden oder Wartungsbedarf melden?')}</p>
                    <p className="text-sm text-muted-foreground">{tx('Optional — kann auch übersprungen werden.')}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant={meldeSchaden ? 'default' : 'outline'}
                    onClick={() => setMeldeSchaden(true)}
                    className="w-full sm:w-auto flex items-center gap-2"
                  >
                    <IconAlertTriangle size={16} stroke={1.5} />
                    {tx('Ja, melden')}
                  </Button>
                  <Button
                    variant={!meldeSchaden ? 'default' : 'outline'}
                    onClick={() => {
                      setMeldeSchaden(false);
                      setDone(true);
                    }}
                    className="w-full sm:w-auto flex items-center gap-2"
                  >
                    <IconArrowRight size={16} stroke={1.5} />
                    {tx('Nein, überspringen')}
                  </Button>
                </div>
              </div>

              {/* Wartungs-/Reparatur-Mini-Formular */}
              {meldeSchaden && (
                <div className="rounded-2xl border bg-card p-4 space-y-4">
                  <h3 className="font-medium text-foreground">{tx('Vorgang anlegen')}</h3>

                  {/* Vorgangsart (radio-style tiles) */}
                  <div className="space-y-1.5">
                    <Label>{tx('Art des Vorgangs')}</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['wartung', 'reparatur'] as const).map((art) => (
                        <button
                          key={art}
                          type="button"
                          onClick={() => setVorgangsart(art)}
                          className={`rounded-xl border p-3 text-sm font-medium text-left transition-colors ${
                            vorgangsart === art
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-foreground hover:bg-secondary'
                          }`}
                        >
                          {art === 'wartung' ? tx('Wartung') : tx('Reparatur')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Startdatum */}
                  <div className="space-y-1.5">
                    <Label htmlFor="startdatum">{tx('Startdatum')}</Label>
                    <Input
                      id="startdatum"
                      type="date"
                      value={startdatum}
                      onChange={(e) => setStartdatum(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Geplantes Enddatum */}
                  <div className="space-y-1.5">
                    <Label htmlFor="geplanteEnddatum">{tx('Geplantes Enddatum (optional)')}</Label>
                    <Input
                      id="geplanteEnddatum"
                      type="date"
                      value={geplanteEnddatum}
                      onChange={(e) => setGeplanteEnddatum(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Beschreibung */}
                  <div className="space-y-1.5">
                    <Label htmlFor="beschreibung">{tx('Beschreibung (optional)')}</Label>
                    <Textarea
                      id="beschreibung"
                      value={beschreibung}
                      onChange={(e) => setBeschreibung(e.target.value)}
                      placeholder={tx('Art des Schadens oder der benötigten Wartung …')}
                      rows={3}
                      className="w-full"
                    />
                  </div>

                  {wartungError && (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                      {wartungError}
                    </div>
                  )}

                  <Button
                    onClick={handleWartungMelden}
                    disabled={wartungSubmitting || !startdatum}
                    className="w-full flex items-center gap-2"
                  >
                    {wartungSubmitting ? (
                      <IconRefresh size={16} stroke={1.5} className="animate-spin" />
                    ) : (
                      <IconCheck size={16} stroke={1.5} />
                    )}
                    {wartungSubmitting ? tx('Wird gespeichert …') : tx('Vorgang anlegen')}
                  </Button>
                </div>
              )}
            </div>
          )
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
