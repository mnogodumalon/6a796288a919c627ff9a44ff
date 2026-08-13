/**
 * Werkzeug Ausleihen — 3-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen (nur verfügbare) → 2) Handwerker wählen (nur aktive) → 3) Ausleihe anlegen & Werkzeugstatus aktualisieren.
 * Reads: werkzeuge, handwerker. Writes: ausleihe (createAusleiheEntry), werkzeuge (updateWerkzeugeEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconTool, IconUser, IconClipboardCheck, IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS } from '@/types/app';
import type { Werkzeuge, Handwerker } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';

export default function WerkzeugAusleihenPage() {
  const { werkzeuge, handwerker, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedWerkzeug, setSelectedWerkzeug] = useState<Werkzeuge | null>(null);
  const [selectedHandwerker, setSelectedHandwerker] = useState<Handwerker | null>(null);

  // Step 3 form state
  const [ausleihdatum, setAusleihdatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [geplantesRueckgabedatum, setGeplantesRueckgabedatum] = useState('');
  const [bemerkungenAusleihe, setBemerkungenAusleihe] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ausleiheId, setAusleiheId] = useState<string | null>(null);

  // Create Werkzeug mini-form state
  const [showCreateWerkzeug, setShowCreateWerkzeug] = useState(false);
  const [newWerkzeugname, setNewWerkzeugname] = useState('');
  const [newInventarnummer, setNewInventarnummer] = useState('');
  const [creatingWerkzeug, setCreatingWerkzeug] = useState(false);

  // Create Handwerker mini-form state
  const [showCreateHandwerker, setShowCreateHandwerker] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [creatingHandwerker, setCreatingHandwerker] = useState(false);

  const verfuegbareWerkzeuge = werkzeuge.filter(
    (w) => w.fields.zustand?.key === 'verfuegbar'
  );

  const aktiveHandwerker = handwerker.filter(
    (h) => h.fields.status?.key === 'aktiv'
  );

  const handleWerkzeugSelect = (id: string) => {
    const found = werkzeuge.find((w) => w.record_id === id) ?? null;
    setSelectedWerkzeug(found);
    setStep(2);
  };

  const handleHandwerkerSelect = (id: string) => {
    const found = handwerker.find((h) => h.record_id === id) ?? null;
    setSelectedHandwerker(found);
    setStep(3);
  };

  const handleCreateWerkzeug = async () => {
    if (!newWerkzeugname || !newInventarnummer) return;
    setCreatingWerkzeug(true);
    try {
      const created = await LivingAppsService.createWerkzeugeEntry({
        werkzeugname: newWerkzeugname,
        inventarnummer: newInventarnummer,
        zustand: 'verfuegbar',
      });
      await fetchAll();
      setShowCreateWerkzeug(false);
      setNewWerkzeugname('');
      setNewInventarnummer('');
      const found = werkzeuge.find((w) => w.record_id === created.record_id) ?? null;
      setSelectedWerkzeug(found ?? { record_id: created.record_id, created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updated_at: null, createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updatedat: null, fields: { werkzeugname: newWerkzeugname, inventarnummer: newInventarnummer, zustand: { key: 'verfuegbar', label: tx('Verfügbar') } } });
      setStep(2);
    } finally {
      setCreatingWerkzeug(false);
    }
  };

  const handleCreateHandwerker = async () => {
    if (!newVorname || !newNachname) return;
    setCreatingHandwerker(true);
    try {
      const created = await LivingAppsService.createHandwerkerEntry({
        vorname: newVorname,
        nachname: newNachname,
        status: 'aktiv',
      });
      await fetchAll();
      setShowCreateHandwerker(false);
      setNewVorname('');
      setNewNachname('');
      const found = handwerker.find((h) => h.record_id === created.record_id) ?? null;
      setSelectedHandwerker(found ?? { record_id: created.record_id, created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updated_at: null, createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updatedat: null, fields: { vorname: newVorname, nachname: newNachname, status: { key: 'aktiv', label: tx('Aktiv') } } });
      setStep(3);
    } finally {
      setCreatingHandwerker(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedWerkzeug || !selectedHandwerker || !ausleihdatum) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      let aid = ausleiheId;
      if (!aid) {
        const ausleihe = await LivingAppsService.createAusleiheEntry({
          werkzeug: createRecordUrl(APP_IDS.WERKZEUGE, selectedWerkzeug.record_id),
          handwerker: createRecordUrl(APP_IDS.HANDWERKER, selectedHandwerker.record_id),
          ausleihdatum,
          geplantes_rueckgabedatum: geplantesRueckgabedatum || undefined,
          status_ausleihe: 'ausgeliehen',
          bemerkungen_ausleihe: bemerkungenAusleihe || undefined,
        });
        aid = ausleihe.record_id;
        setAusleiheId(aid);
      }

      await LivingAppsService.updateWerkzeugeEntry(selectedWerkzeug.record_id, {
        zustand: 'ausgeliehen',
      });

      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Anlegen der Ausleihe.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedWerkzeug(null);
    setSelectedHandwerker(null);
    setAusleihdatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setGeplantesRueckgabedatum('');
    setBemerkungenAusleihe('');
    setSubmitError(null);
    setAusleiheId(null);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug ausleihen')}
      subtitle={tx('Werkzeug in 3 Schritten an einen Handwerker ausleihen')}
      steps={[
        { label: tx('Werkzeug') },
        { label: tx('Handwerker') },
        { label: tx('Ausleihe') },
        { label: tx('Fertig') },
      ]}
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
            title: w.fields.werkzeugname ?? '',
            subtitle: [
              w.fields.inventarnummer ? tx`Nr. ${w.fields.inventarnummer}` : null,
              w.fields.kategorie?.label ?? null,
              w.fields.standort ? tx('Standort') + `: ${w.fields.standort}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: w.fields.zustand
              ? { key: w.fields.zustand.key, label: w.fields.zustand.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleWerkzeugSelect}
          createLabel={tx('Neues Werkzeug anlegen')}
          onCreateNew={() => setShowCreateWerkzeug(true)}
          searchPlaceholder={tx('Werkzeug suchen …')}
          emptyText={tx('Keine verfügbaren Werkzeuge gefunden.')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
          createDialog={
            showCreateWerkzeug ? (
              <div className="rounded-2xl border p-4 space-y-3">
                <p className="text-sm font-medium">{tx('Neues Werkzeug anlegen')}</p>
                <Input
                  value={newWerkzeugname}
                  onChange={(e) => setNewWerkzeugname(e.target.value)}
                  placeholder={tx('Werkzeugname')}
                />
                <Input
                  value={newInventarnummer}
                  onChange={(e) => setNewInventarnummer(e.target.value)}
                  placeholder={tx('Inventarnummer')}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={!newWerkzeugname || !newInventarnummer || creatingWerkzeug}
                    onClick={handleCreateWerkzeug}
                  >
                    {creatingWerkzeug ? tx('Wird angelegt …') : tx('Anlegen')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateWerkzeug(false)}>
                    {tx('Abbrechen')}
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* Step 2: Handwerker wählen */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedWerkzeug && (
            <div className="flex items-center gap-2 px-1">
              <Badge variant="secondary" className="flex items-center gap-1">
                <IconTool size={14} />
                {selectedWerkzeug.fields.werkzeugname}
              </Badge>
            </div>
          )}
          {selectedWerkzeug ? (
            <EntitySelectStep
              items={aktiveHandwerker.map((h) => ({
                id: h.record_id,
                title: [h.fields.vorname, h.fields.nachname].filter(Boolean).join(' '),
                subtitle: [
                  h.fields.abteilung ?? null,
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
              createLabel={tx('Neuen Handwerker anlegen')}
              onCreateNew={() => setShowCreateHandwerker(true)}
              searchPlaceholder={tx('Handwerker suchen …')}
              emptyText={tx('Keine aktiven Handwerker gefunden.')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
              createDialog={
                showCreateHandwerker ? (
                  <div className="rounded-2xl border p-4 space-y-3">
                    <p className="text-sm font-medium">{tx('Neuen Handwerker anlegen')}</p>
                    <Input
                      value={newVorname}
                      onChange={(e) => setNewVorname(e.target.value)}
                      placeholder={tx('Vorname')}
                    />
                    <Input
                      value={newNachname}
                      onChange={(e) => setNewNachname(e.target.value)}
                      placeholder={tx('Nachname')}
                    />
                    <div className="flex gap-2">
                      <Button
                        disabled={!newVorname || !newNachname || creatingHandwerker}
                        onClick={handleCreateHandwerker}
                      >
                        {creatingHandwerker ? tx('Wird angelegt …') : tx('Anlegen')}
                      </Button>
                      <Button variant="outline" onClick={() => setShowCreateHandwerker(false)}>
                        {tx('Abbrechen')}
                      </Button>
                    </div>
                  </div>
                ) : null
              }
            />
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Werkzeugauswahl aus Schritt 1.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Ausleihe anlegen */}
      {step === 3 && (
        <div className="space-y-6">
          {selectedWerkzeug && selectedHandwerker ? (
            <>
              {/* Context badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  <IconTool size={14} />
                  {selectedWerkzeug.fields.werkzeugname}
                </Badge>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <IconUser size={14} />
                  {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                    .filter(Boolean)
                    .join(' ')}
                </Badge>
              </div>

              {/* Mini-form */}
              <div className="rounded-2xl border p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <IconClipboardCheck size={18} className="text-primary" />
                  <p className="font-medium text-sm">{tx('Ausleihdetails')}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">
                    {tx('Ausleihdatum')} *
                  </label>
                  <Input
                    type="datetime-local"
                    value={ausleihdatum}
                    onChange={(e) => setAusleihdatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">
                    {tx('Geplantes Rückgabedatum')}
                  </label>
                  <Input
                    type="datetime-local"
                    value={geplantesRueckgabedatum}
                    onChange={(e) => setGeplantesRueckgabedatum(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">
                    {tx('Bemerkungen')}
                  </label>
                  <Textarea
                    value={bemerkungenAusleihe}
                    onChange={(e) => setBemerkungenAusleihe(e.target.value)}
                    placeholder={tx('Optionale Anmerkungen zur Ausleihe …')}
                    rows={3}
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}

                <Button
                  className="w-full"
                  disabled={!ausleihdatum || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? tx('Wird angelegt …') : tx('Ausleihe anlegen')}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="space-y-6">
          {selectedWerkzeug && selectedHandwerker ? (
            <>
              <div className="rounded-2xl border bg-card p-6 space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <IconCheck size={32} className="text-primary" />
                  </div>
                </div>
                <p className="font-semibold text-lg">{tx('Ausleihe erfolgreich angelegt')}</p>

                <div className="rounded-xl bg-secondary p-4 space-y-2 text-left">
                  <div className="flex items-center gap-2 text-sm">
                    <IconTool size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{tx('Werkzeug')}:</span>
                    <span className="font-medium truncate">
                      {selectedWerkzeug.fields.werkzeugname}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <IconUser size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{tx('Handwerker')}:</span>
                    <span className="font-medium truncate">
                      {[selectedHandwerker.fields.vorname, selectedHandwerker.fields.nachname]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <IconClipboardCheck size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{tx('Ausleihdatum')}:</span>
                    <span className="font-medium">{ausleihdatum.replace('T', ' ')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={handleReset} variant="outline" className="w-full">
                  {tx('Weitere Ausleihe anlegen')}
                </Button>
                <a href="#/" className="w-full">
                  <Button variant="ghost" className="w-full">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
              </p>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
