/**
 * Werkzeug-Ausleihe — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status=aktiv) → 2) Werkzeug wählen (zustand=verfuegbar)
 *        → 3) Ausleihe erfassen & bestätigen (erstellt Ausleihe-Eintrag, setzt Werkzeug-zustand auf 'ausgeliehen').
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { IconUser, IconTool, IconClipboardCheck, IconCheck } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const tt = makeT({
  de: {
    title: 'Werkzeug ausleihen', /* i18n-exempt */
    subtitle: 'Handwerker und Werkzeug in 3 Schritten zuweisen', /* i18n-exempt */
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Ausleihe erfassen',
    step4: 'Fertig',
    searchHandwerker: 'Handwerker suchen…',
    searchWerkzeug: 'Werkzeug suchen…',
    noHandwerker: 'Keine aktiven Handwerker gefunden',
    noWerkzeug: 'Keine verfügbaren Werkzeuge gefunden',
    weiterWerkzeug: 'Weiter: Werkzeug wählen',
    weiterAusleihe: 'Weiter: Ausleihe erfassen',
    ausleihdatum: 'Ausleihdatum und -uhrzeit',
    rueckgabedatum: 'Geplantes Rückgabedatum (optional)',
    bemerkungen: 'Bemerkungen (optional)',
    zusammenfassung: 'Zusammenfassung',
    handwerker: 'Handwerker',
    werkzeug: 'Werkzeug',
    inventarnummer: 'Inventarnr.',
    kategorieLabel: 'Kategorie',
    standort: 'Standort',
    ausleiheAbschliessen: 'Ausleihe anlegen',
    submitting: 'Wird gespeichert…',
    successTitle: 'Ausleihe erfolgreich angelegt',
    successDesc: 'Das Werkzeug wurde dem Handwerker zugewiesen und der Status auf „Ausgeliehen" gesetzt.',
    neueAusleihe: 'Neue Ausleihe anlegen',
    zurueck: 'Zurück zum Dashboard',
    zurueckStep: 'Zurück',
    pflicht: 'Pflichtfeld',
    abteilung: 'Abteilung',
    qualifikationLabel: 'Qualifikation',
    selectHandwerker: 'Handwerker auswählen',
    selectWerkzeug: 'Werkzeug auswählen',
  },
  en: {
    title: 'Borrow Tool', /* i18n-exempt */
    subtitle: 'Assign craftsman and tool in 3 steps', /* i18n-exempt */
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Record Lending',
    step4: 'Done',
    searchHandwerker: 'Search craftsman…',
    searchWerkzeug: 'Search tool…',
    noHandwerker: 'No active craftsmen found',
    noWerkzeug: 'No available tools found',
    weiterWerkzeug: 'Next: Choose Tool',
    weiterAusleihe: 'Next: Record Lending',
    ausleihdatum: 'Checkout date and time',
    rueckgabedatum: 'Planned return date (optional)',
    bemerkungen: 'Remarks (optional)',
    zusammenfassung: 'Summary',
    handwerker: 'Craftsman',
    werkzeug: 'Tool',
    inventarnummer: 'Inventory no.',
    kategorieLabel: 'Category',
    standort: 'Location',
    ausleiheAbschliessen: 'Create Lending',
    submitting: 'Saving…',
    successTitle: 'Lending successfully created',
    successDesc: 'The tool has been assigned to the craftsman and status set to "Checked Out".',
    neueAusleihe: 'New Lending',
    zurueck: 'Back to Dashboard',
    zurueckStep: 'Back',
    pflicht: 'Required',
    abteilung: 'Department',
    qualifikationLabel: 'Qualification',
    selectHandwerker: 'Select craftsman',
    selectWerkzeug: 'Select tool',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [rueckgabedatum, setRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  // Derived selections
  const activeHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv'
  );
  const availableWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = selectedHandwerkerId
    ? (handwerker as Handwerker[]).find((h) => h.record_id === selectedHandwerkerId) ?? null
    : null;
  const selectedWerkzeug = selectedWerkzeugId
    ? (werkzeuge as Werkzeuge[]).find((w) => w.record_id === selectedWerkzeugId) ?? null
    : null;

  const handleSelectHandwerker = (id: string) => {
    setSelectedHandwerkerId(id);
    setStep(2);
  };

  const handleSelectWerkzeug = (id: string) => {
    setSelectedWerkzeugId(id);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Idempotency guard: only create if we don't already have an id
      let aid = ausleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: rueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        aid = result.record_id;
        setAusleiheId(aid);
      }
      // Update tool status — idempotent, always safe to retry
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });
      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setRueckgabedatum('');
    setBemerkungen('');
    setSubmitError(null);
    setAusleiheId(null);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Handwerker wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={activeHandwerker.map((h) => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [
              h.fields.abteilung,
              h.fields.qualifikation?.label,
              h.fields.personalnummer ? `Nr. ${h.fields.personalnummer}` : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
            status: h.fields.status
              ? { key: h.fields.status.key, label: h.fields.status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectHandwerker}
          searchPlaceholder={tt('searchHandwerker')}
          emptyText={tt('noHandwerker')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerkerId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
              <IconUser size={16} />
              <span>
                {tt('handwerker')}:{' '}
                <strong className="text-foreground">
                  {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                    .filter(Boolean)
                    .join(' ') || selectedHandwerkerId}
                </strong>
              </span>
            </div>
            <EntitySelectStep
              items={availableWerkzeuge.map((w) => ({
                id: w.record_id,
                title: w.fields.werkzeugname || w.record_id,
                subtitle: [
                  w.fields.inventarnummer ? `${tt('inventarnummer')} ${w.fields.inventarnummer}` : undefined,
                  w.fields.kategorie?.label,
                  w.fields.standort,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: w.fields.zustand
                  ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
                  : undefined,
                icon: <IconTool size={20} className="text-primary" />,
              }))}
              onSelect={handleSelectWerkzeug}
              searchPlaceholder={tt('searchWerkzeug')}
              emptyText={tt('noWerkzeug')}
              emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
            />
            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueckStep')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('selectHandwerker')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('zurueckStep')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Ausleihe erfassen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          <div className="space-y-6">
            {/* Context summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{tt('handwerker')}:</span>
                <span className="font-medium truncate">
                  {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                    .filter(Boolean)
                    .join(' ') || selectedHandwerkerId}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconTool size={16} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{tt('werkzeug')}:</span>
                <span className="font-medium truncate">
                  {selectedWerkzeug?.fields.werkzeugname || selectedWerkzeugId}
                </span>
                {selectedWerkzeug?.fields.inventarnummer && (
                  <span className="text-muted-foreground text-xs">
                    ({tt('inventarnummer')} {selectedWerkzeug.fields.inventarnummer})
                  </span>
                )}
              </div>
              {selectedWerkzeug?.fields.standort && (
                <div className="flex items-center gap-2">
                  <span className="w-4" />
                  <span className="text-muted-foreground">{tt('standort')}:</span>
                  <span>{selectedWerkzeug.fields.standort}</span>
                </div>
              )}
              {selectedWerkzeug?.fields.kategorie && (
                <div className="flex items-center gap-2">
                  <span className="w-4" />
                  <span className="text-muted-foreground">{tt('kategorieLabel')}:</span>
                  <StatusBadge
                    statusKey={selectedWerkzeug.fields.kategorie.key}
                    label={selectedWerkzeug.fields.kategorie.label}
                  />
                </div>
              )}
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ausleihdatum">
                  {tt('ausleihdatum')}{' '}
                  <span className="text-destructive text-xs">*</span>
                </Label>
                <Input
                  id="ausleihdatum"
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={(e) => setAusleihdatum(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rueckgabedatum">{tt('rueckgabedatum')}</Label>
                <Input
                  id="rueckgabedatum"
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={(e) => setRueckgabedatum(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                <Textarea
                  id="bemerkungen"
                  value={bemerkungen}
                  onChange={(e) => setBemerkungen(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tt('zurueckStep')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting || !ausleihdatum}
              >
                {submitting ? tt('submitting') : tt('ausleiheAbschliessen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('selectWerkzeug')}</p>
            <Button variant="outline" onClick={() => setStep(selectedHandwerkerId ? 2 : 1)}>
              {tt('zurueckStep')}
            </Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="flex flex-col items-center text-center py-12 space-y-6">
          <div className="rounded-full bg-primary/10 p-5">
            <IconCheck size={40} className="text-primary" stroke={2} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">{tt('successTitle')}</h2>
            <p className="text-sm text-muted-foreground max-w-sm">{tt('successDesc')}</p>
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border bg-card w-full max-w-sm text-left p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <IconUser size={16} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{tt('handwerker')}:</span>
              <span className="font-medium truncate min-w-0">
                {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                  .filter(Boolean)
                  .join(' ') || selectedHandwerkerId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <IconTool size={16} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{tt('werkzeug')}:</span>
              <span className="font-medium truncate min-w-0">
                {selectedWerkzeug?.fields.werkzeugname || selectedWerkzeugId}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <IconClipboardCheck size={16} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{tt('ausleihdatum')}:</span>
              <span className="font-medium">{ausleihdatum.replace('T', ' ')}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <Button variant="outline" className="flex-1" onClick={handleReset}>
              {tt('neueAusleihe')}
            </Button>
            <Button asChild className="flex-1">
              <a href="#/">{tt('zurueck')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
