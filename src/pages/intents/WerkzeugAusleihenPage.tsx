/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Handwerker wählen (nur aktive) → 2) Werkzeug wählen (nur verfügbare) → 3) Ausleihe bestätigen & anlegen.
 * Reads: handwerker, werkzeuge. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTool,
  IconClipboardCheck,
  IconCheck,
  IconRefresh,
} from '@tabler/icons-react';
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

// ── i18n ────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    title: 'Werkzeug ausleihen', /* i18n-exempt */
    subtitle: 'Handwerker und Werkzeug auswählen, Ausleihe anlegen',
    step1: 'Handwerker',
    step2: 'Werkzeug',
    step3: 'Bestätigen',
    step4: 'Fertig',
    searchHandwerker: 'Handwerker suchen …',
    searchWerkzeug: 'Werkzeug suchen …',
    emptyHandwerker: 'Keine aktiven Handwerker gefunden',
    emptyWerkzeug: 'Kein verfügbares Werkzeug gefunden',
    ausleihdatum: 'Ausleihdatum & Uhrzeit',
    rueckgabedatum: 'Geplantes Rückgabedatum (optional)',
    bemerkungen: 'Bemerkungen',
    confirmTitle: 'Ausleihe bestätigen',
    handwerker: 'Handwerker',
    werkzeug: 'Werkzeug',
    ausleihen: 'Jetzt ausleihen',
    submitting: 'Wird angelegt …',
    successTitle: 'Ausleihe erfolgreich angelegt!',
    successMsg: 'Das Werkzeug wurde auf "ausgeliehen" gesetzt.',
    newAusleihe: 'Neue Ausleihe anlegen',
    dashboard: 'Zurück zum Dashboard',
    abteilung: 'Abteilung',
    labelQualifikation: 'Qualifikation',
    inventarnummer: 'Inventarnr.',
    labelKategorie: 'Kategorie',
    standort: 'Standort',
    weiter: 'Weiter',
  },
  en: {
    title: 'Borrow tool', /* i18n-exempt */
    subtitle: 'Select worker and tool, create loan',
    step1: 'Worker',
    step2: 'Tool',
    step3: 'Confirm',
    step4: 'Done',
    searchHandwerker: 'Search worker …',
    searchWerkzeug: 'Search tool …',
    emptyHandwerker: 'No active workers found',
    emptyWerkzeug: 'No available tools found',
    ausleihdatum: 'Loan date & time',
    rueckgabedatum: 'Planned return date (optional)',
    bemerkungen: 'Remarks',
    confirmTitle: 'Confirm loan',
    handwerker: 'Worker',
    werkzeug: 'Tool',
    ausleihen: 'Create loan',
    submitting: 'Creating …',
    successTitle: 'Loan successfully created!',
    successMsg: 'The tool status has been set to "borrowed".',
    newAusleihe: 'New loan',
    dashboard: 'Back to dashboard',
    abteilung: 'Department',
    labelQualifikation: 'Qualification',
    inventarnummer: 'Inv. no.',
    labelKategorie: 'Category',
    standort: 'Location',
    weiter: 'Continue',
  },
  cs: {
    title: 'Půjčit nástroj', /* i18n-exempt */
    subtitle: 'Vyberte pracovníka a nástroj, vytvořte výpůjčku',
    step1: 'Pracovník',
    step2: 'Nástroj',
    step3: 'Potvrdit',
    step4: 'Hotovo',
    searchHandwerker: 'Hledat pracovníka …',
    searchWerkzeug: 'Hledat nástroj …',
    emptyHandwerker: 'Žádní aktivní pracovníci',
    emptyWerkzeug: 'Žádný dostupný nástroj',
    ausleihdatum: 'Datum a čas výpůjčky',
    rueckgabedatum: 'Plánované datum vrácení (volitelné)',
    bemerkungen: 'Poznámky',
    confirmTitle: 'Potvrdit výpůjčku',
    handwerker: 'Pracovník',
    werkzeug: 'Nástroj',
    ausleihen: 'Vytvořit výpůjčku',
    submitting: 'Vytváření …',
    successTitle: 'Výpůjčka úspěšně vytvořena!',
    successMsg: 'Stav nástroje byl nastaven na "půjčeno".',
    newAusleihe: 'Nová výpůjčka',
    dashboard: 'Zpět na dashboard',
    abteilung: 'Oddělení',
    labelQualifikation: 'Kvalifikace',
    inventarnummer: 'Inv. č.',
    labelKategorie: 'Kategorie',
    standort: 'Umístění',
    weiter: 'Pokračovat',
  },
});

