/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe auswählen (nur status_ausleihe = 'ausgeliehen')
 *        → 2) Rückgabe erfassen (tatsaechliches_rueckgabedatum, Zustand, Bemerkungen)
 *        → 3) Wartung/Reparatur anlegen (optional, nur bei zustand in_reparatur|in_wartung)
 * Reads: ausleihe, werkzeuge, handwerker.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry),
 *         wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import { formatDateTime } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  IconArrowLeft,
  IconCheck,
  IconTool,
  IconPackageOff,
  IconAlertTriangle,
  IconCheckbox,
} from '@tabler/icons-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    title: 'Werkzeug zurückgeben', /* i18n-exempt */
    subtitle: 'Rückgabe erfassen und Zustand festhalten',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe',
    step3: 'Wartung / Reparatur',
    step1_empty: 'Keine offenen Ausleihen',
    step1_subtitle: 'Rückgabedatum & Zustand',
    rueckgabe_datum_label: 'Tatsächliches Rückgabedatum',
    zustand_label: 'Zustand nach Rückgabe',
    bemerkungen_label: 'Bemerkungen',
    zustand_verfuegbar: 'Verfügbar',
    zustand_in_reparatur: 'In Reparatur',
    zustand_in_wartung: 'In Wartung',
    zustand_defekt: 'Defekt',
    btn_erfassen: 'Rückgabe erfassen',
    btn_recording: 'Wird gespeichert …',
    step2_hint_wartung: 'Da der Zustand "{z}" ist, kannst du im nächsten Schritt einen Vorgang anlegen.',
    step2_hint_done: 'Rückgabe wird als erledigt abgeschlossen.',
    vorgangsart_label: 'Vorgangsart',
    wartung_label: 'Wartung',
    reparatur_label: 'Reparatur',
    startdatum_label: 'Startdatum',
    enddatum_label: 'Geplantes Enddatum',
    verantwortlicher_label: 'Verantwortlicher Handwerker',
    beschreibung_label: 'Beschreibung',
    status_wartung_label: 'Status',
    btn_anlegen: 'Vorgang anlegen',
    btn_anlegen_running: 'Wird angelegt …',
    btn_skip: 'Überspringen',
    success_title: 'Rückgabe erfolgreich!',
    success_desc: 'Das Werkzeug wurde zurückgegeben und der Zustand aktualisiert.',
    success_wartung_desc: 'Zusätzlich wurde ein Wartungs-/Reparaturvorgang angelegt.',
    btn_new: 'Weitere Rückgabe',
    btn_dashboard: 'Zurück zum Dashboard',
    restart_hint: 'Dieser Schritt benötigt eine Auswahl aus Schritt 1.',
    btn_restart: 'Neu starten',
    select_handwerker: 'Handwerker auswählen …',
    no_handwerker: 'Kein aktiver Handwerker vorhanden',
    ausleihdatum: 'Ausgeliehen seit',
    werkzeug: 'Werkzeug',
    handwerker: 'Handwerker',
    required_hint: '* Pflichtfeld',
    step3_pre_selected: 'Vorgangsart automatisch gewählt basierend auf dem Zustand.',
  },
  en: {
    title: 'Return Tool', /* i18n-exempt */
    subtitle: 'Record the return and capture the condition',
    step1: 'Select Loan',
    step2: 'Return',
    step3: 'Maintenance / Repair',
    step1_empty: 'No open loans',
    step1_subtitle: 'Return date & condition',
    rueckgabe_datum_label: 'Actual Return Date',
    zustand_label: 'Condition after Return',
    bemerkungen_label: 'Remarks',
    zustand_verfuegbar: 'Available',
    zustand_in_reparatur: 'In Repair',
    zustand_in_wartung: 'In Maintenance',
    zustand_defekt: 'Defective',
    btn_erfassen: 'Record Return',
    btn_recording: 'Saving …',
    step2_hint_wartung: 'Since condition is "{z}", you can create a work order in the next step.',
    step2_hint_done: 'Return will be completed.',
    vorgangsart_label: 'Process Type',
    wartung_label: 'Maintenance',
    reparatur_label: 'Repair',
    startdatum_label: 'Start Date',
    enddatum_label: 'Planned End Date',
    verantwortlicher_label: 'Responsible Craftsman',
    beschreibung_label: 'Description',
    status_wartung_label: 'Status',
    btn_anlegen: 'Create work order',
    btn_anlegen_running: 'Creating …',
    btn_skip: 'Skip',
    success_title: 'Return recorded!',
    success_desc: 'The tool has been returned and its condition updated.',
    success_wartung_desc: 'A maintenance/repair work order was also created.',
    btn_new: 'Another Return',
    btn_dashboard: 'Back to Dashboard',
    restart_hint: 'This step requires a selection from Step 1.',
    btn_restart: 'Start over',
    select_handwerker: 'Select craftsman …',
    no_handwerker: 'No active craftsman available',
    ausleihdatum: 'Checked out since',
    werkzeug: 'Tool',
    handwerker: 'Craftsman',
    required_hint: '* Required field',
    step3_pre_selected: 'Process type auto-selected based on condition.',
  },
});

