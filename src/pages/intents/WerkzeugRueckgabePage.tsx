/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur 'ausgeliehen') → 2) Rückgabe erfassen (Datum, Zustand, Bemerkungen)
 *        → 3) Wartung/Reparatur anlegen (nur wenn Zustand != 'verfuegbar') → Erfolg.
 * Reads: ausleihe (gefiltert auf ausgeliehen), handwerker, werkzeuge.
 * Writes: updateAusleiheEntry (status + Rückgabedatum), updateWerkzeugeEntry (zustand),
 *         createWartungReparaturEntry (optional, nur bei Defekt/Reparatur).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichAusleihe } from '@/lib/enrich';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, formatDate, lookupKey } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  IconTool,
  IconCalendarCheck,
  IconAlertTriangle,
  IconCircleCheck,
  IconArrowRight,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Werkzeug zurückgeben', /* i18n-exempt */
    subtitle: 'Rückgabe erfassen und Zustand dokumentieren',
    step1: 'Ausleihe wählen',
    step2: 'Rückgabe erfassen',
    step3: 'Wartung / Reparatur',
    step4: 'Abschluss',
    searchPlaceholder: 'Werkzeug oder Handwerker suchen…',
    emptyText: 'Keine offenen Ausleihen gefunden.', /* i18n-exempt */
    ausleihdat: 'Ausgeliehen am',
    geplanteRueckgabe: 'Geplante Rückgabe',
    zusammenfassung: 'Zusammenfassung',
    werkzeug: 'Werkzeug',
    handwerker: 'Handwerker',
    rueckgabedatumLabel: 'Tatsächliches Rückgabedatum',
    zustandLabel: 'Zustand nach Rückgabe',
    bemerkungenLabel: 'Bemerkungen (optional)',
    zustandVerfuegbar: 'Verfügbar',
    zustandInReparatur: 'In Reparatur',
    zustandDefekt: 'Defekt',
    weiterZuSchritt3: 'Weiter: Wartung / Reparatur anlegen',
    rueckgabeAbschliessen: 'Rückgabe abschließen',
    submitting: 'Wird gespeichert…',
    vorgangsartLabel: 'Vorgangsart',
    wartung: 'Wartung',
    reparatur: 'Reparatur',
    startdatumLabel: 'Startdatum',
    enddatumLabel: 'Geplantes Enddatum (optional)',
    beschreibungLabel: 'Beschreibung (optional)',
    verantwortlicherLabel: 'Verantwortlicher (optional)',
    keiner: 'Keiner ausgewählt',
    vorgangAnlegen: 'Vorgang anlegen',
    ueberspringen: 'Schritt überspringen',
    erfolgTitel: 'Rückgabe erfolgreich!',
    erfolgText: 'Die Ausleihe wurde als zurückgegeben markiert und der Werkzeugzustand aktualisiert.',
    wartungAngelegt: 'Ein Wartungs-/Reparaturvorgang wurde angelegt.',
    neueRueckgabe: 'Weitere Rückgabe erfassen',
    zurueckZumDashboard: 'Zurück zum Dashboard',
    step1Fehlt: 'Dieser Schritt braucht eine Ausleihe aus Schritt 1.',
    step2Fehlt: 'Dieser Schritt braucht die Rückgabedaten aus Schritt 2.',
    neuStarten: 'Neu starten',
    pflichtfeldFehlt: 'Bitte alle Pflichtfelder ausfüllen.',
    fehler: 'Fehler beim Speichern. Bitte nochmals versuchen.',
  },
  en: {
    title: 'Return Tool', /* i18n-exempt */
    subtitle: 'Record return and document condition',
    step1: 'Select Loan',
    step2: 'Record Return',
    step3: 'Maintenance / Repair',
    step4: 'Done',
    searchPlaceholder: 'Search tool or craftsman…',
    emptyText: 'No open loans found.', /* i18n-exempt */
    ausleihdat: 'Borrowed on',
    geplanteRueckgabe: 'Planned return',
    zusammenfassung: 'Summary',
    werkzeug: 'Tool',
    handwerker: 'Craftsman',
    rueckgabedatumLabel: 'Actual return date',
    zustandLabel: 'Condition after return',
    bemerkungenLabel: 'Notes (optional)',
    zustandVerfuegbar: 'Available',
    zustandInReparatur: 'In repair',
    zustandDefekt: 'Defective',
    weiterZuSchritt3: 'Next: Create maintenance / repair',
    rueckgabeAbschliessen: 'Complete return',
    submitting: 'Saving…',
    vorgangsartLabel: 'Type',
    wartung: 'Maintenance',
    reparatur: 'Repair',
    startdatumLabel: 'Start date',
    enddatumLabel: 'Planned end date (optional)',
    beschreibungLabel: 'Description (optional)',
    verantwortlicherLabel: 'Responsible person (optional)',
    keiner: 'None selected',
    vorgangAnlegen: 'Create entry',
    ueberspringen: 'Skip step',
    erfolgTitel: 'Return successful!',
    erfolgText: 'The loan has been marked as returned and the tool condition updated.',
    wartungAngelegt: 'A maintenance/repair entry has been created.',
    neueRueckgabe: 'Record another return',
    zurueckZumDashboard: 'Back to dashboard',
    step1Fehlt: 'This step needs a loan from step 1.',
    step2Fehlt: 'This step needs the return data from step 2.',
    neuStarten: 'Start over',
    pflichtfeldFehlt: 'Please fill in all required fields.',
    fehler: 'Error while saving. Please try again.',
  },
});

