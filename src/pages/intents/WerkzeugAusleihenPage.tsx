/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (status=aktiv) → 2) Werkzeug wählen (zustand=verfuegbar) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState } from 'react';
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
    title: 'Werkzeug Ausleihen', /* i18n-exempt */
    subtitle: 'In 3 Schritten eine neue Ausleihe anlegen',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    searchHandwerker: 'Handwerker suchen …',
    searchWerkzeug: 'Werkzeug suchen …',
    emptyHandwerker: 'Keine aktiven Handwerker gefunden',
    emptyWerkzeug: 'Kein verfügbares Werkzeug gefunden',
    ausleihdatum: 'Ausleihdatum',
    geplantesRueckgabe: 'Geplantes Rückgabedatum',
    bemerkungen: 'Bemerkungen',
    bemerkungenPlaceholder: 'Optionale Bemerkungen zur Ausleihe …',
    confirmTitle: 'Ausleihe bestätigen',
    selectedHandwerker: 'Ausgewählter Handwerker',
    selectedWerkzeug: 'Ausgewähltes Werkzeug',
    personalnummer: 'Personalnr.',
    abteilung: 'Abteilung',
    inventarnummer: 'Inventarnr.',
    kategorieLabel: 'Kategorie',
    standort: 'Standort',
    jetzt_ausleihen: 'Jetzt ausleihen',
    saving: 'Wird gespeichert …',
    successTitle: 'Ausleihe erfolgreich angelegt!',
    successMsg: 'Das Werkzeug wurde als ausgeliehen markiert.',
    neueAusleihe: 'Neue Ausleihe anlegen',
    backDashboard: 'Zurück zum Dashboard',
    requiredHint: 'Pflichtfeld',
    noHandwerkerSelected: 'Dieser Schritt benötigt einen Handwerker aus Schritt 1.',
    noWerkzeugSelected: 'Dieser Schritt benötigt ein Werkzeug aus Schritt 2.',
    restart: 'Neu starten',
    toStep1: 'Zu Schritt 1',
    toStep2: 'Zu Schritt 2',
    weiterWerkzeug: 'Weiter: Werkzeug wählen',
    weiterBestaetigen: 'Weiter: Bestätigen',
  },
  en: {
    title: 'Borrow Tool', /* i18n-exempt */
    subtitle: 'Create a new loan in 3 steps',
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Confirm',
    searchHandwerker: 'Search craftsman …',
    searchWerkzeug: 'Search tool …',
    emptyHandwerker: 'No active craftsmen found',
    emptyWerkzeug: 'No available tools found',
    ausleihdatum: 'Loan date',
    geplantesRueckgabe: 'Planned return date',
    bemerkungen: 'Notes',
    bemerkungenPlaceholder: 'Optional notes about the loan …',
    confirmTitle: 'Confirm loan',
    selectedHandwerker: 'Selected craftsman',
    selectedWerkzeug: 'Selected tool',
    personalnummer: 'Personnel no.',
    abteilung: 'Department',
    inventarnummer: 'Inventory no.',
    kategorieLabel: 'Category',
    standort: 'Location',
    jetzt_ausleihen: 'Borrow now',
    saving: 'Saving …',
    successTitle: 'Loan successfully created!',
    successMsg: 'The tool has been marked as borrowed.',
    neueAusleihe: 'New loan',
    backDashboard: 'Back to dashboard',
    requiredHint: 'Required',
    noHandwerkerSelected: 'This step needs a craftsman from step 1.',
    noWerkzeugSelected: 'This step needs a tool from step 2.',
    restart: 'Start over',
    toStep1: 'Go to step 1',
    toStep2: 'Go to step 2',
    weiterWerkzeug: 'Next: select tool',
    weiterBestaetigen: 'Next: confirm',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  // Filtered data
  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv'
  );
  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const selectedHandwerker = selectedHandwerkerId
    ? (handwerker as Handwerker[]).find((h) => h.record_id === selectedHandwerkerId) ?? null
    : null;
  const selectedWerkzeug = selectedWerkzeugId
    ? (werkzeuge as Werkzeuge[]).find((w) => w.record_id === selectedWerkzeugId) ?? null
    : null;

  const handleReset = () => {
    setStep(1);
    setSelectedHandwerkerId(null);
    setSelectedWerkzeugId(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungen('');
    setSubmitError(null);
    setSuccess(false);
    setCreatedAusleiheId(null);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId || !ausleihdatum) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Idempotency guard: only create if not already created
      let aid = createdAusleiheId;
      if (!aid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum: ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        aid = result.record_id;
        setCreatedAusleiheId(aid);
      }
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });
      await fetchAll();
      setSuccess(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
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
              h.fields.personalnummer ? `${tt('personalnummer')} ${h.fields.personalnummer}` : null,
              h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
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
        selectedHandwerkerId ? (
          <EntitySelectStep
            items={verfuegbareWerkzeuge.map((w) => ({
              id: w.record_id,
              title: w.fields.werkzeugname ?? w.record_id,
              subtitle: [
                w.fields.inventarnummer
                  ? `${tt('inventarnummer')} ${w.fields.inventarnummer}`
                  : null,
                w.fields.kategorie?.label ? `${tt('kategorieLabel')}: ${w.fields.kategorie.label}` : null,
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
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noHandwerkerSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('toStep1')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Ausleihe bestätigen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          success ? (
            <div className="flex flex-col items-center gap-6 py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={40} className="text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-muted-foreground">{tt('successMsg')}</p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button onClick={handleReset}>{tt('neueAusleihe')}</Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('backDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-xl mx-auto">
              <h2 className="text-lg font-semibold">{tt('confirmTitle')}</h2>

              {/* Zusammenfassung */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Handwerker-Karte */}
                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <IconUser size={16} />
                    <span>{tt('selectedHandwerker')}</span>
                  </div>
                  <p className="font-semibold truncate">
                    {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                      .filter(Boolean)
                      .join(' ')}
                  </p>
                  {selectedHandwerker?.fields.personalnummer && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('personalnummer')} {selectedHandwerker.fields.personalnummer}
                    </p>
                  )}
                  {selectedHandwerker?.fields.abteilung && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('abteilung')}: {selectedHandwerker.fields.abteilung}
                    </p>
                  )}
                  {selectedHandwerker?.fields.status && (
                    <StatusBadge
                      statusKey={selectedHandwerker.fields.status.key}
                      label={selectedHandwerker.fields.status.label}
                    />
                  )}
                </div>

                {/* Werkzeug-Karte */}
                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <IconTool size={16} />
                    <span>{tt('selectedWerkzeug')}</span>
                  </div>
                  <p className="font-semibold truncate">
                    {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                  </p>
                  {selectedWerkzeug?.fields.inventarnummer && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('inventarnummer')} {selectedWerkzeug.fields.inventarnummer}
                    </p>
                  )}
                  {selectedWerkzeug?.fields.kategorie && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('kategorieLabel')}: {selectedWerkzeug.fields.kategorie.label}
                    </p>
                  )}
                  {selectedWerkzeug?.fields.standort && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tt('standort')}: {selectedWerkzeug.fields.standort}
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

              {/* Formular */}
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
                    className="w-full"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="geplantesRueckgabedatum">{tt('geplantesRueckgabe')}</Label>
                  <Input
                    id="geplantesRueckgabedatum"
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    placeholder={tt('bemerkungenPlaceholder')}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                  {submitError}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !ausleihdatum}
                  className="flex items-center gap-2"
                >
                  <IconClipboardCheck size={16} />
                  {submitting ? tt('saving') : tt('jetzt_ausleihen')}
                </Button>
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  {tt('toStep2')}
                </Button>
              </div>
            </div>
          )
        ) : !selectedHandwerkerId ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noHandwerkerSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restart')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noWerkzeugSelected')}</p>
            <Button variant="outline" onClick={() => setStep(2)}>
              {tt('toStep2')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
