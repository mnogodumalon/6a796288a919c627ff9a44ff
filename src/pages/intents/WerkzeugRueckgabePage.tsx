/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard (Schritt 3 bedingt).
 * Steps: 1) Ausleihe wählen (nur status_ausleihe = 'ausgeliehen') →
 *        2) Rückgabe bestätigen (Datum, Zustand, Bemerkung) →
 *        3) Wartung / Reparatur anlegen (nur wenn Zustand in_wartung oder in_reparatur).
 * Reads: ausleihe, werkzeuge, handwerker. Writes: ausleihe (updateAusleiheEntry),
 *        werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconArrowRight,
  IconCheck,
  IconTool,
  IconAlertTriangle,
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
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Ausleihe, Handwerker } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import { tx } from '@/i18n';

type ZustandKey = 'verfuegbar' | 'in_wartung' | 'in_reparatur' | 'defekt';

const ZUSTAND_COLOR: Record<ZustandKey, string> = {
  verfuegbar: 'bg-green-50 border-green-200 text-green-800',
  in_wartung: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  in_reparatur: 'bg-orange-50 border-orange-200 text-orange-800',
  defekt: 'bg-red-50 border-red-200 text-red-800',
};

function enrichAusleihe(a: Ausleihe, handwerkerMap: Map<string, Handwerker>): EnrichedAusleihe {
  const hwId = a.fields.handwerker ? extractRecordId(a.fields.handwerker) : null;
  const hw = hwId ? handwerkerMap.get(hwId) : undefined;
  const hwName = hw ? `${hw.fields.vorname ?? ''} ${hw.fields.nachname ?? ''}`.trim() : (hwId ?? '');
  return {
    ...a,
    werkzeugName: '',
    handwerkerName: hwName,
  };
}