type ZustandKey = 'verfuegbar' | 'in_reparatur' | 'defekt';

export default function WerkzeugRueckgabePage() {
  const { ausleihe, handwerker, werkzeuge, werkzeugeMap, handwerkerMap, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2
  const [rueckgabedatum, setRueckgabedatum] = useState('');
  const [zustandKey, setZustandKey] = useState<ZustandKey>('verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Submitting, setStep2Submitting] = useState(false);
  const [step2Error, setStep2Error] = useState('');

  // Step 3
  const [vorgangsart, setVorgangsart] = useState<'wartung' | 'reparatur'>('wartung');
  const [startdatum, setStartdatum] = useState('');
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [verantwortlicherId, setVerantwortlicherId] = useState('');
  const [step3Submitting, setStep3Submitting] = useState(false);
  const [step3Error, setStep3Error] = useState('');

  // Success tracking (idempotency)
  const [wartungId, setWartungId] = useState<string | null>(null);
  const [wartungAngelegt, setWartungAngelegt] = useState(false);

  // Enriched ausleihe for display (only 'ausgeliehen')
  const enrichedAusleihe = useMemo(() => {
    const maps = { werkzeugeMap, handwerkerMap };
    return enrichAusleihe(
      ausleihe.filter(a => lookupKey(a.fields.status_ausleihe) === 'ausgeliehen'),
      maps
    );
  }, [ausleihe, werkzeugeMap, handwerkerMap]);

  // Aktive Handwerker für Verantwortlichen-Auswahl
  const aktiveHandwerker = useMemo(
    () => handwerker.filter(h => lookupKey(h.fields.status) === 'aktiv'),
    [handwerker]
  );

  // Werkzeug aus gewählter Ausleihe
  const werkzeugId = selectedAusleihe
    ? extractRecordId(selectedAusleihe.fields.werkzeug) ?? ''
    : '';

  const werkzeugRecord = werkzeugId ? werkzeugeMap.get(werkzeugId) : undefined;

  const handleSelectAusleihe = (id: string) => {
    const found = enrichedAusleihe.find(a => a.record_id === id);
    if (found) {
      setSelectedAusleihe(found);
      // Prefill Rückgabedatum mit aktueller Zeit
      setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setStep(2);
    }
  };

  const handleStep2Submit = async () => {
    if (!selectedAusleihe || !rueckgabedatum) {
      setStep2Error(tt('pflichtfeldFehlt'));
      return;
    }
    setStep2Submitting(true);
    setStep2Error('');
    try {
      // a) Ausleihe aktualisieren
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      // b) Werkzeugzustand aktualisieren
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey,
        });
      }
      await fetchAll();
      // Wenn Zustand 'verfuegbar' → direkt zu Schritt 4 (Erfolg ohne Wartung)
      if (zustandKey === 'verfuegbar') {
        setStep(4);
      } else {
        setStep(3);
      }
    } catch {
      setStep2Error(tt('fehler'));
    } finally {
      setStep2Submitting(false);
    }
  };

  const handleStep3Submit = async () => {
    if (!startdatum) {
      setStep3Error(tt('pflichtfeldFehlt'));
      return;
    }
    setStep3Submitting(true);
    setStep3Error('');
    try {
      // Idempotenz: nur anlegen wenn noch nicht vorhanden
      let wId = wartungId;
      if (!wId) {
        const payload: Parameters<typeof LivingAppsService.createWartungReparaturEntry>[0] = {
          werkzeug_wartung: werkzeugId
            ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId)
            : undefined,
          vorgangsart: vorgangsart,
          startdatum: startdatum,
          status_wartung: 'geplant',
        };
        if (geplanteEnddatum) payload.geplantes_enddatum = geplanteEnddatum;
        if (beschreibung) payload.beschreibung = beschreibung;
        if (verantwortlicherId) {
          payload.verantwortlicher = createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherId);
        }
        const result = await LivingAppsService.createWartungReparaturEntry(payload);
        wId = result.record_id;
        setWartungId(wId);
      }
      setWartungAngelegt(true);
      await fetchAll();
      setStep(4);
    } catch {
      setStep3Error(tt('fehler'));
    } finally {
      setStep3Submitting(false);
    }
  };

  const handleReset = () => {
    setSelectedAusleihe(null);
    setRueckgabedatum('');
    setZustandKey('verfuegbar');
    setBemerkungen('');
    setStep2Error('');
    setVorgangsart('wartung');
    setStartdatum('');
    setGeplanteEnddatum('');
    setBeschreibung('');
    setVerantwortlicherId('');
    setStep3Error('');
    setWartungId(null);
    setWartungAngelegt(false);
    setStep(1);
  };

  const zustandOptions: { key: ZustandKey; label: string; icon: React.ReactNode }[] = [
    {
      key: 'verfuegbar',
      label: tt('zustandVerfuegbar'),
      icon: <IconCircleCheck size={20} className="text-green-600" />,
    },
    {
      key: 'in_reparatur',
      label: tt('zustandInReparatur'),
      icon: <IconTool size={20} className="text-amber-600" />,
    },
    {
      key: 'defekt',
      label: tt('zustandDefekt'),
      icon: <IconAlertTriangle size={20} className="text-red-600" />,
    },
  ];

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
      {/* ── Schritt 1: Ausleihe wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedAusleihe.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || tt('werkzeug'),
            subtitle: `${a.handwerkerName || tt('handwerker')} · ${tt('ausleihdat')}: ${formatDateTime(a.fields.ausleihdatum)}${a.fields.geplantes_rueckgabedatum ? ` · ${tt('geplanteRueckgabe')}: ${formatDateTime(a.fields.geplantes_rueckgabedatum)}` : ''}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('emptyText')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Schritt 2: Rückgabe erfassen ── */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-xl">
            {/* Zusammenfassung der gewählten Ausleihe */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {tt('zusammenfassung')}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span>
                  <span className="text-muted-foreground">{tt('werkzeug')}: </span>
                  <strong>{selectedAusleihe.werkzeugName || '—'}</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">{tt('handwerker')}: </span>
                  <strong>{selectedAusleihe.handwerkerName || '—'}</strong>
                </span>
                {werkzeugRecord?.fields.inventarnummer && (
                  <span className="text-muted-foreground text-xs">
                    #{werkzeugRecord.fields.inventarnummer}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>{tt('ausleihdat')}: {formatDateTime(selectedAusleihe.fields.ausleihdatum)}</span>
                {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                  <span>{tt('geplanteRueckgabe')}: {formatDateTime(selectedAusleihe.fields.geplantes_rueckgabedatum)}</span>
                )}
              </div>
            </div>

            {/* Tatsächliches Rückgabedatum */}
            <div className="space-y-1.5">
              <Label htmlFor="rueckgabedatum">{tt('rueckgabedatumLabel')} *</Label>
              <Input
                id="rueckgabedatum"
                type="datetime-local"
                value={rueckgabedatum}
                onChange={e => setRueckgabedatum(e.target.value)}
              />
            </div>

            {/* Zustand nach Rückgabe — Kacheln */}
            <div className="space-y-2">
              <Label>{tt('zustandLabel')}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {zustandOptions.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setZustandKey(opt.key)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors w-full ${
                      zustandKey === opt.key
                        ? 'border-primary bg-primary/10 font-semibold'
                        : 'border-border hover:bg-secondary/60'
                    }`}
                  >
                    {opt.icon}
                    <span className="text-sm">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bemerkungen */}
            <div className="space-y-1.5">
              <Label htmlFor="bemerkungen">{tt('bemerkungenLabel')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                rows={3}
              />
            </div>

            {step2Error && (
              <p className="text-sm text-destructive">{step2Error}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              {zustandKey !== 'verfuegbar' ? (
                <Button onClick={handleStep2Submit} disabled={step2Submitting || !rueckgabedatum}>
                  <IconArrowRight size={16} stroke={2} className="mr-1.5" />
                  {step2Submitting ? tt('submitting') : tt('weiterZuSchritt3')}
                </Button>
              ) : (
                <Button onClick={handleStep2Submit} disabled={step2Submitting || !rueckgabedatum}>
                  <IconCalendarCheck size={16} stroke={2} className="mr-1.5" />
                  {step2Submitting ? tt('submitting') : tt('rueckgabeAbschliessen')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setStep(1)}>
                ← {tt('step1')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step1Fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* ── Schritt 3: Wartung / Reparatur anlegen ── */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-xl">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 p-4 space-y-1">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
                <IconAlertTriangle size={16} stroke={2} />
                {werkzeugRecord?.fields.werkzeugname ?? selectedAusleihe.werkzeugName}
              </div>
              <p className="text-xs text-muted-foreground">
                {tt('zustandLabel')}:{' '}
                <StatusBadge statusKey={zustandKey} label={zustandOptions.find(o => o.key === zustandKey)?.label} />
              </p>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <Label>{tt('vorgangsartLabel')} *</Label>
              <div className="grid grid-cols-2 gap-3">
                {(['wartung', 'reparatur'] as const).map(art => (
                  <button
                    key={art}
                    type="button"
                    onClick={() => setVorgangsart(art)}
                    className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors w-full ${
                      vorgangsart === art
                        ? 'border-primary bg-primary/10 font-semibold'
                        : 'border-border hover:bg-secondary/60'
                    }`}
                  >
                    <IconTool size={18} stroke={2} />
                    <span className="text-sm">{art === 'wartung' ? tt('wartung') : tt('reparatur')}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Startdatum */}
            <div className="space-y-1.5">
              <Label htmlFor="startdatum">{tt('startdatumLabel')} *</Label>
              <Input
                id="startdatum"
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
              />
            </div>

            {/* Geplantes Enddatum */}
            <div className="space-y-1.5">
              <Label htmlFor="geplanteEnddatum">{tt('enddatumLabel')}</Label>
              <Input
                id="geplanteEnddatum"
                type="date"
                value={geplanteEnddatum}
                onChange={e => setGeplanteEnddatum(e.target.value)}
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-1.5">
              <Label htmlFor="beschreibung">{tt('beschreibungLabel')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                rows={3}
              />
            </div>

            {/* Verantwortlicher */}
            <div className="space-y-1.5">
              <Label htmlFor="verantwortlicher">{tt('verantwortlicherLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setVerantwortlicherId('')}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    verantwortlicherId === ''
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-border hover:bg-secondary/60'
                  }`}
                >
                  {tt('keiner')}
                </button>
                {aktiveHandwerker.map(h => (
                  <button
                    key={h.record_id}
                    type="button"
                    onClick={() => setVerantwortlicherId(h.record_id)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      verantwortlicherId === h.record_id
                        ? 'border-primary bg-primary/10 font-semibold'
                        : 'border-border hover:bg-secondary/60'
                    }`}
                  >
                    {[h.fields.vorname, h.fields.nachname].filter(Boolean).join(' ') || h.record_id}
                  </button>
                ))}
              </div>
            </div>

            {step3Error && (
              <p className="text-sm text-destructive">{step3Error}</p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={handleStep3Submit} disabled={step3Submitting || !startdatum}>
                <IconTool size={16} stroke={2} className="mr-1.5" />
                {step3Submitting ? tt('submitting') : tt('vorgangAnlegen')}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setWartungAngelegt(false); setStep(4); }}
                disabled={step3Submitting}
              >
                {tt('ueberspringen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step2Fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* ── Schritt 4: Abschluss ── */}
      {step === 4 && (
        selectedAusleihe ? (
          <div className="flex flex-col items-center text-center py-10 space-y-5 max-w-md mx-auto">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-5">
              <IconCircleCheck size={48} stroke={1.5} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">{tt('erfolgTitel')}</h2>
              <p className="text-sm text-muted-foreground">{tt('erfolgText')}</p>
              {wartungAngelegt && (
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mt-1">
                  {tt('wartungAngelegt')}
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-secondary/40 p-4 w-full text-left space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tt('werkzeug')}</span>
                <strong>{selectedAusleihe.werkzeugName || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tt('handwerker')}</span>
                <strong>{selectedAusleihe.handwerkerName || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tt('zustandLabel')}</span>
                <StatusBadge
                  statusKey={zustandKey}
                  label={zustandOptions.find(o => o.key === zustandKey)?.label}
                />
              </div>
              {rueckgabedatum && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tt('rueckgabedatumLabel')}</span>
                  <span>{formatDate(rueckgabedatum)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <Button onClick={handleReset}>
                {tt('neueRueckgabe')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tt('zurueckZumDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step1Fehlt')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
