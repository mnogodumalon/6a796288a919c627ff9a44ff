/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (status_ausleihe = 'ausgeliehen') →
 *        2) Rückgabe bestätigen & Zustand prüfen →
 *        3) Wartung / Reparatur anlegen (nur bei Bedarf).
 * Reads: ausleihe (enriched), handwerker, werkzeuge.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartungReparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  IconArrowRight,
  IconCheck,
  IconTool,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';

import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tx } from '@/i18n';

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const ZUSTAND_RELEVANT = ['verfuegbar', 'in_reparatur', 'in_wartung', 'defekt'] as const;
type RelevantZustand = typeof ZUSTAND_RELEVANT[number];

const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];

function needsFollowUp(zustand: string): zustand is 'in_reparatur' | 'in_wartung' | 'defekt' {
  return zustand === 'in_reparatur' || zustand === 'in_wartung' || zustand === 'defekt';
}

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2 form state
  const [rueckgabedatum, setRueckgabedatum] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [zustandKey, setZustandKey] = useState<RelevantZustand>('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting2, setSubmitting2] = useState(false);
  const [error2, setError2] = useState<string | null>(null);

  // Step 3 form state
  const [vorgangsart, setVorgangsart] = useState<string>(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [geplantesDatum, setGeplantesDatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState<string>('none');
  const [submitting3, setSubmitting3] = useState(false);
  const [error3, setError3] = useState<string | null>(null);

  // Idempotency guard for step 3
  const [wartungId, setWartungId] = useState<string | null>(null);

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  const offeneAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => h.fields.status?.key === 'aktiv'),
    [handwerker]
  );

  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihen.find(a => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);
    setStep(2);
  }

  async function handleRueckgabe() {
    if (!selectedAusleihe) return;
    setSubmitting2(true);
    setError2(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey,
        });
      }

      await fetchAll();

      if (needsFollowUp(zustandKey)) {
        setStep(3);
      } else {
        setStep(4);
      }
    } catch (err) {
      setError2(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting2(false);
    }
  }

  async function handleWartungAnlegen() {
    if (!selectedAusleihe) return;
    setSubmitting3(true);
    setError3(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      let pid = wartungId;
      if (!pid) {
        const result = await LivingAppsService.createWartungReparaturEntry({
          werkzeug_wartung: werkzeugId ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId) : undefined,
          vorgangsart: vorgangsart,
          startdatum: startdatum,
          geplantes_enddatum: geplantesDatum || undefined,
          beschreibung: beschreibung || undefined,
          verantwortlicher: verantwortlicherId && verantwortlicherId !== 'none'
            ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
            : undefined,
          status_wartung: 'geplant',
        });
        pid = result.record_id;
        setWartungId(pid);
      }

      await fetchAll();
      setStep(4);
    } catch (err) {
      setError3(err instanceof Error ? err.message : tx('Fehler beim Anlegen'));
    } finally {
      setSubmitting3(false);
    }
  }

  function handleReset() {
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey('verfuegbar');
    setBemerkungen('');
    setError2(null);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesDatum('');
    setBeschreibung('');
    setVerantwortlicherId('none');
    setError3(null);
    setWartungId(null);
    setStep(1);
  }

  const werkzeugNameForStep3 = selectedAusleihe?.werkzeugName ?? '';

  const zustandLabel = ZUSTAND_OPTIONS.find(o => o.key === zustandKey)?.label ?? zustandKey;
  const vorgangsartLabel = VORGANGSART_OPTIONS.find(o => o.key === vorgangsart)?.label ?? vorgangsart;

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Zustand dokumentieren')}
      steps={[
        { label: tx('Ausleihe wählen') },
        { label: tx('Rückgabe bestätigen') },
        { label: tx('Wartung / Reparatur') },
        { label: tx('Fertig') },
      ]}
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
            title: a.werkzeugName || tx('(Werkzeug unbekannt)'),
            subtitle: `${tx('Handwerker')}: ${a.handwerkerName || '—'} · ${tx('Ausgeliehen')}: ${a.fields.ausleihdatum ?? '—'}`,
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

      {/* Step 2: Rückgabe bestätigen */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Context card */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{tx('Werkzeug')}</p>
              <p className="text-lg font-semibold">{selectedAusleihe.werkzeugName}</p>
              <p className="text-sm text-muted-foreground">
                {tx('Handwerker')}: {selectedAusleihe.handwerkerName || '—'}
              </p>
              {selectedAusleihe.fields.ausleihdatum && (
                <p className="text-sm text-muted-foreground">
                  {tx('Ausgeliehen am')}: {selectedAusleihe.fields.ausleihdatum}
                </p>
              )}
            </div>

            {/* Rückgabeformular */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rueckgabedatum">{tx('Tatsächliches Rückgabedatum')} *</Label>
                <Input
                  id="rueckgabedatum"
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={e => setRueckgabedatum(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="zustand">{tx('Zustand bei Rückgabe')}</Label>
                <Select value={zustandKey} onValueChange={v => setZustandKey(v as RelevantZustand)}>
                  <SelectTrigger id="zustand" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZUSTAND_RELEVANT.map(key => {
                      const opt = ZUSTAND_OPTIONS.find(o => o.key === key);
                      return (
                        <SelectItem key={key} value={key}>
                          {opt?.label ?? key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {needsFollowUp(zustandKey) && (
                  <p className="text-xs text-amber-600">
                    {tx('Im nächsten Schritt kannst du einen Wartungs- oder Reparaturvorgang anlegen.')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Anmerkungen zur Rückgabe …')}
                  rows={3}
                />
              </div>
            </div>

            {error2 && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">{error2}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting2}>
                {tx('Zurück')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleRueckgabe}
                disabled={submitting2 || !rueckgabedatum}
              >
                {submitting2 ? tx('Wird gespeichert …') : (
                  <>
                    {needsFollowUp(zustandKey)
                      ? tx('Bestätigen & Vorgang anlegen')
                      : tx('Rückgabe abschließen')}
                    <IconArrowRight size={16} className="ml-2" stroke={1.5} />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte wähle zuerst eine Ausleihe aus.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Wartung / Reparatur anlegen */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Live-Feedback-Karte */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{tx('Werkzeug')}</p>
              <p className="text-lg font-semibold">{werkzeugNameForStep3}</p>
              <p className="text-sm text-muted-foreground">
                {tx('Zustand')}: <span className="font-medium">{zustandLabel}</span>
              </p>
              {vorgangsart && (
                <p className="text-sm text-muted-foreground">
                  {tx('Vorgangsart')}: <span className="font-medium">{vorgangsartLabel}</span>
                </p>
              )}
            </div>

            <div className="space-y-4">
              {/* Vorgangsart als Radio-Kacheln */}
              <div className="space-y-1.5">
                <Label>{tx('Vorgangsart')} *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        vorgangsart === opt.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card hover:bg-secondary/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <IconTool size={18} stroke={1.5} />
                        <span className="font-medium text-sm">{opt.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="startdatum">{tx('Startdatum')} *</Label>
                <Input
                  id="startdatum"
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="geplantesDatum">{tx('Geplantes Enddatum')}</Label>
                <Input
                  id="geplantesDatum"
                  type="date"
                  value={geplantesDatum}
                  onChange={e => setGeplantesDatum(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="beschreibung">{tx('Beschreibung')}</Label>
                <Textarea
                  id="beschreibung"
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tx('Beschreibung des Vorgangs …')}
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="verantwortlicher">{tx('Verantwortlicher')}</Label>
                <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                  <SelectTrigger id="verantwortlicher" className="w-full">
                    <SelectValue placeholder={tx('Handwerker wählen (optional)')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tx('Kein Verantwortlicher')}</SelectItem>
                    {aktiveHandwerker.map(h => (
                      <SelectItem key={h.record_id} value={h.record_id}>
                        {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error3 && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">{error3}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting3}>
                {tx('Zurück')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleWartungAnlegen}
                disabled={submitting3 || !vorgangsart || !startdatum}
              >
                {submitting3 ? tx('Wird angelegt …') : (
                  <>
                    {tx('Vorgang anlegen')}
                    <IconArrowRight size={16} className="ml-2" stroke={1.5} />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte starte den Prozess von vorne.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Fertig */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <IconCheck size={32} className="text-primary" stroke={2} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tx('Rückgabe abgeschlossen')}</h2>
            {selectedAusleihe && (
              <p className="text-muted-foreground">
                <span className="font-medium">{selectedAusleihe.werkzeugName}</span>{' '}
                {tx('wurde erfolgreich zurückgegeben.')}
              </p>
            )}
            {zustandKey && needsFollowUp(zustandKey) && wartungId && (
              <p className="text-sm text-muted-foreground">
                {tx('Ein Vorgang vom Typ')}{' '}
                <span className="font-medium">{vorgangsartLabel}</span>{' '}
                {tx('wurde angelegt.')}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tx('Weitere Rückgabe erfassen')}
            </Button>
            <a href="#/">
              <Button>{tx('Zurück zum Dashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