// ── Lookup options ─────────────────────────────────────────────────────────────
const VORGANGSART_OPTS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

// Condition options for local select (not a stored lookup from ausleihe, but
// maps to werkzeuge.zustand keys)
const ZUSTAND_OPTS: { key: string; label: (t: typeof tt) => string }[] = [
  { key: 'verfuegbar', label: t => t('zustand_verfuegbar') },
  { key: 'in_reparatur', label: t => t('zustand_in_reparatur') },
  { key: 'in_wartung', label: t => t('zustand_in_wartung') },
  { key: 'defekt', label: t => t('zustand_defekt') },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, werkzeugeMap, handwerkerMap, loading, error, fetchAll } =
    useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: selection
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2: return fields
  const [rueckgabeDatum, setRueckgabeDatum] = useState('');
  const [zustandKey, setZustandKey] = useState('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Step 3: maintenance/repair
  const [vorgangsart, setVorgangsart] = useState('');
  const [startdatum, setStartdatum] = useState('');
  const [geplantesDatum, setGeplantesDatum] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung] = useState(STATUS_WARTUNG_OPTS[0]?.key ?? 'geplant');
  const [anlegen, setAnlegen] = useState(false);
  const [anlegerError, setAnlegerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [wartungCreated, setWartungCreated] = useState(false);

  // Derived data
  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  const offeneAusleihe = useMemo(
    () => enrichedAusleihe.filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  const activeHandwerker = useMemo(
    () => handwerker.filter(h => h.fields.status?.key === 'aktiv'),
    [handwerker]
  );

  // Suppress unused warning — werkzeuge is consumed via werkzeugeMap
  void werkzeuge;

  const needsWartung = zustandKey === 'in_reparatur' || zustandKey === 'in_wartung';

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleSelectAusleihe(id: string) {
    const found = offeneAusleihe.find(a => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    // Pre-fill return date with now
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey('verfuegbar');
    setBemerkungen('');
    setSaveError(null);
    setStep(2);
  }

  async function handleRueckgabe() {
    if (!selectedAusleihe || !rueckgabeDatum) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Update ausleihe record
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        status_ausleihe: 'zurueckgegeben',
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      // Update werkzeug zustand
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey,
        });
      }

      await fetchAll();

      if (needsWartung) {
        // Pre-select vorgangsart
        const preVorgangsart = zustandKey === 'in_wartung' ? 'wartung' : 'reparatur';
        setVorgangsart(preVorgangsart);
        setStartdatum(format(new Date(), 'yyyy-MM-dd'));
        setGeplantesDatum('');
        setVerantwortlicherId('');
        setBeschreibung('');
        setAnlegerError(null);
        setAnlegen(false);
        setStep(3);
      } else {
        setDone(true);
        setStep(4);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleWartungAnlegen() {
    if (!selectedAusleihe || !vorgangsart || !startdatum) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) return;

    setAnlegen(true);
    setAnlegerError(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart,
        startdatum,
        geplantes_enddatum: geplantesDatum || undefined,
        verantwortlicher: verantwortlicherId
          ? createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId)
          : undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
      });
      await fetchAll();
      setWartungCreated(true);
      setDone(true);
      setStep(4);
    } catch (err) {
      setAnlegerError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnlegen(false);
    }
  }

  function handleSkipWartung() {
    setDone(true);
    setStep(4);
  }

  function handleReset() {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabeDatum('');
    setZustandKey('verfuegbar');
    setBemerkungen('');
    setSaveError(null);
    setVorgangsart('');
    setStartdatum('');
    setGeplantesDatum('');
    setVerantwortlicherId('');
    setBeschreibung('');
    setAnlegerError(null);
    setDone(false);
    setWartungCreated(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
  ];

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={Math.min(step, 3)}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe auswählen ──────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihe.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || a.record_id,
            subtitle: `${tt('handwerker')}: ${a.handwerkerName || '—'} · ${tt('ausleihdatum')}: ${formatDateTime(a.fields.ausleihdatum)}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectAusleihe}
          emptyText={tt('step1_empty')}
          emptyIcon={<IconPackageOff size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Rückgabe erfassen ───────────────────────────────────── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-5 max-w-lg mx-auto">
            {/* Context card */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{selectedAusleihe.werkzeugName || '—'}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {tt('handwerker')}: {selectedAusleihe.handwerkerName || '—'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tt('ausleihdatum')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}
                  </p>
                </div>
                <StatusBadge
                  statusKey={selectedAusleihe.fields.status_ausleihe?.key}
                  label={selectedAusleihe.fields.status_ausleihe?.label}
                />
              </div>
            </div>

            {/* Actual return date */}
            <div className="space-y-1.5">
              <Label htmlFor="rueckgabe-datum">
                {tt('rueckgabe_datum_label')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rueckgabe-datum"
                type="datetime-local"
                value={rueckgabeDatum}
                onChange={e => setRueckgabeDatum(e.target.value)}
              />
            </div>

            {/* Condition select */}
            <div className="space-y-2">
              <Label>{tt('zustand_label')} <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-2 gap-2">
                {ZUSTAND_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setZustandKey(opt.key)}
                    className={`rounded-xl border p-3 text-left text-sm font-medium transition-colors
                      ${zustandKey === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-secondary/60 text-foreground'
                      }`}
                  >
                    {opt.label(tt)}
                  </button>
                ))}
              </div>
            </div>

            {/* Bemerkungen */}
            <div className="space-y-1.5">
              <Label htmlFor="bemerkungen">{tt('bemerkungen_label')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Hint for next step */}
            {needsWartung && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
                <IconAlertTriangle size={16} stroke={1.5} className="mt-0.5 shrink-0" />
                <span>
                  {tt('step2_hint_wartung', {
                    z: ZUSTAND_OPTS.find(o => o.key === zustandKey)?.label(tt) ?? zustandKey,
                  })}
                </span>
              </div>
            )}

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep(1)}>
                <IconArrowLeft size={16} stroke={1.5} className="mr-1" />
                {/* back */}
              </Button>
              <Button
                className="flex-1"
                disabled={!rueckgabeDatum || saving}
                onClick={handleRueckgabe}
              >
                {saving ? tt('btn_recording') : tt('btn_erfassen')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{tt('required_hint')}</p>
          </div>
        ) : (
          /* Deep-link fallback */
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('restart_hint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Wartung / Reparatur anlegen ────────────────────────── */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-5 max-w-lg mx-auto">
            {/* Vorgangsart tile select */}
            <div className="space-y-2">
              <Label>{tt('vorgangsart_label')} <span className="text-destructive">*</span></Label>
              <p className="text-xs text-muted-foreground">{tt('step3_pre_selected')}</p>
              <div className="grid grid-cols-2 gap-2">
                {VORGANGSART_OPTS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVorgangsart(opt.key)}
                    className={`rounded-xl border p-3 text-left text-sm font-medium transition-colors
                      ${vorgangsart === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:bg-secondary/60 text-foreground'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Startdatum */}
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="enddatum">{tt('enddatum_label')}</Label>
              <Input
                id="enddatum"
                type="date"
                value={geplantesDatum}
                onChange={e => setGeplantesDatum(e.target.value)}
              />
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-1.5">
              <Label htmlFor="verantwortlicher">{tt('verantwortlicher_label')}</Label>
              {activeHandwerker.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tt('no_handwerker')}</p>
              ) : (
                <select
                  id="verantwortlicher"
                  value={verantwortlicherId}
                  onChange={e => setVerantwortlicherId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">{tt('select_handwerker')}</option>
                  {activeHandwerker.map(h => (
                    <option key={h.record_id} value={h.record_id}>
                      {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Beschreibung */}
            <div className="space-y-1.5">
              <Label htmlFor="beschreibung">{tt('beschreibung_label')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {anlegerError && (
              <p className="text-sm text-destructive">{anlegerError}</p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-1">
              <Button
                variant="outline"
                onClick={handleSkipWartung}
                className="sm:w-auto"
              >
                {tt('btn_skip')}
              </Button>
              <Button
                className="flex-1"
                disabled={!vorgangsart || !startdatum || anlegen}
                onClick={handleWartungAnlegen}
              >
                {anlegen ? tt('btn_anlegen_running') : tt('btn_anlegen')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{tt('required_hint')}</p>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('restart_hint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Success ─────────────────────────────────────────────── */}
      {step === 4 && done && (
        <div className="flex flex-col items-center text-center py-12 space-y-4 max-w-sm mx-auto">
          <div className="rounded-full bg-primary/10 p-4">
            {wartungCreated
              ? <IconCheckbox size={36} className="text-primary" stroke={1.5} />
              : <IconCheck size={36} className="text-primary" stroke={1.5} />
            }
          </div>
          <h2 className="text-xl font-semibold">{tt('success_title')}</h2>
          <p className="text-sm text-muted-foreground">
            {tt('success_desc')}
            {wartungCreated && (
              <> {tt('success_wartung_desc')}</>
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 w-full pt-2">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              {tt('btn_new')}
            </Button>
            <a href="#/" className="flex-1">
              <Button className="w-full">{tt('btn_dashboard')}</Button>
            </a>
          </div>
        </div>
      )}

      {/* fallback for step 4 if arrived cold */}
      {step === 4 && !done && (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">{tt('restart_hint')}</p>
          <Button variant="outline" onClick={() => setStep(1)}>{tt('btn_restart')}</Button>
        </div>
      )}
    </IntentWizardShell>
  );
}
