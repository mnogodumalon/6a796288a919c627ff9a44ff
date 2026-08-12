/**
 * Werkzeug Verleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (nur aktive) → 2) Werkzeug wählen (nur verfügbare)
 *        → 3) Ausleihe bestätigen & anlegen, Werkzeugzustand auf 'ausgeliehen' setzen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconTool,
  IconUser,
  IconCheck,
  IconAlertCircle,
  IconArrowRight,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    pageTitle: 'Werkzeug verleihen',
    subtitle: 'Handwerker und Werkzeug wählen, Ausleihe anlegen',
    stepHandwerker: 'Handwerker',
    stepWerkzeug: 'Werkzeug',
    stepBestaetigen: 'Bestätigen',
    searchHandwerker: 'Handwerker suchen …',
    searchWerkzeug: 'Werkzeug suchen …',
    emptyHandwerker: 'Keine aktiven Handwerker gefunden',
    emptyWerkzeug: 'Keine verfügbaren Werkzeuge gefunden',
    ausleihdatum: 'Ausleihdatum',
    geplantesRueckgabe: 'Geplantes Rückgabedatum',
    bemerkungen: 'Bemerkungen',
    weiterWerkzeug: 'Weiter zu Werkzeug',
    weiterBestaetigen: 'Weiter zur Bestätigung',
    zurueckHandwerker: 'Zurück zu Handwerker',
    zurueckWerkzeug: 'Zurück zu Werkzeug',
    ausleiheAnlegen: 'Ausleihe anlegen',
    neueAusleihe: 'Neue Ausleihe',
    erfolgTitel: 'Ausleihe erfolgreich angelegt',
    erfolgText: 'Das Werkzeug wurde als ausgeliehen markiert.',
    dashboardLink: 'Zurück zum Dashboard',
    bemerkungenPlaceholder: 'Optionale Bemerkungen zur Ausleihe …',
    zusammenfassung: 'Zusammenfassung',
    handwerkerLabel: 'Handwerker',
    werkzeugLabel: 'Werkzeug',
    ausleihdatumRequired: 'Ausleihdatum ist erforderlich',
    submitting: 'Wird gespeichert …',
    stepMissing: 'Dieser Schritt benötigt die Auswahl aus einem vorherigen Schritt.',
    neuStarten: 'Neu starten',
    abteilung: 'Abteilung',
    inventarnummer: 'Inventar-Nr.',
    standort: 'Standort',
  },
  en: {
    pageTitle: 'Lend Tool',
    subtitle: 'Select worker and tool, create lending record',
    stepHandwerker: 'Worker',
    stepWerkzeug: 'Tool',
    stepBestaetigen: 'Confirm',
    searchHandwerker: 'Search worker …',
    searchWerkzeug: 'Search tool …',
    emptyHandwerker: 'No active workers found',
    emptyWerkzeug: 'No available tools found',
    ausleihdatum: 'Lending date',
    geplantesRueckgabe: 'Planned return date',
    bemerkungen: 'Notes',
    weiterWerkzeug: 'Next: Tool',
    weiterBestaetigen: 'Next: Confirm',
    zurueckHandwerker: 'Back to Worker',
    zurueckWerkzeug: 'Back to Tool',
    ausleiheAnlegen: 'Create lending',
    neueAusleihe: 'New lending',
    erfolgTitel: 'Lending created successfully',
    erfolgText: 'The tool has been marked as lent out.',
    dashboardLink: 'Back to Dashboard',
    bemerkungenPlaceholder: 'Optional notes for this lending …',
    zusammenfassung: 'Summary',
    handwerkerLabel: 'Worker',
    werkzeugLabel: 'Tool',
    ausleihdatumRequired: 'Lending date is required',
    submitting: 'Saving …',
    stepMissing: 'This step requires a selection from a previous step.',
    neuStarten: 'Start over',
    abteilung: 'Department',
    inventarnummer: 'Inventory No.',
    standort: 'Location',
  },
});

export default function WerkzeugVerleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv'
  );

  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = aktiveHandwerker.find((h) => h.record_id === selectedHandwerkerId);
  const selectedWerkzeug = verfuegbareWerkzeuge.find((w) => w.record_id === selectedWerkzeugId);

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      let aid = ausleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        aid = result.record_id;
        setAusleiheId(aid);
      }
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, { zustand: 'ausgeliehen' });
      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setAusleiheId(null);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepHandwerker') },
        { label: tt('stepWerkzeug') },
        { label: tt('stepBestaetigen') },
      ]}
      currentStep={step <= 3 ? step : 3}
      onStepChange={(s) => {
        if (s < step) setStep(s);
      }}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map((h) => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [
              h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
              h.fields.qualifikation?.label ?? null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: h.fields.status
              ? { key: h.fields.status.key, label: h.fields.status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedHandwerkerId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('searchHandwerker')}
          emptyText={tt('emptyHandwerker')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        <>
          {selectedHandwerkerId ? (
            <>
              <EntitySelectStep
                items={verfuegbareWerkzeuge.map((w) => ({
                  id: w.record_id,
                  title: w.fields.werkzeugname ?? w.record_id,
                  subtitle: [
                    w.fields.inventarnummer
                      ? `${tt('inventarnummer')} ${w.fields.inventarnummer}`
                      : null,
                    w.fields.kategorie?.label ?? null,
                    w.fields.standort ? `${tt('standort')}: ${w.fields.standort}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  status: w.fields.zustand
                    ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                    : undefined,
                  icon: <IconTool size={20} className="text-primary" />,
                }))}
                onSelect={(id) => {
                  setSelectedWerkzeugId(id);
                  setStep(3);
                }}
                searchPlaceholder={tt('searchWerkzeug')}
                emptyText={tt('emptyWerkzeug')}
                emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
              />
              <div className="mt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tt('zurueckHandwerker')}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepMissing')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('neuStarten')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Step 3: Bestätigen */}
      {step === 3 && (
        <>
          {selectedHandwerkerId && selectedWerkzeugId ? (
            <div className="space-y-6">
              {/* Zusammenfassung */}
              <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
                <h3 className="font-semibold text-foreground">{tt('zusammenfassung')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-secondary p-3 space-y-1 overflow-hidden">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {tt('handwerkerLabel')}
                    </p>
                    <p className="font-medium truncate text-foreground">
                      {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                        .filter(Boolean)
                        .join(' ') || selectedHandwerkerId}
                    </p>
                    {selectedHandwerker?.fields.abteilung && (
                      <p className="text-sm text-muted-foreground truncate">
                        {selectedHandwerker.fields.abteilung}
                      </p>
                    )}
                    {selectedHandwerker?.fields.status && (
                      <StatusBadge
                        statusKey={selectedHandwerker.fields.status.key}
                        label={selectedHandwerker.fields.status.label}
                      />
                    )}
                  </div>
                  <div className="rounded-xl bg-secondary p-3 space-y-1 overflow-hidden">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {tt('werkzeugLabel')}
                    </p>
                    <p className="font-medium truncate text-foreground">
                      {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                    </p>
                    {selectedWerkzeug?.fields.inventarnummer && (
                      <p className="text-sm text-muted-foreground truncate">
                        {tt('inventarnummer')} {selectedWerkzeug.fields.inventarnummer}
                      </p>
                    )}
                    {selectedWerkzeug?.fields.zustand && (
                      <StatusBadge
                        statusKey={selectedWerkzeug.fields.zustand.key}
                        label={selectedWerkzeug.fields.zustand.label}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Ausleihe-Felder */}
              <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
                <div className="space-y-2">
                  <Label htmlFor="ausleihdatum">
                    {tt('ausleihdatum')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="geplantesRueckgabe">{tt('geplantesRueckgabe')}</Label>
                  <Input
                    id="geplantesRueckgabe"
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungenAusleihe}
                    onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                    placeholder={tt('bemerkungenPlaceholder')}
                    className="w-full min-h-[80px]"
                  />
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                  <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="w-full sm:w-auto">
                  {tt('zurueckWerkzeug')}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!ausleihdatum || submitting}
                  className="w-full sm:flex-1"
                >
                  {submitting ? tt('submitting') : tt('ausleiheAnlegen')}
                  {!submitting && <IconArrowRight size={16} className="ml-2" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('stepMissing')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('neuStarten')}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto">
            <IconCheck size={32} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{tt('erfolgTitel')}</h2>
            <p className="text-sm text-muted-foreground">{tt('erfolgText')}</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 text-left space-y-2 max-w-sm mx-auto overflow-hidden">
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm text-muted-foreground">{tt('handwerkerLabel')}</span>
              <span className="text-sm font-medium truncate">
                {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                  .filter(Boolean)
                  .join(' ') || selectedHandwerkerId}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-sm text-muted-foreground">{tt('werkzeugLabel')}</span>
              <span className="text-sm font-medium truncate">
                {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
              </span>
            </div>
            {ausleihdatum && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-muted-foreground">{tt('ausleihdatum')}</span>
                <span className="text-sm font-medium">
                  {format(new Date(ausleihdatum), 'dd.MM.yyyy HH:mm')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={handleReset}>
              {tt('neueAusleihe')}
            </Button>
            <Button asChild>
              <a href="#/">{tt('dashboardLink')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
