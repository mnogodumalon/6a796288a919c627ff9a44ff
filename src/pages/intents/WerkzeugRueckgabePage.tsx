/**
 * Werkzeug-Rückgabe — 3-Schritt-Wizard.
 * Steps: 1) Offene Ausleihe wählen → 2) Rückgabe & Zustandsbewertung → 3) Wartung/Reparatur anlegen (optional).
 * Reads: ausleihe (gefiltert: status_ausleihe = 'ausgeliehen'), werkzeuge.
 * Writes: ausleihe (updateAusleiheEntry), werkzeuge (updateWerkzeugeEntry), wartung_reparatur (createWartungReparaturEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedAusleihe } from '@/types/enriched';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tx } from '@/i18n';
import {
  IconTool,
  IconAlertTriangle,
  IconCheck,
  IconSettings,
} from '@tabler/icons-react';

const ZUSTAND_OPTIONS = (LOOKUP_OPTIONS['werkzeuge']?.['zustand'] ?? []).filter(
  o => o.key !== 'ausgeliehen'
);
const VORGANGSART_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [];
const STATUS_WARTUNG_OPTIONS = LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [];

const WARTUNG_REQUIRED_ZUSTAENDE = new Set(['in_reparatur', 'in_wartung', 'defekt']);

export default function WerkzeugRueckgabePage() {
  const { ausleihe, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1
  const [selectedAusleihe, setSelectedAusleihe] = useState<EnrichedAusleihe | null>(null);

  // Step 2
  const [rueckgabedatum, setRueckgabedatum] = useState(
    format(new Date(), "yyyy-MM-dd'T'HH:mm")
  );
  const [zustandKey, setZustandKey] = useState(ZUSTAND_OPTIONS[0]?.key ?? '');
  const [bemerkungen, setBemerkungen] = useState('');
  const [step2Saving, setStep2Saving] = useState(false);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3
  const [vorgangsart, setVorgangsart] = useState(VORGANGSART_OPTIONS[0]?.key ?? '');
  const [startdatum, setStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [geplanteEnddatum, setGeplanteEnddatum] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  const [statusWartung, setStatusWartung] = useState(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
  const [step3Saving, setStep3Saving] = useState(false);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const offeneAusleihen = (ausleihe as EnrichedAusleihe[]).filter(
    a => a.fields.status_ausleihe?.key === 'ausgeliehen'
  );

  const handleSelectAusleihe = (id: string) => {
    const found = offeneAusleihen.find(a => a.record_id === id);
    if (found) {
      setSelectedAusleihe(found);
      setStep(2);
    }
  };

  const handleStep2Submit = async () => {
    if (!selectedAusleihe) return;
    setStep2Saving(true);
    setStep2Error(null);
    try {
      await LivingAppsService.updateAusleiheEntry(selectedAusleihe.record_id, {
        status_ausleihe: 'zurueckgegeben',
        tatsaechliches_rueckgabedatum: rueckgabedatum,
        bemerkungen_ausleihe: bemerkungen || undefined,
      });

      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      if (werkzeugId) {
        await LivingAppsService.updateWerkzeugeEntry(werkzeugId, {
          zustand: zustandKey,
        });
      }

      await fetchAll();

      if (WARTUNG_REQUIRED_ZUSTAENDE.has(zustandKey)) {
        setStep(3);
      } else {
        setDone(true);
        setStep(4);
      }
    } catch (e) {
      setStep2Error(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setStep2Saving(false);
    }
  };

  const handleStep3Submit = async () => {
    if (!selectedAusleihe) return;
    setStep3Saving(true);
    setStep3Error(null);
    try {
      const werkzeugId = extractRecordId(selectedAusleihe.fields.werkzeug);
      await LivingAppsService.createWartungReparaturEntry({
        werkzeug_wartung: werkzeugId
          ? createRecordUrl(APP_IDS.WERKZEUGE, werkzeugId)
          : undefined,
        vorgangsart,
        startdatum,
        geplantes_enddatum: geplanteEnddatum || undefined,
        beschreibung: beschreibung || undefined,
        status_wartung: statusWartung,
      });
      await fetchAll();
      setDone(true);
      setStep(4);
    } catch (e) {
      setStep3Error(e instanceof Error ? e.message : tx('Fehler beim Anlegen'));
    } finally {
      setStep3Saving(false);
    }
  };

  const handleReset = () => {
    setSelectedAusleihe(null);
    setRueckgabedatum(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setZustandKey(ZUSTAND_OPTIONS[0]?.key ?? '');
    setBemerkungen('');
    setStep2Error(null);
    setVorgangsart(VORGANGSART_OPTIONS[0]?.key ?? '');
    setStartdatum(format(new Date(), 'yyyy-MM-dd'));
    setGeplanteEnddatum('');
    setBeschreibung('');
    setStatusWartung(STATUS_WARTUNG_OPTIONS[0]?.key ?? 'geplant');
    setStep3Error(null);
    setDone(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Werkzeug zurückgeben')}
      subtitle={tx('Ausleihe abschließen und Zustand dokumentieren')}
      steps={[
        { label: tx('Ausleihe') },
        { label: tx('Zustand') },
        { label: tx('Wartung') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Ausleihe wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneAusleihen.map(a => ({
            id: a.record_id,
            title: a.werkzeugName || tx('Unbekanntes Werkzeug'),
            subtitle: `${tx('Handwerker')}: ${a.handwerkerName || '—'} · ${tx('Ausgeliehen')}: ${a.fields.ausleihdatum ? a.fields.ausleihdatum.slice(0, 10) : '—'}${a.fields.geplantes_rueckgabedatum ? ` · ${tx('Geplant bis')}: ${a.fields.geplantes_rueckgabedatum.slice(0, 10)}` : ''}`,
            status: a.fields.status_ausleihe
              ? { key: a.fields.status_ausleihe.key, label: a.fields.status_ausleihe.label }
              : undefined,
            icon: <IconTool size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectAusleihe}
          searchPlaceholder={tx('Werkzeug oder Handwerker suchen …')}
          emptyText={tx('Keine offenen Ausleihen vorhanden')}
          emptyIcon={<IconTool size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Rückgabe & Zustandsbewertung */}
      {step === 2 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Kontext */}
            <div className="rounded-2xl border bg-card p-4 flex items-start gap-3 overflow-hidden">
              <IconTool size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{selectedAusleihe.werkzeugName || tx('Unbekanntes Werkzeug')}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {tx('Handwerker')}: {selectedAusleihe.handwerkerName || '—'}
                </p>
                {selectedAusleihe.fields.status_ausleihe && (
                  <div className="mt-1">
                    <StatusBadge
                      statusKey={selectedAusleihe.fields.status_ausleihe.key}
                      label={selectedAusleihe.fields.status_ausleihe.label}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Felder */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Tatsächliches Rückgabedatum')} *</label>
                <Input
                  type="datetime-local"
                  value={rueckgabedatum}
                  onChange={e => setRueckgabedatum(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Zustand nach Rückgabe')} *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ZUSTAND_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setZustandKey(opt.key)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        zustandKey === opt.key
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <span className="text-sm">{opt.label}</span>
                      {WARTUNG_REQUIRED_ZUSTAENDE.has(opt.key) && (
                        <span className="ml-1.5 inline-flex items-center">
                          <IconAlertTriangle size={12} className="text-amber-500" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {WARTUNG_REQUIRED_ZUSTAENDE.has(zustandKey) && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                    <IconAlertTriangle size={13} />
                    {tx('Im nächsten Schritt kannst du einen Wartungs- oder Reparaturvorgang anlegen.')}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Bemerkungen')} <span className="text-muted-foreground font-normal">({tx('optional')})</span></label>
                <Textarea
                  value={bemerkungen}
                  onChange={e => setBemerkungen(e.target.value)}
                  placeholder={tx('Hinweise zum Zustand oder zur Rückgabe …')}
                  className="w-full min-h-[80px]"
                />
              </div>
            </div>

            {step2Error && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                {step2Error}
              </p>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={() => setStep(1)} disabled={step2Saving}>
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleStep2Submit}
                disabled={step2Saving || !rueckgabedatum || !zustandKey}
              >
                {step2Saving
                  ? tx('Wird gespeichert …')
                  : WARTUNG_REQUIRED_ZUSTAENDE.has(zustandKey)
                    ? tx('Rückgabe speichern & Wartung anlegen')
                    : tx('Rückgabe abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte wähle zuerst eine Ausleihe aus.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zur Auswahl')}</Button>
          </div>
        )
      )}

      {/* Step 3: Wartung / Reparatur anlegen (optional) */}
      {step === 3 && (
        selectedAusleihe ? (
          <div className="space-y-6">
            {/* Kontext */}
            <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4 flex items-start gap-3 overflow-hidden">
              <IconAlertTriangle size={20} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-amber-800 truncate">
                  {selectedAusleihe.werkzeugName || tx('Unbekanntes Werkzeug')}
                </p>
                <p className="text-sm text-amber-700">
                  {tx('Zustand')}: {ZUSTAND_OPTIONS.find(o => o.key === zustandKey)?.label ?? zustandKey}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Vorgangsart')} *</label>
                <div className="flex gap-2">
                  {VORGANGSART_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setVorgangsart(opt.key)}
                      className={`flex-1 rounded-xl border p-3 text-center transition-colors ${
                        vorgangsart === opt.key
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1.5 text-sm">
                        {opt.key === 'wartung' ? <IconSettings size={15} /> : <IconTool size={15} />}
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tx('Startdatum')} *</label>
                  <Input
                    type="date"
                    value={startdatum}
                    onChange={e => setStartdatum(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{tx('Geplantes Enddatum')} <span className="text-muted-foreground font-normal">({tx('optional')})</span></label>
                  <Input
                    type="date"
                    value={geplanteEnddatum}
                    onChange={e => setGeplanteEnddatum(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Status')} *</label>
                <Select value={statusWartung} onValueChange={setStatusWartung}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_WARTUNG_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tx('Beschreibung')} <span className="text-muted-foreground font-normal">({tx('optional')})</span></label>
                <Textarea
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder={tx('Was soll gemacht werden? Welche Teile sind betroffen? …')}
                  className="w-full min-h-[80px]"
                />
              </div>

              {/* Live-Zusammenfassung */}
              <div className="rounded-xl border bg-secondary p-3 text-sm space-y-1 overflow-hidden">
                <p className="font-medium text-foreground">{tx('Zusammenfassung')}</p>
                <p className="text-muted-foreground truncate">
                  {tx('Werkzeug')}: <span className="text-foreground">{selectedAusleihe.werkzeugName || '—'}</span>
                </p>
                <p className="text-muted-foreground">
                  {tx('Vorgang')}: <span className="text-foreground">{VORGANGSART_OPTIONS.find(o => o.key === vorgangsart)?.label ?? vorgangsart}</span>
                </p>
                <p className="text-muted-foreground">
                  {tx('Start')}: <span className="text-foreground">{startdatum || '—'}</span>
                  {geplanteEnddatum && <> · {tx('Ende')}: <span className="text-foreground">{geplanteEnddatum}</span></>}
                </p>
              </div>
            </div>

            {step3Error && (
              <p className="text-sm text-destructive rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
                {step3Error}
              </p>
            )}

            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => { setDone(true); setStep(4); }}
                disabled={step3Saving}
              >
                {tx('Überspringen')}
              </Button>
              <Button
                onClick={handleStep3Submit}
                disabled={step3Saving || !vorgangsart || !startdatum || !statusWartung}
              >
                {step3Saving ? tx('Wird angelegt …') : tx('Vorgang anlegen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte starte den Ablauf von vorne.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Fertig */}
      {step === 4 && (
        done ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" stroke={2} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold">{tx('Rückgabe erfolgreich abgeschlossen')}</p>
              {selectedAusleihe && (
                <p className="text-sm text-muted-foreground">
                  {selectedAusleihe.werkzeugName || tx('Das Werkzeug')} {tx('wurde als')} <span className="font-medium">{ZUSTAND_OPTIONS.find(o => o.key === zustandKey)?.label ?? zustandKey}</span> {tx('erfasst.')}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button onClick={handleReset} variant="outline">
                {tx('Weitere Rückgabe erfassen')}
              </Button>
              <a href="#/">
                <Button>{tx('Zurück zum Dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte starte den Ablauf von vorne.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
