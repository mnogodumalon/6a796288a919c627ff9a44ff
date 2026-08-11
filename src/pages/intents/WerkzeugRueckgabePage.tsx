/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard (Schritt 3 optional).
 * Steps: 1) Ausleihe wählen (nur status_ausleihe='ausgeliehen') →
 *        2) Rückgabe erfassen (Datum, Bemerkungen, Wartungs-Checkbox) →
 *        3) Wartung/Reparatur anlegen (optional, wenn Checkbox gesetzt).
 * Reads: ausleihe (gefiltert auf 'ausgeliehen'), handwerker (aktiv).
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IconArrowBack, IconTool, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const tt = makeT({
  de: {
    title: 'Werkzeug-Rückgabe', /* i18n-exempt */
    subtitle: 'Ausleihe abschließen und optional Wartung/Reparatur einleiten',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe erfassen',
    step3: 'Wartung/Reparatur',
    selectAusleihe: 'Aktive Ausleihe auswählen',
    noActiveLoans: 'Keine aktiven Ausleihen vorhanden',
    returnDate: 'Tatsächliches Rückgabedatum',
    remarks: 'Bemerkungen',
    remarksPlaceholder: 'Zustand bei Rückgabe, Hinweise ...',
    initiateService: 'Wartung/Reparatur einleiten?',
    submit: 'Rückgabe bestätigen',
    submitting: 'Wird gespeichert ...',
    processType: 'Vorgangsart',
    startDate: 'Startdatum',
    plannedEndDate: 'Geplantes Enddatum',
    description: 'Beschreibung', /* i18n-exempt */
    descriptionPlaceholder: 'Beschreibung des Problems oder der geplanten Maßnahme ...',
    statusField: 'Status',
    cost: 'Kosten (€)',
    responsible: 'Verantwortlicher Handwerker',
    noResponsible: 'Kein Handwerker',
    createService: 'Vorgang anlegen',
    creatingService: 'Wird angelegt ...',
    successTitle: 'Rückgabe erfolgreich!',
    successWithService: 'Die Rückgabe wurde erfasst und ein Wartungs-/Reparaturvorgang angelegt.',
    successWithoutService: 'Die Rückgabe wurde erfasst. Das Werkzeug ist wieder verfügbar.',
    newReturn: 'Weitere Rückgabe erfassen',
    backToDashboard: 'Zurück zum Dashboard',
    checkedOutSince: 'Ausgeliehen seit',
    werkzeug: 'Werkzeug',
    handwerker: 'Handwerker',
    noPrerequisite: 'Dieser Schritt benötigt eine ausgewählte Ausleihe aus Schritt 1.',
    restart: 'Neu starten',
    errorUpdate: 'Fehler beim Aktualisieren. Bitte erneut versuchen.',
  },
  en: {
    title: 'Tool Return', /* i18n-exempt */
    subtitle: 'Close checkout and optionally initiate maintenance/repair',
    step1: 'Select Checkout',
    step2: 'Record Return',
    step3: 'Maintenance/Repair',
    selectAusleihe: 'Select active checkout',
    noActiveLoans: 'No active checkouts',
    returnDate: 'Actual Return Date',
    remarks: 'Remarks',
    remarksPlaceholder: 'Condition at return, notes ...',
    initiateService: 'Initiate maintenance/repair?',
    submit: 'Confirm Return',
    submitting: 'Saving ...',
    processType: 'Process Type',
    startDate: 'Start Date',
    plannedEndDate: 'Planned End Date',
    description: 'Description', /* i18n-exempt */
    descriptionPlaceholder: 'Description of problem or planned action ...',
    statusField: 'Status',
    cost: 'Cost (€)',
    responsible: 'Responsible Craftsman',
    noResponsible: 'No craftsman',
    createService: 'Create Process',
    creatingService: 'Creating ...',
    successTitle: 'Return recorded!',
    successWithService: 'The return was recorded and a maintenance/repair process was created.',
    successWithoutService: 'The return was recorded. The tool is available again.',
    newReturn: 'Record another return',
    backToDashboard: 'Back to Dashboard',
    checkedOutSince: 'Checked out since',
    werkzeug: 'Tool',
    handwerker: 'Craftsman',
    noPrerequisite: 'This step requires a checkout selected in step 1.',
    restart: 'Start over',
    errorUpdate: 'Error updating. Please try again.',
  },
});

