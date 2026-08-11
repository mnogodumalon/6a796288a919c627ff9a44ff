/**
 * Werkzeug Ausleihen — 4-Schritt-Wizard.
 * Steps: 1) Handwerker wählen → 2) Werkzeug wählen → 3) Ausleihe anlegen → 4) Bestätigung.
 * Reads: handwerker (filter: status=aktiv), werkzeuge (filter: zustand=verfuegbar).
 * Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry: zustand=ausgeliehen).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS } from '@/types/app';
import type { Handwerker, Werkzeuge } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconUser,
  IconTool,
  IconCircleCheck,
  IconCalendar,
  IconBuilding,
  IconId,
  IconMapPin,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Werkzeug ausleihen', // i18n-exempt
    subtitle: 'Handwerker wählen, Werkzeug auswählen und Ausleihe anlegen',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Ausleihe',
    step4: 'Fertig',
    step1Heading: 'Handwerker wählen',
    step1Sub: 'Aktiven Handwerker für die Ausleihe auswählen',
    step2Heading: 'Werkzeug wählen',
    step2Sub: 'Verfügbares Werkzeug auswählen',
    step3Heading: 'Ausleihe anlegen',
    step3Sub: 'Details der Ausleihe erfassen',
    step4Heading: 'Ausleihe erfolgreich',
    step4Sub: 'Das Werkzeug ist jetzt als ausgeliehen markiert',
    ausleihdatum: 'Ausleihdatum und -uhrzeit',
    rueckgabedatum: 'Geplantes Rückgabedatum (optional)',
    bemerkungen: 'Bemerkungen (optional)',
    submitBtn: 'Ausleihe anlegen',
    submitting: 'Wird angelegt…',
    summaryHandwerker: 'Handwerker',
    summaryWerkzeug: 'Werkzeug',
    summaryRueckgabe: 'Geplante Rückgabe',
    summaryNoRueckgabe: 'Kein Rückgabedatum angegeben',
    successMsg: 'Ausleihe erfolgreich angelegt. Das Werkzeug ist jetzt als "ausgeliehen" markiert.',
    newLoan: 'Neue Ausleihe anlegen',
    backDashboard: 'Zurück zum Dashboard',
    noHandwerker: 'Keine aktiven Handwerker gefunden',
    noWerkzeuge: 'Keine verfügbaren Werkzeuge',
    errorMsg: 'Fehler beim Anlegen der Ausleihe. Bitte erneut versuchen.',
    selectHandwerker: 'Handwerker suchen…',
    selectWerkzeug: 'Werkzeug suchen…',
    prereqHandwerker: 'Dieser Schritt erfordert einen ausgewählten Handwerker.',
    prereqWerkzeug: 'Dieser Schritt erfordert ein ausgewähltes Werkzeug.',
    restart: 'Neu starten',
    abteilung: 'Abteilung',
    personalnummer: 'Personalnummer',
    kategorieLabel: 'Kategorie',
    standort: 'Standort',
    inventarnummer: 'Inventarnummer',
  },
  en: {
    title: 'Check Out Tool', // i18n-exempt
    subtitle: 'Choose craftsman, select tool and create loan',
    step1: 'Craftsman',
    step2: 'Tool',
    step3: 'Loan',
    step4: 'Done',
    step1Heading: 'Choose Craftsman',
    step1Sub: 'Select an active craftsman for the loan',
    step2Heading: 'Choose Tool',
    step2Sub: 'Select an available tool',
    step3Heading: 'Create Loan',
    step3Sub: 'Enter loan details',
    step4Heading: 'Loan Created',
    step4Sub: 'The tool is now marked as checked out',
    ausleihdatum: 'Checkout Date and Time',
    rueckgabedatum: 'Planned Return Date (optional)',
    bemerkungen: 'Remarks (optional)',
    submitBtn: 'Create Loan',
    submitting: 'Creating…',
    summaryHandwerker: 'Craftsman',
    summaryWerkzeug: 'Tool',
    summaryRueckgabe: 'Planned Return',
    summaryNoRueckgabe: 'No return date specified',
    successMsg: 'Loan created successfully. The tool is now marked as "checked out".',
    newLoan: 'Create New Loan',
    backDashboard: 'Back to Dashboard',
    noHandwerker: 'No active craftsmen found',
    noWerkzeuge: 'No available tools',
    errorMsg: 'Error creating loan. Please try again.',
    selectHandwerker: 'Search craftsman…',
    selectWerkzeug: 'Search tool…',
    prereqHandwerker: 'This step requires a selected craftsman.',
    prereqWerkzeug: 'This step requires a selected tool.',
    restart: 'Start over',
    abteilung: 'Department',
    personalnummer: 'Employee No.',
    kategorieLabel: 'Category',
    standort: 'Location',
    inventarnummer: 'Inventory No.',
  },
});

export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  );
  const [rueckgabedatum, setRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  const activeHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv',
  );
  const availableWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar',
  );

  const selectedHandwerker = selectedHandwerkerId
    ? activeHandwerker.find((h) => h.record_id === selectedHandwerkerId)
    : null;
  const selectedWerkzeug = selectedWerkzeugId
    ? availableWerkzeuge.find((w) => w.record_id === selectedWerkzeugId)
    : null;

  const handleHandwerkerSelect = (id: string) => {
    setSelectedHandwerkerId(id);
    setStep(2);
  };

  const handleWerkzeugSelect = (id: string) => {
    setSelectedWerkzeugId(id);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Idempotency guard: if already created, skip the create and only run the update
      let pid = createdAusleiheId;
      if (!pid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: rueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        pid = result.record_id;
        setCreatedAusleiheId(pid);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setStep(4);
    } catch {
      setSubmitError(tt('errorMsg'));
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
    setCreatedAusleiheId(null);
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
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{tt('step1Heading')}</h2>
            <p className="text-sm text-muted-foreground">{tt('step1Sub')}</p>
          </div>
          <EntitySelectStep
            items={activeHandwerker.map((h) => ({
              id: h.record_id,
              title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
              subtitle: [
                h.fields.personalnummer ? `${tt('personalnummer')}: ${h.fields.personalnummer}` : null,
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
            onSelect={handleHandwerkerSelect}
            searchPlaceholder={tt('selectHandwerker')}
            emptyText={tt('noHandwerker')}
            emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          />
        </div>
      )}

      {/* Step 2: Werkzeug wählen */}
      {step === 2 && (
        selectedHandwerkerId ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{tt('step2Heading')}</h2>
              <p className="text-sm text-muted-foreground">{tt('step2Sub')}</p>
            </div>
            <EntitySelectStep
              items={availableWerkzeuge.map((w) => ({
                id: w.record_id,
                title: w.fields.werkzeugname ?? w.record_id,
                subtitle: [
                  w.fields.inventarnummer ? `${tt('inventarnummer')}: ${w.fields.inventarnummer}` : null,
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
              onSelect={handleWerkzeugSelect}
              searchPlaceholder={tt('selectWerkzeug')}
              emptyText={tt('noWerkzeuge')}
              emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prereqHandwerker')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restart')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Ausleihe anlegen */}
      {step === 3 && (
        selectedHandwerkerId && selectedWerkzeugId ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{tt('step3Heading')}</h2>
              <p className="text-sm text-muted-foreground">{tt('step3Sub')}</p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border bg-card p-4 space-y-1 overflow-hidden">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <IconUser size={16} />
                  <span className="text-xs font-medium">{tt('summaryHandwerker')}</span>
                </div>
                <p className="font-semibold truncate">
                  {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {selectedHandwerker?.fields.abteilung && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <IconBuilding size={12} />
                    <span className="truncate">{selectedHandwerker.fields.abteilung}</span>
                  </p>
                )}
                {selectedHandwerker?.fields.personalnummer && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <IconId size={12} />
                    <span>{selectedHandwerker.fields.personalnummer}</span>
                  </p>
                )}
              </div>
              <div className="rounded-2xl border bg-card p-4 space-y-1 overflow-hidden">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <IconTool size={16} />
                  <span className="text-xs font-medium">{tt('summaryWerkzeug')}</span>
                </div>
                <p className="font-semibold truncate">
                  {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
                </p>
                {selectedWerkzeug?.fields.inventarnummer && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <IconId size={12} />
                    <span>{selectedWerkzeug.fields.inventarnummer}</span>
                  </p>
                )}
                {selectedWerkzeug?.fields.standort && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <IconMapPin size={12} />
                    <span className="truncate">{selectedWerkzeug.fields.standort}</span>
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

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ausleihdatum">
                  {tt('ausleihdatum')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ausleihdatum"
                  type="datetime-local"
                  value={ausleihdatum}
                  onChange={(e) => setAusleihdatum(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rueckgabedatum">
                  <span className="flex items-center gap-1.5">
                    <IconCalendar size={14} />
                    {tt('rueckgabedatum')}
                  </span>
                </Label>
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
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting || !ausleihdatum}
            >
              {submitting ? tt('submitting') : tt('submitBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prereqWerkzeug')}</p>
            <Button variant="outline" onClick={() => setStep(selectedHandwerkerId ? 2 : 1)}>
              {tt('restart')}
            </Button>
          </div>
        )
      )}

      {/* Step 4: Bestätigung */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex justify-center">
            <IconCircleCheck size={64} className="text-green-500" stroke={1.5} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tt('step4Heading')}</h2>
            <p className="text-muted-foreground">{tt('successMsg')}</p>
          </div>

          <div className="rounded-2xl border bg-card p-4 text-left space-y-3 max-w-sm mx-auto overflow-hidden">
            <div className="flex items-center gap-2">
              <IconUser size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">{tt('summaryHandwerker')}</span>
            </div>
            <p className="font-semibold truncate">
              {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                .filter(Boolean)
                .join(' ')}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <IconTool size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">{tt('summaryWerkzeug')}</span>
            </div>
            <p className="font-semibold truncate">
              {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <IconCalendar size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">{tt('summaryRueckgabe')}</span>
            </div>
            <p className="text-sm">
              {rueckgabedatum ? rueckgabedatum.replace('T', ' ') : tt('summaryNoRueckgabe')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} variant="default">
              {tt('newLoan')}
            </Button>
            <a href="#/">
              <Button variant="outline" className="w-full sm:w-auto">
                {tt('backDashboard')}
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
