/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe & Zustand bestätigen → 3) Optional Folgeauftrag anlegen.
 * Reads: ausleihe (filter: status_ausleihe = 'ausgeliehen'), werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { IconTool, IconArrowRight, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Ausleihe } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

const FOLLOW_UP_ZUSTAENDE = new Set(['in_reparatur', 'in_wartung', 'defekt']);

function needsFollowUp(zustandKey: string): boolean {
  return FOLLOW_UP_ZUSTAENDE.has(zustandKey);
}

function prefillVorgangsart(zustandKey: string): string {
  if (zustandKey === 'defekt' || zustandKey === 'in_reparatur') return 'reparatur';
  return 'wartung';
}

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<Ausleihe | null>(null);

  // Step 2 state
  const [rueckgabedatum, setRueckgabedatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [zustandKey, setZustandKey] = useState(ZUSTAND_OPTIONS[0]?.key ?? '');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submittingStep2, setSubmittingStep2] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 state
  const [vorgangsart, setVorgangsart] = useState('reparatur');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung, setStatusWartung] = useState(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
  const [submittingStep3, setSubmittingStep3] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [folgeauftragId, setFolgeauftragId] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const offeneAusleihen = ausleihe.filter(
    (a) => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  const werkzeugMap = new Map(werkzeuge.map((w) => [w.record_id, w]));
  const handwerkerMap = new Map(handwerker.map((h) => [h.record_id, h]));

  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihen.find((a) => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    if (found) {
      setZustandKey(ZUSTAND_OPTIONS[0]?.key ?? '');
      setBemerkungen('');
      setStep2Error(null);
      setStep(2);
    }
  }

  async function handleRueckgabe() {
    if (!selectedAusleihe) return;
    setSubmittingStep2(true);
    setStep2Error(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        status_ausleihe: 'zurueckgegeben',
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
        setVorgangsart(prefillVorgangsart(zustandKey));
        setStartdatum(format(new Date(), 'yyyy-MM-dd'));
        setGeplanteEnddatum('');
        setBeschreibung('');
        setStatusWartung(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
        setFolgeauftragId(null);
        setStep3Error(null);
        setStep(3);
      } else {
        setDone(true);
        setStep(3);
      }
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmittingStep2(false);
    }
  }

  async function handleFolgeauftrag() {
    if (!selectedAusleihe) return;
    setSubmittingStep3(true);
    setStep3Error(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      let pid = folgeauftragId;
      if (!pid) {
        const result = await LivingAppsService.createWartungReparaturEntry({
          werkzeug_wartung: werkzeugId
            ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId)
            : undefined,
          vorgangsart,
          startdatum,
          geplantes_enddatum: geplanteEnddatum || undefined,
          beschreibung: beschreibung || undefined,
          status_wartung: statusWartung,
        });
        pid = result.record_id;
        setFolgeauftragId(pid);
      }
      await fetchAll();
      setDone(true);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : tx('Fehler beim Anlegen'));
    } finally {
      setSubmittingStep3(false);
    }
  }

  function handleReset() {
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey(ZUSTAND_OPTIONS[0]?.key ?? '');
    setBemerkungen('');
    setStep2Error(null);
    setVorgangsart('reparatur');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setBeschreibung('');
    setStatusWartung(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
    setFolgeauftragId(null);
    setDone(false);
    setStep(1);
  }

  const wizardSteps = [
    { label: tx('Ausleihe wählen') },
    { label: tx('Rückgabe & Zustand') },
    { label: tx('Folgeauftrag') },
  ];

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Rückgabe bestätigen und optional Wartungs- oder Reparaturauftrag anlegen')}
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
          items={offeneAusleihen.map((a) => {
            const wId = extractRecordId(a.fields.werkzeug);
            const hId = extractRecordId(a.fields.handwerker);
            const w = wId ? werkzeugMap.get(wId) : undefined;
            const h = hId ? handwerkerMap.get(hId) : undefined;
            const werkzeugName = w?.fields.werkzeugname ?? wId ?? tx('Unbekanntes Werkzeug');
            const handwerkerName = h
              ? `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim()
              : (hId ?? tx('Unbekannter Handwerker'));
            const ausleihdatum = a.fields.ausleihdatum
              ? a.fields.ausleihdatum.substring(0, 10)
              : '–';
            const rueckgabe = a.fields.geplantes_rueckgabedatum
              ? a.fields.geplantes_rueckgabedatum.substring(0, 10)
              : '–';
            return {
              id: a.record_id,
              title: werkzeugName,
              subtitle: `${tx('Handwerker')}: ${handwerkerName} · ${tx('Ausgeliehen')}: ${ausleihdatum} · ${tx('Geplante Rückgabe')}: ${rueckgabe}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" />,
            };
          })}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen gefunden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Rückgabe & Zustand */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Ausleihe-Info */}
            <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium">
                <IconTool size={16} className="text-primary" />
                <span>{tx('Ausgewählte Ausleihe')}</span>
              </div>
              {(() => {
                const wId = extractRecordId(selectedAusleihe.fields.werkzeug);
                const hId = extractRecordId(selectedAusleihe.fields.handwerker);
                const w = wId ? werkzeugMap.get(wId) : undefined;
                const h = hId ? handwerkerMap.get(hId) : undefined;
                const werkzeugName = w?.fields.werkzeugname ?? tx('Unbekanntes Werkzeug');
                const handwerkerName = h
                  ? `${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim()
                  : tx('Unbekannter Handwerker');
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">{tx('Werkzeug')}: </span>
                      {werkzeugName}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">{tx('Handwerker')}: </span>
                      {handwerkerName}
                    </div>
                    {selectedAusleihe.fields.ausleihdatum && (
                      <div>
                        <span className="font-medium text-foreground">{tx('Ausgeliehen am')}: </span>
                        {selectedAusleihe.fields.ausleihdatum.substring(0, 10)}
                      </div>
                    )}
                    {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                      <div>
                        <span className="font-medium text-foreground">{tx('Geplante Rückgabe')}: </span>
                        {selectedAusleihe.fields.geplantes_rueckgabedatum.substring(0, 10)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Rückgabe-Formular */}
            <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
              <h3 className="font-semibold text-sm">{tx('Rückgabedaten erfassen')}</h3>

              <div className="space-y-2">
                <Label htmlFor="rueckgabedatum">{tx('Tatsächliches Rückgabedatum')}</Label>
                <Input
                  id="rueckgabedatum"
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={(e) => setRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('Zustand nach Rückgabe')}</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ZUSTAND_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setZustandKey(opt.key)}
                      className={`rounded-xl border p-3 text-sm text-left transition-colors ${
                        zustandKey === opt.key
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <StatusBadge statusKey={opt.key} label={opt.label} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  placeholder={tx('Optionale Bemerkungen zur Rückgabe …')}
                  rows={3}
                  className="w-full"
                />
              </div>

              {needsFollowUp(zustandKey) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <IconAlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {tx('Der gewählte Zustand erfordert einen Folgeauftrag. Im nächsten Schritt kannst du diesen direkt anlegen.')}
                  </span>
                </div>
              )}

              {step2Error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {step2Error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="w-full sm:w-auto"
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={handleRueckgabe}
                  disabled={submittingStep2 || !zustandKey || !rueckgabedatum}
                  className="w-full sm:w-auto flex items-center gap-2"
                >
                  {submittingStep2 ? tx('Speichern …') : (
                    <>
                      {needsFollowUp(zustandKey) ? tx('Rückgabe bestätigen & weiter') : tx('Rückgabe abschließen')}
                      <IconArrowRight size={16} />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht eine ausgewählte Ausleihe aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Folgeauftrag oder Erfolg */}
      {step === 3 && (
        done ? (
          // Erfolgsanzeige
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <IconCheck size={32} className="text-green-600" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">{tx('Rückgabe erfolgreich')}</h3>
              {selectedAusleihe && (() => {
                const wId = extractRecordId(selectedAusleihe.fields.werkzeug);
                const w = wId ? werkzeugMap.get(wId) : undefined;
                return (
                  <p className="text-sm text-muted-foreground">
                    {w?.fields.werkzeugname ?? tx('Das Werkzeug')} {tx('wurde zurückgegeben.')}
                    {folgeauftragId && ` ${tx('Ein Folgeauftrag wurde angelegt.')}`}
                  </p>
                );
              })()}
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
        ) : selectedAusleihe ? (
          // Folgeauftrag-Formular
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
              <h3 className="font-semibold text-sm">{tx('Folgeauftrag anlegen')}</h3>
              <p className="text-sm text-muted-foreground">
                {tx('Lege optional einen Wartungs- oder Reparaturauftrag für dieses Werkzeug an.')}
              </p>

              <div className="space-y-2">
                <Label>{tx('Vorgangsart')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {VORGANGSART_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                        vorgangsart === opt.key
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startdatum">{tx('Startdatum')}</Label>
                  <Input
                    id="startdatum"
                    type="date"
                    value={startdatum}
                    onChange={(e) => setStartdatum(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enddatum">{tx('Geplantes Enddatum')}</Label>
                  <Input
                    id="enddatum"
                    type="date"
                    value={geplanteEnddatum}
                    onChange={(e) => setGeplanteEnddatum(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="beschreibung">{tx('Beschreibung')}</Label>
                <Textarea
                  id="beschreibung"
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  placeholder={tx('Beschreibung des Auftrags …')}
                  rows={3}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('Status')}</Label>
                <div className="flex gap-2 flex-wrap">
                  {STATUS_WARTUNG_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setStatusWartung(opt.key)}
                      className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                        statusWartung === opt.key
                          ? 'border-primary bg-primary/10 font-medium'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <StatusBadge statusKey={opt.key} label={opt.label} />
                    </button>
                  ))}
                </div>
              </div>

              {step3Error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {step3Error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setDone(true); }}
                  className="w-full sm:w-auto"
                >
                  {tx('Überspringen')}
                </Button>
                <Button
                  onClick={handleFolgeauftrag}
                  disabled={submittingStep3 || !vorgangsart || !startdatum || !statusWartung}
                  className="w-full sm:w-auto flex items-center gap-2"
                >
                  {submittingStep3 ? tx('Anlegen …') : (
                    <>
                      {tx('Folgeauftrag anlegen')}
                      <IconCheck size={16} />
                    </>
                  )}
                </Button>
              </div>
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
    </IntentWizardShell>
  );
}
