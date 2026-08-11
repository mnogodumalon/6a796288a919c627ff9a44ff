/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen (nur verfuegbar) → 2) Handwerker wählen (nur aktiv) → 3) Ausleihe bestätigen & anlegen.
 * Reads: werkzeuge, handwerker. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Werkzeuge, Handwerker } from '@/types/app';
import {
  IconTool,
  IconUser,
  IconClipboardCheck,
  IconAlertCircle,
  IconCircleCheck,
} from '@tabler/icons-react';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    step1Title: 'Werkzeug wählen',
    step2Title: 'Handwerker wählen',
    step3Title: 'Ausleihe bestätigen',
    pageTitle: 'Werkzeug ausleihen',
    pageSubtitle: 'Werkzeug an einen Handwerker in 3 Schritten ausleihen',
    searchWerkzeug: 'Werkzeug suchen…',
    searchHandwerker: 'Handwerker suchen…',
    noVerfuegbar: 'Kein verfügbares Werkzeug gefunden',
    noAktiv: 'Kein aktiver Handwerker gefunden',
    ausleihdatum: 'Ausleihdatum & Uhrzeit',
    rueckgabedatum: 'Geplantes Rückgabedatum (optional)',
    bemerkungen: 'Bemerkungen (optional)',
    bestaetigen: 'Ausleihe anlegen',
    submitting: 'Wird angelegt…',
    weiterZuSchritt2: 'Weiter zu Schritt 2',
    weiterZuSchritt3: 'Weiter zu Schritt 3',
    zurueck: 'Zurück',
    ausgewaehlt: 'Ausgewählt',
    werkzeugLabel: 'Werkzeug',
    handwerkerLabel: 'Handwerker',
    erfolg: 'Ausleihe erfolgreich angelegt',
    neuAusleihe: 'Weitere Ausleihe anlegen',
    dashboard: 'Zurück zum Dashboard',
    ausleiheSummary: 'Zusammenfassung',
    ausleihdatumRequired: 'Bitte Ausleihdatum angeben',
    missing: 'Bitte Schritt 1 oder 2 erneut durchführen',
    restart: 'Neu starten',
    inventar: 'Inventarnr.',
    standort: 'Standort',
    abteilung: 'Abteilung',
    qualifikationLabel: 'Qualifikation',
    kategorieLabel: 'Kategorie',
  },
  en: {
    step1Title: 'Choose Tool',
    step2Title: 'Choose Craftsman',
    step3Title: 'Confirm Loan',
    pageTitle: 'Loan Tool',
    pageSubtitle: 'Loan a tool to a craftsman in 3 steps',
    searchWerkzeug: 'Search tool…',
    searchHandwerker: 'Search craftsman…',
    noVerfuegbar: 'No available tool found',
    noAktiv: 'No active craftsman found',
    ausleihdatum: 'Loan date & time',
    rueckgabedatum: 'Planned return date (optional)',
    bemerkungen: 'Notes (optional)',
    bestaetigen: 'Create loan',
    submitting: 'Creating…',
    weiterZuSchritt2: 'Continue to step 2',
    weiterZuSchritt3: 'Continue to step 3',
    zurueck: 'Back',
    ausgewaehlt: 'Selected',
    werkzeugLabel: 'Tool',
    handwerkerLabel: 'Craftsman',
    erfolg: 'Loan successfully created',
    neuAusleihe: 'Create another loan',
    dashboard: 'Back to dashboard',
    ausleiheSummary: 'Summary',
    ausleihdatumRequired: 'Please provide a loan date',
    missing: 'Please go back to step 1 or 2',
    restart: 'Restart',
    inventar: 'Inventory no.',
    standort: 'Location',
    abteilung: 'Department',
    qualifikationLabel: 'Qualification',
    kategorieLabel: 'Category',
  },
});

