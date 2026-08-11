/**
 * Werkzeug Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe bestätigen & Zustand erfassen →
 *         3) Wartung / Reparatur anlegen (nur wenn Zustand != verfuegbar).
 * Reads: ausleihe (filter status_ausleihe=ausgeliehen), handwerker (filter status=aktiv).
 * Writes: updateAusleiheEntry (status_ausleihe, tatsaechliches_rueckgabedatum, bemerkungen_ausleihe),
 *         updateWerkzeugeEntry (zustand), createWartungReparaturEntry (optional).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatDate, formatDateTime } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconTool,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug zurückgeben',
    pageSubtitle: 'Ausleihe abschließen und Zustand erfassen',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe bestätigen',
    step3: 'Wartung / Reparatur',
    step_done: 'Abgeschlossen',
    search_placeholder: 'Werkzeug oder Handwerker suchen…',
    empty_text: 'Keine offenen Ausleihen vorhanden.',
    rueckgabedatum_label: 'Tatsächliches Rückgabedatum',
    zustand_label: 'Neuer Zustand',
    bemerkungen_label: 'Bemerkungen',
    bemerkungen_placeholder: 'Optionale Bemerkungen zur Rückgabe…',
    btn_confirm: 'Rückgabe bestätigen',
    btn_confirming: 'Wird gespeichert…',
    vorgangsart_label: 'Vorgangsart',
    startdatum_label: 'Startdatum',
    enddatum_label: 'Geplantes Enddatum',
    beschreibung_label: 'Beschreibung',
    beschreibung_placeholder: 'Beschreibung der Maßnahme…',
    verantwortlicher_label: 'Verantwortlicher (optional)',
    verantwortlicher_none: 'Kein Verantwortlicher',
    btn_create_wartung: 'Vorgang anlegen',
    btn_creating: 'Wird angelegt…',
    btn_skip: 'Ohne Vorgang abschließen',
    success_title: 'Rückgabe erfolgreich',
    success_msg: 'Das Werkzeug wurde zurückgegeben und der Zustand aktualisiert.',
    success_wartung: 'Ein Wartungs-/Reparaturvorgang wurde angelegt.',
    btn_reset: 'Neue Rückgabe erfassen',
    btn_dashboard: 'Zurück zum Dashboard',
    missing_prereq: 'Dieser Schritt benötigt die Auswahl aus Schritt 1.',
    btn_restart: 'Neu starten',
    missing_prereq2: 'Dieser Schritt benötigt den Abschluss von Schritt 2.',
    ausleihdatum: 'Ausgeliehen seit',
    geplant_rueckgabe: 'Geplante Rückgabe',
    zustand_verfuegbar: 'Verfügbar',
    zustand_in_reparatur: 'In Reparatur',
    zustand_in_wartung: 'In Wartung',
    zustand_defekt: 'Defekt',
    error_required_vorgangsart: 'Bitte Vorgangsart wählen.',
    error_required_startdatum: 'Bitte Startdatum angeben.',
  },
  en: {
    pageTitle: 'Return Tool',
    pageSubtitle: 'Complete loan and record condition',
    step1: 'Select Loan',
    step2: 'Confirm Return',
    step3: 'Maintenance / Repair',
    step_done: 'Completed',
    search_placeholder: 'Search tool or worker…',
    empty_text: 'No open loans found.',
    rueckgabedatum_label: 'Actual Return Date',
    zustand_label: 'New Condition',
    bemerkungen_label: 'Remarks',
    bemerkungen_placeholder: 'Optional remarks on the return…',
    btn_confirm: 'Confirm Return',
    btn_confirming: 'Saving…',
    vorgangsart_label: 'Type',
    startdatum_label: 'Start Date',
    enddatum_label: 'Planned End Date',
    beschreibung_label: 'Description',
    beschreibung_placeholder: 'Description of the measure…',
    verantwortlicher_label: 'Responsible (optional)',
    verantwortlicher_none: 'No responsible person',
    btn_create_wartung: 'Create Record',
    btn_creating: 'Creating…',
    btn_skip: 'Finish without record',
    success_title: 'Return successful',
    success_msg: 'The tool has been returned and the condition updated.',
    success_wartung: 'A maintenance/repair record was created.',
    btn_reset: 'Record new return',
    btn_dashboard: 'Back to Dashboard',
    missing_prereq: 'This step requires a selection from step 1.',
    btn_restart: 'Restart',
    missing_prereq2: 'This step requires step 2 to be completed.',
    ausleihdatum: 'Loaned since',
    geplant_rueckgabe: 'Planned return',
    zustand_verfuegbar: 'Available',
    zustand_in_reparatur: 'In repair',
    zustand_in_wartung: 'In maintenance',
    zustand_defekt: 'Defective',
    error_required_vorgangsart: 'Please select a type.',
    error_required_startdatum: 'Please provide a start date.',
  },
});

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];

// Only the zustand keys relevant to the return step (not ausgeliehen/ausgemustert)
const RETURN_ZUSTAND_KEYS = ['verfuegbar', 'in_reparatur', 'in_wartung', 'defekt'];
const RETURN_ZUSTAND_OPTIONS = ZUSTAND_OPTIONS.filter(o => RETURN_ZUSTAND_KEYS.includes(o.key));

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, werkzeugeMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2
  const [rueckgabedatum, setRueckgabedatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [neuerZustand, setNeuerZustand] = useState(RETURN_ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Submitting, setStep2Submitting] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step2Done, setStep2Done] = useState(false);
  const [wartungNeeded, setWartungNeeded] = useState(false);

  // Step 3
  const [vorgangsart, setVorgangsart] = useState(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState('');
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [selectedVerantwortlicherId, setSelectedVerantwortlicherId] = useState<string>('none');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [step3Done, setStep3Done] = useState(false);
  const [wartungCreatedId, setWartungCreatedId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filtered data
  const offeneAusleihen = ausleihe.filter(
    a => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  const enrichedAusleihen: EnrichedAusleihe[] = offeneAusleihen.map(a => {
    const wId = extractRecordId(a.fields.werkzeug);
    const hId = extractRecordId(a.fields.handwerker);
    const wz = wId ? werkzeugeMap.get(wId) : undefined;
    const hw = hId ? handwerker.find(h => h.record_id === hId) : undefined;
    const wzName = wz?.fields.werkzeugname ?? wId ?? '—';
    const hwName = hw
      ? `${hw.fields.vorname ?? ''} ${hw.fields.nachname ?? ''}`.trim() || hw.record_id
      : hId ?? '—';
    return {
      ...a,
      werkzeugName: wzName,
      handwerkerName: hwName,
    };
  });

  const activeHandwerker = handwerker.filter(h => h.fields.status?.key === 'aktiv');

  // Step 2: confirm return
  const handleStep2Submit = async () => {
    if (!selectedAusleihe) return;
    setStep2Submitting(true);
    setStep2Error(null);
    try {
      const linkedWerkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      if (linkedWerkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(linkedWerkzeugId, {
          zustand: neuerZustand,
        });
      }

      await fetchAll();
      setStep2Done(true);

      if (neuerZustand === 'verfuegbar') {
        setWartungNeeded(false);
        setSuccess(true);
        setStep(4);
      } else {
        setWartungNeeded(true);
        setStep(3);
      }
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setStep2Submitting(false);
    }
  };

  // Step 3: create Wartung/Reparatur
  const handleStep3Submit = async () => {
    if (!selectedAusleihe) return;
    if (!vorgangsart) {
      setStep3Error(tt('error_required_vorgangsart'));
      return;
    }
    if (!startdatum) {
      setStep3Error(tt('error_required_startdatum'));
      return;
    }
    setStep3Submitting(true);
    setStep3Error(null);

    try {
      const linkedWerkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);

      // Idempotency guard: skip create if already created on a previous attempt
      let wid = wartungCreatedId;
      if (!wid) {
        const payload: Parameters<typeof LivingAppsService.createWartungReparaturEntry>[0] = {
          vorgangsart,
          startdatum,
          status_wartung: 'geplant',
        };
        if (linkedWerkzeugId) {
          payload.werkzeug_wartung = createRecordUrl(APP_IDS.WERKZEUGE, linkedWerkzeugId);
        }
        if (geplantesEnddatum) payload.geplantes_enddatum = geplantesEnddatum;
        if (beschreibung) payload.beschreibung = beschreibung;
        if (selectedVerantwortlicherId && selectedVerantwortlicherId !== 'none') {
          payload.verantwortlicher = createRecordUrl(APP_IDS.HANDWERKER, selectedVerantwortlicherId);
        }

        const result = await LivingAppsService.createWartungReparaturEntry(payload);
        wid = result.record_id;
        setWartungCreatedId(wid);
      }

      setStep3Done(true);
      setSuccess(true);
      setStep(4);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : 'Fehler beim Anlegen.');
    } finally {
      setStep3Submitting(false);
    }
  };

  const handleSkipStep3 = () => {
    setSuccess(true);
    setStep(4);
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNeuerZustand(RETURN_ZUSTAND_OPTIONS[0]?.key ?? 'verfuegbar');
    setBemerkungen('');
    setStep2Submitting(false);
    setStep2Error(null);
    setStep2Done(false);
    setWartungNeeded(false);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum('');
    setGeplantesEnddatum('');
    setBeschreibung('');
    setSelectedVerantwortlicherId('none');
    setStep3Submitting(false);
    setStep3Error(null);
    setStep3Done(false);
    setWartungCreatedId(null);
    setSuccess(false);
  };

  const wizardSteps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step_done') },
  ];

  // Find werkzeug record for display in step 2
  const selectedWerkzeug = selectedAusleihe
    ? (() => {
        const wId = extractRecordId(selectedAusleihe.fields.werkzeug);
        return wId ? werkzeugeMap.get(wId) : undefined;
      })()
    : undefined;

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('pageSubtitle')}
      steps={wizardSteps}
      currentStep={step}
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
            subtitle: `${a.handwerkerName} · ${tt('ausleihdatum')}: ${formatDateTime(a.fields.ausleihdatum)}${a.fields.geplantes_rueckgabedatum ? ` · ${tt('geplant_rueckgabe')}: ${formatDate(a.fields.geplantes_rueckgabedatum)}` : ''}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={id => {
            const found = enrichedAusleihen.find(a => a.record_id === id);
            if (found) {
              setSelectedAusleihe(found);
              setStep(2);
            }
          }}
          searchPlaceholder={tt('search_placeholder')}
          emptyText={tt('empty_text')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Rückgabe bestätigen ── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Kontext-Karte */}
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" stroke={1.5} />
                <span className="font-semibold text-foreground">
                  {(selectedAusleihe as EnrichedAusleihe).werkzeugName}
                </span>
                {selectedWerkzeug?.fields.zustand && (
                  <StatusBadge
                    statusKey={selectedWerkzeug.fields.zustand.key}
                    label={selectedWerkzeug.fields.zustand.label}
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {(selectedAusleihe as EnrichedAusleihe).handwerkerName}
                {' · '}
                {tt('ausleihdatum')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}
              </p>
              {selectedWerkzeug?.fields.inventarnummer && (
                <p className="text-xs text-muted-foreground">
                  Nr. {selectedWerkzeug.fields.inventarnummer}
                  {selectedWerkzeug.fields.standort ? ` · ${selectedWerkzeug.fields.standort}` : ''}
                </p>
              )}
            </div>

            {/* Rückgabedatum */}
            <div className="space-y-2">
              <Label htmlFor="rueckgabedatum">{tt('rueckgabedatum_label')}</Label>
              <Input
                id="rueckgabedatum"
                type="datetime-local"
                value={rueckgabedatum}
                onChange={e => setRueckgabedatum(e.target.value)}
              />
            </div>

            {/* Neuer Zustand */}
            <div className="space-y-2">
              <Label>{tt('zustand_label')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {RETURN_ZUSTAND_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setNeuerZustand(opt.key)}
                    className={`rounded-xl border p-3 text-sm font-medium text-left transition-colors ${
                      neuerZustand === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.key === 'verfuegbar' && <IconCheck size={14} className="inline mr-1" stroke={2} />}
                    {opt.key !== 'verfuegbar' && <IconAlertTriangle size={14} className="inline mr-1" stroke={2} />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bemerkungen */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tt('bemerkungen_label')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tt('bemerkungen_placeholder')}
                rows={3}
              />
            </div>

            {step2Error && (
              <p className="text-sm text-destructive">{step2Error}</p>
            )}

            <Button
              className="w-full"
              disabled={step2Submitting || !rueckgabedatum || !neuerZustand}
              onClick={handleStep2Submit}
            >
              {step2Submitting ? tt('btn_confirming') : tt('btn_confirm')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missing_prereq')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Wartung / Reparatur anlegen ── */}
      {step === 3 && (
        step2Done && selectedAusleihe ? (
          <div className="space-y-6 max-w-lg mx-auto">
            {/* Kontext */}
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <IconTool size={20} className="text-amber-500" stroke={1.5} />
              <div>
                <p className="font-semibold text-foreground">
                  {(selectedAusleihe as EnrichedAusleihe).werkzeugName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ZUSTAND_OPTIONS.find(o => o.key === neuerZustand)?.label ?? neuerZustand}
                </p>
              </div>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <Label>{tt('vorgangsart_label')}</Label>
              <div className="flex gap-2">
                {VORGANGSART_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVorgangsart(opt.key)}
                    className={`flex-1 rounded-xl border p-3 text-sm font-medium transition-colors ${
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
            <div className="space-y-2">
              <Label htmlFor="startdatum">
                {tt('startdatum_label')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startdatum"
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
              />
            </div>

            {/* Geplantes Enddatum */}
            <div className="space-y-2">
              <Label htmlFor="enddatum">{tt('enddatum_label')}</Label>
              <Input
                id="enddatum"
                type="date"
                value={geplantesEnddatum}
                onChange={e => setGeplantesEnddatum(e.target.value)}
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="beschreibung">{tt('beschreibung_label')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tt('beschreibung_placeholder')}
                rows={3}
              />
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-2">
              <Label htmlFor="verantwortlicher">{tt('verantwortlicher_label')}</Label>
              <select
                id="verantwortlicher"
                value={selectedVerantwortlicherId}
                onChange={e => setSelectedVerantwortlicherId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="none">{tt('verantwortlicher_none')}</option>
                {activeHandwerker.map(h => (
                  <option key={h.record_id} value={h.record_id}>
                    {`${h.fields.vorname ?? ''} ${h.fields.nachname ?? ''}`.trim() || h.record_id}
                    {h.fields.abteilung ? ` · ${h.fields.abteilung}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {step3Error && (
              <p className="text-sm text-destructive">{step3Error}</p>
            )}

            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={step3Submitting || !vorgangsart || !startdatum}
                onClick={handleStep3Submit}
              >
                {step3Submitting ? tt('btn_creating') : tt('btn_create_wartung')}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={step3Submitting}
                onClick={handleSkipStep3}
              >
                {tt('btn_skip')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missing_prereq2')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Erfolg ── */}
      {step === 4 && (
        success ? (
          <div className="text-center py-16 space-y-4 max-w-sm mx-auto">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-5">
                <IconCheck size={40} className="text-primary" stroke={2} />
              </div>
            </div>
            <h2 className="text-xl font-semibold text-foreground">{tt('success_title')}</h2>
            <p className="text-sm text-muted-foreground">{tt('success_msg')}</p>
            {step3Done && wartungCreatedId && (
              <p className="text-sm text-muted-foreground">{tt('success_wartung')}</p>
            )}
            {selectedAusleihe && (
              <div className="rounded-xl border bg-secondary p-3 text-sm text-left space-y-1">
                <p className="font-medium">{(selectedAusleihe as EnrichedAusleihe).werkzeugName}</p>
                <p className="text-muted-foreground">
                  {ZUSTAND_OPTIONS.find(o => o.key === neuerZustand)?.label ?? neuerZustand}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleReset}>{tt('btn_reset')}</Button>
              <a href="#/" className="text-sm text-primary underline underline-offset-4">
                {tt('btn_dashboard')}
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missing_prereq')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
