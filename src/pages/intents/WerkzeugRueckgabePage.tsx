/**
 * Werkzeug-Rückgabe — 2–3-Schritt-Wizard.
 * Steps: 1) Ausleihe wählen (nur status_ausleihe='ausgeliehen') →
 *        2) Rückgabe & Zustand erfassen (update Ausleihe + Werkzeug) →
 *        3) Wartung/Reparatur anlegen (optional, nur wenn zustand=in_reparatur|in_wartung).
 * Reads: ausleihe, werkzeuge, handwerker. Writes: ausleihe (updateAusleiheEntry),
 *        werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconArrowRight, IconCheck, IconTool, IconTools } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedAusleihe } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import {
  LivingAppsService,
  createRecordUrl,
  extractRecordId,
} from '@/services/livingAppsService';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const ZUSTAND_OPTIONS = LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? [];
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

// Zustand-Optionen für die Rückgabe (ohne 'ausgeliehen' und 'ausgemustert')
const RUECKGABE_ZUSTAND = ZUSTAND_OPTIONS.filter(
  o => o.key !== 'ausgeliehen' && o.key !== 'ausgemustert'
);

export default function WerkzeugRueckgabePage() {
  const { ausleihe, werkzeuge, handwerker, loading, error, fetchAll, werkzeugeMap, handwerkerMap } =
    useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Schritt 2 Formular
  const [rueckgabeDatum, setRueckgabeDatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [zustandKey, setZustandKey] = useState<string>(RUECKGABE_ZUSTAND[0]?.key ?? 'verfuegbar');
  const [bemerkungen, setBemerkungen] = useState('');
  const [submitting2, setSubmitting2] = useState(false);
  const [error2, setError2] = useState<string | null>(null);

  // Schritt 3 Formular
  const vorgangsartDefault = zustandKey === 'in_wartung' ? 'wartung' : 'reparatur';
  const [vorgangsart, setVorgangsart] = useState<string>(vorgangsartDefault);
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplantesDatum, setGeplantesDatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung] = useState<string>(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
  const [submitting3, setSubmitting3] = useState(false);
  const [error3, setError3] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Datensatz anreichern
  const enrichedAusleihe: EnrichedAusleihe[] = ausleihe
    .filter(a => a.fields.status_ausleihe?.key === 'ausgeliehen')
    .map(a => {
      const werkzeugId = extractRecordId(a.fields.werkzeug);
      const handwerkerId = extractRecordId(a.fields.handwerker);
      const wz = werkzeugId ? werkzeugeMap.get(werkzeugId) : undefined;
      const hw = handwerkerId ? handwerkerMap.get(handwerkerId) : undefined;
      return {
        ...a,
        werkzeugName: wz?.fields.werkzeugname ?? tx('Unbekanntes Werkzeug'),
        handwerkerName: hw
          ? `${hw.fields.vorname ?? ''} ${hw.fields.nachname ?? ''}`.trim()
          : tx('Unbekannter Handwerker'),
      };
    });

  const handleSelectAusleihe = (id: string) => {
    const found = enrichedAusleihe.find(a => a.record_id === id);
    if (!found) return;
    setSelectedAusleihe(found);
    setStep(2);
  };

  const handleRueckgabe = async () => {
    if (!selectedAusleihe) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) return;

    setSubmitting2(true);
    setError2(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabeDatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });
      await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
        zustand: zustandKey,
      });
      await fetchAll();

      if (zustandKey === 'in_reparatur' || zustandKey === 'in_wartung') {
        // Vorgangsart vorbelegen basierend auf Zustand
        setVorgangsart(zustandKey === 'in_wartung' ? 'wartung' : 'reparatur');
        setStep(3);
      } else {
        setDone(true);
        setStep(4);
      }
    } catch (err) {
      setError2(err instanceof Error ? err.message : tx('Fehler bei der Rückgabe'));
    } finally {
      setSubmitting2(false);
    }
  };

  const handleWartungAnlegen = async () => {
    if (!selectedAusleihe) return;
    const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
    if (!werkzeugId) return;

    setSubmitting3(true);
    setError3(null);
    try {
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId),
        vorgangsart: vorgangsart,
        startdatum: startdatum,
        geplantes_enddatum: geplantesDatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
      });
      await fetchAll();
      setDone(true);
      setStep(4);
    } catch (err) {
      setError3(err instanceof Error ? err.message : tx('Fehler beim Anlegen'));
    } finally {
      setSubmitting3(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedAusleihe(null);
    setRueckgabeDatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey(RUECKGABE_ZUSTAND[0]?.key ?? 'verfuegbar');
    setBemerkungen('');
    setVorgangsart('wartung');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplantesDatum('');
    setBeschreibung('');
    setError2(null);
    setError3(null);
    setDone(false);
  };

  const needsMaintenance = zustandKey === 'in_reparatur' || zustandKey === 'in_wartung';
  const wizardSteps = needsMaintenance
    ? [
        { label: tx('Ausleihe wählen') },
        { label: tx('Rückgabe erfassen') },
        { label: tx('Wartung anlegen') },
        { label: tx('Fertig') },
      ]
    : [
        { label: tx('Ausleihe wählen') },
        { label: tx('Rückgabe erfassen') },
        { label: tx('Fertig') },
      ];

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Rückgabe in wenigen Schritten erfassen')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Ausleihe wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedAusleihe.map(a => ({
            id: a.record_id,
            title: a.werkzeugName,
            subtitle: `${a.handwerkerName}${a.fields.ausleihdatum ? ' · ' + a.fields.ausleihdatum.slice(0, 10) : ''}${a.fields.geplantes_rueckgabedatum ? ' → ' + a.fields.geplantes_rueckgabedatum.slice(0, 10) : ''}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine aktiven Ausleihen gefunden')}
        />
      )}

      {/* Schritt 2: Rückgabe & Zustand */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg">
            {/* Zusammenfassung der gewählten Ausleihe */}
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconTool size={18} className="text-primary" />
                <span className="font-semibold text-foreground">{selectedAusleihe.werkzeugName}</span>
                <StatusBadge
                  statusKey={selectedAusleihe.fields.status_ausleihe?.key}
                  label={selectedAusleihe.fields.status_ausleihe?.label}
                />
              </div>
              <p className="text-sm text-muted-foreground">{selectedAusleihe.handwerkerName}</p>
              {selectedAusleihe.fields.geplantes_rueckgabedatum && (
                <p className="text-sm text-muted-foreground">
                  {tx('Geplante Rückgabe')}: {selectedAusleihe.fields.geplantes_rueckgabedatum.slice(0, 10)}
                </p>
              )}
            </div>

            {/* Rückgabedatum */}
            <div className="space-y-2">
              <Label htmlFor="rueckgabe-datum">{tx('Tatsächliches Rückgabedatum')}</Label>
              <Input
                id="rueckgabe-datum"
                type="datetime-local"
                value={rueckgabeDatum}
                onChange={e => setRueckgabeDatum(e.target.value)}
              />
            </div>

            {/* Zustand nach Rückgabe */}
            <div className="space-y-2">
              <Label>{tx('Zustand nach Rückgabe')}</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {RUECKGABE_ZUSTAND.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setZustandKey(opt.key)}
                    className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                      zustandKey === opt.key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(zustandKey === 'in_reparatur' || zustandKey === 'in_wartung') && (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  {tx('Im nächsten Schritt kannst du einen Wartungs-/Reparaturauftrag anlegen.')}
                </p>
              )}
            </div>

            {/* Bemerkungen */}
            <div className="space-y-2">
              <Label htmlFor="bemerkungen">{tx('Bemerkungen')}</Label>
              <Textarea
                id="bemerkungen"
                value={bemerkungen}
                onChange={e => setBemerkungen(e.target.value)}
                placeholder={tx('Optionale Anmerkungen zur Rückgabe …')}
                rows={3}
              />
            </div>

            {error2 && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error2}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleRueckgabe}
                disabled={submitting2 || !rueckgabeDatum}
                className="flex items-center gap-2"
              >
                {needsMaintenance ? (
                  <>
                    {tx('Rückgabe speichern')}
                    <IconArrowRight size={16} />
                  </>
                ) : (
                  <>
                    <IconCheck size={16} />
                    {tx('Rückgabe abschließen')}
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine ausgewählte Ausleihe.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Schritt 3: Wartung / Reparatur anlegen */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6 max-w-lg">
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <IconTools size={20} className="text-primary" />
              <div>
                <p className="font-semibold text-foreground">{selectedAusleihe.werkzeugName}</p>
                <p className="text-sm text-muted-foreground">
                  {zustandKey === 'in_wartung' ? tx('Wartung erforderlich') : tx('Reparatur erforderlich')}
                </p>
              </div>
            </div>

            {/* Vorgangsart */}
            <div className="space-y-2">
              <Label>{tx('Vorgangsart')}</Label>
              <div className="flex gap-2">
                {VORGANGSART_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setVorgangsart(opt.key)}
                    className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                      vorgangsart === opt.key
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Startdatum */}
            <div className="space-y-2">
              <Label htmlFor="startdatum">
                {tx('Startdatum')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startdatum"
                type="date"
                value={startdatum}
                onChange={e => setStartdatum(e.target.value)}
              />
            </div>

            {/* Geplantes Enddatum */}
            <div className="space-y-2">
              <Label htmlFor="geplantes-enddatum">{tx('Geplantes Enddatum')}</Label>
              <Input
                id="geplantes-enddatum"
                type="date"
                value={geplantesDatum}
                onChange={e => setGeplantesDatum(e.target.value)}
              />
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="beschreibung">{tx('Beschreibung')}</Label>
              <Textarea
                id="beschreibung"
                value={beschreibung}
                onChange={e => setBeschreibung(e.target.value)}
                placeholder={tx('Was soll geprüft oder repariert werden? …')}
                rows={3}
              />
            </div>

            {error3 && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error3}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button
                onClick={handleWartungAnlegen}
                disabled={submitting3 || !vorgangsart || !startdatum}
                className="flex items-center gap-2"
              >
                <IconCheck size={16} />
                {tx('Auftrag anlegen & abschließen')}
              </Button>
              <Button variant="outline" onClick={() => { setDone(true); setStep(4); }}>
                {tx('Überspringen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine ausgewählte Ausleihe.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Schritt 4: Fertig */}
      {step === 4 && (
        done ? (
          <div className="text-center py-16 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <IconCheck size={32} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {tx('Rückgabe erfolgreich erfasst')}
              </h2>
              {selectedAusleihe && (
                <p className="text-sm text-muted-foreground">
                  {selectedAusleihe.werkzeugName} {tx('wurde zurückgegeben.')}
                  {(zustandKey === 'in_reparatur' || zustandKey === 'in_wartung') &&
                    ` ${tx('Ein Wartungs-/Reparaturauftrag wurde angelegt.')}`}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={handleReset} variant="outline">
                {tx('Weitere Rückgabe erfassen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt benötigt eine abgeschlossene Rückgabe.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