export default function WerkzeugRueckgabePage() {
  const ZUSTAND_OPTIONS: { key: ZustandKey; label: string; description: string }[] = [
  { key: 'verfuegbar', label: tx('Verfügbar'), description: tx('Werkzeug ist in einwandfreiem Zustand') },
  { key: 'in_wartung', label: tx('In Wartung'), description: tx('Wartung erforderlich → Wartungsauftrag anlegen') },
  { key: 'in_reparatur', label: tx('In Reparatur'), description: tx('Reparatur erforderlich → Reparaturauftrag anlegen') },
  { key: 'defekt', label: tx('Defekt'), description: tx('Werkzeug ist defekt') },
];

  const { ausleihe, werkzeuge, handwerker, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2
  const [rueckgabeDatum, setRueckgabeDatum] = useState('');
  const [selectedZustand, setSelectedZustand] = useState<ZustandKey>('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting2, setSubmitting2] = useState(false);
  const [error2, setError2] = useState<string | null>(null);

  // Step 3
  const [vorgangsart, setVorgangsart] = useState<'wartung' | 'reparatur'>('wartung');
  const [verantwortlicherId, setVerantwortlicherId] = useState<string>('');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [kosten, setKosten] = useState('');
  const [submitting3, setSubmitting3] = useState(false);
  const [error3, setError3] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [createdWartungId, setCreatedWartungId] = useState<string | null>(null);

  const offeneAusleihen = ausleihe.filter(
    a => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  const werkzeugeMap = new Map(werkzeuge.map(w => [w.record_id, w]));

  const aktiveHandwerker = handwerker.filter(h => h.fields.status?.key === 'aktiv');

  const getWerkzeugName = (a: Ausleihe) => {
    if (!a.fields.werkzeug) return '';
    const wId = extractRecordId(a.fields.werkzeug);
    if (!wId) return '';
    return werkzeugeMap.get(wId)?.fields.werkzeugname ?? '';
  };

  const handleSelectAusleihe = (id: string) => {
    const found = offeneAusleihen.find(a => a.record_id === id);
    if (!found) return;
    const enriched = enrichAusleihe(found, handwerkerMap);
    enriched.werkzeugName = getWerkzeugName(found);
    setSelectedAusleihe(enriched);
    setStep(2);
  };

  const handleRueckgabeBestaetigen = async () => {
    if (!selectedAusleihe || !rueckgabeDatum) return;
    setSubmitting2(true);
    setError2(null);
    try {
      const werkzeugId = selectedAusleihe.fields.werkzeug
        ? extractRecordId(selectedAusleihe.fields.werkzeug)
        : null;

      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: selectedZustand,
        });
      }

      await fetchAll();

      if (selectedZustand === 'in_wartung' || selectedZustand === 'in_reparatur') {
        setVorgangsart(selectedZustand === 'in_wartung' ? 'wartung' : 'reparatur');
        setStep(3);
      } else {
        setDone(true);
        setStep(4);
      }
    } catch (err) {
      setError2(err instanceof Error ? err.message : tx('Fehler bei der Rückgabe'));
    } finally {
      setSubmitting2(false);
    }
  };

  const handleWartungAnlegen = async () => {
    if (!selectedAusleihe || !startdatum) return;
    const werkzeugId = selectedAusleihe.fields.werkzeug
      ? extractRecordId(selectedAusleihe.fields.werkzeug)
      : null;
    if (!werkzeugId) return;

    setSubmitting3(true);
    setError3(null);

    try {
      let wid = createdWartungId;
      if (!wid) {
        const result = await LivingAppsService.createWartungReparaturEntry({
          werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
          vorgangsart: vorgangsart,
          verantwortlicher: verantwortlicherId
            ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
            : undefined,
          startdatum: startdatum,
          geplantes_enddatum: geplanteEnddatum || undefined,
          beschreibung: beschreibung || undefined,
          status_wartung: 'geplant',
          kosten: kosten ? Number(kosten) : undefined,
        });
        wid = result.record_id;
        setCreatedWartungId(wid);
      }

      await fetchAll();
      setDone(true);
      setStep(4);
    } catch (err) {
      setError3(err instanceof Error ? err.message : tx('Fehler beim Anlegen'));
    } finally {
      setSubmitting3(false);
    }
  };

  const handleReset = () => {
    setSelectedAusleihe(null);
    setRueckgabeDatum('');
    setSelectedZustand('verfuegbar');
    setBemerkungen('');
    setVorgangsart('wartung');
    setVerantwortlicherId('');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setBeschreibung('');
    setKosten('');
    setError2(null);
    setError3(null);
    setDone(false);
    setCreatedWartungId(null);
    setStep(1);
  };

  const needsWartung = selectedZustand === 'in_wartung' || selectedZustand === 'in_reparatur';

  const steps = needsWartung
    ? [
        { label: tx('Ausleihe wählen') },
        { label: tx('Rückgabe bestätigen') },
        { label: tx('Auftrag anlegen') },
        { label: tx('Fertig') },
      ]
    : [
        { label: tx('Ausleihe wählen') },
        { label: tx('Rückgabe bestätigen') },
        { label: tx('Fertig') },
      ];

  const effectiveStep = needsWartung ? step : step > 2 ? step - 1 : step;

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Zustand erfassen')}
      steps={steps}
      currentStep={effectiveStep}
      onStepChange={(s) => {
        const target = needsWartung ? s : s >= 3 ? s + 1 : s;
        if (target < step) setStep(target);
      }}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Ausleihe wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => {
            const wName = getWerkzeugName(a);
            const hwId = a.fields.handwerker ? extractRecordId(a.fields.handwerker) : null;
            const hw = hwId ? handwerkerMap.get(hwId) : undefined;
            const hwName = hw ? `${hw.fields.vorname ?? ''} ${hw.fields.nachname ?? ''}`.trim() : '';
            return {
              id: a.record_id,
              title: wName || tx('Unbekanntes Werkzeug'),
              subtitle: hwName ? `${tx('Handwerker')}: ${hwName}` : undefined,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              stats: [
                { label: tx('Ausgeliehen'), value: a.fields.ausleihdatum ? a.fields.ausleihdatum.slice(0, 10) : '—' },
                { label: tx('Geplante Rückgabe'), value: a.fields.geplantes_rueckgabedatum ? a.fields.geplantes_rueckgabedatum.slice(0, 10) : '—' },
              ],
              icon: <IconTool size={20} className="text-primary" />,
            };
          })}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Rückgabe bestätigen */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Kontext-Info */}
            <div className="rounded-2xl border bg-secondary/30 p-4 space-y-2">
              <p className="text-sm font-medium">{tx('Ausgewählte Ausleihe')}</p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedAusleihe.werkzeugName || tx('Werkzeug')}</span>
                {selectedAusleihe.handwerkerName && (
                  <span>{tx('Handwerker')}: {selectedAusleihe.handwerkerName}</span>
                )}
                {selectedAusleihe.fields.ausleihdatum && (
                  <span>{tx('Ausgeliehen')}: {selectedAusleihe.fields.ausleihdatum.slice(0, 10)}</span>
                )}
              </div>
            </div>

            {/* Rückgabedatum */}
            <div className="space-y-2">
              <Label htmlFor="rueckgabe-datum" className="font-medium">
                {tx('Tatsächliches Rückgabedatum')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rueckgabe-datum"
                type="datetime-local"
                value={rueckgabeDatum}
                onChange={e => setRueckgabeDatum(e.target.value)}
                className="w-full max-w-sm"
              />
            </div>

            {/* Zustand */}
            <div className="space-y-3">
              <Label className="font-medium">{tx('Zustand nach Rückgabe')} <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ZUSTAND_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedZustand(opt.key)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selectedZustand === opt.key
                        ? `${ZUSTAND_COLOR[opt.key]} ring-2 ring-offset-1 ring-current`
                        : 'bg-card hover:bg-secondary/40'
                    }`}
                  >
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
              {(selectedZustand === 'in_wartung' || selectedZustand === 'in_reparatur') && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                  <IconAlertTriangle size={16} />
                  <span>{tx('Im nächsten Schritt wird ein Wartungs-/Reparaturauftrag angelegt.')}</span>
                </div>
              )}
            </div>

            {/* Bemerkungen */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen" className="font-medium">{tx('Bemerkungen')} <span className="text-muted-foreground text-xs">{tx('(optional)')}</span></Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tx('Hinweise zur Rückgabe …')}
                rows={3}
                className="w-full"
              />
            </div>

            {error2 && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error2}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>{tx('Zurück')}</Button>
              <Button
                onClick={handleRueckgabeBestaetigen}
                disabled={!rueckgabeDatum || submitting2}
                className="flex-1"
              >
                {submitting2 ? tx('Wird gespeichert …') : (
                  (selectedZustand === 'in_wartung' || selectedZustand === 'in_reparatur')
                    ? <>{tx('Bestätigen & Auftrag anlegen')} <IconArrowRight size={16} className="ml-1" /></>
                    : <>{tx('Rückgabe abschließen')} <IconCheck size={16} className="ml-1" /></>
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

      {/* Step 3: Wartung / Reparatur anlegen (bedingt) */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Kontext */}
            <div className="rounded-2xl border bg-secondary/30 p-4 space-y-1">
              <p className="text-sm font-medium">{tx('Werkzeug')}: <span className="text-foreground">{selectedAusleihe.werkzeugName}</span></p>
              <p className="text-sm text-muted-foreground">
                {tx('Zustand')}: <StatusBadge statusKey={selectedZustand} label={ZUSTAND_OPTIONS.find(o => o.key === selectedZustand)?.label} />
              </p>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <Label className="font-medium">{tx('Vorgangsart')} <span className="text-destructive">*</span></Label>
              <div className="flex gap-3">
                {(LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? []).map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVorgangsart(opt.key as 'wartung' | 'reparatur')}
                    className={`flex-1 rounded-xl border p-3 text-center transition-all ${
                      vorgangsart === opt.key
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1'
                        : 'bg-card hover:bg-secondary/40'
                    }`}
                  >
                    <IconTool size={18} className="mx-auto mb-1" />
                    <p className="text-sm font-medium">{opt.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-2">
              <Label className="font-medium">{tx('Verantwortlicher')} <span className="text-muted-foreground text-xs">{tx('(optional)')}</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setVerantwortlicherId('')}
                  className={`rounded-xl border p-3 text-left transition-all text-sm ${
                    verantwortlicherId === ''
                      ? 'bg-primary/10 border-primary/40 font-medium'
                      : 'bg-card hover:bg-secondary/40'
                  }`}
                >
                  {tx('Kein Verantwortlicher')}
                </button>
                {aktiveHandwerker.map(hw => (
                  <button
                    key={hw.record_id}
                    type="button"
                    onClick={() => setVerantwortlicherId(hw.record_id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      verantwortlicherId === hw.record_id
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-card hover:bg-secondary/40'
                    }`}
                  >
                    <p className="text-sm font-medium">{`${hw.fields.vorname ?? ''} ${hw.fields.nachname ?? ''}`.trim() || hw.record_id}</p>
                    {hw.fields.qualifikation && (
                      <p className="text-xs text-muted-foreground">{hw.fields.qualifikation.label}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Startdatum */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startdatum" className="font-medium">
                  {tx('Startdatum')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="startdatum"
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="geplantes-enddatum" className="font-medium">
                  {tx('Geplantes Enddatum')} <span className="text-muted-foreground text-xs">{tx('(optional)')}</span>
                </Label>
                <Input
                  id="geplantes-enddatum"
                  type="date"
                  value={geplanteEnddatum}
                  onChange={e => setGeplanteEnddatum(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="beschreibung" className="font-medium">
                {tx('Beschreibung')} <span className="text-muted-foreground text-xs">{tx('(optional)')}</span>
              </Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tx('Beschreibung des Auftrags …')}
                rows={3}
                className="w-full"
              />
            </div>

            {/* Kosten */}
            <div className="space-y-2">
              <Label htmlFor="kosten" className="font-medium">
                {tx('Kosten (€)')} <span className="text-muted-foreground text-xs">{tx('(optional)')}</span>
              </Label>
              <Input
                id="kosten"
                type="number"
                min="0"
                step="0.01"
                value={kosten}
                onChange={e => setKosten(e.target.value)}
                placeholder="0,00"
                className="w-full max-w-xs"
              />
            </div>

            {error3 && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error3}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setDone(true);
                  setStep(4);
                }}
              >
                {tx('Überspringen')}
              </Button>
              <Button
                onClick={handleWartungAnlegen}
                disabled={!startdatum || submitting3}
                className="flex-1"
              >
                {submitting3 ? tx('Wird angelegt …') : (
                  <>{tx('Auftrag anlegen')} <IconCheck size={16} className="ml-1" /></>
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

      {/* Step 4: Erfolg */}
      {step === 4 && done && (
        <div className="text-center py-10 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={32} className="text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tx('Rückgabe erfolgreich')}</h2>
            {selectedAusleihe && (
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{selectedAusleihe.werkzeugName}</span>{' '}
                {tx('wurde zurückgegeben.')}
                {selectedZustand !== 'verfuegbar' && (
                  <> {tx('Zustand')}: <span className="font-medium">{ZUSTAND_OPTIONS.find(o => o.key === selectedZustand)?.label}</span>.</>
                )}
              </p>
            )}
            {createdWartungId && (
              <p className="text-sm text-muted-foreground">
                {tx('Wartungs-/Reparaturauftrag wurde angelegt.')} ({vorgangsart === 'wartung' ? tx('Wartung') : tx('Reparatur')},{' '}
                {tx('Start')}: {startdatum})
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="outline">
              {tx('Weitere Rückgabe erfassen')}
            </Button>
            <Button asChild>
              <a href="#/">{tx('Zurück zum Dashboard')}</a>
            </Button>
          </div>
        </div>
      )}

      {step === 4 && !done && (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die vorherigen Schritte.')}</p>
          <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