const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleiheId, setSelectedAusleiheId] = useState<string | null>(null);

  // Step 2 state
  const [rueckgabeDatum, setRueckgabeDatum] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [bemerkungen, setBemerkungen] = useState('');
  const [initiateService, setInitiateService] = useState(false);
  const [submitting2, setSubmitting2] = useState(false);
  const [error2, setError2] = useState<string | null>(null);

  // Step 3 state
  const [vorgangsart, setVorgangsart] = useState(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung, setStatusWartung] = useState(
    STATUS_WARTUNG_OPTIONS.find(o => o.key === 'geplant')?.key ?? STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant'
  );
  const [kosten, setKosten] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState('none');
  const [submitting3, setSubmitting3] = useState(false);
  const [error3, setError3] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneWithService, setDoneWithService] = useState(false);

  const activeLoans = useMemo(
    () => ausleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [ausleihe]
  );

  const selectedAusleihe = useMemo(
    () => (selectedAusleiheId ? ausleihe.find(a => a.record_id === selectedAusleiheId) ?? null : null),
    [selectedAusleiheId, ausleihe]
  );

  const selectedWerkzeugId = useMemo(() => {
    if (!selectedAusleihe) return null;
    return extractRecordId(selectedAusleihe.fields.werkzeug);
  }, [selectedAusleihe]);

  const selectedWerkzeug = useMemo(() => {
    if (!selectedWerkzeugId) return null;
    return werkzeugeMap.get(selectedWerkzeugId) ?? null;
  }, [selectedWerkzeugId, werkzeugeMap]);

  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => h.fields.status?.key === 'aktiv'),
    [handwerker]
  );

  const steps = initiateService
    ? [{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]
    : [{ label: tt('step1') }, { label: tt('step2') }];

  function handleReset() {
    setStep(1);
    setSelectedAusleiheId(null);
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setBemerkungen('');
    setInitiateService(false);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setStatusWartung(
      STATUS_WARTUNG_OPTIONS.find(o => o.key === 'geplant')?.key ?? STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant'
    );
    setKosten('');
    setVerantwortlicherId('none');
    setError2(null);
    setError3(null);
    setDone(false);
    setDoneWithService(false);
  }

  async function handleStep2Submit() {
    if (!selectedAusleiheId || !selectedWerkzeugId) return;
    setSubmitting2(true);
    setError2(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleiheId, {
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      // If no service requested, mark tool as available
      if (!initiateService) {
        await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
          zustand: 'verfuegbar',
        });
        await fetchAll();
        setDone(true);
        setDoneWithService(false);
        return;
      }
      // Tool status will be set in step 3 based on vorgangsart
      await fetchAll();
      setStep(3);
    } catch {
      setError2(tt('errorUpdate'));
    } finally {
      setSubmitting2(false);
    }
  }

  async function handleStep3Submit() {
    if (!selectedWerkzeugId) return;
    setSubmitting3(true);
    setError3(null);
    try {
      // Update tool zustand based on vorgangsart
      const newZustand = vorgangsart === 'wartung' ? 'in_wartung' : 'in_reparatur';
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: newZustand,
      });

      const verantw =
        verantwortlicherId && verantwortlicherId !== 'none'
          ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
          : undefined;

      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
        vorgangsart,
        startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
        kosten: kosten ? parseFloat(kosten) : undefined,
        verantwortlicher: verantw,
      });

      await fetchAll();
      setDone(true);
      setDoneWithService(true);
    } catch {
      setError3(tt('errorUpdate'));
    } finally {
      setSubmitting3(false);
    }
  }

  if (done) {
    return (
      <IntentWizardShell
        title={tt('title')}
        subtitle={tt('subtitle')}
        steps={steps}
        currentStep={steps.length}
        onStepChange={setStep}
        loading={false}
        error={null}
        onRetry={fetchAll}
      >
        <div className="flex flex-col items-center text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={32} className="text-green-600" stroke={2} />
          </div>
          <h2 className="text-xl font-semibold text-foreground">{tt('successTitle')}</h2>
          <p className="text-muted-foreground max-w-sm">
            {doneWithService ? tt('successWithService') : tt('successWithoutService')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="outline" onClick={handleReset}>
              <IconArrowBack size={16} className="mr-2" stroke={2} />
              {tt('newReturn')}
            </Button>
            <Button asChild>
              <a href="#/">{tt('backToDashboard')}</a>
            </Button>
          </div>
        </div>
      </IntentWizardShell>
    );
  }

  return (
    <IntentWizardShell
      title={tt('title')}
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
          items={activeLoans.map(a => {
            const wId = extractRecordId(a.fields.werkzeug);
            const hId = extractRecordId(a.fields.handwerker);
            const wz = wId ? werkzeugeMap.get(wId) : undefined;
            const hw = hId ? handwerkerMap.get(hId) : undefined;
            const wzName = wz?.fields.werkzeugname ?? wId ?? '—';
            const hwName = hw
              ? [hw.fields.vorname, hw.fields.nachname].filter(Boolean).join(' ')
              : hId ?? '—';
            const ausleihdatum = a.fields.ausleihdatum
              ? format(new Date(a.fields.ausleihdatum), 'dd.MM.yyyy HH:mm')
              : '—';
            return {
              id: a.record_id,
              title: wzName,
              subtitle: `${tt('handwerker')}: ${hwName} · ${tt('checkedOutSince')}: ${ausleihdatum}`,
              status: a.fields.status_ausleihe
                ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
                : undefined,
              icon: <IconTool size={20} className="text-primary" stroke={2} />,
            };
          })}
          onSelect={(id) => {
            setSelectedAusleiheId(id);
            setStep(2);
          }}
          emptyText={tt('noActiveLoans')}
          emptyIcon={<IconAlertCircle size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2 — Rückgabe erfassen */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-5 max-w-lg">
            {/* Context card */}
            <div className="rounded-2xl border bg-secondary p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" stroke={2} />
                <span className="font-medium text-foreground">
                  {selectedWerkzeug?.fields.werkzeugname ?? tt('werkzeug')}
                </span>
                {selectedWerkzeug?.fields.zustand && (
                  <StatusBadge
                    statusKey={selectedWerkzeug.fields.zustand.key}
                    label={selectedWerkzeug.fields.zustand.label}
                  />
                )}
              </div>
              {(() => {
                const hId = extractRecordId(selectedAusleihe.fields.handwerker);
                const hw = hId ? handwerkerMap.get(hId) : undefined;
                const hwName = hw
                  ? [hw.fields.vorname, hw.fields.nachname].filter(Boolean).join(' ')
                  : '—';
                return (
                  <p className="text-sm text-muted-foreground">
                    {tt('handwerker')}: {hwName}
                  </p>
                );
              })()}
            </div>

            {/* Return date */}
            <div className="space-y-1.5">
              <Label htmlFor="rueckgabeDatum">{tt('returnDate')} *</Label>
              <Input
                id="rueckgabeDatum"
                type="datetime-local"
                value={rueckgabeDatum}
                onChange={e => setRueckgabeDatum(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="bemerkungen">{tt('remarks')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('remarksPlaceholder')}
                rows={3}
                className="w-full"
              />
            </div>

            {/* Initiate service checkbox */}
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <input
                id="initiateService"
                type="checkbox"
                checked={initiateService}
                onChange={e => setInitiateService(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <Label htmlFor="initiateService" className="cursor-pointer">
                {tt('initiateService')}
              </Label>
            </div>

            {error2 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <IconAlertCircle size={16} stroke={2} />
                {error2}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <IconArrowBack size={16} className="mr-2" stroke={2} />
                Zurück
              </Button>
              <Button
                disabled={!rueckgabeDatum || submitting2}
                onClick={handleStep2Submit}
                className="flex-1"
              >
                {submitting2 ? tt('submitting') : tt('submit')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noPrerequisite')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Wartung/Reparatur anlegen (optional) */}
      {step === 3 && (
        selectedWerkzeugId ? (
          <div className="space-y-5 max-w-lg">
            {/* Context card */}
            <div className="rounded-2xl border bg-secondary p-4">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" stroke={2} />
                <span className="font-medium text-foreground">
                  {selectedWerkzeug?.fields.werkzeugname ?? tt('werkzeug')}
                </span>
              </div>
            </div>

            {/* Vorgangsart — radio tiles */}
            <div className="space-y-1.5">
              <Label>{tt('processType')} *</Label>
              <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="startdatum">{tt('startDate')} *</Label>
              <Input
                id="startdatum"
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Geplantes Enddatum */}
            <div className="space-y-1.5">
              <Label htmlFor="geplantesEnddatum">{tt('plannedEndDate')}</Label>
              <Input
                id="geplantesEnddatum"
                type="date"
                value={geplantesEnddatum}
                onChange={e => setGeplantesEnddatum(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-1.5">
              <Label htmlFor="beschreibung">{tt('description')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tt('descriptionPlaceholder')}
                rows={3}
                className="w-full"
              />
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label htmlFor="statusWartung">{tt('statusField')} *</Label>
              <Select value={statusWartung} onValueChange={setStatusWartung}>
                <SelectTrigger id="statusWartung" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_WARTUNG_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kosten */}
            <div className="space-y-1.5">
              <Label htmlFor="kosten">{tt('cost')}</Label>
              <Input
                id="kosten"
                type="number"
                min="0"
                step="0.01"
                value={kosten}
                onChange={e => setKosten(e.target.value)}
                placeholder="0.00"
                className="w-full"
              />
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-1.5">
              <Label htmlFor="verantwortlicher">{tt('responsible')}</Label>
              <Select value={verantwortlicherId} onValueChange={setVerantwortlicherId}>
                <SelectTrigger id="verantwortlicher" className="w-full">
                  <SelectValue placeholder={tt('noResponsible')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt('noResponsible')}</SelectItem>
                  {aktiveHandwerker.map(h => (
                    <SelectItem key={h.record_id} value={h.record_id}>
                      {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error3 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <IconAlertCircle size={16} stroke={2} />
                {error3}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                <IconArrowBack size={16} className="mr-2" stroke={2} />
                Zurück
              </Button>
              <Button
                disabled={!startdatum || !vorgangsart || !statusWartung || submitting3}
                onClick={handleStep3Submit}
                className="flex-1"
              >
                {submitting3 ? tt('creatingService') : tt('createService')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noPrerequisite')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
