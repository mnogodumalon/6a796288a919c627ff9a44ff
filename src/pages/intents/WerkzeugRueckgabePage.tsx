/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard (Schritt 3 optional).
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe & Zustand erfassen →
 *        3) Wartung/Reparatur anlegen (nur bei in_reparatur/in_wartung).
 * Reads: ausleihe (status_ausleihe=ausgeliehen), handwerker, werkzeuge.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import type { APP_IDS as _APP_IDS } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatDateTime, lookupKey } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconTools,
  IconCheck,
  IconAlertTriangle,
  IconCalendar,
  IconUser,
  IconTool,
  IconCircleCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Werkzeug zurückgeben', /* i18n-exempt */
    subtitle: 'Rückgabe erfassen und Zustand dokumentieren',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe & Zustand',
    step3: 'Wartung / Reparatur',
    step4: 'Abgeschlossen',
    noOpenLendings: 'Keine offenen Ausleihen vorhanden.',
    noOpenLendingsHint: 'Alle Werkzeuge sind bereits zurückgegeben.',
    searchPlaceholder: 'Werkzeug oder Handwerker suchen...',
    returnDate: 'Tatsächliches Rückgabedatum',
    newCondition: 'Neuer Zustand nach Rückgabe',
    remarks: 'Bemerkungen zur Rückgabe (optional)',
    remarksPlaceholder: 'Zustandsbeschreibung, Besonderheiten...',
    saveReturn: 'Rückgabe speichern',
    saving: 'Wird gespeichert...',
    conditionRequired: 'Bitte Zustand auswählen.',
    processType: 'Vorgangsart',
    startDate: 'Startdatum',
    plannedEnd: 'Geplantes Enddatum (optional)',
    description: 'Beschreibung (optional)', /* i18n-exempt */
    descriptionPlaceholder: 'Problem oder geplante Maßnahme beschreiben...',
    responsible: 'Verantwortlicher Handwerker',
    responsibleHint: 'Vorausgefüllt mit dem Handwerker der Ausleihe.',
    cost: 'Kosten (€, optional)',
    saveRepair: 'Wartung/Reparatur anlegen',
    skipRepair: 'Überspringen – direkt abschließen',
    successTitle: 'Rückgabe erfolgreich erfasst!',
    successMsg: 'Das Werkzeug wurde zurückgegeben und der Zustand aktualisiert.',
    repairCreated: 'Wartung/Reparatur wurde angelegt.',
    newReturn: 'Weitere Rückgabe erfassen',
    backToDashboard: 'Zurück zum Dashboard',
    noPrerequisite: 'Dieser Schritt benötigt die Auswahl aus Schritt 1.',
    restart: 'Neu starten',
    tool: 'Werkzeug',
    craftsman: 'Handwerker',
    lentSince: 'Ausgeliehen seit',
    selectCondition: 'Zustand auswählen...',
    selectResponsible: 'Handwerker auswählen (optional)',
    wartungLabel: 'Wartung',
    reparaturLabel: 'Reparatur',
    conditionNote: 'Zustand erfordert Wartung/Reparatur. Bitte erfassen:',
  },
  en: {
    title: 'Return Tool', /* i18n-exempt */
    subtitle: 'Record return and document condition',
    step1: 'Select Lending',
    step2: 'Return & Condition',
    step3: 'Maintenance / Repair',
    step4: 'Done',
    noOpenLendings: 'No open lendings available.',
    noOpenLendingsHint: 'All tools have already been returned.',
    searchPlaceholder: 'Search tool or craftsman...',
    returnDate: 'Actual Return Date',
    newCondition: 'New Condition after Return',
    remarks: 'Remarks on Return (optional)',
    remarksPlaceholder: 'Condition notes, special observations...',
    saveReturn: 'Save Return',
    saving: 'Saving...',
    conditionRequired: 'Please select a condition.',
    processType: 'Process Type',
    startDate: 'Start Date',
    plannedEnd: 'Planned End Date (optional)',
    description: 'Description (optional)', /* i18n-exempt */
    descriptionPlaceholder: 'Describe the problem or planned action...',
    responsible: 'Responsible Craftsman',
    responsibleHint: 'Pre-filled with the lending craftsman.',
    cost: 'Cost (€, optional)',
    saveRepair: 'Create Maintenance/Repair',
    skipRepair: 'Skip – complete now',
    successTitle: 'Return successfully recorded!',
    successMsg: 'The tool has been returned and its condition updated.',
    repairCreated: 'Maintenance/Repair record created.',
    newReturn: 'Record another return',
    backToDashboard: 'Back to Dashboard',
    noPrerequisite: 'This step requires the selection from step 1.',
    restart: 'Start over',
    tool: 'Tool',
    craftsman: 'Craftsman',
    lentSince: 'Lent since',
    selectCondition: 'Select condition...',
    selectResponsible: 'Select craftsman (optional)',
    wartungLabel: 'Maintenance',
    reparaturLabel: 'Repair',
    conditionNote: 'Condition requires maintenance/repair. Please record:',
  },
});

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2
  const [rueckgabedatum, setRueckgabedatum] = useState<string>(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [neuerZustand, setNeuerZustand] = useState<string>('');
  const [bemerkungen, setBemerkungen] = useState<string>('');
  const [savingReturn, setSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Step 3
  const [vorgangsart, setVorgangsart] = useState<string>('');
  const [startdatum, setStartdatum] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [geplanteEnddatum, setGeplanteEnddatum] = useState<string>('');
  const [beschreibung, setBeschreibung] = useState<string>('');
  const [verantwortlicherId, setVerantwortlicherId] = useState<string>('none');
  const [kosten, setKosten] = useState<string>('');
  const [savingRepair, setSavingRepair] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  // Success tracking
  const [repairCreated, setRepairCreated] = useState(false);
  const [done, setDone] = useState(false);

  const handwerkerMap = useMemo(() => {
    const m = new Map<string, string>();
    handwerker.forEach(h => {
      const name = [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ');
      m.set(h.record_id, name || h.record_id);
    });
    return m;
  }, [handwerker]);

  const werkzeugeMap = useMemo(() => {
    const m = new Map<string, string>();
    werkzeuge.forEach(w => {
      m.set(w.record_id, w.fields.werkzeugname ?? w.record_id);
    });
    return m;
  }, [werkzeuge]);

  // Enrich ausleihe records
  const enrichedAusleihen = useMemo((): EnrichedAusleihe[] => {
    return ausleihe
      .filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen')
      .map(a => {
        const werkzeugId = extractRecordId(a.fields.werkzeug);
        const handwerkerId = extractRecordId(a.fields.handwerker);
        return {
          ...a,
          werkzeugName: werkzeugId ? (werkzeugeMap.get(werkzeugId) ?? '—') : '—',
          handwerkerName: handwerkerId ? (handwerkerMap.get(handwerkerId) ?? '—') : '—',
        } as EnrichedAusleihe;
      });
  }, [ausleihe, werkzeugeMap, handwerkerMap]);

  const needsRepairStep = neuerZustand === 'in_reparatur' || neuerZustand === 'in_wartung';

  const totalSteps = needsRepairStep ? 4 : 3;
  const stepLabels = needsRepairStep
    ? [
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]
    : [
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step4') },
      ];

  // Map displayed step to wizard step: when no repair, step 3 in display = 3 internal (done)
  const displayStep = needsRepairStep ? step : step === 3 ? 3 : step;

  function handleSelectAusleihe(id: string) {
    const found = enrichedAusleihen.find(a => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);

    // Pre-fill verantwortlicher from handwerker of the lending
    const handwerkerId = extractRecordId(found.fields.handwerker);
    setVerantwortlicherId(handwerkerId ?? 'none');

    setStep(2);
  }

  async function handleSaveReturn() {
    if (!selectedAusleihe) return;
    if (!neuerZustand) {
      setReturnError(tt('conditionRequired'));
      return;
    }
    setReturnError(null);
    setSavingReturn(true);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      // a) Update Ausleihe
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      // b) Update Werkzeug Zustand
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: neuerZustand,
        });
      }

      await fetchAll();

      if (needsRepairStep) {
        // Pre-fill vorgangsart based on neuer_zustand
        setVorgangsart(neuerZustand === 'in_wartung' ? 'wartung' : 'reparatur');
        setStep(3);
      } else {
        setDone(true);
        setStep(3);
      }
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSavingReturn(false);
    }
  }

  async function handleSaveRepair() {
    if (!selectedAusleihe) return;
    setSavingRepair(true);
    setRepairError(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: werkzeugId
          ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId)
          : undefined,
        vorgangsart: vorgangsart,
        verantwortlicher:
          verantwortlicherId && verantwortlicherId !== 'none'
            ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
            : undefined,
        startdatum: startdatum,
        geplantes_enddatum: geplanteEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: 'geplant',
        kosten: kosten ? parseFloat(kosten) : undefined,
      });

      await fetchAll();
      setRepairCreated(true);
      setDone(true);
      setStep(4);
    } catch (e) {
      setRepairError(e instanceof Error ? e.message : 'Fehler beim Anlegen');
    } finally {
      setSavingRepair(false);
    }
  }

  function handleSkipRepair() {
    setDone(true);
    setStep(4);
  }

  function handleReset() {
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNeuerZustand('');
    setBemerkungen('');
    setReturnError(null);
    setVorgangsart('');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setBeschreibung('');
    setVerantwortlicherId('none');
    setKosten('');
    setRepairError(null);
    setRepairCreated(false);
    setDone(false);
    setStep(1);
  }

  // The shell uses 1-based step; map our internal step to display step
  const shellStep = needsRepairStep ? step : step === 3 ? 3 : step;
  void displayStep; // explicitly unused

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={stepLabels}
      currentStep={shellStep}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedAusleihen.map(a => ({
            id: a.record_id,
            title: a.werkzeugName,
            subtitle: `${tt('craftsman')}: ${a.handwerkerName} · ${tt('lentSince')}: ${formatDateTime(a.fields.ausleihdatum)}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTools size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('noOpenLendings')}
          emptyIcon={<IconCheck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Rückgabe & Zustand ── */}
      {step === 2 && (
        <div className="space-y-5">
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noPrerequisite')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Context card */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2">
                  <IconTools size={18} className="text-primary shrink-0" />
                  <span className="font-semibold truncate">{selectedAusleihe.werkzeugName}</span>
                  {selectedAusleihe.fields.status_ausleihe && (
                    <StatusBadge
                      statusKey={selectedAusleihe.fields.status_ausleihe.key}
                      label={selectedAusleihe.fields.status_ausleihe.label}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconUser size={14} className="shrink-0" />
                  <span className="truncate">{selectedAusleihe.handwerkerName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconCalendar size={14} className="shrink-0" />
                  <span>{tt('lentSince')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}</span>
                </div>
              </div>

              {/* Rückgabedatum */}
              <div className="space-y-1.5">
                <Label>{tt('returnDate')}</Label>
                <Input
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={e => setRueckgabedatum(e.target.value)}
                />
              </div>

              {/* Zustand */}
              <div className="space-y-1.5">
                <Label>{tt('newCondition')}</Label>
                <Select value={neuerZustand} onValueChange={setNeuerZustand}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('selectCondition')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ZUSTAND_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {neuerZustand === 'in_reparatur' || neuerZustand === 'in_wartung' ? (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <IconAlertTriangle size={13} />
                    {tt('conditionNote')}
                  </p>
                ) : null}
              </div>

              {/* Bemerkungen */}
              <div className="space-y-1.5">
                <Label>{tt('remarks')}</Label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tt('remarksPlaceholder')}
                  rows={3}
                />
              </div>

              {returnError && (
                <p className="text-sm text-destructive">{returnError}</p>
              )}

              <Button
                className="w-full"
                onClick={handleSaveReturn}
                disabled={savingReturn || !neuerZustand}
              >
                {savingReturn ? tt('saving') : tt('saveReturn')}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Wartung/Reparatur (nur wenn needsRepairStep) ── */}
      {step === 3 && needsRepairStep && (
        <div className="space-y-5">
          {!selectedAusleihe ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noPrerequisite')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Context */}
              <div className="rounded-2xl border bg-card p-4 overflow-hidden">
                <div className="flex items-center gap-2">
                  <IconTool size={18} className="text-amber-500 shrink-0" />
                  <span className="font-semibold truncate">{selectedAusleihe.werkzeugName}</span>
                </div>
              </div>

              {/* Vorgangsart — Radio tiles */}
              <div className="space-y-1.5">
                <Label>{tt('processType')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`rounded-xl border p-3 text-sm font-medium transition-colors text-left ${
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

              {/* Startdatum */}
              <div className="space-y-1.5">
                <Label>{tt('startDate')} *</Label>
                <Input
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                />
              </div>

              {/* Geplantes Enddatum */}
              <div className="space-y-1.5">
                <Label>{tt('plannedEnd')}</Label>
                <Input
                  type="date"
                  value={geplanteEnddatum}
                  onChange={e => setGeplanteEnddatum(e.target.value)}
                />
              </div>

              {/* Beschreibung */}
              <div className="space-y-1.5">
                <Label>{tt('description')}</Label>
                <Textarea
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tt('descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Verantwortlicher */}
              <div className="space-y-1.5">
                <Label>{tt('responsible')}</Label>
                <p className="text-xs text-muted-foreground">{tt('responsibleHint')}</p>
                <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('selectResponsible')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('selectResponsible')}</SelectItem>
                    {handwerker.map(h => (
                      <SelectItem key={h.record_id} value={h.record_id}>
                        {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Kosten */}
              <div className="space-y-1.5">
                <Label>{tt('cost')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={kosten}
                  onChange={e => setKosten(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Status (hidden — default 'geplant') */}
              <div className="hidden">
                {STATUS_WARTUNG_OPTIONS.map(o => o.key).join(',')}
              </div>

              {repairError && (
                <p className="text-sm text-destructive">{repairError}</p>
              )}

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={handleSaveRepair}
                  disabled={savingRepair || !vorgangsart || !startdatum}
                >
                  {savingRepair ? tt('saving') : tt('saveRepair')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSkipRepair}
                  disabled={savingRepair}
                >
                  {tt('skipRepair')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3 (ohne Repair) oder Step 4 (mit Repair): Erfolg ── */}
      {((step === 3 && !needsRepairStep && done) || (step === 4 && done)) && (
        <div className="text-center py-12 space-y-4">
          <div className="flex justify-center">
            <IconCircleCheck size={56} className="text-green-500" stroke={1.5} />
          </div>
          <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
          <p className="text-sm text-muted-foreground">{tt('successMsg')}</p>
          {repairCreated && (
            <p className="text-sm text-muted-foreground">{tt('repairCreated')}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button onClick={handleReset}>{tt('newReturn')}</Button>
            <Button variant="outline" asChild>
              <a href="#/">{tt('backToDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
