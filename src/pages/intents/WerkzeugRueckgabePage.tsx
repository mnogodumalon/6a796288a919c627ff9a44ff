/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard (optional nur 2 Schritte).
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe bestätigen → 3) Wartung/Reparatur anlegen (optional).
 * Reads: ausleihe (filter: status_ausleihe=ausgeliehen), werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  IconArrowBack,
  IconTool,
  IconCheck,
  IconUser,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Ausleihe } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { tx } from '@/i18n';

export default function WerkzeugRueckgabePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  // Step & selection state
  const initialStep = searchParams.get('ausleiheId') ? 2 : 1;
  const [step, setStep] = useState(initialStep);

  const [selectedAusleiheId, setSelectedAusleiheId] = useState<string | null>(
    searchParams.get('ausleiheId') ?? null
  );

  // Step 2 form state
  const nowFormatted = format(new Date(), "yyyy-MM-dd'T'HH:mm");
  const todayFormatted = format(new Date(), 'yyyy-MM-dd');
  const [tatsaechlichesRueckgabedatum, setTatsaechlichesRueckgabedatum] = useState(nowFormatted);
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');
  const [weiterZuWartung, setWeiterZuWartung] = useState(false);
  const [step2Submitting, setStep2Submitting] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 form state
  const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
  const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];
  const [vorgangsart, setVorgangsart] = useState(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(todayFormatted);
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung, setStatusWartung] = useState(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Derived data
  const offeneAusleihen = useMemo<Ausleihe[]>(
    () => ausleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [ausleihe]
  );

  const selectedAusleihe = useMemo(
    () => (selectedAusleiheId ? offeneAusleihen.find(a => a.record_id === selectedAusleiheId) ?? null : null),
    [selectedAusleiheId, offeneAusleihen]
  );

  const werkzeugId = useMemo(
    () => (selectedAusleihe ? extractRecordId(selectedAusleihe.fields.werkzeug) : null),
    [selectedAusleihe]
  );

  const selectedWerkzeug = useMemo(
    () => (werkzeugId ? werkzeuge.find(w => w.record_id === werkzeugId) ?? null : null),
    [werkzeugId, werkzeuge]
  );

  const handwerkerId = useMemo(
    () => (selectedAusleihe ? extractRecordId(selectedAusleihe.fields.handwerker) : null),
    [selectedAusleihe]
  );

  const selectedHandwerker = useMemo(
    () => (handwerkerId ? handwerker.find(h => h.record_id === handwerkerId) ?? null : null),
    [handwerkerId, handwerker]
  );

  const werkzeugName = selectedWerkzeug?.fields.werkzeugname ?? tx('Unbekanntes Werkzeug');
  const handwerkerName = selectedHandwerker
    ? `${selectedHandwerker.fields.vorname ?? ''} ${selectedHandwerker.fields.nachname ?? ''}`.trim()
    : tx('Unbekannter Handwerker');

  // Handlers
  function handleAusleiheSelect(id: string) {
    setSelectedAusleiheId(id);
    const params = new URLSearchParams(searchParams);
    params.set('ausleiheId', id);
    setSearchParams(params);
    setStep(2);
  }

  async function handleStep2Submit() {
    if (!selectedAusleiheId || !werkzeugId) return;
    setStep2Submitting(true);
    setStep2Error(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleiheId, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: tatsaechlichesRueckgabedatum,
        bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
      });

      if (weiterZuWartung) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'in_wartung' });
        await fetchAll();
        setStep(3);
      } else {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'verfuegbar' });
        await fetchAll();
        setDone(true);
        setStep(3);
      }
    } catch (err) {
      setStep2Error(err instanceof Error ? err.message : tx('Fehler beim Speichern.'));
    } finally {
      setStep2Submitting(false);
    }
  }

  async function handleStep3Submit() {
    if (!werkzeugId) return;
    setStep3Submitting(true);
    setStep3Error(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart,
        startdatum,
        geplantes_enddatum: geplanteEnddatum || undefined,
        verantwortlicher: verantwortlicherId
          ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
          : undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
      });

      if (vorgangsart === 'reparatur') {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, { zustand: 'in_reparatur' });
      }

      await fetchAll();
      setDone(true);
    } catch (err) {
      setStep3Error(err instanceof Error ? err.message : tx('Fehler beim Anlegen.'));
    } finally {
      setStep3Submitting(false);
    }
  }

  function handleReset() {
    setSelectedAusleiheId(null);
    setTatsaechlichesRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setBemerkungenAusleihe('');
    setWeiterZuWartung(false);
    setStep2Error(null);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setVerantwortlicherId('');
    setBeschreibung('');
    setStatusWartung(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
    setStep3Error(null);
    setDone(false);
    const params = new URLSearchParams();
    setSearchParams(params);
    setStep(1);
  }

  const wizardSteps = weiterZuWartung
    ? [{ label: tx('Ausleihe') }, { label: tx('Rückgabe') }, { label: tx('Wartung') }]
    : [{ label: tx('Ausleihe') }, { label: tx('Rückgabe') }, { label: tx('Fertig') }];

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Werkzeug übernehmen')}
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
          items={offeneAusleihen.map(a => {
            const wId = extractRecordId(a.fields.werkzeug);
            const hId = extractRecordId(a.fields.handwerker);
            const wName = wId ? (werkzeuge.find(w => w.record_id === wId)?.fields.werkzeugname ?? tx('Unbekannt')) : tx('Unbekannt');
            const hName = hId
              ? (() => {
                  const h = handwerker.find(h2 => h2.record_id === hId);
                  return h ? `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() : tx('Unbekannt');
                })()
              : tx('Unbekannt');
            return {
              id: a.record_id,
              title: wName,
              subtitle: `${tx('Ausgeliehen an')}: ${hName} · ${tx('Seit')}: ${formatDate(a.fields.ausleihdatum)}${a.fields.geplantes_rueckgabedatum ? ` · ${tx('Geplant bis')}: ${formatDate(a.fields.geplantes_rueckgabedatum)}` : ''}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" />,
            };
          })}
          onSelect={handleAusleiheSelect}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen vorhanden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Rückgabe bestätigen */}
      {step === 2 && (
        <>
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Context badges */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                  <IconTool size={14} />
                  {werkzeugName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                  <IconUser size={14} />
                  {handwerkerName}
                </span>
                <StatusBadge statusKey={selectedAusleihe.fields.status_ausleihe?.key} label={selectedAusleihe.fields.status_ausleihe?.label} />
              </div>

              {/* Form */}
              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                <div className="space-y-1">
                  <Label htmlFor="rueckgabedatum">{tx('Tatsächliches Rückgabedatum')}</Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={tatsaechlichesRueckgabedatum}
                    onChange={e => setTatsaechlichesRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungenAusleihe}
                    onChange={e => setBemerkungenAusleihe(e.target.value)}
                    placeholder={tx('Optionale Anmerkungen zur Rückgabe …')}
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-3 rounded-xl border p-3 bg-secondary/50">
                  <input
                    id="weiter-zu-wartung"
                    type="checkbox"
                    checked={weiterZuWartung}
                    onChange={e => setWeiterZuWartung(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="weiter-zu-wartung" className="cursor-pointer select-none">
                    {tx('Direkt Wartung/Reparatur anlegen?')}
                  </Label>
                </div>

                {step2Error && (
                  <p className="text-sm text-destructive">{step2Error}</p>
                )}

                <Button
                  className="w-full"
                  onClick={handleStep2Submit}
                  disabled={step2Submitting || !tatsaechlichesRueckgabedatum}
                >
                  {step2Submitting
                    ? tx('Wird gespeichert …')
                    : weiterZuWartung
                      ? tx('Rückgabe bestätigen & Wartung anlegen')
                      : tx('Rückgabe bestätigen')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Step 3: Wartung/Reparatur anlegen OR Success */}
      {step === 3 && (
        <>
          {/* Success state (no wartung) */}
          {done && !weiterZuWartung ? (
            <div className="text-center py-16 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{tx('Rückgabe abgeschlossen')}</h2>
                <p className="text-sm text-muted-foreground">
                  {werkzeugName} {tx('ist wieder verfügbar.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Button onClick={handleReset}>{tx('Weitere Rückgabe erfassen')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : done && weiterZuWartung ? (
            /* Success state after wartung was created */
            <div className="text-center py-16 space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{tx('Rückgabe & Vorgang angelegt')}</h2>
                <p className="text-sm text-muted-foreground">
                  {werkzeugName} {tx('wurde zurückgegeben und ein Wartungs-/Reparaturvorgang wurde erstellt.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                <Button onClick={handleReset}>{tx('Weitere Rückgabe erfassen')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tx('Zurück zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : !weiterZuWartung ? (
            /* Reached step 3 without going through step 2 (direct URL) */
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
            </div>
          ) : (
            /* Wartung/Reparatur anlegen form */
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Werkzeug badge */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm font-medium text-foreground">
                  <IconTool size={14} />
                  {werkzeugName}
                </span>
                <span className="text-sm text-muted-foreground">{tx('Vorgangsdetails eingeben')}</span>
              </div>

              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                {/* Vorgangsart */}
                <div className="space-y-2">
                  <Label>{tx('Art des Vorgangs')}</Label>
                  <div className="flex gap-2">
                    {VORGANGSART_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setVorgangsart(opt.key)}
                        className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-colors ${
                          vorgangsart === opt.key
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input bg-card text-foreground hover:bg-secondary'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Startdatum */}
                <div className="space-y-1">
                  <Label htmlFor="startdatum">{tx('Startdatum')} *</Label>
                  <Input
                    id="startdatum"
                    type="date"
                    value={startdatum}
                    onChange={e => setStartdatum(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>

                {/* Geplantes Enddatum */}
                <div className="space-y-1">
                  <Label htmlFor="geplantes-enddatum">{tx('Geplantes Enddatum')}</Label>
                  <Input
                    id="geplantes-enddatum"
                    type="date"
                    value={geplanteEnddatum}
                    onChange={e => setGeplanteEnddatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                {/* Verantwortlicher */}
                <div className="space-y-1">
                  <Label htmlFor="verantwortlicher">{tx('Verantwortlicher')}</Label>
                  <Select value={verantwortlicherId || 'none'} onValueChange={v => setVerantwortlicherId(v === 'none' ? '' : v)}>
                    <SelectTrigger id="verantwortlicher" className="w-full">
                      <SelectValue placeholder={tx('Handwerker wählen …')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('Keinen zuweisen')}</SelectItem>
                      {handwerker.map(h => (
                        <SelectItem key={h.record_id} value={h.record_id}>
                          {`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <Label htmlFor="status-wartung">{tx('Status')} *</Label>
                  <Select value={statusWartung} onValueChange={setStatusWartung}>
                    <SelectTrigger id="status-wartung" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_WARTUNG_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Beschreibung */}
                <div className="space-y-1">
                  <Label htmlFor="beschreibung">{tx('Beschreibung')}</Label>
                  <Textarea
                    id="beschreibung"
                    value={beschreibung}
                    onChange={e => setBeschreibung(e.target.value)}
                    placeholder={tx('Beschreibung des Vorgangs …')}
                    rows={3}
                  />
                </div>

                {step3Error && (
                  <p className="text-sm text-destructive">{step3Error}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="flex items-center gap-1"
                  >
                    <IconArrowBack size={16} />
                    {tx('Zurück')}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleStep3Submit}
                    disabled={step3Submitting || !startdatum || !vorgangsart || !statusWartung}
                  >
                    {step3Submitting ? tx('Wird angelegt …') : tx('Vorgang anlegen')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
