/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (status_ausleihe = 'ausgeliehen') →
 *        2) Zustand prüfen & Rückgabe buchen (update Ausleihe + Werkzeug) →
 *        3) Wartung/Reparatur anlegen (nur bei Schaden, createWartungReparaturEntry).
 * Reads: ausleihe, handwerker, werkzeuge. Writes: ausleihe (update), werkzeuge (update), wartungReparatur (create).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { makeT } from '@/i18n';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconArrowLeft,
  IconCheck,
  IconAlertTriangle,
  IconTool,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    heading: 'Werkzeug-Rückgabe',
    subtitle: 'Ausleihe zurückgeben und ggf. Wartung/Reparatur anlegen',
    step1: 'Ausleihe wählen',
    step2: 'Zustand prüfen',
    step3: 'Wartung/Reparatur',
    step4: 'Fertig',
    step1Empty: 'Keine offenen Ausleihen',
    step1EmptyDesc: 'Aktuell sind keine Werkzeuge ausgeliehen.',
    step1Search: 'Ausleihe suchen…',
    ausgeliehen: 'Ausgeliehen',
    rueckgabeDatum: 'Tatsächliches Rückgabedatum',
    zustandLabel: 'Zustand nach Rückgabe',
    zustandOK: 'OK – kein Schaden',
    zustandSchaden: 'Schaden festgestellt',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Optionale Bemerkungen zur Rückgabe…',
    zurueckgeben: 'Rückgabe buchen',
    zurueckgebenRunning: 'Wird gebucht…',
    validationDate: 'Bitte Rückgabedatum angeben.',
    validationZustand: 'Bitte Zustand auswählen.',
    vorgangsartLabel: 'Vorgangsart',
    wartung: 'Wartung',
    reparatur: 'Reparatur',
    startdatum: 'Startdatum',
    geplantesEnddatum: 'Geplantes Enddatum (optional)',
    beschreibung: 'Beschreibung (optional)',
    beschreibungPlaceholder: 'Problembeschreibung oder geplante Maßnahme…',
    verantwortlicher: 'Verantwortlicher Handwerker (optional)',
    keiner: 'Kein Verantwortlicher',
    anlegen: 'Wartung/Reparatur anlegen',
    anlegenRunning: 'Wird angelegt…',
    überspringen: 'Ohne Wartung/Reparatur abschließen',
    successTitle: 'Rückgabe abgeschlossen',
    successWithRepair: 'Das Werkzeug wurde zurückgegeben und ein Wartungs-/Reparaturvorgang wurde angelegt.',
    successOK: 'Das Werkzeug wurde als verfügbar markiert und zurückgegeben.',
    successSchaden: 'Das Werkzeug wurde als "In Reparatur" markiert. Kein Wartungs-/Reparaturvorgang angelegt.',
    neueRueckgabe: 'Weitere Rückgabe',
    dashboard: 'Zurück zum Dashboard',
    validationVorgangsart: 'Bitte Vorgangsart wählen.',
    validationStartdatum: 'Bitte Startdatum angeben.',
    errorStep2: 'Fehler beim Buchen der Rückgabe.',
    errorStep3: 'Fehler beim Anlegen des Vorgangs.',
  },
  en: {
    heading: 'Tool Return',
    subtitle: 'Return a loan and optionally create a maintenance/repair record',
    step1: 'Choose Loan',
    step2: 'Check Condition',
    step3: 'Maintenance/Repair',
    step4: 'Done',
    step1Empty: 'No open loans',
    step1EmptyDesc: 'No tools are currently checked out.',
    step1Search: 'Search loans…',
    ausgeliehen: 'Checked out',
    rueckgabeDatum: 'Actual return date',
    zustandLabel: 'Condition after return',
    zustandOK: 'OK – no damage',
    zustandSchaden: 'Damage found',
    bemerkungen: 'Remarks',
    bemerkungenPlaceholder: 'Optional remarks about the return…',
    zurueckgeben: 'Book return',
    zurueckgebenRunning: 'Booking…',
    validationDate: 'Please enter a return date.',
    validationZustand: 'Please select a condition.',
    vorgangsartLabel: 'Process type',
    wartung: 'Maintenance',
    reparatur: 'Repair',
    startdatum: 'Start date',
    geplantesEnddatum: 'Planned end date (optional)',
    beschreibung: 'Description (optional)',
    beschreibungPlaceholder: 'Problem description or planned action…',
    verantwortlicher: 'Responsible craftsman (optional)',
    keiner: 'No responsible person',
    anlegen: 'Create maintenance/repair',
    anlegenRunning: 'Creating…',
    überspringen: 'Close without maintenance/repair',
    successTitle: 'Return completed',
    successWithRepair: 'The tool was returned and a maintenance/repair record was created.',
    successOK: 'The tool was marked as available and returned.',
    successSchaden: 'The tool was marked as "In Repair". No maintenance/repair record created.',
    neueRueckgabe: 'Another return',
    dashboard: 'Back to Dashboard',
    validationVorgangsart: 'Please select a process type.',
    validationStartdatum: 'Please enter a start date.',
    errorStep2: 'Error booking the return.',
    errorStep3: 'Error creating the record.',
  },
  cs: {
    heading: 'Vrácení nářadí',
    subtitle: 'Vrátit výpůjčku a případně založit údržbu/opravu',
    step1: 'Vybrat výpůjčku',
    step2: 'Zkontrolovat stav',
    step3: 'Údržba/Oprava',
    step4: 'Hotovo',
    step1Empty: 'Žádné otevřené výpůjčky',
    step1EmptyDesc: 'Momentálně není zapůjčeno žádné nářadí.',
    step1Search: 'Hledat výpůjčky…',
    ausgeliehen: 'Zapůjčeno',
    rueckgabeDatum: 'Skutečné datum vrácení',
    zustandLabel: 'Stav po vrácení',
    zustandOK: 'OK – žádné poškození',
    zustandSchaden: 'Zjištěno poškození',
    bemerkungen: 'Poznámky',
    bemerkungenPlaceholder: 'Volitelné poznámky k vrácení…',
    zurueckgeben: 'Zaznamenat vrácení',
    zurueckgebenRunning: 'Ukládám…',
    validationDate: 'Prosím zadej datum vrácení.',
    validationZustand: 'Prosím vyber stav.',
    vorgangsartLabel: 'Typ záznamu',
    wartung: 'Údržba',
    reparatur: 'Oprava',
    startdatum: 'Datum zahájení',
    geplantesEnddatum: 'Plánované datum ukončení (volitelné)',
    beschreibung: 'Popis (volitelné)',
    beschreibungPlaceholder: 'Popis problému nebo plánované akce…',
    verantwortlicher: 'Odpovědný řemeslník (volitelné)',
    keiner: 'Žádný odpovědný',
    anlegen: 'Vytvořit údržbu/opravu',
    anlegenRunning: 'Vytvářím…',
    überspringen: 'Ukončit bez údržby/opravy',
    successTitle: 'Vrácení dokončeno',
    successWithRepair: 'Nářadí bylo vráceno a byl vytvořen záznam údržby/opravy.',
    successOK: 'Nářadí bylo označeno jako dostupné a vráceno.',
    successSchaden: 'Nářadí bylo označeno jako „V opravě". Žádný záznam údržby/opravy nebyl vytvořen.',
    neueRueckgabe: 'Další vrácení',
    dashboard: 'Zpět na dashboard',
    validationVorgangsart: 'Prosím vyber typ záznamu.',
    validationStartdatum: 'Prosím zadej datum zahájení.',
    errorStep2: 'Chyba při záznamu vrácení.',
    errorStep3: 'Chyba při vytváření záznamu.',
  },
});

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  // Wizard step
  const [step, setStep] = useState(1);

  // Step 1 selection
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2 form state
  const [rueckgabeDatum, setRueckgabeDatum] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [zustandKey, setZustandKey] = useState<'OK' | 'Schaden' | ''>('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Submitting, setStep2Submitting] = useState(false);
  const [step2Error, setStep2Error] = useState('');

  // Step 3 form state
  const [vorgangsartKey, setVorgangsartKey] = useState<'wartung' | 'reparatur' | ''>('');
  const [startdatum, setStartdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState('none');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [step3Error, setStep3Error] = useState('');

  // Success state
  const [successMode, setSuccessMode] = useState<'ok' | 'schaden-no-repair' | 'schaden-with-repair' | null>(null);

  // Enriched ausleihe (all with status ausgeliehen)
  const enrichedAusleihe = useMemo(() => {
    return enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap })
      .filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen');
  }, [ausleihe, werkzeugeMap, handwerkerMap]);

  const handleSelectAusleihe = (id: string) => {
    const found = enrichedAusleihe.find(a => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);
    setStep(2);
  };

  const handleStep2Submit = async () => {
    if (!rueckgabeDatum) { setStep2Error(tt('validationDate')); return; }
    if (!zustandKey) { setStep2Error(tt('validationZustand')); return; }
    if (!selectedAusleihe) return;
    setStep2Error('');
    setStep2Submitting(true);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey === 'Schaden' ? 'in_reparatur' : 'verfuegbar',
        });
      }

      await fetchAll();

      if (zustandKey === 'OK') {
        setSuccessMode('ok');
        setStep(4);
      } else {
        setStep(3);
      }
    } catch {
      setStep2Error(tt('errorStep2'));
    } finally {
      setStep2Submitting(false);
    }
  };

  const handleStep3Submit = async () => {
    if (!vorgangsartKey) { setStep3Error(tt('validationVorgangsart')); return; }
    if (!startdatum) { setStep3Error(tt('validationStartdatum')); return; }
    if (!selectedAusleihe) return;

    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) return;

    setStep3Error('');
    setStep3Submitting(true);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart: vorgangsartKey,
        startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        verantwortlicher: verantwortlicherId !== 'none'
          ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
          : undefined,
        status_wartung: 'geplant',
      });

      await fetchAll();
      setSuccessMode('schaden-with-repair');
      setStep(4);
    } catch {
      setStep3Error(tt('errorStep3'));
    } finally {
      setStep3Submitting(false);
    }
  };

  const handleSkipStep3 = () => {
    setSuccessMode('schaden-no-repair');
    setStep(4);
  };

  const handleReset = () => {
    setSelectedAusleihe(null);
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey('');
    setBemerkungen('');
    setStep2Error('');
    setVorgangsartKey('');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setVerantwortlicherId('none');
    setStep3Error('');
    setSuccessMode(null);
    setStep(1);
  };

  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('heading')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Ausleihe wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedAusleihe.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || a.record_id,
            subtitle: [
              a.handwerkerName,
              a.fields.ausleihdatum
                ? format(new Date(a.fields.ausleihdatum), 'dd.MM.yyyy HH:mm')
                : '',
            ].filter(Boolean).join(' · '),
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tt('step1Search')}
          emptyText={tt('step1EmptyDesc')}
        />
      )}

      {/* Step 2 — Zustand prüfen */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Context card */}
            <div className="rounded-2xl border bg-card p-4 space-y-1">
              <p className="font-semibold text-base">{selectedAusleihe.werkzeugName}</p>
              <p className="text-sm text-muted-foreground">{selectedAusleihe.handwerkerName}</p>
              {selectedAusleihe.fields.ausleihdatum && (
                <p className="text-sm text-muted-foreground">
                  {tt('ausgeliehen')}: {format(new Date(selectedAusleihe.fields.ausleihdatum), 'dd.MM.yyyy HH:mm')}
                </p>
              )}
            </div>

            {/* Return datetime */}
            <div className="space-y-2">
              <Label htmlFor="rueckgabeDatum" className="text-sm font-medium">
                {tt('rueckgabeDatum')} *
              </Label>
              <input
                id="rueckgabeDatum"
                type="datetime-local"
                value={rueckgabeDatum}
                onChange={e => setRueckgabeDatum(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Condition */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tt('zustandLabel')} *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setZustandKey('OK')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    zustandKey === 'OK'
                      ? 'border-green-500 bg-green-50 ring-2 ring-green-300'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconCheck size={20} className="text-green-600" stroke={2} />
                    <span className="font-medium text-sm">{tt('zustandOK')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setZustandKey('Schaden')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    zustandKey === 'Schaden'
                      ? 'border-red-500 bg-red-50 ring-2 ring-red-300'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconAlertTriangle size={20} className="text-red-500" stroke={2} />
                    <span className="font-medium text-sm">{tt('zustandSchaden')}</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen" className="text-sm font-medium">{tt('bemerkungen')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('bemerkungenPlaceholder')}
                rows={3}
              />
            </div>

            {step2Error && (
              <p className="text-sm text-destructive">{step2Error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <IconArrowLeft size={16} stroke={1.5} className="mr-1" />
                {tt('step1')}
              </Button>
              <Button
                onClick={handleStep2Submit}
                disabled={step2Submitting || !rueckgabeDatum || !zustandKey}
                className="flex-1"
              >
                {step2Submitting ? tt('zurueckgebenRunning') : tt('zurueckgeben')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step1EmptyDesc')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('step1')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Wartung/Reparatur anlegen */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Context card */}
            <div className="rounded-2xl border bg-destructive/10 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <IconAlertTriangle size={18} className="text-destructive" stroke={2} />
                <p className="font-semibold text-sm">{tt('zustandSchaden')}: {selectedAusleihe.werkzeugName}</p>
              </div>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tt('vorgangsartLabel')} *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setVorgangsartKey('wartung')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    vorgangsartKey === 'wartung'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconTool size={20} className="text-primary" stroke={1.5} />
                    <span className="font-medium text-sm">{tt('wartung')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVorgangsartKey('reparatur')}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    vorgangsartKey === 'reparatur'
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconTool size={20} className="text-primary" stroke={1.5} />
                    <span className="font-medium text-sm">{tt('reparatur')}</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Startdatum */}
            <div className="space-y-2">
              <Label htmlFor="startdatum" className="text-sm font-medium">{tt('startdatum')} *</Label>
              <input
                id="startdatum"
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Geplantes Enddatum */}
            <div className="space-y-2">
              <Label htmlFor="geplantesEnddatum" className="text-sm font-medium">{tt('geplantesEnddatum')}</Label>
              <input
                id="geplantesEnddatum"
                type="date"
                value={geplantesEnddatum}
                onChange={e => setGeplantesEnddatum(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="beschreibung" className="text-sm font-medium">{tt('beschreibung')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tt('beschreibungPlaceholder')}
                rows={3}
              />
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-2">
              <Label htmlFor="verantwortlicher" className="text-sm font-medium">{tt('verantwortlicher')}</Label>
              <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                <SelectTrigger id="verantwortlicher" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt('keiner')}</SelectItem>
                  {handwerker
                    .filter(h => h.fields.status?.key === 'aktiv')
                    .map(h => (
                      <SelectItem key={h.record_id} value={h.record_id}>
                        {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {step3Error && (
              <p className="text-sm text-destructive">{step3Error}</p>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={handleStep3Submit}
                disabled={step3Submitting || !vorgangsartKey || !startdatum}
              >
                {step3Submitting ? tt('anlegenRunning') : tt('anlegen')}
              </Button>
              <Button variant="outline" onClick={handleSkipStep3} disabled={step3Submitting}>
                {tt('überspringen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step1EmptyDesc')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('step1')}</Button>
          </div>
        )
      )}

      {/* Step 4 — Erfolg */}
      {step === 4 && (
        successMode ? (
          <div className="text-center py-12 space-y-6 max-w-md mx-auto">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <IconCheck size={32} className="text-green-600" stroke={2} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {successMode === 'ok' && tt('successOK')}
                {successMode === 'schaden-with-repair' && tt('successWithRepair')}
                {successMode === 'schaden-no-repair' && tt('successSchaden')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tt('neueRueckgabe')}
              </Button>
              <Button asChild>
                <a href="#/">{tt('dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step1EmptyDesc')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('step1')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