export default function WerkzeugAusleihenPage() {
  const { werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Idempotency guard: store the created ausleihe id so retry doesn't duplicate
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar',
  );

  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv',
  );

  const handleWerkzeugSelect = (id: string) => {
    const found = verfuegbareWerkzeuge.find((w) => w.record_id === id) ?? null;
    setSelectedWerkzeug(found);
    setStep(2);
  };

  const handleHandwerkerSelect = (id: string) => {
    const found = aktiveHandwerker.find((h) => h.record_id === id) ?? null;
    setSelectedHandwerker(found);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedWerkzeug || !selectedHandwerker) return;
    if (!ausleihdatum) {
      setSubmitError(tt('ausleihdatumRequired'));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      let ausleiheId = createdAusleiheId;

      if (!ausleiheId) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeug.record_id),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerker.record_id),
          ausleihdatum: ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        ausleiheId = result.record_id;
        setCreatedAusleiheId(ausleiheId);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeug.record_id, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedWerkzeug(null);
    setSelectedHandwerker(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setDone(false);
    setCreatedAusleiheId(null);
  };

  const formatDisplayDate = (dt: string) => {
    if (!dt) return '';
    try {
      return format(new Date(dt), 'dd.MM.yyyy HH:mm');
    } catch {
      return dt;
    }
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('pageSubtitle')}
      steps={[
        { label: tt('step1Title') },
        { label: tt('step2Title') },
        { label: tt('step3Title') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Werkzeug wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map((w) => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? w.record_id,
            subtitle: [
              w.fields.inventarnummer ? `${tt('inventar')} ${w.fields.inventarnummer}` : null,
              w.fields.standort ? `${tt('standort')}: ${w.fields.standort}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: w.fields.zustand
              ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
              : undefined,
            stats: w.fields.kategorie
              ? [{ label: tt('kategorieLabel'), value: w.fields.kategorie.label }]
              : [],
            icon: <IconTool size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleWerkzeugSelect}
          searchPlaceholder={tt('searchWerkzeug')}
          emptyText={tt('noVerfuegbar')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Schritt 2: Handwerker wählen ── */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedWerkzeug && (
            <div className="flex items-center gap-2 rounded-xl border bg-secondary/40 px-4 py-2 text-sm">
              <IconTool size={16} className="text-primary shrink-0" stroke={1.5} />
              <span className="text-muted-foreground">{tt('werkzeugLabel')}:</span>
              <span className="font-medium truncate min-w-0">
                {selectedWerkzeug.fields.werkzeugname}
              </span>
              {selectedWerkzeug.fields.zustand && (
                <StatusBadge
                  statusKey={selectedWerkzeug.fields.zustand.key}
                  label={selectedWerkzeug.fields.zustand.label}
                />
              )}
            </div>
          )}

          {!selectedWerkzeug && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('missing')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('restart')}
              </Button>
            </div>
          )}

          {selectedWerkzeug && (
            <EntitySelectStep
              items={aktiveHandwerker.map((h) => ({
                id: h.record_id,
                title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
                subtitle: [
                  h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
                  h.fields.qualifikation ? `${tt('qualifikationLabel')}: ${h.fields.qualifikation.label}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: h.fields.status
                  ? { key: h.fields.status.key, label: h.fields.status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={handleHandwerkerSelect}
              searchPlaceholder={tt('searchHandwerker')}
              emptyText={tt('noAktiv')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
            />
          )}
        </div>
      )}

      {/* ── Schritt 3: Ausleihe bestätigen ── */}
      {step === 3 && (
        <div className="space-y-6">
          {(!selectedWerkzeug || !selectedHandwerker) ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('missing')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('restart')}
              </Button>
            </div>
          ) : done ? (
            /* Erfolgsanzeige */
            <div className="flex flex-col items-center gap-6 py-8 text-center">
              <IconCircleCheck size={56} className="text-green-500" stroke={1.5} />
              <div className="space-y-1">
                <p className="text-lg font-semibold">{tt('erfolg')}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedWerkzeug.fields.werkzeugname} →{' '}
                  {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {ausleihdatum && (
                  <p className="text-sm text-muted-foreground">
                    {formatDisplayDate(ausleihdatum)}
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button variant="outline" className="w-full" onClick={handleReset}>
                  {tt('neuAusleihe')}
                </Button>
                <Button asChild className="w-full">
                  <a href="#/">{tt('dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            /* Bestätigungsformular */
            <div className="space-y-6">
              {/* Zusammenfassung Auswahl */}
              <div className="rounded-2xl border bg-secondary/30 p-4 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{tt('ausleiheSummary')}</p>
                <div className="flex items-center gap-2 text-sm">
                  <IconTool size={16} className="text-primary shrink-0" stroke={1.5} />
                  <span className="text-muted-foreground">{tt('werkzeugLabel')}:</span>
                  <span className="font-medium truncate min-w-0">
                    {selectedWerkzeug.fields.werkzeugname}
                  </span>
                  {selectedWerkzeug.fields.inventarnummer && (
                    <span className="text-muted-foreground text-xs">
                      ({selectedWerkzeug.fields.inventarnummer})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <IconUser size={16} className="text-primary shrink-0" stroke={1.5} />
                  <span className="text-muted-foreground">{tt('handwerkerLabel')}:</span>
                  <span className="font-medium truncate min-w-0">
                    {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                  {selectedHandwerker.fields.abteilung && (
                    <span className="text-muted-foreground text-xs">
                      · {selectedHandwerker.fields.abteilung}
                    </span>
                  )}
                </div>
              </div>

              {/* Ausleihdatum (Pflichtfeld) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {tt('ausleihdatum')} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={(e) => setAusleihdatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Geplantes Rückgabedatum (optional) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  {tt('rueckgabedatum')}
                </label>
                <Input
                  type="datetime-local"
                  value={geplantesRueckgabedatum}
                  onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Bemerkungen (optional) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  {tt('bemerkungen')}
                </label>
                <Textarea
                  value={bemerkungenAusleihe}
                  onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>

              {/* Fehlermeldung */}
              {submitError && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <IconAlertCircle size={16} stroke={1.5} />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Aktionen */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  {tt('zurueck')}
                </Button>
                <Button
                  className="w-full sm:flex-1"
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                >
                  <IconClipboardCheck size={16} stroke={1.5} className="mr-1.5" />
                  {submitting ? tt('submitting') : tt('bestaetigen')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
