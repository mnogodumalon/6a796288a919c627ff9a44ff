/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen (nur verfügbare) → 2) Handwerker wählen (nur aktive) → 3) Ausleihdaten erfassen & Ausleihe anlegen + Werkzeugstatus aktualisieren.
 * Reads: werkzeuge, handwerker. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconTool,
  IconUser,
  IconClipboardCheck,
  IconCheck,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Werkzeuge, Handwerker } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    title: 'Werkzeug ausleihen', /* i18n-exempt */
    subtitle: 'Werkzeug an einen Handwerker ausleihen',
    stepWerkzeug: 'Werkzeug',
    stepHandwerker: 'Handwerker',
    stepAusleihe: 'Ausleihe',
    stepFertig: 'Fertig',
    werkzeugSearch: 'Werkzeug suchen …',
    handwerkerSearch: 'Handwerker suchen …',
    werkzeugEmpty: 'Keine verfügbaren Werkzeuge gefunden',
    handwerkerEmpty: 'Keine aktiven Handwerker gefunden',
    ausleihdatum: 'Ausleihdatum',
    geplantesRueckgabe: 'Geplantes Rückgabedatum',
    bemerkungen: 'Bemerkungen',
    weiterHandwerker: 'Weiter: Handwerker wählen',
    weiterAusleihe: 'Weiter: Ausleihdaten erfassen',
    zurueckWerkzeug: 'Zurück: Werkzeug wählen',
    zurueckHandwerker: 'Zurück: Handwerker wählen',
    ausleiheAnlegen: 'Ausleihe anlegen',
    ausleiheSaving: 'Wird gespeichert …',
    successTitle: 'Ausleihe erfolgreich angelegt!',
    successDesc: 'Das Werkzeug wurde als ausgeliehen markiert.',
    neueAusleihe: 'Neue Ausleihe anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    selectedWerkzeug: 'Gewähltes Werkzeug',
    selectedHandwerker: 'Gewählter Handwerker',
    verfuegbar: 'Verfügbar',
    ausleihdatumRequired: 'Bitte Ausleihdatum angeben.',
    summaryAusleihdatum: 'Ausleihdatum',
    summaryRueckgabe: 'Geplante Rückgabe',
    summaryBemerkungen: 'Bemerkungen',
    inventarnummer: 'Inventarnummer',
    abteilung: 'Abteilung',
    errorMsg: 'Fehler beim Anlegen der Ausleihe. Bitte erneut versuchen.',
    noWerkzeugStep3: 'Dieser Schritt benötigt ein gewähltes Werkzeug.',
    noHandwerkerStep3: 'Dieser Schritt benötigt einen gewählten Handwerker.',
    neuStart: 'Neu starten',
  },
  en: {
    title: 'Lend Tool', /* i18n-exempt */
    subtitle: 'Lend a tool to a craftsman',
    stepWerkzeug: 'Tool',
    stepHandwerker: 'Craftsman',
    stepAusleihe: 'Loan',
    stepFertig: 'Done',
    werkzeugSearch: 'Search tool …',
    handwerkerSearch: 'Search craftsman …',
    werkzeugEmpty: 'No available tools found',
    handwerkerEmpty: 'No active craftsmen found',
    ausleihdatum: 'Loan date',
    geplantesRueckgabe: 'Planned return date',
    bemerkungen: 'Remarks',
    weiterHandwerker: 'Next: choose craftsman',
    weiterAusleihe: 'Next: enter loan details',
    zurueckWerkzeug: 'Back: choose tool',
    zurueckHandwerker: 'Back: choose craftsman',
    ausleiheAnlegen: 'Create loan',
    ausleiheSaving: 'Saving …',
    successTitle: 'Loan successfully created!',
    successDesc: 'The tool has been marked as loaned out.',
    neueAusleihe: 'Create new loan',
    zurueckDashboard: 'Back to dashboard',
    selectedWerkzeug: 'Selected tool',
    selectedHandwerker: 'Selected craftsman',
    verfuegbar: 'Available',
    ausleihdatumRequired: 'Please enter a loan date.',
    summaryAusleihdatum: 'Loan date',
    summaryRueckgabe: 'Planned return',
    summaryBemerkungen: 'Remarks',
    inventarnummer: 'Inventory number',
    abteilung: 'Department',
    errorMsg: 'Error creating loan. Please try again.',
    noWerkzeugStep3: 'This step requires a selected tool.',
    noHandwerkerStep3: 'This step requires a selected craftsman.',
    neuStart: 'Start over',
  },
});