// ── Component ────────────────────────────────────────────────────────────────
export default function WerkzeugAusleihenPage() {
  const { handwerker, werkzeuge, loading, error, fetchAll } = useDashboardData();

  // Wizard step
  const [step, setStep] = useState(1);

  // Selections
  const [selectedHandwerkerId, setSelectedHandwerkerId] = useState<string | null>(null);
  const [selectedWerkzeugId, setSelectedWerkzeugId] = useState<string | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState(() =>
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [rueckgabedatum, setRueckgabedatum] = useState('');
  const [bemerkungen, setBemerkungen] = useState('');

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // idempotency guard — store created ausleihe id so retry doesn't duplicate
  const [createdAusleiheId, setCreatedAusleiheId] = useState<string | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────
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

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSelectHandwerker = (id: string) => {
    setSelectedHandwerkerId(id);
    setStep(2);
  };

  const handleSelectWerkzeug = (id: string) => {
    setSelectedWerkzeugId(id);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedHandwerkerId || !selectedWerkzeugId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let ausleiheId = createdAusleiheId;
      if (!ausleiheId) {
        const result = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeugId),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerkerId),
          ausleihdatum,
          geplantes_rueckgabedatum: rueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungen || undefined,
        });
        ausleiheId = result.record_id;
        setCreatedAusleiheId(ausleiheId);
      }
      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeugId, {
        zustand: 'ausgeliehen',
      });
      await fetchAll();
      setDone(true);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
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
    setDone(false);
    setCreatedAusleiheId(null);
    setStep(1);
  };

  // ── Render ───────────────────────────────────────────────────────────────
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
      {/* ── Step 1: Handwerker wählen ─────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveHandwerker.map((h) => ({
            id: h.record_id,
            title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id,
            subtitle: [
              h.fields.abteilung ? `${tt('abteilung')}: ${h.fields.abteilung}` : null,
              h.fields.qualifikation ? `${tt('labelQualifikation')}: ${h.fields.qualifikation.label}` : null,
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
          emptyText={tt('emptyHandwerker')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Werkzeug wählen ───────────────────────────────────── */}
      {step === 2 && (
        <EntitySelectStep
          items={verfuegbareWerkzeuge.map((w) => ({
            id: w.record_id,
            title: w.fields.werkzeugname ?? w.record_id,
            subtitle: [
              w.fields.inventarnummer ? `${tt('inventarnummer')}: ${w.fields.inventarnummer}` : null,
              w.fields.kategorie ? `${tt('labelKategorie')}: ${w.fields.kategorie.label}` : null,
              w.fields.standort ? `${tt('standort')}: ${w.fields.standort}` : null,
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
          emptyText={tt('emptyWerkzeug')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 3: Ausleihe bestätigen ───────────────────────────────── */}
      {step === 3 && (
        <>
          {selectedHandwerkerId && selectedWerkzeugId ? (
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Summary cards */}
              <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b bg-secondary/30">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <IconClipboardCheck size={16} />
                    {tt('confirmTitle')}
                  </h3>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {/* Handwerker summary */}
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <IconUser size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('handwerker')}</p>
                      <p className="font-medium truncate">
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
                  </div>

                  <div className="h-px bg-border" />

                  {/* Werkzeug summary */}
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <IconTool size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('werkzeug')}</p>
                      <p className="font-medium truncate">
                        {selectedWerkzeug?.fields.werkzeugname ?? selectedWerkzeugId}
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
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ausleihdatum">{tt('ausleihdatum')}</Label>
                  <Input
                    id="ausleihdatum"
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rueckgabedatum">{tt('rueckgabedatum')}</Label>
                  <Input
                    id="rueckgabedatum"
                    type="datetime-local"
                    value={rueckgabedatum}
                    onChange={(e) => setRueckgabedatum(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bemerkungen">{tt('bemerkungen')}</Label>
                  <Textarea
                    id="bemerkungen"
                    value={bemerkungen}
                    onChange={(e) => setBemerkungen(e.target.value)}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-4 py-3">
                  {submitError}
                </p>
              )}

              <Button
                className="w-full"
                disabled={submitting || !ausleihdatum}
                onClick={handleSubmit}
              >
                {submitting ? tt('submitting') : tt('ausleihen')}
              </Button>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                Neu starten
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Step 4: Erfolg ───────────────────────────────────────────── */}
      {step === 4 && (
        <>
          {done ? (
            <div className="text-center py-16 space-y-6 max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <IconCheck size={32} className="text-primary" stroke={2} />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-sm text-muted-foreground">{tt('successMsg')}</p>
                {selectedHandwerker && selectedWerkzeug && (
                  <p className="text-sm text-muted-foreground">
                    {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                      .filter(Boolean)
                      .join(' ')}{' '}
                    &rarr; {selectedWerkzeug.fields.werkzeugname}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={handleReset} className="w-full">
                  <IconRefresh size={16} className="mr-2" />
                  {tt('newAusleihe')}
                </Button>
                <a href="#/" className="w-full">
                  <Button variant="outline" className="w-full">
                    {tt('dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                Neu starten
              </Button>
            </div>
          )}
        </>
      )}
    </IntentWizardShell>
  );
}
