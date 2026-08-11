/**
 * Werkzeug Rückgabe — 4-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur 'ausgeliehen') → 2) Rückgabe bestätigen & Werkzeugzustand setzen
 *        → 3) Wartung/Reparatur anlegen (nur wenn Zustand 'in_reparatur' oder 'in_wartung')
 *        → 4) Zusammenfassung.
 * Reads: ausleihe (EnrichedAusleihe), werkzeuge, handwerker.
 * Writes: updateAusleiheEntry (status + Rückgabedatum), updateWerkzeugeEntry (zustand),
 *         createWartungReparaturEntry (optional).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { enrichAusleihe } from '@/lib/enrich';
import { formatDate, formatDateTime, lookupKey } from '@/lib/formatters';
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
  IconTool,
  IconArrowBack,
  IconCircleCheck,
  IconAlertTriangle,
  IconRefresh,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageHeading: 'Werkzeug zurückgeben',
    pageSubheading: 'Ausleihe abschließen und Werkzeugzustand aktualisieren',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe bestätigen',
    step3: 'Wartung / Reparatur',
    step4: 'Zusammenfassung',
    searchPlaceholder: 'Werkzeug oder Handwerker suchen …',
    keineAusleihen: 'Keine offenen Ausleihen gefunden.',
    ausgeliehen: 'Ausgeliehen seit',
    geplanteRueckgabe: 'Geplante Rückgabe',
    rueckgabeDateLabel: 'Tatsächliches Rückgabedatum & -uhrzeit',
    neuerZustandLabel: 'Neuer Werkzeugzustand nach Rückgabe',
    bemerkungenLabel: 'Bemerkungen (optional)',
    bemerkungenPlaceholder: 'Hinweise zur Rückgabe …',
    bestaetigen: 'Rückgabe bestätigen',
    confirming: 'Wird bestätigt …',
    zustandRequired: 'Bitte einen neuen Zustand wählen.',
    rueckgabeRequired: 'Bitte Rückgabedatum angeben.',
    wartungTitle: 'Wartung oder Reparatur anlegen',
    wartungHint: 'Das Werkzeug ist als "{zustand}" markiert. Soll ein Wartungs- oder Reparaturvorgang angelegt werden?',
    vorgangsartLabel: 'Vorgangsart',
    startdatumLabel: 'Startdatum',
    enddatumLabel: 'Geplantes Enddatum (optional)',
    beschreibungLabel: 'Beschreibung (optional)',
    beschreibungPlaceholder: 'Problembeschreibung oder geplante Maßnahme …',
    statusWartungLabel: 'Status',
    anlegen: 'Vorgang anlegen',
    anlegenRunning: 'Wird angelegt …',
    ueberspringen: 'Schritt überspringen',
    summaryTitle: 'Rückgabe abgeschlossen',
    summaryWerkzeug: 'Werkzeug',
    summaryHandwerker: 'Handwerker',
    summaryNeuerZustand: 'Neuer Zustand',
    summaryWartung: 'Wartung / Reparatur',
    summaryWartungJa: 'Angelegt',
    summaryWartungNein: 'Nicht angelegt',
    neueRueckgabe: 'Weitere Rückgabe erfassen',
    zurueck: 'Zurück zum Dashboard',
    contextWerkzeug: 'Werkzeug',
    contextHandwerker: 'Handwerker',
    wartungRequired: 'Bitte Vorgangsart und Startdatum angeben.',
    vorgangsartWartung: 'Wartung',
    vorgangsartReparatur: 'Reparatur',
    noAusleiheSelected: 'Keine Ausleihe ausgewählt.',
    backToStep1: 'Zur Auswahl zurückkehren',
    zustandWaehlen: 'Zustand wählen …',
  },
  en: {
    pageHeading: 'Return Tool',
    pageSubheading: 'Close lending and update tool condition',
    step1: 'Select Lending',
    step2: 'Confirm Return',
    step3: 'Maintenance / Repair',
    step4: 'Summary',
    searchPlaceholder: 'Search tool or craftsman …',
    keineAusleihen: 'No open lendings found.',
    ausgeliehen: 'Checked out since',
    geplanteRueckgabe: 'Planned return',
    rueckgabeDateLabel: 'Actual return date & time',
    neuerZustandLabel: 'New tool condition after return',
    bemerkungenLabel: 'Remarks (optional)',
    bemerkungenPlaceholder: 'Notes about the return …',
    bestaetigen: 'Confirm return',
    confirming: 'Confirming …',
    zustandRequired: 'Please select a new condition.',
    rueckgabeRequired: 'Please provide a return date.',
    wartungTitle: 'Create Maintenance or Repair',
    wartungHint: 'The tool is marked as "{zustand}". Would you like to create a maintenance or repair record?',
    vorgangsartLabel: 'Process type',
    startdatumLabel: 'Start date',
    enddatumLabel: 'Planned end date (optional)',
    beschreibungLabel: 'Description (optional)',
    beschreibungPlaceholder: 'Problem description or planned action …',
    statusWartungLabel: 'Status',
    anlegen: 'Create entry',
    anlegenRunning: 'Creating …',
    ueberspringen: 'Skip this step',
    summaryTitle: 'Return completed',
    summaryWerkzeug: 'Tool',
    summaryHandwerker: 'Craftsman',
    summaryNeuerZustand: 'New condition',
    summaryWartung: 'Maintenance / Repair',
    summaryWartungJa: 'Created',
    summaryWartungNein: 'Not created',
    neueRueckgabe: 'Record another return',
    zurueck: 'Back to Dashboard',
    contextWerkzeug: 'Tool',
    contextHandwerker: 'Craftsman',
    wartungRequired: 'Please provide process type and start date.',
    vorgangsartWartung: 'Maintenance',
    vorgangsartReparatur: 'Repair',
    noAusleiheSelected: 'No lending selected.',
    backToStep1: 'Back to selection',
    zustandWaehlen: 'Select condition …',
  },
});

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const ZUSTAND_RETURN_OPTIONS = ZUSTAND_OPTIONS.filter(o => o.key !== 'ausgeliehen');
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll, werkzeugeMap, handwerkerMap } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2 state
  const [rueckgabeDatum, setRueckgabeDatum] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [neuerZustandKey, setNeuerZustandKey] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Error, setStep2Error] = useState('');
  const [step2Submitting, setStep2Submitting] = useState(false);

  // Step 3 state
  const [vorgangsartKey, setVorgangsartKey] = useState(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
  const [startdatum, setStartdatum] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [geplantesEnddatum, setGeplantesEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartungKey, setStatusWartungKey] = useState('geplant');
  const [step3Error, setStep3Error] = useState('');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [wartungAngelegt, setWartungAngelegt] = useState(false);
  const [wartungId, setWartungId] = useState<string | null>(null);

  const enrichedAusleihe = useMemo(
    () => enrichAusleihe(ausleihe, { werkzeugeMap, handwerkerMap }),
    [ausleihe, werkzeugeMap, handwerkerMap]
  );

  const offeneAusleihen = useMemo(
    () => enrichedAusleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
    [enrichedAusleihe]
  );

  const needsWartung =
    neuerZustandKey === 'in_reparatur' || neuerZustandKey === 'in_wartung';

  const zustandLabel = useMemo(
    () => ZUSTAND_OPTIONS.find(o => o.key === neuerZustandKey)?.label ?? neuerZustandKey,
    [neuerZustandKey]
  );

  // ── Helper: resolve werkzeug id from selected ausleihe ──────────────
  function getWerkzeugId(): string | null {
    if (!selectedAusleihe) return null;
    return extractRecordId(selectedAusleihe.fields.werkzeug);
  }

  function getHandwerkerId(): string | null {
    if (!selectedAusleihe) return null;
    return extractRecordId(selectedAusleihe.fields.handwerker);
  }

  // ── Step 1: select ──────────────────────────────────────────────────
  function handleSelectAusleihe(id: string) {
    const found = enrichedAusleihe.find(a => a.record_id === id) ?? null;
    setSelectedAusleihe(found);
    setStep(2);
  }

  // ── Step 2: confirm return ──────────────────────────────────────────
  async function handleConfirmReturn() {
    if (!rueckgabeDatum) { setStep2Error(tt('rueckgabeRequired')); return; }
    if (!neuerZustandKey) { setStep2Error(tt('zustandRequired')); return; }
    if (!selectedAusleihe) return;
    const werkzeugId = getWerkzeugId();
    if (!werkzeugId) return;

    setStep2Error('');
    setStep2Submitting(true);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: neuerZustandKey,
      });
      await fetchAll();
      if (needsWartung) {
        setStep(3);
      } else {
        setStep(4);
      }
    } catch (err) {
      setStep2Error(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setStep2Submitting(false);
    }
  }

  // ── Step 3: create Wartung/Reparatur ────────────────────────────────
  async function handleCreateWartung() {
    if (!vorgangsartKey || !startdatum) { setStep3Error(tt('wartungRequired')); return; }
    const werkzeugId = getWerkzeugId();
    const handwerkerId = getHandwerkerId();
    if (!werkzeugId) return;

    // Idempotency guard: skip create if already done
    if (wartungId) {
      setStep(4);
      return;
    }

    setStep3Error('');
    setStep3Submitting(true);
    try {
      const result = await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        verantwortlicher: handwerkerId
          ? createRecordUrl(APP_IDS.HANDWERKER, handwerkerId)
          : undefined,
        vorgangsart: vorgangsartKey,
        startdatum,
        geplantes_enddatum: geplantesEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartungKey,
      });
      setWartungId(result.record_id);
      setWartungAngelegt(true);
      await fetchAll();
      setStep(4);
    } catch (err) {
      setStep3Error(err instanceof Error ? err.message : 'Fehler beim Anlegen.');
    } finally {
      setStep3Submitting(false);
    }
  }

  function handleSkipWartung() {
    setWartungAngelegt(false);
    setStep(4);
  }

  function handleReset() {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setNeuerZustandKey('');
    setBemerkungen('');
    setStep2Error('');
    setVorgangsartKey(VORGANGSART_OPTIONS[0]?.key ?? 'wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesEnddatum('');
    setBeschreibung('');
    setStatusWartungKey('geplant');
    setStep3Error('');
    setWartungAngelegt(false);
    setWartungId(null);
  }

  // ── Shared: selected ausleihe context bar ──────────────────────────
  function ContextBar() {
    if (!selectedAusleihe) return null;
    return (
      <div className="rounded-xl border bg-secondary/40 px-4 py-3 flex flex-wrap gap-4 items-center text-sm mb-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <IconTool size={15} stroke={1.5} />
          <span className="font-medium text-foreground">{selectedAusleihe.werkzeugName || '—'}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <IconArrowBack size={15} stroke={1.5} />
          <span className="font-medium text-foreground">{selectedAusleihe.handwerkerName || '—'}</span>
        </span>
        {selectedAusleihe.fields.ausleihdatum && (
          <span className="text-muted-foreground">
            {tt('ausgeliehen')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}
          </span>
        )}
      </div>
    );
  }

  // ── Steps definition ───────────────────────────────────────────────
  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('pageHeading')}
      subtitle={tt('pageSubheading')}
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Ausleihe wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || '—',
            subtitle: `${a.handwerkerName || '—'} · ${tt('ausgeliehen')}: ${formatDateTime(a.fields.ausleihdatum)}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            stats: a.fields.geplantes_rueckgabedatum
              ? [{ label: tt('geplanteRueckgabe'), value: formatDateTime(a.fields.geplantes_rueckgabedatum) }]
              : [],
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('keineAusleihen')}
          emptyIcon={<IconArrowBack size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Rückgabe bestätigen ── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-4">
            <ContextBar />

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rueckgabeDatum">{tt('rueckgabeDateLabel')} *</Label>
                <Input
                  id="rueckgabeDatum"
                  type="datetime-local"
                  value={rueckgabeDatum}
                  onChange={e => setRueckgabeDatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="neuerZustand">{tt('neuerZustandLabel')} *</Label>
                <Select value={neuerZustandKey} onValueChange={setNeuerZustandKey}>
                  <SelectTrigger id="neuerZustand" className="w-full">
                    <SelectValue placeholder={tt('zustandWaehlen')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ZUSTAND_RETURN_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tt('bemerkungenLabel')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tt('bemerkungenPlaceholder')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>

              {step2Error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <IconAlertTriangle size={15} stroke={1.5} />
                  {step2Error}
                </div>
              )}

              <Button
                className="w-full"
                disabled={step2Submitting || !rueckgabeDatum || !neuerZustandKey}
                onClick={handleConfirmReturn}
              >
                {step2Submitting ? tt('confirming') : tt('bestaetigen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noAusleiheSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('backToStep1')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Wartung / Reparatur ── */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-4">
            <ContextBar />

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-start gap-3">
                <IconTool size={20} className="text-amber-500 mt-0.5 shrink-0" stroke={1.5} />
                <p className="text-sm text-muted-foreground">
                  {tt('wartungHint', { zustand: zustandLabel })}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{tt('vorgangsartLabel')} *</Label>
                <div className="flex gap-2 flex-wrap">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsartKey(opt.key)}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        vorgangsartKey === opt.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-foreground hover:bg-secondary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="startdatum">{tt('startdatumLabel')} *</Label>
                <Input
                  id="startdatum"
                  type="date"
                  value={startdatum}
                  onChange={e => setStartdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="geplantesEnddatum">{tt('enddatumLabel')}</Label>
                <Input
                  id="geplantesEnddatum"
                  type="date"
                  value={geplantesEnddatum}
                  onChange={e => setGeplantesEnddatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="beschreibung">{tt('beschreibungLabel')}</Label>
                <Textarea
                  id="beschreibung"
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tt('beschreibungPlaceholder')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="statusWartung">{tt('statusWartungLabel')} *</Label>
                <Select value={statusWartungKey} onValueChange={setStatusWartungKey}>
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

              {step3Error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <IconAlertTriangle size={15} stroke={1.5} />
                  {step3Error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  className="flex-1"
                  disabled={step3Submitting || !vorgangsartKey || !startdatum}
                  onClick={handleCreateWartung}
                >
                  {step3Submitting ? tt('anlegenRunning') : tt('anlegen')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleSkipWartung}
                  disabled={step3Submitting}
                >
                  {tt('ueberspringen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noAusleiheSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('backToStep1')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Zusammenfassung ── */}
      {step === 4 && (
        selectedAusleihe ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <IconCircleCheck size={24} stroke={1.5} />
                <h3 className="font-semibold text-lg">{tt('summaryTitle')}</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{tt('summaryWerkzeug')}</p>
                  <p className="font-medium truncate">{selectedAusleihe.werkzeugName || '—'}</p>
                </div>
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{tt('summaryHandwerker')}</p>
                  <p className="font-medium truncate">{selectedAusleihe.handwerkerName || '—'}</p>
                </div>
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{tt('summaryNeuerZustand')}</p>
                  <div className="mt-0.5">
                    <StatusBadge statusKey={neuerZustandKey} label={zustandLabel} />
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">{tt('summaryWartung')}</p>
                  <p className="font-medium">
                    {wartungAngelegt ? tt('summaryWartungJa') : tt('summaryWartungNein')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                <IconRefresh size={16} stroke={1.5} className="mr-2" />
                {tt('neueRueckgabe')}
              </Button>
              <a href="#/" className="flex-1">
                <Button variant="default" className="w-full">
                  {tt('zurueck')}
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noAusleiheSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('backToStep1')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