export default function WerkzeugAusleihenPage() {
  const { werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  const wizardSteps = [
    { label: tt('stepWerkzeug') },
    { label: tt('stepHandwerker') },
    { label: tt('stepAusleihe') },
    { label: tt('stepFertig') },
  ];
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);

  const [ausleihdatum, setAusleihdatum] = useState('');
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAusleiheId, setSavedAusleiheId] = useState<string | null>(null);

  const verfuegbareWerkzeuge = (werkzeuge as Werkzeuge[]).filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const aktiveHandwerker = (handwerker as Handwerker[]).filter(
    (h) => h.fields.status?.key === 'aktiv'
  );

  const selectedWerkzeug = selectedWerkzeugId
    ? (werkzeuge as Werkzeuge[]).find((w) => w.record_id === selectedWerkzeugId) ?? null
    : null;

  const selectedHandwerker = selectedHandwerkerId
    ? (handwerker as Handwerker[]).find((h) => h.record_id === selectedHandwerkerId) ?? null
    : null;

  const handleReset = () => {
    setStep(1);
    setSelectedWerkzeugId(null);
    setSelectedHandwerkerId(null);
    setAusleihdatum('');
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSaving(false);
    setSaveError(null);
    setSavedAusleiheId(null);
  };

  const handleSubmit = async () => {
    if (!selectedWerkzeugId || !selectedHandwerkerId || !ausleihdatum) return;

    setSaving(true);
    setSaveError(null);

    let pid = savedAusleiheId;
    try {
      if (!pid) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum: format(new Date(ausleihdatum), "yyyy-MM-dd'T'HH:mm"),
          geplantes_rueckgabedatum: geplantesRueckgabedatum
            ? format(new Date(geplantesRueckgabedatum), "yyyy-MM-dd'T'HH:mm")
            : undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        pid = result.record_id;
        setSavedAusleiheId(pid);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setStep(4);
    } catch {
      setSaveError(tt('errorMsg'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Werkzeug wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map((w) => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? '–',
            subtitle: w.fields.inventarnummer
              ? `${tt('inventarnummer')}: ${w.fields.inventarnummer}`
              : undefined,
            status: w.fields.zustand
              ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedWerkzeugId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('werkzeugSearch')}
          emptyText={tt('werkzeugEmpty')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Handwerker wählen */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedWerkzeug && (
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <IconTool size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('selectedWerkzeug')}</p>
                <p className="font-medium truncate">
                  {selectedWerkzeug.fields.werkzeugname ?? '–'}
                </p>
                {selectedWerkzeug.fields.inventarnummer && (
                  <p className="text-sm text-muted-foreground truncate">
                    {tt('inventarnummer')}: {selectedWerkzeug.fields.inventarnummer}
                  </p>
                )}
              </div>
            </div>
          )}

          <EntitySelectStep
            items={aktiveHandwerker.map((h) => ({
              id: h.record_id,
              title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || '–',
              subtitle: h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : undefined,
              status: h.fields.status
                ? { key: h.fields.status.key, label: h.fields.status.label }
                : undefined,
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedHandwerkerId(id);
              setStep(3);
            }}
            searchPlaceholder={tt('handwerkerSearch')}
            emptyText={tt('handwerkerEmpty')}
            emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          />

          <div className="pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="w-full">
              {tt('zurueckWerkzeug')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Ausleihdaten erfassen */}
      {step === 3 && (
        <>
          {!selectedWerkzeugId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noWerkzeugStep3')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('neuStart')}
              </Button>
            </div>
          ) : !selectedHandwerkerId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noHandwerkerStep3')}</p>
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('neuStart')}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
                  <IconTool size={20} className="text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('selectedWerkzeug')}</p>
                    <p className="font-medium truncate">
                      {selectedWerkzeug?.fields.werkzeugname ?? '–'}
                    </p>
                    {selectedWerkzeug?.fields.inventarnummer && (
                      <p className="text-sm text-muted-foreground truncate">
                        {tt('inventarnummer')}: {selectedWerkzeug.fields.inventarnummer}
                      </p>
                    )}
                    {selectedWerkzeug?.fields.zustand && (
                      <StatusBadge
                        statusKey={selectedWerkzeug.fields.zustand.key}
                        label={selectedWerkzeug.fields.zustand.label}
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
                  <IconUser size={20} className="text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('selectedHandwerker')}</p>
                    <p className="font-medium truncate">
                      {[selectedHandwerker?.fields.vorname, selectedHandwerker?.fields.nachname]
                        .filter(Boolean)
                        .join(' ') || '–'}
                    </p>
                    {selectedHandwerker?.fields.abteilung && (
                      <p className="text-sm text-muted-foreground truncate">
                        {tt('abteilung')}: {selectedHandwerker.fields.abteilung}
                      </p>
                    )}
                    {selectedHandwerker?.fields.status && (
                      <StatusBadge
                        statusKey={selectedHandwerker.fields.status.key}
                        label={selectedHandwerker.fields.status.label}
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Loan details form */}
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconClipboardCheck size={18} className="text-primary" />
                  <h3 className="font-semibold">{tt('stepAusleihe')}</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ausleihdatum">{tt('ausleihdatum')} *</Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="geplantesRueckgabedatum">{tt('geplantesRueckgabe')}</Label>
                  <Input
                    id="geplantesRueckgabedatum"
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
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {saveError && (
                <p className="text-sm text-destructive text-center">{saveError}</p>
              )}

              <div className="space-y-2">
                <Button
                  className="w-full"
                  disabled={saving || !ausleihdatum}
                  onClick={handleSubmit}
                >
                  {saving ? tt('ausleiheSaving') : tt('ausleiheAnlegen')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep(2)}
                  disabled={saving}
                >
                  {tt('zurueckHandwerker')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Step 4: Bestätigung */}
      {step === 4 && (
        <div className="text-center space-y-6 py-6">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-muted-foreground text-sm max-w-sm">{tt('successDesc')}</p>
          </div>

          <div className="rounded-2xl border bg-card p-5 text-left space-y-3 max-w-md mx-auto">
            {selectedWerkzeug && (
              <div className="flex items-center gap-3">
                <IconTool size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('selectedWerkzeug')}</p>
                  <p className="font-medium truncate">
                    {selectedWerkzeug.fields.werkzeugname ?? '–'}
                  </p>
                </div>
              </div>
            )}
            {selectedHandwerker && (
              <div className="flex items-center gap-3">
                <IconUser size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('selectedHandwerker')}</p>
                  <p className="font-medium truncate">
                    {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                      .filter(Boolean)
                      .join(' ') || '–'}
                  </p>
                </div>
              </div>
            )}
            {ausleihdatum && (
              <div className="flex items-center gap-3">
                <IconClipboardCheck size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('summaryAusleihdatum')}</p>
                  <p className="font-medium">
                    {format(new Date(ausleihdatum), 'dd.MM.yyyy HH:mm')}
                  </p>
                </div>
              </div>
            )}
            {geplantesRueckgabedatum && (
              <div className="flex items-center gap-3">
                <IconClipboardCheck size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('summaryRueckgabe')}</p>
                  <p className="font-medium">
                    {format(new Date(geplantesRueckgabedatum), 'dd.MM.yyyy HH:mm')}
                  </p>
                </div>
              </div>
            )}
            {bemerkungenAusleihe && (
              <div className="flex items-start gap-3">
                <IconClipboardCheck size={18} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('summaryBemerkungen')}</p>
                  <p className="text-sm line-clamp-2">{bemerkungenAusleihe}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 max-w-sm mx-auto">
            <Button className="w-full" onClick={handleReset}>
              {tt('neueAusleihe')}
            </Button>
            <a href="#/" className="block">
              <Button variant="outline" className="w-full">
                {tt('zurueckDashboard')}
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
